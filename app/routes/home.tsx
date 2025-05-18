import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getWordOfTheDay } from '@/lib/embed.server';
import { getGuessDistance, getUserGuesses, guesskey } from '@/lib/guesses.server';
import { getSession, getUserId, vSessionData } from '@/lib/session.server';
import { getBindings } from '@/middleware/bindings.server';
import { Form, data } from 'react-router';
import * as v from 'valibot';
import type { Route } from './+types/home';

type Guess = {
	word: string;
	distance: number;
};

type Config = {
	initialGuess: string;
	maxTries: number;
};

const CONFIG: Config = {
	initialGuess: 'guess',
	maxTries: 20,
};

/** Returns a number between 0% and 100% */
const getDistance = (distance: number) => Math.round(distance * 100);

/** Represents data that can be seen by the user. They cannot see the vector distance itself,
 * but they can see between the two words which is closer */
type PublicGuessesRound =
	| {
			type: 'complete';
			left: { word: string; distance: number };
			right: { word: string; distance: number };
			winner: 'left' | 'right';
	  }
	| { type: 'pending'; word: string; distance: number };

const getPublicGuesses = async (guesses: Array<Guess>, date: Date) => {
	const wordOfTheDay = await getWordOfTheDay(date);
	const publicGuesses: PublicGuessesRound[] = [];
	let winnerGuess = {
		word: CONFIG.initialGuess,
		distance: await getGuessDistance({ date, guess: CONFIG.initialGuess }),
	};

	for (const guess of guesses) {
		if (guess.distance > winnerGuess.distance) {
			publicGuesses.push({
				type: 'complete',
				left: { word: winnerGuess.word, distance: getDistance(winnerGuess.distance) },
				right: { word: guess.word, distance: getDistance(guess.distance) },
				winner: 'right',
			});
			winnerGuess = guess;
		} else {
			publicGuesses.push({
				type: 'complete',
				left: { word: winnerGuess.word, distance: getDistance(winnerGuess.distance) },
				right: { word: guess.word, distance: getDistance(guess.distance) },
				winner: 'left',
			});
		}
	}

	if (winnerGuess.word !== wordOfTheDay.word && guesses.length < CONFIG.maxTries) {
		publicGuesses.push({ type: 'pending', word: winnerGuess.word, distance: getDistance(winnerGuess.distance) });
	}

	return {
		guesses: publicGuesses,
		won: guesses.some((g) => g.word === wordOfTheDay.word),
		attemptsLeft: CONFIG.maxTries - guesses.length,
	};
};

export function meta(_: Route.MetaArgs) {
	return [{ title: 'Word guesser' }, { name: 'description', content: '' }];
}

export async function loader({ context, request }: Route.LoaderArgs) {
	const { MY_KV } = getBindings(context);

	const { getHeaders, userId } = await getUserId(request);
	const date = new Date();
	const guesses = await getUserGuesses({ key: guesskey({ date, userId }), kv: MY_KV });

	return data(await getPublicGuesses(guesses, date), { headers: { ...(await getHeaders?.()) } });
}

const vAction = v.object({
	guess: v.pipe(v.string(), v.minLength(3, 'Please enter 3 or more characters')),
});

export async function action({ request, context }: Route.ActionArgs) {
	const sessionCookie = await getSession(request.headers.get('Cookie'));
	const { user_id: userId } = v.parse(vSessionData, sessionCookie.data);

	const formData = Object.fromEntries((await request.formData()).entries());
	const parsed = v.safeParse(vAction, formData);
	if (parsed.success === false) return data({ ok: false as const, error: parsed.issues[0].message });
	const guess = parsed.output.guess.toLowerCase().trim();
	const { MY_KV } = getBindings(context);

	const date = new Date();
	const key = guesskey({ date, userId });
	const guesses = await getUserGuesses({ key, kv: MY_KV });

	if (guesses.some((g) => g.word === guess))
		return data({ ok: false as const, error: 'You already guessed that word!' });
	if (guesses.length >= CONFIG.maxTries) return data({ ok: false as const, error: 'No attempts left! You lost!' });

	const distance = await getGuessDistance({ date, guess });

	guesses.push({ word: guess, distance });
	await MY_KV.put(key, JSON.stringify(guesses));

	return data({ ok: true as const });
}

export default function Home({ loaderData, actionData }: Route.ComponentProps) {
	return (
		<div className="p-8">
			<ol>
				{loaderData.guesses.map((guess, i) => {
					switch (guess.type) {
						case 'complete':
							return (
								<li key={i} className="flex items-center gap-4 py-2">
									<div className="flex flex-1 items-center justify-end gap-2">
										{guess.left.word}
										<Badge variant={guess.winner === 'left' ? 'default' : 'outline'}>{guess.left.distance}%</Badge>
									</div>
									<p className="text-foreground text-sm">VS</p>
									<div className="flex flex-1 items-center justify-start gap-2">
										<Badge variant={guess.winner === 'right' ? 'default' : 'outline'}>{guess.right.distance}%</Badge>
										{guess.right.word}
									</div>
								</li>
							);
						case 'pending':
							return (
								<li key="pending" className="flex items-center gap-4">
									<div className="flex flex-1 items-center justify-end gap-2">
										{guess.word}
										<Badge variant="default">{guess.distance}%</Badge>
									</div>
									<p className="text-foreground text-sm">VS</p>
									<span className="flex flex-1 items-center justify-start">
										<Form onSubmit={(e) => e.currentTarget.clear()} method="POST" className="flex">
											<Input autoFocus type="text" name="guess" />
											<Button variant="default" type="submit">
												Submit
											</Button>
											{actionData?.ok === false ? <p role="alert">{actionData.error}</p> : null}
										</Form>
									</span>
								</li>
							);
					}
				})}
			</ol>

			{loaderData.won ? (
				<p className="p-4 text-center text-muted-foreground">You won!</p>
			) : (
				<p className="p-4 text-center text-muted-foreground">{loaderData.attemptsLeft} guesses left</p>
			)}
		</div>
	);
}

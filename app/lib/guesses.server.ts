import * as v from 'valibot';
import { getDateStamp } from './date';
import { getGuessEmbedding, getWordOfTheDay } from './embed.server';

const vGuesses = v.array(
	v.object({
		word: v.string(),
		distance: v.number(),
	}),
);

export const guesskey = ({ date, userId }: { userId: string; date: Date }) => `${userId}-${getDateStamp(date)}`;

export const getUserGuesses = async ({ kv, key }: { key: string; kv: KVNamespace }) => {
	let values = await kv.get(key, 'json');
	if (!values) {
		await kv.put(key, JSON.stringify([]));
		values = [];
	}
	return v.parse(vGuesses, values);
};

const cosineSimilarity = (a: number[], b: number[]) => {
	const dotProduct = a.reduce((acc, val, i) => {
		const bi = b[i];
		if (!bi) return acc;
		return acc + val * bi;
	}, 0);
	const magnitude = Math.sqrt(a.reduce((acc, val) => acc + val * val, 0));
	const magnitudeB = Math.sqrt(b.reduce((acc, val) => acc + val * val, 0));
	return dotProduct / (magnitude * magnitudeB);
};

// gets the guess distance between the answer and the guess based on their embeddings
export const getGuessDistance = async ({ date, guess }: { date: Date; guess: string }) => {
	const answer = await getWordOfTheDay(date);
	const guessEmbedding = await getGuessEmbedding(guess, date);

	console.log(answer.word, guess);
	const distance = cosineSimilarity(answer.embeddings, guessEmbedding);
	return distance;
};

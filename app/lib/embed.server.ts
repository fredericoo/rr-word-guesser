import { env } from 'cloudflare:workers';
import OpenAI from 'openai';
import * as v from 'valibot';
import { getDateStamp } from './date';

const openai = new OpenAI({
	apiKey: env.OPENAI_API_KEY,
});

const vWordOfTheDay = v.object({
	word: v.string(),
	embeddings: v.array(v.number()),
});

const LIBRARY: Record<string, string> = {
	// '2025-05-18': 'Apple',
	// '2025-05-19': 'Fireman',
	// '2025-05-20': 'Hexagon',
	// '2025-05-21': 'Jellyfish',
	// '2025-05-22': 'Kangaroo',
	// '2025-05-23': 'Lamp',
	// '2025-05-24': 'Mushroom',
	// '2025-05-25': 'Nest',
	// '2025-05-26': 'Octopus',
	// '2025-05-27': 'Purpose',
	// '2025-05-28': 'Quilt',
	// '2025-05-29': 'Rocket',
	// '2025-05-30': 'Sailboat',
	// '2025-05-31': 'Turtle',
	// '2025-06-01': 'Umbrella',
	// '2025-06-02': 'Vase',
	// '2025-06-03': 'Wand',
	// '2025-06-04': 'Xylophone',
	// '2025-06-05': 'Yacht',
	// '2025-06-06': 'Zebra',
};

export const embedWord = async (word: string) => {
	const res = await openai.embeddings.create({
		model: 'text-embedding-3-small',
		input: word,
	});
	const embeddings = res.data[0]?.embedding;
	if (!embeddings) throw new Error('Failed to embed word');
	return embeddings;
};

const vEmbeddings = v.array(v.number());
export const getGuessEmbedding = async (guess: string, date: Date) => {
	const datestamp = getDateStamp(date);
	const key = `guess-${datestamp}-${guess}`;
	const value = await env.MY_KV.get(key, 'json');
	if (value) return v.parse(vEmbeddings, value);
	const embedded = await embedWord(guess);
	await env.MY_KV.put(key, JSON.stringify(embedded));
	return embedded;
};

const embedAndStore = async (word: string, datestamp: string) => {
	const embeddings = await embedWord(word);

	const value = {
		word,
		embeddings,
	};

	await env.MY_KV.put(datestamp, JSON.stringify(value));
	return value;
};

export const getWordOfTheDay = async (date: Date) => {
	const datestamp = getDateStamp(date);
	const wordOfTheDay = await env.MY_KV.get(datestamp, 'json');
	if (!wordOfTheDay) {
		const fromLibrary = LIBRARY[datestamp];
		if (fromLibrary) return await embedAndStore(fromLibrary, datestamp);

		// make it up
		const completion = await openai.chat.completions.create({
			model: 'gpt-4o-mini',
			max_tokens: 4,
			messages: [
				{
					role: 'system',
					content: `
      You are a word generator.
      You are given a date and you need to generate a word for that date.
      The word should be a single word that is related to the date.
      The word should be a single word that is a common word.
      The word should be a single word that is NOT a proper noun.
      Just return the word, nothing else.
      Day: ${datestamp}
      Word:
`,
				},
			],
		});
		const word = completion.choices[0]?.message.content?.toLowerCase().trim();
		if (!word) throw new Error('Failed to generate word');
		return await embedAndStore(word, datestamp);
	}
	return v.parse(vWordOfTheDay, wordOfTheDay);
};

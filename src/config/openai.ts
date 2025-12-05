import OpenAI from "openai";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
	throw new Error("OPENAI_API_KEY is not set");
}

/**
 * Cliente OpenAI configurado
 * Pode ser injetado como dependência para facilitar testes
 */
export const createOpenAIClient = (): OpenAI => {
	return new OpenAI({ apiKey: OPENAI_API_KEY });
};

export const openaiClient = createOpenAIClient();


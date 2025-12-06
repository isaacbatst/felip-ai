import type { MessageParser } from "../handlers/message-handler.js";
import type { PurchaseRequest } from "../types/purchase.js";
import type { MessageParserConfig } from "../services/message-parser.js";
import { createMessageParser as createRealMessageParser } from "../services/message-parser.js";
import type OpenAI from "openai";

/**
 * Adapter that implements MessageParser interface using the real message parser implementation
 * Follows Adapter pattern to bridge between interface and implementation
 */
export class MessageParserAdapter implements MessageParser {
	private parseMessage: (text: string) => Promise<PurchaseRequest | null>;

	constructor(openaiClient: OpenAI, config: MessageParserConfig) {
		this.parseMessage = createRealMessageParser(openaiClient, config);
	}

	async parse(text: string): Promise<PurchaseRequest | null> {
		return await this.parseMessage(text);
	}
}


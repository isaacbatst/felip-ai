import { createBot, startBot } from "./bot/bot-factory.js";
import { openaiClient } from "./config/openai.js";
import { PRICE_TABLE } from "./config/price-table.js";
import {
	createMessageParser,
	DEFAULT_PARSER_CONFIG,
} from "./services/message-parser.js";

console.log("[DEBUG] Starting application initialization...");

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TELEGRAM_BOT_TOKEN) {
	console.error("[DEBUG] TELEGRAM_BOT_TOKEN is not set");
	throw new Error("TELEGRAM_BOT_TOKEN is not set");
}

console.log("[DEBUG] TELEGRAM_BOT_TOKEN found, creating message parser...");
const parseMessage = createMessageParser(openaiClient, DEFAULT_PARSER_CONFIG);
console.log("[DEBUG] Message parser created with config:", {
	model: DEFAULT_PARSER_CONFIG.model,
	systemPromptLength: DEFAULT_PARSER_CONFIG.systemPrompt.length,
});

console.log("[DEBUG] Creating bot instance...");
const bot = createBot({
	token: TELEGRAM_BOT_TOKEN,
	messageHandlerDeps: {
		parseMessage,
		priceTable: PRICE_TABLE,
	},
});
console.log("[DEBUG] Bot instance created successfully");

console.log("[DEBUG] Starting bot...");
startBot(bot).catch((error) => {
	console.error("[DEBUG] Error starting bot:", error);
	console.error(error);
	process.exit(1);
});

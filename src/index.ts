import { createBot, startBot } from "./bot/bot-factory.js";
import { openaiClient } from "./config/openai.js";
import { fetchPriceTableFromSheets } from "./services/google-sheets.js";
import {
	createMessageParser,
	DEFAULT_PARSER_CONFIG,
} from "./services/message-parser.js";

console.log("[DEBUG] Starting application initialization...");

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GOOGLE_SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const GOOGLE_SPREADSHEET_RANGE = process.env.GOOGLE_SPREADSHEET_RANGE; // Opcional: "Sheet1" ou "Sheet1!A:C" ou deixe vazio para auto-detectar
const GOOGLE_SERVICE_ACCOUNT_KEY_FILE = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
if (!TELEGRAM_BOT_TOKEN) {
	console.error("[DEBUG] TELEGRAM_BOT_TOKEN is not set");
	throw new Error("TELEGRAM_BOT_TOKEN is not set");
}

if (!GOOGLE_SPREADSHEET_ID) {
	console.error("[DEBUG] GOOGLE_SPREADSHEET_ID is not set");
	throw new Error("GOOGLE_SPREADSHEET_ID is not set");
}

if (!GOOGLE_SERVICE_ACCOUNT_KEY_FILE) {
	console.error("[DEBUG] GOOGLE_SERVICE_ACCOUNT_KEY_FILE is not set");
	throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY_FILE is not set");
}

console.log("[DEBUG] Fetching price table from Google Sheets...");
const PRICE_TABLE_RESULT = await fetchPriceTableFromSheets(
	GOOGLE_SPREADSHEET_ID,
	GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
	GOOGLE_SPREADSHEET_RANGE,
).catch((error) => {
	console.error("[DEBUG] Error fetching price table from Google Sheets:", error);
	throw error;
});
console.log("[DEBUG] Price table loaded successfully");
console.log("[DEBUG] Price table:", PRICE_TABLE_RESULT.priceTable);
console.log("[DEBUG] Available miles:", PRICE_TABLE_RESULT.availableMiles);

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
		priceTable: PRICE_TABLE_RESULT.priceTable,
		availableMiles: PRICE_TABLE_RESULT.availableMiles,
	},
});
console.log("[DEBUG] Bot instance created successfully");

console.log("[DEBUG] Starting bot...");
startBot(bot).catch((error) => {
	console.error("[DEBUG] Error starting bot:", error);
	console.error(error);
	process.exit(1);
});

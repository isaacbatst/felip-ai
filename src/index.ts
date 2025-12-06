import { MessageParserAdapter } from "./adapters/message-parser-adapter.js";
import { PriceTableProviderAdapter } from "./adapters/price-table-provider-adapter.js";
import { createBot, startBot } from "./bot/bot-factory.js";
import { openaiClient } from "./config/openai.js";
import { DEFAULT_PARSER_CONFIG } from "./services/message-parser.js";
import { createPriceTableCacheV2 } from "./services/price-table-cache.js";

console.log("[DEBUG] Starting application initialization...");

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GOOGLE_SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
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

console.log("[DEBUG] Creating price table cache v2...");
const GOOGLE_SPREADSHEET_RANGE_V2 = process.env.GOOGLE_SPREADSHEET_RANGE_V2; // Opcional: "Sheet2" ou "Sheet2!A:B" para v2
const priceTableCacheV2 = createPriceTableCacheV2({
	spreadsheetId: GOOGLE_SPREADSHEET_ID,
	keyFile: GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
	...(GOOGLE_SPREADSHEET_RANGE_V2 && { range: GOOGLE_SPREADSHEET_RANGE_V2 }),
	ttlSeconds: 60,
});
console.log("[DEBUG] Price table cache v2 created successfully");

console.log("[DEBUG] TELEGRAM_BOT_TOKEN found, creating message parser adapter...");
const messageParser = new MessageParserAdapter(openaiClient, DEFAULT_PARSER_CONFIG);
console.log("[DEBUG] Message parser adapter created with config:", {
	model: DEFAULT_PARSER_CONFIG.model,
	systemPromptLength: DEFAULT_PARSER_CONFIG.systemPrompt.length,
});

console.log("[DEBUG] Creating price table provider adapter (v2)...");
const priceTableProvider = new PriceTableProviderAdapter(priceTableCacheV2);
console.log("[DEBUG] Price table provider adapter created successfully");

console.log("[DEBUG] Creating bot instance...");
const bot = createBot({
	token: TELEGRAM_BOT_TOKEN,
	messageHandlerDeps: {
		messageParser,
		priceTableProvider,
	},
	priceTableCache: priceTableCacheV2, // Using v2 cache for command handler
});
console.log("[DEBUG] Bot instance created successfully");

console.log("[DEBUG] Starting bot...");
startBot(bot).catch((error) => {
	console.error("[DEBUG] Error starting bot:", error);
	console.error(error);
	process.exit(1);
});

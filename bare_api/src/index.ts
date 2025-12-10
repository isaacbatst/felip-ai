import { MessageParserAdapter } from "./adapters/message-parser-adapter.js";
import { PriceTableProviderAdapter } from "./adapters/price-table-provider-adapter.js";
import { createBot, startBot } from "./bot/bot-factory.js";
import { openaiClient } from "./config/openai.js";
import { DEFAULT_PARSER_CONFIG } from "./services/message-parser.js";
import { createPriceTableCacheV2 } from "./services/price-table-cache.js";
import { createTelegramUserClient } from "./services/telegram-client.js";

console.log("[DEBUG] Starting application initialization...");

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GOOGLE_SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const GOOGLE_SERVICE_ACCOUNT_KEY_FILE = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
const TELEGRAM_API_ID = process.env.TELEGRAM_API_ID;
const TELEGRAM_API_HASH = process.env.TELEGRAM_API_HASH;
const TELEGRAM_PHONE = '+5584987287398';

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

if (!TELEGRAM_API_ID) {
	console.error("[DEBUG] TELEGRAM_API_ID is not set");
	throw new Error("TELEGRAM_API_ID is not set");
}

if (!TELEGRAM_API_HASH) {
	console.error("[DEBUG] TELEGRAM_API_HASH is not set");
	throw new Error("TELEGRAM_API_HASH is not set");
}

if (!TELEGRAM_PHONE) {
	console.error("[DEBUG] TELEGRAM_PHONE is not set");
	throw new Error("TELEGRAM_PHONE is not set");
}

console.log("[DEBUG] Creating price table cache v2...");
const GOOGLE_SPREADSHEET_RANGE_V2 = process.env.GOOGLE_SPREADSHEET_RANGE_V2; // Opcional: "Sheet2" ou "Sheet2!A:B" para v2
const priceTableCacheV2 = createPriceTableCacheV2({
	spreadsheetId: GOOGLE_SPREADSHEET_ID,
	keyFile: GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
	...(GOOGLE_SPREADSHEET_RANGE_V2 && { range: GOOGLE_SPREADSHEET_RANGE_V2 }),
	ttlSeconds: 10,
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

// Initialize Telegram User Client (POC)
console.log("[DEBUG] Initializing Telegram User Client (POC)...");
let isShuttingDown = false;
const telegramUserClient = createTelegramUserClient(
	{
		apiId: Number.parseInt(TELEGRAM_API_ID, 10),
		apiHash: TELEGRAM_API_HASH,
		databaseDirectory: "./tdlib-db",
		filesDirectory: "./tdlib-files",
	},
	{
		onError: (error) => {
			// Don't log errors during shutdown, especially authorizationStateClosed
			if (isShuttingDown) {
				return;
			}
			// Also ignore authorizationStateClosed errors as they're expected during shutdown
			if (error instanceof Error && error.message.includes("authorizationStateClosed")) {
				return;
			}
			console.error("[ERROR] Telegram User Client error:", error);
		},
		onUpdate: (update: unknown) => {
			// Don't process updates during shutdown
			if (isShuttingDown) {
				return;
			}
			// Filtrar apenas updates importantes
			if (typeof update === "object" && update !== null && "_" in update) {
				const updateType = (update as { _: string })._;
				if (updateType === "updateConnectionState") {
					const stateObj = update as { state?: { _?: string } };
					const state = stateObj?.state?._;
					if (state === "connectionStateReady") {
						console.log("[DEBUG] ✅ Telegram User Client connected and ready");
					} else if (state === "connectionStateConnecting") {
						console.log("[DEBUG] 🔄 Telegram User Client connecting...");
					}
				} else if (updateType === "updateAuthorizationState") {
					const authObj = update as { authorization_state?: { _?: string } };
					const authState = authObj?.authorization_state?._;
					// Ignore authorizationStateClosed during shutdown
					if (authState === "authorizationStateClosed") {
						return;
					}
					if (authState === "authorizationStateReady") {
						console.log("[DEBUG] ✅ Authorization ready");
					} else if (authState === "authorizationStateWaitPhoneNumber") {
						console.log("[DEBUG] 📱 Waiting for phone number...");
					} else if (authState === "authorizationStateWaitCode") {
						console.log("[DEBUG] 🔐 Waiting for code...");
					} else if (authState === "authorizationStateWaitPassword") {
						console.log("[DEBUG] 🔒 Waiting for password...");
					}
				}
			}
			// Ignorar outros updates para reduzir logs
		},
	},
);

// Start the user client and test fetching user info
telegramUserClient.start(TELEGRAM_PHONE)
	.then((userInfo) => {
		console.log("[DEBUG] ✅ Telegram User Client started successfully");
		console.log("[DEBUG] 📋 User information retrieved:", userInfo);
	})
	.catch((error) => {
		// Don't log errors during shutdown, especially authorizationStateClosed
		if (isShuttingDown) {
			return;
		}
		// Also ignore authorizationStateClosed errors as they're expected during shutdown
		if (error instanceof Error && error.message.includes("authorizationStateClosed")) {
			return;
		}
		console.error("[DEBUG] ❌ Error starting Telegram User Client:", error);
		console.error(error);
		process.exit(1);
	});

console.log("[DEBUG] Starting bot...");
let botRunner: Awaited<ReturnType<typeof startBot>> | null = null;
startBot(bot)
	.then((runner) => {
		botRunner = runner;
		console.log("[DEBUG] Bot started successfully");
	})
	.catch((error) => {
		console.error("[DEBUG] Error starting bot:", error);
		console.error(error);
		process.exit(1);
	});

// Unified graceful shutdown handler for both Bot and Telegram User Client
const shutdownAll = async (signal: string) => {
	if (isShuttingDown) {
		return; // Prevent multiple shutdown attempts
	}
	isShuttingDown = true;
	
	console.log(`[DEBUG] Shutting down (${signal})...`);
	
	// Close stdin immediately to release any readline interfaces that might be blocking
	try {
		if (process.stdin.isTTY) {
			process.stdin.setRawMode(false);
		}
		process.stdin.pause();
		process.stdin.destroy();
	} catch (error) {
		// Ignore errors when closing stdin
	}
	
	// Stop bot runner
	if (botRunner) {
		try {
			console.log("[DEBUG] Stopping bot runner...");
			if (botRunner.isRunning()) {
				await botRunner.stop();
				console.log("[DEBUG] Bot runner stopped successfully");
			}
		} catch (error) {
			console.error("[ERROR] Error stopping bot runner:", error);
		}
	}
	
	// Close Telegram User Client
	try {
		console.log("[DEBUG] Closing Telegram User Client...");
		await telegramUserClient.close();
		console.log("[DEBUG] Telegram User Client closed successfully");
	} catch (error) {
		// Only log errors if we're not already shutting down due to authorizationStateClosed
		if (!(error instanceof Error && error.message.includes("authorizationStateClosed"))) {
			console.error("[ERROR] Error closing Telegram User Client:", error);
		}
	}
	
	console.log("[DEBUG] Shutdown complete");
	
	// Exit the process
	process.exitCode = 0;
	process.exit(0);
};

// Register unified shutdown handlers
process.once("SIGINT", () => {
	void shutdownAll("SIGINT");
});
process.once("SIGTERM", () => {
	void shutdownAll("SIGTERM");
});

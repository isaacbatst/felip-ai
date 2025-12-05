import { Bot } from "grammy";
import type { MessageHandlerDependencies } from "../handlers/message-handler.js";
import { createMessageHandler } from "../handlers/message-handler.js";
import { createStartCommandHandler } from "../handlers/command-handler.js";

/**
 * Configuração para criar o bot
 */
export interface BotConfig {
	token: string;
	messageHandlerDeps: MessageHandlerDependencies;
	onStart?: (botInfo: { username?: string }) => void;
}

/**
 * Cria e configura o bot usando composição
 * Função factory que permite fácil configuração e teste
 */
export const createBot = (config: BotConfig): Bot => {
	console.log("[DEBUG] createBot: Creating new Bot instance...");
	const bot = new Bot(config.token);

	// Registra handlers usando composição
	console.log("[DEBUG] createBot: Registering /start command handler...");
	bot.command("start", createStartCommandHandler({
		priceTable: config.messageHandlerDeps.priceTable,
	}));
	console.log("[DEBUG] createBot: Registering message:text handler...");
	bot.on("message:text", createMessageHandler(config.messageHandlerDeps));
	console.log("[DEBUG] createBot: Bot instance configured successfully");

	return bot;
};

/**
 * Inicia o bot com tratamento de erros
 */
export const startBot = async (
	bot: Bot,
	onStart?: (botInfo: { username?: string }) => void,
): Promise<void> => {
	console.log("[DEBUG] startBot: Initiating bot startup...");
	return bot
		.start({
			onStart(botInfo) {
				console.log(`[DEBUG] startBot: Bot ${botInfo.username} started successfully`);
				onStart?.(botInfo);
			},
		});
};


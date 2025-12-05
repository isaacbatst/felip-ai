import { run, sequentialize, type RunnerHandle } from "@grammyjs/runner";
import { Bot } from "grammy";
import { createStartCommandHandler } from "../handlers/command-handler.js";
import type { MessageHandlerDependencies } from "../handlers/message-handler.js";
import { createMessageHandler } from "../handlers/message-handler.js";

/**
 * Configuração para criar o bot
 */
export interface BotConfig {
	token: string;
	messageHandlerDeps: MessageHandlerDependencies;
}

const stopRunner = async (runner: RunnerHandle) => runner.isRunning() && runner.stop();

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
		priceTableCache: config.messageHandlerDeps.priceTableCache,
	}));
	console.log("[DEBUG] createBot: Registering message:text handler...");
	bot.on("message:text", sequentialize((ctx) => {
		const chat = ctx.chat?.id.toString();
		const user = ctx.from?.id.toString();
		return [chat, user].filter((con) => con !== undefined);
	}), createMessageHandler(config.messageHandlerDeps));
	console.log("[DEBUG] createBot: Bot instance configured successfully");

	return bot;
};

/**
 * Inicia o bot com tratamento de erros
 */
export const startBot = async (
	bot: Bot,
): Promise<void> => {
	console.log("[DEBUG] startBot: Initiating bot startup...");
	bot.catch((error) => {
		console.error("[ERROR] Bot error:", error);
	});
	const runner = run(bot, {
		sink: {
			concurrency: 5,
		}
	});
	process.once("SIGINT", () => stopRunner(runner));
	process.once("SIGTERM", () => stopRunner(runner));
};

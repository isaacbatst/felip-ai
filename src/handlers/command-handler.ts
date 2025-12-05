import type { Context } from "grammy";
import type { PriceTableByCpf } from "../types/price.js";
import type { PriceTableCache } from "../services/price-table-cache.js";

/**
 * Dependências do handler de comandos
 * Permite dependency injection para testes e flexibilidade
 */
export interface StartCommandHandlerDependencies {
	priceTableCache: PriceTableCache;
}

/**
 * Formata a tabela de preços em uma string legível
 * Função pura de formatação
 */
const formatPriceTable = (priceTable: PriceTableByCpf): string => {
	const lines: string[] = [];
	
	const cpfCounts = Object.keys(priceTable)
		.map(Number)
		.sort((a, b) => a - b);
	
	for (const cpfCount of cpfCounts) {
		const table = priceTable[cpfCount];
		if (!table) continue;
		
		lines.push(`\n${cpfCount} CPF:`);
		
		const quantities = Object.keys(table)
			.map(Number)
			.sort((a, b) => a - b);
		
		for (const qty of quantities) {
			const price = table[qty];
			if (price !== undefined) {
				lines.push(`  ${qty}k milhas: R$ ${price.toFixed(2)}`);
			}
		}
	}
	
	return lines.join("\n");
};

/**
 * Handler para o comando /start
 * Revalida o cache antes de mostrar a tabela de preços
 */
export const createStartCommandHandler =
	(deps: StartCommandHandlerDependencies) =>
	async (ctx: Context): Promise<void> => {
		const userId = ctx.from?.id;
		const chatId = ctx.chat?.id;
		console.log("[DEBUG] command-handler: /start command received", {
			userId,
			chatId,
		});

		// Revalida o cache antes de mostrar a tabela
		console.log("[DEBUG] command-handler: Revalidating cache for /start command...");
		const priceTableResult = await deps.priceTableCache.get(true);
		const priceTableFormatted = formatPriceTable(priceTableResult.priceTable);
		
		const welcomeMessage =
			"📊 Tabela de Preços:" +
			priceTableFormatted;

		console.log("[DEBUG] command-handler: Sending welcome message");
		await ctx.reply(welcomeMessage);
		console.log("[DEBUG] command-handler: Welcome message sent");
	};


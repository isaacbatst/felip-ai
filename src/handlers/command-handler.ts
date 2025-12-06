import type { Context } from "grammy";
import type { PriceTableV2 } from "../types/price.js";
import type { PriceTableCacheV2 } from "../services/price-table-cache.js";

/**
 * Dependências do handler de comandos
 * Permite dependency injection para testes e flexibilidade
 */
export interface StartCommandHandlerDependencies {
	priceTableCache: PriceTableCacheV2;
}

/**
 * Formata a tabela de preços v2 em uma string legível
 * Função pura de formatação
 * Todos os registros são para 1 CPF
 */
const formatPriceTableV2 = (priceTable: PriceTableV2): string => {
	const lines: string[] = [];
	
	const quantities = Object.keys(priceTable)
		.map(Number)
		.sort((a, b) => a - b);
	
	lines.push("\n1 CPF:");
	
	for (const qty of quantities) {
		const price = priceTable[qty];
		if (price !== undefined) {
			lines.push(`  ${qty}k milhas: R$ ${price.toFixed(2)}`);
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
		console.log("[DEBUG] command-handler: Revalidating cache v2 for /start command...");
		const priceTableResult = await deps.priceTableCache.get(true);
		const priceTableFormatted = formatPriceTableV2(priceTableResult.priceTable);
		
		const welcomeMessage =
			"📊 Tabela de Preços (1 CPF):" +
			priceTableFormatted;

		console.log("[DEBUG] command-handler: Sending welcome message");
		await ctx.reply(welcomeMessage);
		console.log("[DEBUG] command-handler: Welcome message sent");
	};


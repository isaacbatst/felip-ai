/**
 * Formata a resposta da cotação de forma estruturada
 * Função pura de formatação
 */
export const formatQuoteResponse = (
	quantity: number,
	cpfCount: number,
	price: number,
	airline?: string,
	requestedQuantity?: number,
): string => {
	console.log("[DEBUG] quote-formatter: Formatting quote response", {
		quantity,
		cpfCount,
		price,
		airline,
		requestedQuantity,
	});

	const airlineText = airline ? ` ${airline.toUpperCase()}` : "";
	const cpfText = cpfCount > 1 ? "s" : "";
	
	let quantityText = `📊 ${quantity}k milhas`;
	if (requestedQuantity !== undefined && requestedQuantity > quantity) {
		quantityText += ` (disponível: ${quantity}k de ${requestedQuantity}k solicitadas)`;
	}

	const formatted = (
		`💰 Cotação${airlineText}\n\n` +
		`${quantityText}\n` +
		`👤 ${cpfCount} CPF${cpfText}\n\n` +
		`💵 Preço: R$ ${price.toFixed(2)}`
	);

	console.log("[DEBUG] quote-formatter: Formatted response:", formatted);
	return formatted;
};

/**
 * Formata mensagem de erro
 */
export const formatErrorMessage = (reason: string): string => {
	console.log("[DEBUG] quote-formatter: Formatting error message:", reason);
	const formatted = `❌ ${reason}`;
	console.log("[DEBUG] quote-formatter: Formatted error:", formatted);
	return formatted;
};


import { Injectable } from '@nestjs/common';

/**
 * Service responsável por formatar respostas de cotação
 * Single Responsibility: apenas formatação de mensagens
 */
@Injectable()
export class QuoteFormatterService {
  /**
   * Formata a resposta da cotação de forma estruturada
   */
  formatQuoteResponse(
    quantity: number,
    cpfCount: number,
    price: number,
    airline?: string,
    requestedQuantity?: number,
  ): string {
    const airlineText = airline ? ` ${airline.toUpperCase()}` : '';
    const cpfText = cpfCount > 1 ? 's' : '';

    let quantityText = `📊 ${quantity}k milhas`;
    if (requestedQuantity !== undefined && requestedQuantity > quantity) {
      quantityText += ` (disponível: ${quantity}k de ${requestedQuantity}k solicitadas)`;
    }

    return (
      `💰 Cotação${airlineText}\n\n` +
      `${quantityText}\n` +
      `👤 ${cpfCount} CPF${cpfText}\n\n` +
      `💵 Preço: R$ ${price.toFixed(2)}`
    );
  }

  /**
   * Formata mensagem de erro
   */
  formatErrorMessage(reason: string): string {
    return `❌ ${reason}`;
  }

  /**
   * Formata a tabela de preços v2 em uma string legível
   */
  formatPriceTableV2(priceTable: Record<number, number>): string {
    const lines: string[] = [];

    const quantities = Object.keys(priceTable)
      .map(Number)
      .sort((a, b) => a - b);

    lines.push('\n1 CPF:');

    for (const qty of quantities) {
      const price = priceTable[qty];
      if (price !== undefined) {
        lines.push(`  ${qty}k milhas: R$ ${price.toFixed(2)}`);
      }
    }

    return lines.join('\n');
  }
}


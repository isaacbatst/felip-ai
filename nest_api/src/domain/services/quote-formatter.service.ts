import { Injectable } from '@nestjs/common';
import type { Provider } from '../types/provider.types';
import type { PriceTableV2 } from '../types/price.types';

/**
 * Service responsável por formatar respostas de cotação
 * Single Responsibility: apenas formatação de mensagens
 */
@Injectable()
export class QuoteFormatterService {
  /**
   * Formata nome de provedor para exibição amigável
   * Como providers são dinâmicos, apenas capitaliza e formata o nome original
   */
  private getProviderDisplayName(provider: Provider): string {
    // Se já está bem formatado, retorna como está
    // Caso contrário, capitaliza palavras
    return provider
      .split(' ')
      .map((word) => {
        // Mantém siglas em maiúsculas (ex: SMILES, LATAM)
        if (word === word.toUpperCase() && word.length <= 5) {
          return word;
        }
        // Capitaliza primeira letra
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(' ');
  }

  /**
   * Formata a resposta da cotação de forma estruturada
   */
  formatQuoteResponse(
    quantity: number,
    cpfCount: number,
    price: number,
    airline?: string,
    requestedQuantity?: number,
    provider?: Provider,
  ): string {
    const airlineText = airline ? ` ${airline.toUpperCase()}` : '';
    const cpfText = cpfCount > 1 ? 's' : '';
    const providerText = provider ? ` (${this.getProviderDisplayName(provider)})` : '';

    let quantityText = `📊 ${quantity}k milhas`;
    if (requestedQuantity !== undefined && requestedQuantity > quantity) {
      quantityText += ` (disponível: ${quantity}k de ${requestedQuantity}k solicitadas)`;
    }

    return (
      `💰 Cotação${airlineText}${providerText}\n\n` +
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
   * Formata uma tabela de preços v2 em uma string legível
   */
  formatPriceTableV2(priceTable: PriceTableV2): string {
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

  /**
   * Formata múltiplas tabelas de preços por provedor
   */
  formatPriceTablesByProvider(priceTables: Record<Provider, PriceTableV2>): string {
    const lines: string[] = [];
    const providers = Object.keys(priceTables) as Provider[];

    for (const provider of providers) {
      const priceTable = priceTables[provider];
      if (!priceTable || Object.keys(priceTable).length === 0) {
        continue;
      }

      const providerName = this.getProviderDisplayName(provider);
      lines.push(`\n📊 ${providerName}:`);
      lines.push(this.formatPriceTableV2(priceTable));
    }

    return lines.join('\n');
  }
}


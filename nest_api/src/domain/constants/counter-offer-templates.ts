/**
 * Counter offer message templates
 * Used when sending private counter offers to buyers
 */
export const COUNTER_OFFER_TEMPLATES: Record<number, string> = {
  1: `Olá, tudo bem? Podemos atender a sua demanda da seguinte cotação 

✈️{PROGRAMA}
📊 {QUANTIDADE}k milhas
👤 {CPF_COUNT} CPF

Vamos nessa a R$ {PRECO}?!`,

  2: `Oi! Vi seu interesse em {PROGRAMA}. 

Tenho disponível {QUANTIDADE}k milhas por R$ {PRECO}/milheiro.

Vamos? 🤝`,

  3: `Olá! Sobre sua demanda de {PROGRAMA}:

📊 {QUANTIDADE}k milhas
💰 R$ {PRECO}/milheiro

Manda msg se tiver interesse! 👍`,
};

/**
 * Available template IDs
 */
export const COUNTER_OFFER_TEMPLATE_IDS = [1, 2, 3] as const;

export type CounterOfferTemplateId = (typeof COUNTER_OFFER_TEMPLATE_IDS)[number];

/**
 * Template descriptions for display in dashboard
 */
export const COUNTER_OFFER_TEMPLATE_DESCRIPTIONS: Record<number, string> = {
  1: 'Formal - Com emojis de avião e detalhes estruturados',
  2: 'Direto - Mensagem objetiva e amigável',
  3: 'Informal - Tom descontraído com emojis',
};

/**
 * Build a counter offer message from a template
 * @param templateId - The template ID to use (1, 2, or 3)
 * @param programa - The miles program name (e.g., "SMILES")
 * @param quantidade - The quantity in thousands (e.g., 60 for 60k)
 * @param cpfCount - Number of CPFs
 * @param preco - The price per thousand miles
 * @returns The formatted message
 */
export function buildCounterOfferMessage(
  templateId: number,
  programa: string,
  quantidade: number,
  cpfCount: number,
  preco: number,
): string {
  const template = COUNTER_OFFER_TEMPLATES[templateId] || COUNTER_OFFER_TEMPLATES[1];
  
  const precoFormatado = Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(preco);

  return template
    .replace('{PROGRAMA}', programa)
    .replace('{QUANTIDADE}', String(quantidade))
    .replace('{CPF_COUNT}', String(cpfCount))
    .replace('{PRECO}', precoFormatado);
}

/**
 * Call to action message templates
 * Used when sending private messages to close deals (when accepted price >= our price)
 */
export const CALL_TO_ACTION_TEMPLATES: Record<number, string> = {
  // Estruturado com lista - detalhes organizados em linhas separadas
  1: `Olá! 👋

{PROGRAMA}
{QUANTIDADE}k milhas
{CPF_COUNT} CPF
R$ {PRECO}/milheiro

Vamos fechar?!`,

  // Compacto em linha única - direto e objetivo
  2: `Olá!

{QUANTIDADE}k {PROGRAMA} {CPF_COUNT} CPF por R$ {PRECO}

Vamos emitir?!`,
};

/**
 * Available call to action template IDs
 */
export const CALL_TO_ACTION_TEMPLATE_IDS = [1, 2] as const;

export type CallToActionTemplateId = (typeof CALL_TO_ACTION_TEMPLATE_IDS)[number];

/**
 * Call to action template descriptions for display in dashboard
 */
export const CALL_TO_ACTION_TEMPLATE_DESCRIPTIONS: Record<number, string> = {
  1: 'Estruturado - Detalhes organizados em linhas separadas',
  2: 'Compacto - Direto e objetivo em linha única',
};

/**
 * Build a call to action message from a template
 * @param templateId - The template ID to use (1 or 2)
 * @param programa - The miles program name (e.g., "SMILES")
 * @param quantidade - The quantity in thousands (e.g., 60 for 60k)
 * @param cpfCount - Number of CPFs
 * @param preco - The price per thousand miles
 * @returns The formatted message
 */
export function buildCallToActionMessage(
  templateId: number,
  programa: string,
  quantidade: number,
  cpfCount: number,
  preco: number,
): string {
  const template = CALL_TO_ACTION_TEMPLATES[templateId] || CALL_TO_ACTION_TEMPLATES[1];
  
  const precoFormatado = Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(preco);

  return template
    .replace('{PROGRAMA}', programa)
    .replace('{QUANTIDADE}', String(quantidade))
    .replace('{CPF_COUNT}', String(cpfCount))
    .replace('{PRECO}', precoFormatado);
}

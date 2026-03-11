import { applyTemplatePlaceholders, buildCounterOfferMessage, buildCallToActionMessage } from './counter-offer-templates';

describe('applyTemplatePlaceholders', () => {
  const baseValues = {
    programa: 'SMILES',
    quantidade: 50,
    cpfCount: 2,
    preco: '18,50',
  };

  it('should replace all known placeholders', () => {
    const template = '{PROGRAMA} {QUANTIDADE}k {CPF_COUNT} CPF R$ {PRECO}';
    const result = applyTemplatePlaceholders(template, baseValues);
    expect(result).toBe('SMILES 50k 2 CPF R$ 18,50');
  });

  it('should replace {MENSAGEM_ORIGINAL} when provided', () => {
    const template = 'Sobre: {MENSAGEM_ORIGINAL}\n\nOferta: R$ {PRECO}';
    const result = applyTemplatePlaceholders(template, {
      ...baseValues,
      mensagemOriginal: 'Preciso de 100k smiles 2 CPF',
    });
    expect(result).toBe('Sobre: Preciso de 100k smiles 2 CPF\n\nOferta: R$ 18,50');
  });

  it('should replace {MENSAGEM_ORIGINAL} with empty string when not provided', () => {
    const template = 'Msg: {MENSAGEM_ORIGINAL} Oferta: R$ {PRECO}';
    const result = applyTemplatePlaceholders(template, baseValues);
    expect(result).toBe('Msg:  Oferta: R$ 18,50');
  });

  it('should replace all occurrences of the same placeholder', () => {
    const template = '{PROGRAMA} - compre {PROGRAMA} agora!';
    const result = applyTemplatePlaceholders(template, baseValues);
    expect(result).toBe('SMILES - compre SMILES agora!');
  });

  it('should format numeric preco', () => {
    const template = 'R$ {PRECO}';
    const result = applyTemplatePlaceholders(template, { ...baseValues, preco: 18.5 });
    expect(result).toBe('R$ 18,50');
  });
});

describe('buildCounterOfferMessage', () => {
  it('should still work with existing template IDs', () => {
    const result = buildCounterOfferMessage(1, 'SMILES', 50, 2, '18,50');
    expect(result).toContain('SMILES');
    expect(result).toContain('50');
    expect(result).toContain('18,50');
  });
});

describe('buildCallToActionMessage', () => {
  it('should still work with existing template IDs', () => {
    const result = buildCallToActionMessage(1, 'SMILES', 50, 2, '18,50');
    expect(result).toContain('SMILES');
    expect(result).toContain('50');
    expect(result).toContain('18,50');
  });
});

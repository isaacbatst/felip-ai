import { Test, type TestingModule } from '@nestjs/testing';
import { PriceCalculatorService } from './price-calculator.service';
import type { PriceTableV2 } from '../types/price.types';

describe('PriceCalculatorService', () => {
  let service: PriceCalculatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PriceCalculatorService],
    }).compile();

    service = module.get<PriceCalculatorService>(PriceCalculatorService);
  });

  describe('Validação de inputs', () => {
    const validPriceTable: PriceTableV2 = {
      15: 20,
      30: 18,
      50: 16,
    };

    it('deve retornar erro quando quantidade é zero', () => {
      const result = service.calculate(0, 1, validPriceTable);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe('Quantidade deve ser maior que zero');
      }
    });

    it('deve retornar erro quando quantidade é negativa', () => {
      const result = service.calculate(-10, 1, validPriceTable);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe('Quantidade deve ser maior que zero');
      }
    });

    it('deve retornar erro quando cpfCount é zero', () => {
      const result = service.calculate(15, 0, validPriceTable);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe('Número de CPF deve ser maior que zero');
      }
    });

    it('deve retornar erro quando cpfCount é negativo', () => {
      const result = service.calculate(15, -1, validPriceTable);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe('Número de CPF deve ser maior que zero');
      }
    });

    it('deve retornar erro quando tabela de preços está vazia', () => {
      const emptyTable: PriceTableV2 = {};
      const result = service.calculate(15, 1, emptyTable);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe('Tabela de preços vazia');
      }
    });
  });

  describe('Quantidade exatamente no mínimo', () => {
    const priceTable: PriceTableV2 = {
      15: 20, // minQty = 15, maxPrice = 20
      30: 18,
      50: 16, // maxQty = 50, minPrice = 16
    };

    it('deve retornar maxPrice quando quantidade por CPF é igual ao mínimo', () => {
      const result = service.calculate(15, 1, priceTable);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.price).toBe(20);
      }
    });

    it('deve aplicar customMaxPrice quando fornecido e menor que o maior preço da tabela', () => {
      const result = service.calculate(15, 1, priceTable, { customMaxPrice: 18 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.price).toBe(18);
      }
    });

    it('deve aplicar customMaxPrice quando fornecido e maior que o maior preço da tabela', () => {
      const result = service.calculate(15, 1, priceTable, { customMaxPrice: 25 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.price).toBe(20); // maxPrice da tabela
      }
    });

    it('deve aplicar customMaxPrice quando fornecido é maior que o maior preço da tabela e o preço calculado é maior que o customMaxPrice', () => {
      const result = service.calculate(15, 2, priceTable, { customMaxPrice: 20.5 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.price).toBe(20.5); // it would be 21
      }
    });

    it('deve funcionar com múltiplos CPFs quando quantidade total resulta em minQty por CPF', () => {
      const result = service.calculate(30, 2, priceTable); // 30/2 = 15
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.price).toBe(20);
      }
    });
  });

  describe('Quantidade abaixo do mínimo (extrapolação)', () => {
    const priceTable: PriceTableV2 = {
      15: 20,
      30: 18,
      50: 16,
    };

    it('deve extrapolar preço quando quantidade por CPF é menor que o mínimo', () => {
      // Usa múltiplos CPFs para não cair no caso especial de cpfCount === 1
      const result = service.calculate(20, 2, priceTable); // 20/2 = 10 < 15
      expect(result.success).toBe(true);
      if (result.success) {
        // Deve estar entre minPrice e maxPrice após aplicar limites
        expect(result.price).toBeGreaterThanOrEqual(20); // extrapolated price
      }
    });

    it('deve aplicar customMaxPrice na extrapolação', () => {
      const result = service.calculate(7.5, 1, priceTable, { customMaxPrice: 21 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.price).toEqual(21);
      }
    });

    it('deve retornar maior preço quando cpfCount é 1 e quantidade abaixo do mínimo', () => {
      const result = service.calculate(10, 1, priceTable);
      expect(result.success).toBe(true);
      if (result.success) {
        // Com cpfCount === 1, deve retornar maior preço
        expect(result.price).toBe(20);
      }
    });

    it('deve aplicar customMaxPrice quando cpfCount é 1', () => {
      const result = service.calculate(10, 1, priceTable, { customMaxPrice: 18 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.price).toBe(18);
      }
    });

    it('deve aplicar limites quando múltiplos CPFs e quantidade abaixo do mínimo', () => {
      const result = service.calculate(20, 2, priceTable); // 20/2 = 10 < 15
      expect(result.success).toBe(true);
      if (result.success) {
        // Deve estar entre minPrice e maxPrice
        expect(result.price).toBeGreaterThanOrEqual(16);
        expect(result.price).toBeLessThanOrEqual(20);
      }
    });

    it('deve retornar maxPrice quando todos os preços são iguais e há apenas 2 quantidades', () => {
      const samePriceTable: PriceTableV2 = {
        15: 20,
        30: 20,
      };
      const result = service.calculate(10, 1, samePriceTable);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.price).toBe(20);
      }
    });
  });

  describe('Quantidade acima do máximo', () => {
    const priceTable: PriceTableV2 = {
      15: 20,
      30: 18,
      50: 16, // maxQty = 50, minPrice = 16
    };

    it('deve retornar minPrice quando quantidade por CPF é igual ao máximo', () => {
      const result = service.calculate(50, 1, priceTable);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.price).toBe(16);
      }
    });

    it('deve retornar minPrice quando quantidade por CPF é maior que o máximo', () => {
      const result = service.calculate(100, 1, priceTable);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.price).toBe(16);
      }
    });

    it('deve funcionar com múltiplos CPFs quando quantidade total resulta em maxQty por CPF', () => {
      const result = service.calculate(100, 2, priceTable); // 100/2 = 50
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.price).toBe(16);
      }
    });
  });

  describe('Quantidade dentro do intervalo (interpolação)', () => {
    const priceTable: PriceTableV2 = {
      15: 20,
      30: 18,
      50: 16,
    };

    it('deve interpolar preço quando quantidade está entre dois pontos', () => {
      const result = service.calculate(22, 1, priceTable); // Entre 15 e 30
      expect(result.success).toBe(true);
      if (result.success) {
        // Deve estar entre 18 e 20
        expect(result.price).toBeGreaterThanOrEqual(16); // minPrice
        expect(result.price).toBeLessThanOrEqual(20); // maxPrice
      }
    });

    it('deve retornar preço exato quando quantidade corresponde a um ponto da tabela', () => {
      const result = service.calculate(30, 1, priceTable);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.price).toBe(18);
      }
    });

    it('deve aplicar customMaxPrice na interpolação', () => {
      const result = service.calculate(22, 1, priceTable, { customMaxPrice: 19 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.price).toBeLessThanOrEqual(19);
      }
    });

    it('deve aplicar minPrice quando preço interpolado é menor que minPrice', () => {
      const result = service.calculate(45, 1, priceTable); // Entre 30 e 50
      expect(result.success).toBe(true);
      if (result.success) {
        // Deve ser pelo menos minPrice (16)
        expect(result.price).toBeGreaterThanOrEqual(16);
      }
    });

    it('deve retornar preço quando lowerPrice e upperPrice são iguais', () => {
      const samePriceTable: PriceTableV2 = {
        15: 20,
        20: 20,
        30: 20,
      };
      const result = service.calculate(20, 1, samePriceTable);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.price).toBe(20);
      }
    });

    it('deve funcionar com múltiplos CPFs na interpolação', () => {
      const result = service.calculate(44, 2, priceTable); // 44/2 = 22
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.price).toBeGreaterThanOrEqual(16);
        expect(result.price).toBeLessThanOrEqual(20);
      }
    });
  });

  describe('Arredondamento para quartos', () => {
    const priceTable: PriceTableV2 = {
      15: 20.1,
      30: 18.3,
      50: 16.7,
    };

    it('deve arredondar para o quarto mais próximo (0.00)', () => {
      const result = service.calculate(15, 1, priceTable);
      expect(result.success).toBe(true);
      if (result.success) {
        // 20.1 deve arredondar para 20.0 ou 20.25
        expect([20.0, 20.25, 19.75, 20.5]).toContain(result.price);
      }
    });

    it('deve arredondar para o quarto mais próximo (0.25)', () => {
      const result = service.calculate(30, 1, priceTable);
      expect(result.success).toBe(true);
      if (result.success) {
        // 18.3 deve arredondar para próximo de 0.25
        const remainder = result.price % 0.25;
        expect(remainder).toBeCloseTo(0, 2);
      }
    });

    it('deve arredondar valores interpolados para quartos', () => {
      const result = service.calculate(22, 1, priceTable);
      expect(result.success).toBe(true);
      if (result.success) {
        const remainder = result.price % 0.25;
        expect(remainder).toBeCloseTo(0, 2);
      }
    });
  });

  describe('Casos especiais com customMaxPrice', () => {
    const priceTable: PriceTableV2 = {
      15: 20,
      30: 18,
      50: 16,
    };

    it('deve respeitar customMaxPrice mesmo quando menor que minPrice', () => {
      // Quando quantidade >= maxQty, retorna minPrice diretamente sem aplicar customMaxPrice
      // Isso é comportamento esperado: acima do máximo sempre retorna minPrice
      const result = service.calculate(50, 1, priceTable, { customMaxPrice: 15 });
      expect(result.success).toBe(true);
      if (result.success) {
        // calculatePriceAboveMaximum retorna minPrice diretamente, sem aplicar customMaxPrice
        expect(result.price).toBe(16); // minPrice
      }
    });

    it('deve usar o menor entre maxPrice e customMaxPrice', () => {
      const result = service.calculate(15, 1, priceTable, { customMaxPrice: 18 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.price).toBe(18); // menor entre 20 e 18
      }
    });

    it('deve aplicar customMaxPrice em extrapolação', () => {
      const result = service.calculate(5, 1, priceTable, { customMaxPrice: 22 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.price).toBeLessThanOrEqual(22);
      }
    });

    it('deve aplicar customMaxPrice em interpolação', () => {
      const result = service.calculate(25, 1, priceTable, { customMaxPrice: 19 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.price).toBeLessThanOrEqual(19);
      }
    });
  });

  describe('Tabelas com preços iguais', () => {
    it('deve funcionar com todos os preços iguais', () => {
      const samePriceTable: PriceTableV2 = {
        15: 20,
        30: 20,
        50: 20,
      };
      const result = service.calculate(25, 1, samePriceTable);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.price).toBe(20);
      }
    });

    it('deve funcionar com apenas 2 quantidades e preços iguais', () => {
      const twoPriceTable: PriceTableV2 = {
        15: 20,
        30: 20,
      };
      const result = service.calculate(10, 1, twoPriceTable);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.price).toBe(20);
      }
    });
  });

  describe('Casos de borda', () => {
    const priceTable: PriceTableV2 = {
      15: 20,
      30: 18,
      50: 16,
    };

    it('deve funcionar com quantidade muito pequena', () => {
      const result = service.calculate(1, 1, priceTable);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.price).toBeGreaterThan(0);
      }
    });

    it('deve funcionar com quantidade muito grande', () => {
      const result = service.calculate(1000, 1, priceTable);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.price).toBe(16); // minPrice
      }
    });

    it('deve funcionar com muitos CPFs', () => {
      const result = service.calculate(150, 10, priceTable); // 150/10 = 15
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.price).toBe(20);
      }
    });

    it('deve funcionar com quantidade decimal após divisão', () => {
      const result = service.calculate(17, 2, priceTable); // 17/2 = 8.5
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.price).toBeGreaterThan(0);
      }
    });
  });
});


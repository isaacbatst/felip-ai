import { Test, type TestingModule } from '@nestjs/testing';
import { SubscriptionService, SubscriptionError, EXTRA_GROUP_PRICE_IN_CENTS, MAX_EXTRA_GROUPS } from './subscription.service';
import { CouponService } from './coupon.service';
import { SubscriptionRepository, type SubscriptionData, type SubscriptionWithPlan } from '@/infrastructure/persistence/subscription.repository';
import { SubscriptionPlanRepository, type SubscriptionPlanData } from '@/infrastructure/persistence/subscription-plan.repository';
import { SubscriptionPaymentRepository } from '@/infrastructure/persistence/subscription-payment.repository';
import { ActiveGroupsRepository } from '@/infrastructure/persistence/active-groups.repository';
import { CouponRepository, type CouponData } from '@/infrastructure/persistence/coupon.repository';
import { AppConfigService } from '@/config/app.config';
import { CieloService } from '@/infrastructure/cielo/cielo.service';

// Mock plan data
const starterPlan: SubscriptionPlanData = {
  id: 1,
  name: 'starter',
  displayName: 'Starter',
  priceInCents: 4900,
  groupLimit: 3,
  durationDays: 30,
  isActive: true,
  promotionalPriceInCents: 3430,
  promotionalMonths: 3,
  features: ['3 grupos'],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const scalePlan: SubscriptionPlanData = {
  id: 3,
  name: 'scale',
  displayName: 'Scale',
  priceInCents: 14900,
  groupLimit: null,
  durationDays: 30,
  isActive: true,
  promotionalPriceInCents: null,
  promotionalMonths: null,
  features: ['Ilimitados'],
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeSubscription(overrides: Partial<SubscriptionData> = {}): SubscriptionData {
  return {
    id: 1,
    userId: 'user1',
    planId: 1,
    status: 'active',
    cieloRecurrentPaymentId: 'recur-123',
    cieloCardToken: 'token-123',
    cardLastFourDigits: '1234',
    cardBrand: 'Visa',
    startDate: new Date(),
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    canceledAt: null,
    cancelReason: null,
    trialUsed: false,
    promotionalPaymentsRemaining: 0,
    extraGroups: 0,
    couponId: null,
    bonusGroups: 0,
    couponDiscountMonthsRemaining: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeSubscriptionWithPlan(
  subOverrides: Partial<SubscriptionData> = {},
  plan: SubscriptionPlanData = starterPlan,
): SubscriptionWithPlan {
  return {
    ...makeSubscription(subOverrides),
    plan: {
      id: plan.id,
      name: plan.name,
      displayName: plan.displayName,
      priceInCents: plan.priceInCents,
      groupLimit: plan.groupLimit,
      durationDays: plan.durationDays,
      promotionalPriceInCents: plan.promotionalPriceInCents,
      promotionalMonths: plan.promotionalMonths,
      features: plan.features,
    },
  };
}

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  let subscriptionRepo: jest.Mocked<SubscriptionRepository>;
  let planRepo: jest.Mocked<SubscriptionPlanRepository>;
  let activeGroupsRepo: jest.Mocked<ActiveGroupsRepository>;
  let couponRepo: jest.Mocked<CouponRepository>;
  let cieloService: jest.Mocked<CieloService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionService,
        CouponService,
        {
          provide: SubscriptionRepository,
          useValue: {
            getByUserId: jest.fn(),
            getWithPlanByUserId: jest.fn(),
            getById: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            updateByUserId: jest.fn(),
            hasUsedTrial: jest.fn(),
            markTrialUsed: jest.fn(),
            getExpiringSoon: jest.fn(),
            getExpiredSubscriptions: jest.fn(),
            delete: jest.fn(),
            deleteByUserId: jest.fn(),
            getByCieloRecurrentPaymentId: jest.fn(),
          },
        },
        {
          provide: SubscriptionPlanRepository,
          useValue: {
            getPlanById: jest.fn(),
            getActivePlans: jest.fn(),
            seedDefaultPlans: jest.fn(),
          },
        },
        {
          provide: SubscriptionPaymentRepository,
          useValue: {
            getBySubscriptionId: jest.fn(),
            getByCieloPaymentId: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: ActiveGroupsRepository,
          useValue: {
            getActiveGroups: jest.fn(),
            setActiveGroups: jest.fn(),
            removeActiveGroup: jest.fn(),
            addActiveGroup: jest.fn(),
          },
        },
        {
          provide: CouponRepository,
          useValue: {
            getByCode: jest.fn(),
            getById: jest.fn(),
            incrementRedemptions: jest.fn(),
          },
        },
        {
          provide: AppConfigService,
          useValue: {
            getTrialDurationDays: jest.fn().mockReturnValue(7),
            getCieloEnvironment: jest.fn().mockReturnValue('sandbox'),
            getCieloMerchantId: jest.fn().mockReturnValue('test'),
            getCieloMerchantKey: jest.fn().mockReturnValue('test'),
          },
        },
        {
          provide: CieloService,
          useValue: {
            createRecurrentPayment: jest.fn(),
            queryPayment: jest.fn(),
            updateRecurrenceAmount: jest.fn(),
            deactivateRecurrence: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(SubscriptionService);
    subscriptionRepo = module.get(SubscriptionRepository);
    planRepo = module.get(SubscriptionPlanRepository);
    activeGroupsRepo = module.get(ActiveGroupsRepository);
    couponRepo = module.get(CouponRepository);
    cieloService = module.get(CieloService);
  });

  describe('calculateRecurrenceAmount', () => {
    it('should return plan price with no extras and no promo', () => {
      const amount = service.calculateRecurrenceAmount(starterPlan, 0, 0);
      expect(amount).toBe(4900);
    });

    it('should return promotional price when promo payments remaining', () => {
      const amount = service.calculateRecurrenceAmount(starterPlan, 2, 0);
      expect(amount).toBe(3430);
    });

    it('should add extra groups cost', () => {
      const amount = service.calculateRecurrenceAmount(starterPlan, 0, 2);
      expect(amount).toBe(4900 + 2 * EXTRA_GROUP_PRICE_IN_CENTS);
    });

    it('should combine promotional price with extra groups', () => {
      const amount = service.calculateRecurrenceAmount(starterPlan, 1, 3);
      expect(amount).toBe(3430 + 3 * EXTRA_GROUP_PRICE_IN_CENTS);
    });

    it('should use full price when plan has no promotional price', () => {
      const amount = service.calculateRecurrenceAmount(scalePlan, 2, 0);
      expect(amount).toBe(14900);
    });
  });

  describe('purchaseExtraGroups', () => {
    it('should calculate correct amount and update Cielo', async () => {
      const sub = makeSubscription({ extraGroups: 0 });
      subscriptionRepo.getByUserId.mockResolvedValue(sub);
      planRepo.getPlanById.mockResolvedValue(starterPlan);
      subscriptionRepo.update.mockResolvedValue(makeSubscription({ extraGroups: 2 }));
      subscriptionRepo.getWithPlanByUserId.mockResolvedValue(
        makeSubscriptionWithPlan({ extraGroups: 2 }),
      );
      cieloService.updateRecurrenceAmount.mockResolvedValue(undefined);

      await service.purchaseExtraGroups('user1', 2);

      expect(cieloService.updateRecurrenceAmount).toHaveBeenCalledWith(
        'recur-123',
        4900 + 2 * EXTRA_GROUP_PRICE_IN_CENTS,
      );
    });

    it('should increment extraGroups in DB', async () => {
      const sub = makeSubscription({ extraGroups: 1 });
      subscriptionRepo.getByUserId.mockResolvedValue(sub);
      planRepo.getPlanById.mockResolvedValue(starterPlan);
      subscriptionRepo.update.mockResolvedValue(makeSubscription({ extraGroups: 3 }));
      subscriptionRepo.getWithPlanByUserId.mockResolvedValue(
        makeSubscriptionWithPlan({ extraGroups: 3 }),
      );
      cieloService.updateRecurrenceAmount.mockResolvedValue(undefined);

      await service.purchaseExtraGroups('user1', 2);

      expect(subscriptionRepo.update).toHaveBeenCalledWith(1, { extraGroups: 3 });
    });

    it('should throw if no active subscription', async () => {
      subscriptionRepo.getByUserId.mockResolvedValue(null);

      await expect(service.purchaseExtraGroups('user1', 1)).rejects.toThrow(
        expect.objectContaining({ code: 'no_subscription' }),
      );
    });

    it('should throw if subscription not active', async () => {
      subscriptionRepo.getByUserId.mockResolvedValue(
        makeSubscription({ status: 'canceled' }),
      );

      await expect(service.purchaseExtraGroups('user1', 1)).rejects.toThrow(
        expect.objectContaining({ code: 'subscription_not_active' }),
      );
    });

    it('should throw if Scale plan (unlimited groups)', async () => {
      subscriptionRepo.getByUserId.mockResolvedValue(
        makeSubscription({ planId: 3 }),
      );
      planRepo.getPlanById.mockResolvedValue(scalePlan);

      await expect(service.purchaseExtraGroups('user1', 1)).rejects.toThrow(
        expect.objectContaining({ code: 'unlimited_plan' }),
      );
    });

    it('should throw if exceeds max extra groups', async () => {
      subscriptionRepo.getByUserId.mockResolvedValue(
        makeSubscription({ extraGroups: 4 }),
      );
      planRepo.getPlanById.mockResolvedValue(starterPlan);

      await expect(service.purchaseExtraGroups('user1', 2)).rejects.toThrow(
        expect.objectContaining({ code: 'max_extra_groups' }),
      );
    });

    it('should throw on invalid count', async () => {
      await expect(service.purchaseExtraGroups('user1', 0)).rejects.toThrow(
        expect.objectContaining({ code: 'invalid_count' }),
      );
    });

    it('should include promotional price when promo active', async () => {
      const sub = makeSubscription({ extraGroups: 0, promotionalPaymentsRemaining: 2 });
      subscriptionRepo.getByUserId.mockResolvedValue(sub);
      planRepo.getPlanById.mockResolvedValue(starterPlan);
      subscriptionRepo.update.mockResolvedValue(makeSubscription({ extraGroups: 1 }));
      subscriptionRepo.getWithPlanByUserId.mockResolvedValue(
        makeSubscriptionWithPlan({ extraGroups: 1 }),
      );
      cieloService.updateRecurrenceAmount.mockResolvedValue(undefined);

      await service.purchaseExtraGroups('user1', 1);

      expect(cieloService.updateRecurrenceAmount).toHaveBeenCalledWith(
        'recur-123',
        3430 + 1 * EXTRA_GROUP_PRICE_IN_CENTS,
      );
    });
  });

  describe('calculateRecurrenceAmount with coupon', () => {
    const percentageCoupon: CouponData = {
      id: 1,
      code: 'TEST20',
      discountType: 'percentage',
      discountValue: 20,
      discountDurationMonths: 3,
      extraGroupPriceInCents: null,
      bonusGroups: 0,
      restrictedToUserId: null,
      restrictedToPlanId: null,
      validFrom: new Date(),
      validUntil: null,
      maxRedemptions: null,
      currentRedemptions: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const fixedCoupon: CouponData = {
      ...percentageCoupon,
      id: 2,
      code: 'FIXED1000',
      discountType: 'fixed',
      discountValue: 1000,
    };

    const groupPriceCoupon: CouponData = {
      ...percentageCoupon,
      id: 3,
      code: 'CHEAPGROUPS',
      discountType: null,
      discountValue: null,
      extraGroupPriceInCents: 1500,
    };

    it('should apply percentage coupon discount when months remaining', () => {
      // starterPlan.priceInCents = 4900, 20% off = 980 discount = 3920
      const amount = service.calculateRecurrenceAmount(starterPlan, 0, 0, percentageCoupon, 3);
      expect(amount).toBe(3920);
    });

    it('should apply fixed coupon discount when months remaining', () => {
      // starterPlan.priceInCents = 4900, 1000 off = 3900
      const amount = service.calculateRecurrenceAmount(starterPlan, 0, 0, fixedCoupon, 2);
      expect(amount).toBe(3900);
    });

    it('should NOT apply coupon discount when months remaining is 0', () => {
      const amount = service.calculateRecurrenceAmount(starterPlan, 0, 0, percentageCoupon, 0);
      expect(amount).toBe(4900);
    });

    it('should use custom extra group price from coupon', () => {
      // extraGroupPriceInCents = 1500 instead of 2900
      const amount = service.calculateRecurrenceAmount(starterPlan, 0, 2, groupPriceCoupon, 0);
      expect(amount).toBe(4900 + 2 * 1500);
    });

    it('should NOT apply coupon discount when promo is active (no stacking)', () => {
      // promo active (2 remaining) → uses promo price 3430, coupon discount NOT applied
      const amount = service.calculateRecurrenceAmount(starterPlan, 2, 0, percentageCoupon, 3);
      expect(amount).toBe(3430);
    });

    it('should still use custom group price from coupon even during promo', () => {
      const allAxesCoupon: CouponData = {
        ...percentageCoupon,
        extraGroupPriceInCents: 1000,
      };
      // promo active → base 3430 (no plan discount stacking), but custom group price applies
      // extra groups: 1 * 1000 = 1000
      // total = 3430 + 1000 = 4430
      const amount = service.calculateRecurrenceAmount(starterPlan, 2, 1, allAxesCoupon, 3);
      expect(amount).toBe(4430);
    });

    it('should work with null coupon (backward compatible)', () => {
      const amount = service.calculateRecurrenceAmount(starterPlan, 0, 2, null, 0);
      expect(amount).toBe(4900 + 2 * EXTRA_GROUP_PRICE_IN_CENTS);
    });

    it('should apply permanent discount when couponDiscountMonthsRemaining is -1', () => {
      // -1 means permanent discount
      const amount = service.calculateRecurrenceAmount(starterPlan, 0, 0, fixedCoupon, -1);
      // 4900 - 1000 = 3900
      expect(amount).toBe(3900);
    });

    it('should NOT apply permanent discount when promo is active (no stacking)', () => {
      // promo active → uses promo price 3430, permanent coupon discount NOT applied
      const amount = service.calculateRecurrenceAmount(starterPlan, 2, 0, fixedCoupon, -1);
      expect(amount).toBe(3430);
    });

    it('should apply permanent discount after promo ends', () => {
      // promo NOT active (0 remaining) → full price 4900, then fixed 1000 off = 3900
      const amount = service.calculateRecurrenceAmount(starterPlan, 0, 0, fixedCoupon, -1);
      expect(amount).toBe(3900);
    });
  });

  describe('getGroupLimit with bonusGroups', () => {
    it('should include bonusGroups in group limit', async () => {
      subscriptionRepo.getWithPlanByUserId.mockResolvedValue(
        makeSubscriptionWithPlan({ extraGroups: 1, bonusGroups: 2 }),
      );

      const limit = await service.getGroupLimit('user1');
      // starterPlan.groupLimit (3) + extraGroups (1) + bonusGroups (2) = 6
      expect(limit).toBe(6);
    });

    it('should include bonusGroups in canAddGroup check', async () => {
      subscriptionRepo.getWithPlanByUserId.mockResolvedValue(
        makeSubscriptionWithPlan({ extraGroups: 0, bonusGroups: 2 }),
      );

      // groupLimit=3 + bonusGroups=2 = 5 total, so 4 active should be OK
      const canAdd = await service.canAddGroup('user1', 4);
      expect(canAdd).toBe(true);
    });

    it('should deny canAddGroup when at limit including bonusGroups', async () => {
      subscriptionRepo.getWithPlanByUserId.mockResolvedValue(
        makeSubscriptionWithPlan({ extraGroups: 0, bonusGroups: 1 }),
      );

      // groupLimit=3 + bonusGroups=1 = 4 total, so 4 active should be denied
      const canAdd = await service.canAddGroup('user1', 4);
      expect(canAdd).toBe(false);
    });
  });

  describe('removeExtraGroups', () => {
    it('should decrement extraGroups when groups not in use', async () => {
      const sub = makeSubscription({ extraGroups: 3 });
      subscriptionRepo.getByUserId.mockResolvedValue(sub);
      planRepo.getPlanById.mockResolvedValue(starterPlan);
      activeGroupsRepo.getActiveGroups.mockResolvedValue([1, 2]); // 2 active, limit would be 3+2=5
      subscriptionRepo.update.mockResolvedValue(makeSubscription({ extraGroups: 2 }));
      subscriptionRepo.getWithPlanByUserId.mockResolvedValue(
        makeSubscriptionWithPlan({ extraGroups: 2 }),
      );
      cieloService.updateRecurrenceAmount.mockResolvedValue(undefined);

      await service.removeExtraGroups('user1', 1);

      expect(subscriptionRepo.update).toHaveBeenCalledWith(1, { extraGroups: 2 });
      expect(cieloService.updateRecurrenceAmount).toHaveBeenCalledWith(
        'recur-123',
        4900 + 2 * EXTRA_GROUP_PRICE_IN_CENTS,
      );
    });

    it('should throw if removing would go below active usage', async () => {
      const sub = makeSubscription({ extraGroups: 2 });
      subscriptionRepo.getByUserId.mockResolvedValue(sub);
      planRepo.getPlanById.mockResolvedValue(starterPlan);
      activeGroupsRepo.getActiveGroups.mockResolvedValue([1, 2, 3, 4, 5]); // 5 active, plan limit 3 + 2 extras = 5

      await expect(service.removeExtraGroups('user1', 2)).rejects.toThrow(
        expect.objectContaining({ code: 'extra_groups_in_use' }),
      );
    });

    it('should throw if removing more than owned', async () => {
      const sub = makeSubscription({ extraGroups: 1 });
      subscriptionRepo.getByUserId.mockResolvedValue(sub);

      await expect(service.removeExtraGroups('user1', 2)).rejects.toThrow(
        expect.objectContaining({ code: 'invalid_count' }),
      );
    });

    it('should throw on invalid count', async () => {
      await expect(service.removeExtraGroups('user1', 0)).rejects.toThrow(
        expect.objectContaining({ code: 'invalid_count' }),
      );
    });

    it('should throw if no active subscription', async () => {
      subscriptionRepo.getByUserId.mockResolvedValue(null);

      await expect(service.removeExtraGroups('user1', 1)).rejects.toThrow(
        expect.objectContaining({ code: 'no_subscription' }),
      );
    });
  });
});

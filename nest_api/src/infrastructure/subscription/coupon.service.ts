import { Injectable } from '@nestjs/common';
import { CouponRepository, CouponData } from '@/infrastructure/persistence/coupon.repository';
import { SubscriptionError, EXTRA_GROUP_PRICE_IN_CENTS } from './subscription.service';

@Injectable()
export class CouponService {
  constructor(
    private readonly couponRepository: CouponRepository,
  ) {}

  /**
   * Validate a coupon code against all restrictions.
   * @throws SubscriptionError if coupon is invalid
   */
  async validateCoupon(code: string, userId: string, planId: number): Promise<CouponData> {
    const coupon = await this.couponRepository.getByCode(code.toUpperCase());

    if (!coupon) {
      throw new SubscriptionError('Cupom não encontrado.', 'coupon_not_found');
    }

    if (!coupon.isActive) {
      throw new SubscriptionError('Este cupom não está mais ativo.', 'coupon_inactive');
    }

    const now = new Date();

    if (coupon.validFrom > now) {
      throw new SubscriptionError('Este cupom ainda não está válido.', 'coupon_not_valid_yet');
    }

    if (coupon.validUntil && coupon.validUntil < now) {
      throw new SubscriptionError('Este cupom expirou.', 'coupon_expired');
    }

    if (coupon.maxRedemptions !== null && coupon.currentRedemptions >= coupon.maxRedemptions) {
      throw new SubscriptionError('Este cupom já atingiu o limite de usos.', 'coupon_max_redemptions');
    }

    if (coupon.restrictedToUserId && coupon.restrictedToUserId !== userId) {
      throw new SubscriptionError('Este cupom não é válido para sua conta.', 'coupon_user_restricted');
    }

    if (coupon.restrictedToPlanId && coupon.restrictedToPlanId !== planId) {
      throw new SubscriptionError('Este cupom não é válido para o plano selecionado.', 'coupon_plan_restricted');
    }

    return coupon;
  }

  /**
   * Apply plan discount (percentage or fixed) to a price.
   * Returns the discounted price, clamped to minimum 0.
   */
  applyPlanDiscount(priceInCents: number, coupon: CouponData): number {
    if (!coupon.discountType || coupon.discountValue === null) {
      return priceInCents;
    }

    if (coupon.discountType === 'percentage') {
      const discount = Math.round(priceInCents * coupon.discountValue / 100);
      return Math.max(0, priceInCents - discount);
    }

    if (coupon.discountType === 'fixed') {
      return Math.max(0, priceInCents - coupon.discountValue);
    }

    return priceInCents;
  }

  /**
   * Get the extra group price, using coupon override if available.
   */
  getExtraGroupPrice(coupon: CouponData | null): number {
    if (coupon && coupon.extraGroupPriceInCents !== null) {
      return coupon.extraGroupPriceInCents;
    }
    return EXTRA_GROUP_PRICE_IN_CENTS;
  }
}

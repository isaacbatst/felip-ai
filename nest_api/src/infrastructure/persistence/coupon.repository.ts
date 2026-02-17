/**
 * Coupon data structure
 */
export interface CouponData {
  id: number;
  code: string;
  // Axis 1: Plan discount
  discountType: string | null;       // 'percentage' | 'fixed' | null
  discountValue: number | null;
  discountDurationMonths: number | null;
  // Axis 2: Custom extra group price
  extraGroupPriceInCents: number | null;
  // Axis 3: Bonus groups
  bonusGroups: number;
  // Restrictions
  restrictedToUserId: string | null;
  restrictedToPlanId: number | null;
  // Validity
  validFrom: Date;
  validUntil: Date | null;
  // Limits
  maxRedemptions: number | null;
  currentRedemptions: number;
  // Status
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Abstract repository for coupon operations
 */
export abstract class CouponRepository {
  abstract getByCode(code: string): Promise<CouponData | null>;
  abstract getById(id: number): Promise<CouponData | null>;
  abstract incrementRedemptions(id: number): Promise<void>;
}

import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { CouponRepository, CouponData } from '../coupon.repository';
import { coupons } from '@/infrastructure/database/schema';
import type * as schema from '@/infrastructure/database/schema';

@Injectable()
export class CouponDrizzleStore extends CouponRepository {
  private readonly logger = new Logger(CouponDrizzleStore.name);

  constructor(
    @Inject('DATABASE_CONNECTION')
    private readonly db: PostgresJsDatabase<typeof schema>,
  ) {
    super();
  }

  private mapToCouponData(row: typeof coupons.$inferSelect): CouponData {
    return {
      id: row.id,
      code: row.code,
      discountType: row.discountType,
      discountValue: row.discountValue,
      discountDurationMonths: row.discountDurationMonths,
      extraGroupPriceInCents: row.extraGroupPriceInCents,
      bonusGroups: row.bonusGroups,
      restrictedToUserId: row.restrictedToUserId,
      restrictedToPlanId: row.restrictedToPlanId,
      validFrom: row.validFrom,
      validUntil: row.validUntil,
      maxRedemptions: row.maxRedemptions,
      currentRedemptions: row.currentRedemptions,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async getByCode(code: string): Promise<CouponData | null> {
    const result = await this.db
      .select()
      .from(coupons)
      .where(eq(coupons.code, code))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return this.mapToCouponData(result[0]);
  }

  async getById(id: number): Promise<CouponData | null> {
    const result = await this.db
      .select()
      .from(coupons)
      .where(eq(coupons.id, id))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return this.mapToCouponData(result[0]);
  }

  async incrementRedemptions(id: number): Promise<void> {
    await this.db
      .update(coupons)
      .set({
        currentRedemptions: sql`${coupons.currentRedemptions} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(coupons.id, id));

    this.logger.log(`Incremented redemptions for coupon ${id}`);
  }
}

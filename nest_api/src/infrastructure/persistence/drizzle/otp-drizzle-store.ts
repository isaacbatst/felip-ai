import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, and, isNull, gt, desc, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { OtpRepository, OtpData } from '../otp.repository';
import { otpCodes } from '@/infrastructure/database/schema';
import type * as schema from '@/infrastructure/database/schema';

@Injectable()
export class OtpDrizzleStore extends OtpRepository {
  private readonly logger = new Logger(OtpDrizzleStore.name);

  constructor(
    @Inject('DATABASE_CONNECTION')
    private readonly db: PostgresJsDatabase<typeof schema>,
  ) {
    super();
  }

  async createOtp(phone: string, code: string, ttlMinutes: number): Promise<OtpData> {
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    const result = await this.db
      .insert(otpCodes)
      .values({ phone, code, expiresAt })
      .returning();

    this.logger.log(`Created OTP for phone: ${phone}, expires at: ${expiresAt.toISOString()}`);

    return result[0];
  }

  async findActiveOtp(phone: string): Promise<OtpData | null> {
    const result = await this.db
      .select()
      .from(otpCodes)
      .where(
        and(
          eq(otpCodes.phone, phone),
          isNull(otpCodes.usedAt),
          gt(otpCodes.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(otpCodes.createdAt))
      .limit(1);

    return result.length > 0 ? result[0] : null;
  }

  async incrementAttempts(id: number): Promise<void> {
    await this.db
      .update(otpCodes)
      .set({ attempts: sql`${otpCodes.attempts} + 1` })
      .where(eq(otpCodes.id, id));
  }

  async markUsed(id: number): Promise<void> {
    await this.db
      .update(otpCodes)
      .set({ usedAt: new Date() })
      .where(eq(otpCodes.id, id));
  }

  async invalidateOtpsForPhone(phone: string): Promise<void> {
    await this.db
      .update(otpCodes)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(otpCodes.phone, phone),
          isNull(otpCodes.usedAt),
        ),
      );
  }
}

import { Injectable, Inject } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
  UserDataRepository,
  UserPriceEntryData,
  UserMaxPriceData,
  UserAvailableMilesData,
  PriceEntryInput,
  MaxPriceInput,
  AvailableMilesInput,
} from '../user-data.repository';
import {
  userPriceEntries,
  userMaxPrices,
  userAvailableMiles,
  milesPrograms,
} from '@/infrastructure/database/schema';
import type * as schema from '@/infrastructure/database/schema';
import type { PriceTableResultV2 } from '@/domain/types/google-sheets.types';
import type { PriceTableV2 } from '@/domain/types/price.types';

/**
 * Drizzle implementation of UserDataRepository
 * Single Responsibility: user data operations using Drizzle ORM with PostgreSQL
 */
@Injectable()
export class UserDataDrizzleStore extends UserDataRepository {
  constructor(
    @Inject('DATABASE_CONNECTION')
    private readonly db: PostgresJsDatabase<typeof schema>,
  ) {
    super();
  }

  // ============================================================================
  // Price Entries
  // ============================================================================

  private mapToPriceEntryData(row: typeof userPriceEntries.$inferSelect): UserPriceEntryData {
    return {
      id: row.id,
      userId: row.userId,
      programId: row.programId,
      quantity: row.quantity,
      price: row.price,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async getPriceEntries(userId: string): Promise<UserPriceEntryData[]> {
    const result = await this.db
      .select()
      .from(userPriceEntries)
      .where(eq(userPriceEntries.userId, userId));

    return result.map(this.mapToPriceEntryData);
  }

  async getPriceEntriesForProgram(userId: string, programId: number): Promise<UserPriceEntryData[]> {
    const result = await this.db
      .select()
      .from(userPriceEntries)
      .where(
        and(
          eq(userPriceEntries.userId, userId),
          eq(userPriceEntries.programId, programId),
        ),
      );

    return result.map(this.mapToPriceEntryData);
  }

  async setPriceEntries(userId: string, entries: PriceEntryInput[]): Promise<void> {
    // Delete existing entries
    await this.db.delete(userPriceEntries).where(eq(userPriceEntries.userId, userId));

    // Insert new entries
    if (entries.length > 0) {
      await this.db.insert(userPriceEntries).values(
        entries.map((entry) => ({
          userId,
          programId: entry.programId,
          quantity: entry.quantity,
          price: entry.price,
        })),
      );
    }
  }

  async setPriceEntriesForProgram(userId: string, programId: number, entries: PriceEntryInput[]): Promise<void> {
    // Delete existing entries for this program only
    await this.db.delete(userPriceEntries).where(
      and(
        eq(userPriceEntries.userId, userId),
        eq(userPriceEntries.programId, programId),
      ),
    );

    // Insert new entries
    if (entries.length > 0) {
      await this.db.insert(userPriceEntries).values(
        entries.map((entry) => ({
          userId,
          programId,
          quantity: entry.quantity,
          price: entry.price,
        })),
      );
    }
  }

  async upsertPriceEntry(userId: string, entry: PriceEntryInput): Promise<UserPriceEntryData> {
    const result = await this.db
      .insert(userPriceEntries)
      .values({
        userId,
        programId: entry.programId,
        quantity: entry.quantity,
        price: entry.price,
      })
      .onConflictDoUpdate({
        target: [userPriceEntries.userId, userPriceEntries.programId, userPriceEntries.quantity],
        set: {
          price: entry.price,
          updatedAt: new Date(),
        },
      })
      .returning();

    return this.mapToPriceEntryData(result[0]);
  }

  async deletePriceEntries(userId: string): Promise<void> {
    await this.db.delete(userPriceEntries).where(eq(userPriceEntries.userId, userId));
  }

  async updatePriceEntryById(
    id: number,
    data: { quantity: number; price: number },
  ): Promise<UserPriceEntryData | null> {
    const result = await this.db
      .update(userPriceEntries)
      .set({
        quantity: data.quantity,
        price: data.price,
        updatedAt: new Date(),
      })
      .where(eq(userPriceEntries.id, id))
      .returning();

    return result.length > 0 ? this.mapToPriceEntryData(result[0]) : null;
  }

  async deletePriceEntryById(id: number): Promise<void> {
    await this.db.delete(userPriceEntries).where(eq(userPriceEntries.id, id));
  }

  // ============================================================================
  // Max Prices
  // ============================================================================

  private mapToMaxPriceData(row: typeof userMaxPrices.$inferSelect): UserMaxPriceData {
    return {
      id: row.id,
      userId: row.userId,
      programId: row.programId,
      maxPrice: row.maxPrice,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async getMaxPrices(userId: string): Promise<UserMaxPriceData[]> {
    const result = await this.db
      .select()
      .from(userMaxPrices)
      .where(eq(userMaxPrices.userId, userId));

    return result.map(this.mapToMaxPriceData);
  }

  async getMaxPriceForProgram(userId: string, programId: number): Promise<UserMaxPriceData | null> {
    const result = await this.db
      .select()
      .from(userMaxPrices)
      .where(
        and(
          eq(userMaxPrices.userId, userId),
          eq(userMaxPrices.programId, programId),
        ),
      )
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return this.mapToMaxPriceData(result[0]);
  }

  async setMaxPrices(userId: string, maxPrices: MaxPriceInput[]): Promise<void> {
    await this.db.delete(userMaxPrices).where(eq(userMaxPrices.userId, userId));

    if (maxPrices.length > 0) {
      await this.db.insert(userMaxPrices).values(
        maxPrices.map((mp) => ({
          userId,
          programId: mp.programId,
          maxPrice: mp.maxPrice,
        })),
      );
    }
  }

  async upsertMaxPrice(userId: string, input: MaxPriceInput): Promise<UserMaxPriceData> {
    const result = await this.db
      .insert(userMaxPrices)
      .values({
        userId,
        programId: input.programId,
        maxPrice: input.maxPrice,
      })
      .onConflictDoUpdate({
        target: [userMaxPrices.userId, userMaxPrices.programId],
        set: {
          maxPrice: input.maxPrice,
          updatedAt: new Date(),
        },
      })
      .returning();

    return this.mapToMaxPriceData(result[0]);
  }

  async deleteMaxPrices(userId: string): Promise<void> {
    await this.db.delete(userMaxPrices).where(eq(userMaxPrices.userId, userId));
  }

  // ============================================================================
  // Available Miles
  // ============================================================================

  private mapToAvailableMilesData(row: typeof userAvailableMiles.$inferSelect): UserAvailableMilesData {
    return {
      id: row.id,
      userId: row.userId,
      programId: row.programId,
      availableMiles: row.availableMiles,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async getAvailableMiles(userId: string): Promise<UserAvailableMilesData[]> {
    const result = await this.db
      .select()
      .from(userAvailableMiles)
      .where(eq(userAvailableMiles.userId, userId));

    return result.map(this.mapToAvailableMilesData);
  }

  async getAvailableMilesForProgram(userId: string, programId: number): Promise<UserAvailableMilesData | null> {
    const result = await this.db
      .select()
      .from(userAvailableMiles)
      .where(
        and(
          eq(userAvailableMiles.userId, userId),
          eq(userAvailableMiles.programId, programId),
        ),
      )
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return this.mapToAvailableMilesData(result[0]);
  }

  async setAvailableMiles(userId: string, miles: AvailableMilesInput[]): Promise<void> {
    await this.db.delete(userAvailableMiles).where(eq(userAvailableMiles.userId, userId));

    if (miles.length > 0) {
      await this.db.insert(userAvailableMiles).values(
        miles.map((m) => ({
          userId,
          programId: m.programId,
          availableMiles: m.availableMiles,
        })),
      );
    }
  }

  async upsertAvailableMiles(userId: string, input: AvailableMilesInput): Promise<UserAvailableMilesData> {
    const result = await this.db
      .insert(userAvailableMiles)
      .values({
        userId,
        programId: input.programId,
        availableMiles: input.availableMiles,
      })
      .onConflictDoUpdate({
        target: [userAvailableMiles.userId, userAvailableMiles.programId],
        set: {
          availableMiles: input.availableMiles,
          updatedAt: new Date(),
        },
      })
      .returning();

    return this.mapToAvailableMilesData(result[0]);
  }

  async deleteAvailableMiles(userId: string): Promise<void> {
    await this.db.delete(userAvailableMiles).where(eq(userAvailableMiles.userId, userId));
  }

  // ============================================================================
  // Aggregated Data (for PriceTableProvider compatibility)
  // ============================================================================

  async getUserPriceTableResult(userId: string): Promise<PriceTableResultV2> {
    // Get all programs
    const programs = await this.db.select().from(milesPrograms);
    const programMap = new Map(programs.map((p) => [p.id, p.name]));

    // Get user's price entries
    const priceEntries = await this.getPriceEntries(userId);

    // Get user's max prices
    const maxPrices = await this.getMaxPrices(userId);

    // Get user's available miles
    const availableMilesData = await this.getAvailableMiles(userId);

    // Build priceTables: Record<Provider, PriceTableV2>
    const priceTables: Record<string, PriceTableV2> = {};
    for (const entry of priceEntries) {
      const programName = programMap.get(entry.programId);
      if (!programName) continue;

      if (!priceTables[programName]) {
        priceTables[programName] = {};
      }
      priceTables[programName][entry.quantity] = entry.price;
    }

    // Build customMaxPrice: Record<Provider, number | undefined>
    const customMaxPrice: Record<string, number | undefined> = {};
    for (const mp of maxPrices) {
      const programName = programMap.get(mp.programId);
      if (!programName) continue;
      customMaxPrice[programName] = mp.maxPrice;
    }

    // Build availableMiles: Record<string, number | null>
    const availableMiles: Record<string, number | null> = {};
    for (const am of availableMilesData) {
      const programName = programMap.get(am.programId);
      if (!programName) continue;
      availableMiles[programName] = am.availableMiles;
    }

    return {
      priceTables,
      customMaxPrice,
      availableMiles,
    };
  }
}

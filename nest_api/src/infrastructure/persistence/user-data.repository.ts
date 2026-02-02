import type { PriceTableResultV2 } from '@/domain/types/google-sheets.types';

/**
 * User price entry data structure
 */
export interface UserPriceEntryData {
  id: number;
  userId: string;
  programId: number;
  quantity: number;
  price: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User max price data structure
 */
export interface UserMaxPriceData {
  id: number;
  userId: string;
  programId: number;
  maxPrice: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User available miles data structure
 */
export interface UserAvailableMilesData {
  id: number;
  userId: string;
  programId: number;
  availableMiles: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Price entry input (for create/update)
 */
export interface PriceEntryInput {
  programId: number;
  quantity: number;
  price: number;
}

/**
 * Max price input (for create/update)
 */
export interface MaxPriceInput {
  programId: number;
  maxPrice: number;
}

/**
 * Available miles input (for create/update)
 */
export interface AvailableMilesInput {
  programId: number;
  availableMiles: number;
}

/**
 * Abstract repository for user data operations (price entries, max prices, available miles)
 */
export abstract class UserDataRepository {
  // ============================================================================
  // Price Entries
  // ============================================================================

  /**
   * Get all price entries for a user
   */
  abstract getPriceEntries(userId: string): Promise<UserPriceEntryData[]>;

  /**
   * Get price entries for a user and program
   */
  abstract getPriceEntriesForProgram(userId: string, programId: number): Promise<UserPriceEntryData[]>;

  /**
   * Set price entries for a user (replaces existing entries)
   */
  abstract setPriceEntries(userId: string, entries: PriceEntryInput[]): Promise<void>;

  /**
   * Set price entries for a specific program (replaces existing entries for that program only)
   */
  abstract setPriceEntriesForProgram(userId: string, programId: number, entries: PriceEntryInput[]): Promise<void>;

  /**
   * Upsert a single price entry
   */
  abstract upsertPriceEntry(userId: string, entry: PriceEntryInput): Promise<UserPriceEntryData>;

  /**
   * Delete all price entries for a user
   */
  abstract deletePriceEntries(userId: string): Promise<void>;

  /**
   * Update a single price entry by ID
   */
  abstract updatePriceEntryById(id: number, data: { quantity: number; price: number }): Promise<UserPriceEntryData | null>;

  /**
   * Delete a single price entry by ID
   */
  abstract deletePriceEntryById(id: number): Promise<void>;

  // ============================================================================
  // Max Prices
  // ============================================================================

  /**
   * Get all max prices for a user
   */
  abstract getMaxPrices(userId: string): Promise<UserMaxPriceData[]>;

  /**
   * Get max price for a user and program
   */
  abstract getMaxPriceForProgram(userId: string, programId: number): Promise<UserMaxPriceData | null>;

  /**
   * Set max prices for a user (replaces existing)
   */
  abstract setMaxPrices(userId: string, maxPrices: MaxPriceInput[]): Promise<void>;

  /**
   * Upsert a single max price
   */
  abstract upsertMaxPrice(userId: string, input: MaxPriceInput): Promise<UserMaxPriceData>;

  /**
   * Delete all max prices for a user
   */
  abstract deleteMaxPrices(userId: string): Promise<void>;

  // ============================================================================
  // Available Miles
  // ============================================================================

  /**
   * Get all available miles for a user
   */
  abstract getAvailableMiles(userId: string): Promise<UserAvailableMilesData[]>;

  /**
   * Get available miles for a user and program
   */
  abstract getAvailableMilesForProgram(userId: string, programId: number): Promise<UserAvailableMilesData | null>;

  /**
   * Set available miles for a user (replaces existing)
   */
  abstract setAvailableMiles(userId: string, miles: AvailableMilesInput[]): Promise<void>;

  /**
   * Upsert available miles for a single program
   */
  abstract upsertAvailableMiles(userId: string, input: AvailableMilesInput): Promise<UserAvailableMilesData>;

  /**
   * Delete all available miles for a user
   */
  abstract deleteAvailableMiles(userId: string): Promise<void>;

  // ============================================================================
  // Aggregated Data (for PriceTableProvider compatibility)
  // ============================================================================

  /**
   * Get all user data in the format compatible with PriceTableResultV2
   * This is used by the PriceTableProvider to fetch user-specific data
   */
  abstract getUserPriceTableResult(userId: string): Promise<PriceTableResultV2>;
}

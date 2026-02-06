/**
 * Subscription payment status types
 */
export type SubscriptionPaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

/**
 * Subscription payment data structure
 */
export interface SubscriptionPaymentData {
  id: number;
  subscriptionId: number;
  cieloPaymentId: string | null;
  amountInCents: number;
  status: SubscriptionPaymentStatus;
  cieloReturnCode: string | null;
  cieloReturnMessage: string | null;
  authorizationCode: string | null;
  paidAt: Date | null;
  failedAt: Date | null;
  retryCount: number;
  createdAt: Date;
}

/**
 * Input for creating a subscription payment
 */
export interface CreateSubscriptionPaymentInput {
  subscriptionId: number;
  cieloPaymentId?: string;
  amountInCents: number;
  status: SubscriptionPaymentStatus;
  cieloReturnCode?: string;
  cieloReturnMessage?: string;
  authorizationCode?: string;
  paidAt?: Date;
  failedAt?: Date;
}

/**
 * Input for updating a subscription payment
 */
export interface UpdateSubscriptionPaymentInput {
  status?: SubscriptionPaymentStatus;
  cieloReturnCode?: string;
  cieloReturnMessage?: string;
  authorizationCode?: string;
  paidAt?: Date;
  failedAt?: Date;
  retryCount?: number;
}

/**
 * Abstract repository for subscription payment operations
 */
export abstract class SubscriptionPaymentRepository {
  abstract create(input: CreateSubscriptionPaymentInput): Promise<SubscriptionPaymentData>;
  abstract getById(id: number): Promise<SubscriptionPaymentData | null>;
  abstract getByCieloPaymentId(cieloPaymentId: string): Promise<SubscriptionPaymentData | null>;
  abstract getBySubscriptionId(subscriptionId: number): Promise<SubscriptionPaymentData[]>;
  abstract update(id: number, input: UpdateSubscriptionPaymentInput): Promise<SubscriptionPaymentData | null>;
}

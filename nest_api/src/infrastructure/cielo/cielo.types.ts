/**
 * Cielo transaction status codes
 */
export enum CieloTransactionStatus {
  NotFinished = 0,
  Authorized = 1,
  Confirmed = 2,
  Denied = 3,
  Voided = 10,
  Refunded = 11,
  Pending = 12,
  Aborted = 13,
  Scheduled = 20,
}

/**
 * Cielo recurrent payment interval
 */
export type CieloRecurrentInterval = 'Monthly' | 'Bimonthly' | 'Quarterly' | 'SemiAnnual' | 'Annual';

/**
 * Request body for POST /1/sales/ (recurrent payment)
 */
export interface CieloCreateRecurrentPaymentRequest {
  MerchantOrderId: string;
  Customer: {
    Name: string;
  };
  Payment: {
    Type: 'CreditCard';
    Amount: number;
    Installments: number;
    SoftDescriptor?: string;
    RecurrentPayment: {
      AuthorizeNow: boolean;
      Interval: CieloRecurrentInterval;
    };
    CreditCard: {
      CardNumber: string;
      Holder: string;
      ExpirationDate: string;
      SecurityCode: string;
      Brand: string;
      SaveCard: boolean;
    };
  };
}

/**
 * Response from POST /1/sales/ (recurrent payment)
 */
export interface CieloCreateRecurrentPaymentResponse {
  MerchantOrderId: string;
  Payment: {
    PaymentId: string;
    Type: string;
    Amount: number;
    Status: CieloTransactionStatus;
    ReturnCode: string;
    ReturnMessage: string;
    AuthorizationCode?: string;
    RecurrentPayment: {
      RecurrentPaymentId: string;
      ReasonCode: number;
      ReasonMessage: string;
      NextRecurrency: string;
      Interval: string;
    };
    CreditCard: {
      CardNumber: string;
      Holder: string;
      ExpirationDate: string;
      Brand: string;
      CardToken?: string;
    };
  };
}

/**
 * Response from GET /1/sales/{PaymentId}
 */
export interface CieloQueryPaymentResponse {
  MerchantOrderId: string;
  Payment: {
    PaymentId: string;
    Type: string;
    Amount: number;
    Status: CieloTransactionStatus;
    ReturnCode: string;
    ReturnMessage: string;
    AuthorizationCode?: string;
    RecurrentPayment?: {
      RecurrentPaymentId: string;
      ReasonCode: number;
      ReasonMessage: string;
      NextRecurrency: string;
      Interval: string;
    };
  };
}

/**
 * Cielo webhook payload
 * ChangeType: 1 = Payment status, 2 = Recurrence created, 4 = Recurring payment status
 */
export interface CieloWebhookPayload {
  PaymentId?: string;
  RecurrentPaymentId?: string;
  ChangeType: number;
}

/**
 * Checkout request DTO from frontend
 */
export interface CheckoutRequestDto {
  planId: number;
  cardNumber: string;
  holder: string;
  expirationDate: string;
  securityCode: string;
  brand: string;
  customerName: string;
}

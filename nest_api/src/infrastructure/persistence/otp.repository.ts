export interface OtpData {
  id: number;
  phone: string;
  code: string;
  expiresAt: Date;
  usedAt: Date | null;
  attempts: number;
  createdAt: Date;
}

export abstract class OtpRepository {
  abstract createOtp(phone: string, code: string, ttlMinutes: number): Promise<OtpData>;

  abstract findActiveOtp(phone: string): Promise<OtpData | null>;

  abstract incrementAttempts(id: number): Promise<void>;

  abstract markUsed(id: number): Promise<void>;

  abstract invalidateOtpsForPhone(phone: string): Promise<void>;
}

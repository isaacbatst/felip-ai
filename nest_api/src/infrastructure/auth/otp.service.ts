import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { OtpRepository } from '@/infrastructure/persistence/otp.repository';
import { UserRepository } from '@/infrastructure/persistence/user.repository';
import { TelegramBotService } from '@/infrastructure/telegram/telegram-bot-service';

const OTP_TTL_MINUTES = 5;
const MAX_ATTEMPTS = 5;

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly otpRepository: OtpRepository,
    private readonly userRepository: UserRepository,
    private readonly telegramBotService: TelegramBotService,
  ) {}

  async generateAndSend(phone: string): Promise<{ expiresAt: Date }> {
    const user = await this.userRepository.findByPhone(phone);
    if (!user) {
      throw new HttpException('USER_NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    await this.otpRepository.invalidateOtpsForPhone(phone);

    const code = randomInt(100000, 999999).toString();
    const otp = await this.otpRepository.createOtp(phone, code, OTP_TTL_MINUTES);

    await this.telegramBotService.bot.api.sendMessage(
      user.chatId,
      `Seu código de acesso: ${code}\nEste código expira em 5 minutos.`,
    );

    this.logger.log(`OTP sent to phone: ${phone}`);

    return { expiresAt: otp.expiresAt };
  }

  async validate(phone: string, code: string): Promise<{ valid: boolean; userId?: string }> {
    const otp = await this.otpRepository.findActiveOtp(phone);
    if (!otp) {
      return { valid: false };
    }

    if (otp.attempts >= MAX_ATTEMPTS) {
      return { valid: false };
    }

    await this.otpRepository.incrementAttempts(otp.id);

    if (otp.code === code) {
      await this.otpRepository.markUsed(otp.id);
      const user = await this.userRepository.findByPhone(phone);
      return { valid: true, userId: user!.telegramUserId.toString() };
    }

    return { valid: false };
  }
}

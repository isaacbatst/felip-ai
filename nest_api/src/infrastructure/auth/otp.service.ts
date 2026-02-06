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
      this.logger.warn(`OTP requested for unknown phone: ${phone}`);
      throw new HttpException('USER_NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    this.logger.log(`Generating OTP for phone=${phone}, chatId=${user.chatId}`);

    await this.otpRepository.invalidateOtpsForPhone(phone);

    const code = randomInt(100000, 999999).toString();
    const otp = await this.otpRepository.createOtp(phone, code, OTP_TTL_MINUTES);

    try {
      await this.telegramBotService.bot.api.sendMessage(
        user.chatId,
        `Seu código de acesso: ${code}\nEste código expira em 5 minutos.`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send OTP via Telegram: phone=${phone}, chatId=${user.chatId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new HttpException(
        'Falha ao enviar código via Telegram. Tente novamente.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    this.logger.log(`OTP sent successfully: phone=${phone}, chatId=${user.chatId}`);

    return { expiresAt: otp.expiresAt };
  }

  async validate(phone: string, code: string): Promise<{ valid: boolean; userId?: string }> {
    const otp = await this.otpRepository.findActiveOtp(phone);
    if (!otp) {
      this.logger.warn(`No active OTP found for phone=${phone}`);
      return { valid: false };
    }

    if (otp.attempts >= MAX_ATTEMPTS) {
      this.logger.warn(`Max OTP attempts exceeded for phone=${phone}`);
      return { valid: false };
    }

    await this.otpRepository.incrementAttempts(otp.id);

    if (otp.code === code) {
      await this.otpRepository.markUsed(otp.id);
      const user = await this.userRepository.findByPhone(phone);
      this.logger.log(`OTP validated successfully for phone=${phone}`);
      return { valid: true, userId: user!.telegramUserId.toString() };
    }

    this.logger.warn(`Invalid OTP code for phone=${phone}, attempts=${otp.attempts + 1}/${MAX_ATTEMPTS}`);
    return { valid: false };
  }
}

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Injectable } from '@nestjs/common';
import { TelegramUserClient } from './telegram-user-client';
import { AuthCodeService } from './auth-code.service';
import { PhoneWhitelistService } from './phone-whitelist.service';

/**
 * Informações do usuário retornadas pelo getMe
 */
export interface TelegramUserInfo {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  usernames?: {
    editable_username?: string;
  };
  phone_number?: string;
}

/**
 * Handler responsável por gerenciar login do Telegram User Client
 * Single Responsibility: apenas processamento de login
 */
@Injectable()
export class TelegramUserLoginHandler {
  constructor(
    private readonly client: TelegramUserClient,
    private readonly authCodeService: AuthCodeService,
    private readonly phoneWhitelist: PhoneWhitelistService,
  ) {}

  /**
   * Valida se um número de telefone está na whitelist
   * @param phoneNumber Número de telefone em formato internacional
   * @returns true se está na whitelist, false caso contrário
   */
  isPhoneNumberAllowed(phoneNumber: string): boolean {
    return this.phoneWhitelist.isAllowed(phoneNumber);
  }

  /**
   * Cria a configuração de login para o cliente Telegram
   * @param phone Número de telefone em formato internacional
   * @param userId ID do usuário do bot (para receber o auth code via mensagem)
   * @param isRetry Indica se é uma tentativa após expiração do código
   * @returns Configuração de login
   */
  private createLoginConfig(
    phone: string,
    userId: number,
    isRetry = false,
  ) {
    return {
      type: 'user' as const,
      getPhoneNumber: async () => {
        console.log(`[DEBUG] 📱 Providing phone number: ${phone}`);
        return phone;
      },
      getAuthCode: async (retry?: boolean) => {
        if (retry) {
          console.log('[DEBUG] 🔐 Retrying auth code...');
        } else {
          console.log(
            isRetry
              ? '[DEBUG] 🔐 Waiting for new authentication code...'
              : '[DEBUG] 🔐 Waiting for authentication code...',
          );
        }

        // Espera o código via mensagem do bot
        return await this.authCodeService.waitForAuthCode(userId);
      },
      getPassword: async (passwordHint: string, retry?: boolean) => {
        if (retry) {
          console.log('[DEBUG] 🔒 Retrying password...');
        } else {
          console.log(`[DEBUG] 🔒 Password required (hint: ${passwordHint})`);
        }

        const passwordFile = path.join(process.cwd(), '.telegram-password.txt');

        if (fs.existsSync(passwordFile)) {
          fs.unlinkSync(passwordFile);
        }

        console.log(`[DEBUG] 🔒 Please write your password to: ${passwordFile}`);
        console.log(
          `[DEBUG] 🔒 You can do this by running: echo "YOUR_PASSWORD" > ${passwordFile}`,
        );

        return new Promise<string>((resolve) => {
          const checkFile = () => {
            if (fs.existsSync(passwordFile)) {
              try {
                const password = fs.readFileSync(passwordFile, 'utf-8').trim();
                if (password) {
                  console.log('[DEBUG] 🔒 Password read from file');
                  try {
                    fs.unlinkSync(passwordFile);
                  } catch (_e) {
                    // Ignore cleanup errors
                  }
                  resolve(password);
                  return;
                }
              } catch (_error) {
                // File might be being written, try again
              }
            }
            setTimeout(checkFile, 500);
          };

          checkFile();
        });
      },
    };
  }

  /**
   * Realiza login com um número de telefone
   * @param phone Número de telefone em formato internacional
   * @param userId ID do usuário do bot (para receber o auth code via mensagem)
   * @returns Informações do usuário após login bem-sucedido
   * @throws Error se o número não está na whitelist ou se o login falhar
   */
  async login(phone: string, userId: number): Promise<TelegramUserInfo> {
    // Validate phone number is in whitelist
    if (!this.isPhoneNumberAllowed(phone)) {
      throw new Error('Phone number not in whitelist');
    }
    const clientInstance = this.client.getClient();
    if (!clientInstance) {
      throw new Error('Client not initialized');
    }

    try {
      await clientInstance.login(this.createLoginConfig(phone, userId));
    } catch (error) {
      // Check if error is PHONE_CODE_EXPIRED
      if (
        error instanceof Error &&
        (error.message.includes('PHONE_CODE_EXPIRED') ||
          error.message.includes('phone code expired'))
      ) {
        console.log('[DEBUG] ⏰ Auth code expired, resending authentication code...');
        try {
          await clientInstance.invoke({
            _: 'resendAuthenticationCode',
          });
          console.log('[DEBUG] ✅ Authentication code resent successfully');

          // Retry login after resending code
          await clientInstance.login(
            this.createLoginConfig(phone, userId, true),
          );
        } catch (retryError) {
          console.error('[ERROR] Failed to resend authentication code:', retryError);
          throw retryError;
        }
      } else {
        // Re-throw if it's not a PHONE_CODE_EXPIRED error
        throw error;
      }
    }

    console.log('[DEBUG] ✅ Login successful, fetching user info...');

    const me = (await clientInstance.invoke({
      _: 'getMe',
    })) as TelegramUserInfo;

    return me;
  }
}


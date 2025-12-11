import * as fs from 'node:fs';
import * as path from 'node:path';
import { Injectable } from '@nestjs/common';
import { TelegramUserClient } from './telegram-user-client';

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
  constructor(private readonly client: TelegramUserClient) {}

  /**
   * Realiza login com um número de telefone
   * @param phone Número de telefone em formato internacional
   * @returns Informações do usuário após login bem-sucedido
   */
  async login(phone: string): Promise<TelegramUserInfo> {
    const clientInstance = this.client.getClient();
    if (!clientInstance) {
      throw new Error('Client not initialized');
    }

    await clientInstance.login({
      type: 'user',
      getPhoneNumber: async () => {
        console.log(`[DEBUG] 📱 Providing phone number: ${phone}`);
        return phone;
      },
      getAuthCode: async (retry?: boolean) => {
        if (retry) {
          console.log('[DEBUG] 🔐 Retrying auth code...');
        } else {
          console.log('[DEBUG] 🔐 Waiting for authentication code...');
        }

        const authCodeFile = path.join(process.cwd(), '.telegram-auth-code.txt');

        if (fs.existsSync(authCodeFile)) {
          fs.unlinkSync(authCodeFile);
        }

        console.log(`[DEBUG] 🔐 Please write the authentication code to: ${authCodeFile}`);
        console.log(`[DEBUG] 🔐 You can do this by running: echo "YOUR_CODE" > ${authCodeFile}`);

        return new Promise<string>((resolve) => {
          const checkFile = () => {
            if (fs.existsSync(authCodeFile)) {
              try {
                const code = fs.readFileSync(authCodeFile, 'utf-8').trim();
                if (code) {
                  console.log('[DEBUG] 🔐 Code read from file');
                  try {
                    fs.unlinkSync(authCodeFile);
                  } catch (_e) {
                    // Ignore cleanup errors
                  }
                  resolve(code);
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
    });

    console.log('[DEBUG] ✅ Login successful, fetching user info...');

    const me = (await clientInstance.invoke({
      _: 'getMe',
    })) as TelegramUserInfo;

    return me;
  }
}


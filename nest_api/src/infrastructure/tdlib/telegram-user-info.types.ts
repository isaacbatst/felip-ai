/**
 * Informações do usuário retornadas pelo getMe
 * This type is shared between nest_api and tdlib_worker
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

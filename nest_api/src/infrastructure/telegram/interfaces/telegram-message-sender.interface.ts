/**
 * Classe abstrata para envio de mensagens no Telegram
 * Permite desacoplar handlers de serviços específicos de cliente
 */
export abstract class TelegramMessageSender {
  /**
   * Envia uma mensagem de texto
   * @param chatId ID do chat
   * @param text Texto da mensagem
   * @param replyToMessageId ID da mensagem para responder (opcional)
   */
  abstract sendMessage(
    chatId: number,
    text: string,
    replyToMessageId?: number,
  ): Promise<unknown>;
}


import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { AppConfigService } from 'src/config/app.config';

/**
 * Service responsável por gerenciar cliente OpenAI
 * Single Responsibility: apenas configuração e fornecimento do cliente OpenAI
 */
@Injectable()
export class OpenAIService {
  private readonly client: OpenAI;

  constructor(private readonly appConfig: AppConfigService) {
    const apiKey = this.appConfig.getOpenAIApiKey();
    this.client = new OpenAI({ apiKey });
  }

  getClient(): OpenAI {
    return this.client;
  }
}


import express, { type Request, type Response } from 'express';
import { TelegramUserClient } from './telegram-user-client';

export interface TdlibCommandRequest {
  type:
    | 'sendMessage'
    | 'login'
    | 'getChats'
    | 'getChat'
    | 'getAuthorizationState'
    | 'logOut'
    | 'getMe'
    | 'getUserId'
    | 'resendAuthenticationCode';
  payload: unknown;
}

export interface TdlibCommandResponse {
  success: boolean;
  result?: unknown;
  error?: string;
}

/**
 * HTTP API server that exposes TDL operations
 * Allows nest_api to communicate with TDL via HTTP requests
 */
export class HttpApi {
  private app: express.Application;
  private server: ReturnType<express.Application['listen']> | null = null;

  constructor(
    private readonly client: TelegramUserClient,
    private readonly port: number = 3001,
  ) {
    this.app = express();
    this.app.use(express.json());
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok' });
    });

    // Command endpoint
    this.app.post('/command', async (req: Request<TdlibCommandRequest>, res: Response<TdlibCommandResponse>) => {
      try {
        const { type, payload } = req.body;

        if (!type) {
          res.status(400).json({
            success: false,
            error: 'Missing command type',
          });
          return;
        }

        const result = await this.processCommand(type, payload);

        res.json({
          success: true,
          result,
        });
      } catch (error) {
        console.error(`[ERROR] Error processing command:`, error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }

  private async processCommand(type: string, payload: unknown): Promise<unknown> {
    switch (type) {
      case 'sendMessage': {
        const { chatId, text, replyToMessageId } = payload as {
          chatId: number;
          text: string;
          replyToMessageId?: number;
        };
        return await this.client.sendMessage(chatId, text, replyToMessageId);
      }
      case 'getChats': {
        const { chatList, limit } = payload as {
          chatList: { _: string };
          limit: number;
        };
        return await this.client.getChats(chatList, limit);
      }
      case 'getChat': {
        const { chatId } = payload as { chatId: number };
        return await this.client.getChat(chatId);
      }
      case 'getAuthorizationState': {
        return await this.client.getAuthorizationState();
      }
      case 'logOut': {
        return await this.client.logOut();
      }
      case 'getMe': {
        return await this.client.getMe();
      }
      case 'getUserId': {
        return await this.client.getUserId();
      }
      case 'resendAuthenticationCode': {
        return await this.client.resendAuthenticationCode();
      }
      default:
        throw new Error(`Unknown command type: ${type}`);
    }
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.port, () => {
          console.log(`[DEBUG] HTTP API server listening on port ${this.port}`);
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((err) => {
        if (err) {
          reject(err);
        } else {
          console.log('[DEBUG] HTTP API server closed');
          resolve();
        }
      });
    });
  }
}

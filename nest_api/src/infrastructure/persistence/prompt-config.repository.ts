export interface PromptConfigData {
  id: number;
  key: string;
  promptId: string;
  version: string;
}

export abstract class PromptConfigRepository {
  abstract getByKey(key: string): Promise<PromptConfigData | null>;
  abstract upsert(key: string, promptId: string, version: string): Promise<PromptConfigData>;
}

import { Injectable } from '@nestjs/common';
import type { RawDataExtractionOutput } from '../types/purchase.types';

export interface ProgramOption {
  id: number;
  name: string;
}

@Injectable()
export abstract class MessageParser {
  abstract extractData(
    text: string,
    reasoningEffort?: 'minimal' | 'high',
  ): Promise<RawDataExtractionOutput | null>;

  abstract detectTrap(text: string): Promise<boolean>;
}

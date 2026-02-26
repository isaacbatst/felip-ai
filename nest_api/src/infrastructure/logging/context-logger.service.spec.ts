import { ConsoleLogger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { ContextLoggerService } from './context-logger.service';
import { CLS_TRACE_ID, CLS_USER_ID, CLS_CHAT_ID, CLS_SENDER_ID } from './log-context';

describe('ContextLoggerService', () => {
  let logger: ContextLoggerService;
  let cls: ClsService;
  let consoleSpy: {
    log: jest.SpyInstance;
    error: jest.SpyInstance;
    warn: jest.SpyInstance;
    debug: jest.SpyInstance;
    verbose: jest.SpyInstance;
    fatal: jest.SpyInstance;
  };

  beforeEach(() => {
    cls = {
      get: jest.fn(),
      isActive: jest.fn().mockReturnValue(true),
    } as unknown as ClsService;

    logger = new ContextLoggerService(cls);

    // Spy on the underlying ConsoleLogger methods
    consoleSpy = {
      log: jest.spyOn(ConsoleLogger.prototype, 'log').mockImplementation(),
      error: jest.spyOn(ConsoleLogger.prototype, 'error').mockImplementation(),
      warn: jest.spyOn(ConsoleLogger.prototype, 'warn').mockImplementation(),
      debug: jest.spyOn(ConsoleLogger.prototype, 'debug').mockImplementation(),
      verbose: jest.spyOn(ConsoleLogger.prototype, 'verbose').mockImplementation(),
      fatal: jest.spyOn(ConsoleLogger.prototype, 'fatal').mockImplementation(),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('prefix formatting', () => {
    it('prepends all context fields when all are set', () => {
      (cls.get as jest.Mock).mockImplementation((key: string) => {
        const map: Record<string, string> = {
          [CLS_TRACE_ID]: 'abc-123',
          [CLS_USER_ID]: 'u-42',
          [CLS_CHAT_ID]: 'c-99',
          [CLS_SENDER_ID]: 's-77',
        };
        return map[key];
      });

      logger.log('hello world');

      expect(consoleSpy.log).toHaveBeenCalledWith(
        '[t:abc-123 u:u-42 c:c-99 s:s-77] hello world',
      );
    });

    it('omits missing context fields', () => {
      (cls.get as jest.Mock).mockImplementation((key: string) => {
        if (key === CLS_TRACE_ID) return 'abc-123';
        return undefined;
      });

      logger.log('hello world');

      expect(consoleSpy.log).toHaveBeenCalledWith('[t:abc-123] hello world');
    });

    it('uses no prefix when CLS is inactive', () => {
      (cls.isActive as jest.Mock).mockReturnValue(false);

      logger.log('hello world');

      expect(consoleSpy.log).toHaveBeenCalledWith('hello world');
    });

    it('uses no prefix when no context fields are set', () => {
      (cls.get as jest.Mock).mockReturnValue(undefined);

      logger.log('hello world');

      expect(consoleSpy.log).toHaveBeenCalledWith('hello world');
    });
  });

  describe('log level delegation', () => {
    beforeEach(() => {
      (cls.get as jest.Mock).mockReturnValue(undefined);
    });

    it('delegates warn()', () => {
      logger.warn('warning msg');
      expect(consoleSpy.warn).toHaveBeenCalledWith('warning msg');
    });

    it('delegates error()', () => {
      logger.error('error msg');
      expect(consoleSpy.error).toHaveBeenCalledWith('error msg');
    });

    it('delegates debug()', () => {
      logger.debug('debug msg');
      expect(consoleSpy.debug).toHaveBeenCalledWith('debug msg');
    });

    it('delegates verbose()', () => {
      logger.verbose('verbose msg');
      expect(consoleSpy.verbose).toHaveBeenCalledWith('verbose msg');
    });

    it('delegates fatal()', () => {
      logger.fatal('fatal msg');
      expect(consoleSpy.fatal).toHaveBeenCalledWith('fatal msg');
    });
  });

  describe('context parameter passthrough', () => {
    it('passes context/className as second arg to log()', () => {
      (cls.get as jest.Mock).mockReturnValue(undefined);

      logger.log('some message', 'MyService');

      expect(consoleSpy.log).toHaveBeenCalledWith('some message', 'MyService');
    });
  });
});

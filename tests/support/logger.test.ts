import { createLogger, logger, silentLogger } from '../../src/support/logger';

describe('logger (Pino wrapper)', () => {
  it('registra mensajes en todos los niveles con y sin metadata', () => {
    const customLogger = createLogger('silent');

    expect(() => {
      customLogger.debug('mensaje debug sin meta');
      customLogger.debug('mensaje debug con meta', { foo: 'bar' });
      customLogger.info('mensaje info sin meta');
      customLogger.info('mensaje info con meta', { count: 42 });
      customLogger.warn('mensaje warn sin meta');
      customLogger.warn('mensaje warn con meta', { warning: true });
      customLogger.error('mensaje error sin meta');
      customLogger.error('mensaje error con meta', { err: new Error('boom') });
    }).not.toThrow();
  });

  it('permite usar la instancia exportada silentLogger', () => {
    expect(() => {
      silentLogger.info('test en silent');
      silentLogger.warn('advertencia en silent', { k: 'v' });
    }).not.toThrow();
  });

  it('permite usar la instancia exportada logger por defecto', () => {
    expect(() => {
      logger.info('test en logger por defecto');
      logger.debug('debug en logger por defecto', { a: 1 });
    }).not.toThrow();
  });

  it('resuelve el nivel desde env cuando no es test y no se pasa minLevel', () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      delete process.env.NODE_ENV;
      const envLogger = createLogger();
      expect(() => {
        envLogger.info('test con NODE_ENV no test');
      }).not.toThrow();
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});

import pino from 'pino';
import { env } from '../config/env';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

function resolveLevel(minLevel?: LogLevel | 'silent'): string {
  if (minLevel) return minLevel;
  return process.env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL;
}

function logWithPino(
  instance: pino.Logger,
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>
): void {
  if (meta) {
    instance[level](meta, message);
  } else {
    instance[level](message);
  }
}

export function createLogger(minLevel?: LogLevel | 'silent'): Logger {
  const pinoInstance = pino({
    level: resolveLevel(minLevel),
    timestamp: pino.stdTimeFunctions.isoTime
  });

  return {
    debug: (msg, meta) => logWithPino(pinoInstance, 'debug', msg, meta),
    info: (msg, meta) => logWithPino(pinoInstance, 'info', msg, meta),
    warn: (msg, meta) => logWithPino(pinoInstance, 'warn', msg, meta),
    error: (msg, meta) => logWithPino(pinoInstance, 'error', msg, meta)
  };
}

/** Logger inerte, util en pruebas unitarias de filtros. */
export const silentLogger: Logger = createLogger('silent');

export const logger: Logger = createLogger();

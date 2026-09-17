export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function emit(level: LogLevel, minLevel: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[minLevel]) return;
  const line = { level, message, ...meta };
  if (level === 'error') console.error(JSON.stringify(line));
  else if (level === 'warn') console.warn(JSON.stringify(line));
  else console.log(JSON.stringify(line));
}

export function createLogger(minLevel: LogLevel = 'info'): Logger {
  return {
    debug: (message, meta) => emit('debug', minLevel, message, meta),
    info: (message, meta) => emit('info', minLevel, message, meta),
    warn: (message, meta) => emit('warn', minLevel, message, meta),
    error: (message, meta) => emit('error', minLevel, message, meta)
  };
}

/** Logger inerte, util en pruebas unitarias de filtros. */
export const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

export const logger: Logger = createLogger(
  (process.env.LOG_LEVEL as LogLevel | undefined) ?? (process.env.NODE_ENV === 'test' ? 'error' : 'info')
);

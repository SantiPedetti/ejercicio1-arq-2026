import { ErrorRequestHandler, Request, RequestHandler, Response } from 'express';
import { Logger } from '../support/logger';

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: { code: 'ROUTE_NOT_FOUND', message: `No existe la ruta ${req.method} ${req.originalUrl}` }
  });
};

function handleHttpError(error: HttpError, res: Response): void {
  res.status(error.statusCode).json({
    error: { code: error.code, message: error.message, details: error.details }
  });
}

function handleSyntaxError(error: unknown, res: Response): boolean {
  const syntaxError = error as { type?: string };
  if (syntaxError?.type === 'entity.parse.failed') {
    res.status(400).json({
      error: { code: 'MALFORMED_JSON', message: 'El cuerpo del request no es JSON valido' }
    });
    return true;
  }
  return false;
}

function handleUnknownError(error: unknown, req: Request, res: Response, logger: Logger): void {
  const message = error instanceof Error ? error.message : String(error);
  logger.error('Error no controlado en la capa HTTP', { path: req.originalUrl, error: message });
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Error interno al procesar el request' }
  });
}

/**
 * Frontera de errores de la capa HTTP: traduce fallos a respuestas JSON
 * uniformes y evita que una excepcion tumbe el proceso.
 */
export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, req, res, _next) => {
    void _next;
    if (error instanceof HttpError) {
      handleHttpError(error, res);
      return;
    }
    if (handleSyntaxError(error, res)) return;
    handleUnknownError(error, req, res, logger);
  };
}

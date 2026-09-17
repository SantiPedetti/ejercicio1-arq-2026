import { ErrorRequestHandler, RequestHandler } from 'express';
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

/**
 * Frontera de errores de la capa HTTP: traduce fallos a respuestas JSON
 * uniformes y evita que una excepcion tumbe el proceso.
 */
export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, req, res, _next) => {
    if (error instanceof HttpError) {
      res.status(error.statusCode).json({
        error: { code: error.code, message: error.message, details: error.details }
      });
      return;
    }

    // Body JSON malformado: express lanza un SyntaxError con status 400.
    const syntaxError = error as { type?: string; status?: number; message?: string };
    if (syntaxError?.type === 'entity.parse.failed') {
      res.status(400).json({
        error: { code: 'MALFORMED_JSON', message: 'El cuerpo del request no es JSON valido' }
      });
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    logger.error('Error no controlado en la capa HTTP', { path: req.originalUrl, error: message });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Error interno al procesar el request' }
    });
  };
}

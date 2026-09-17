import { Request, Response } from 'express';
import {
  createErrorHandler,
  HttpError,
  notFoundHandler
} from '../../src/api/errorHandler';
import { silentLogger } from '../../src/support/logger';

describe('capa HTTP: errorHandler', () => {
  it('notFoundHandler devuelve 404 con ROUTE_NOT_FOUND', () => {
    const req = { method: 'GET', originalUrl: '/ruta-inexistente' } as Request;
    const jsonMock = jest.fn();
    const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    const res = { status: statusMock } as unknown as Response;

    notFoundHandler(req, res, () => {});

    expect(statusMock).toHaveBeenCalledWith(404);
    expect(jsonMock).toHaveBeenCalledWith({
      error: { code: 'ROUTE_NOT_FOUND', message: 'No existe la ruta GET /ruta-inexistente' }
    });
  });

  it('createErrorHandler maneja HttpError', () => {
    const handler = createErrorHandler(silentLogger);
    const err = new HttpError(403, 'FORBIDDEN', 'Acceso denegado', { detail: 'x' });
    const req = { originalUrl: '/test' } as Request;
    const jsonMock = jest.fn();
    const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    const res = { status: statusMock } as unknown as Response;

    handler(err, req, res, () => {});

    expect(statusMock).toHaveBeenCalledWith(403);
    expect(jsonMock).toHaveBeenCalledWith({
      error: { code: 'FORBIDDEN', message: 'Acceso denegado', details: { detail: 'x' } }
    });
  });

  it('createErrorHandler maneja SyntaxError de body parser con MALFORMED_JSON', () => {
    const handler = createErrorHandler(silentLogger);
    const syntaxError = Object.assign(new SyntaxError('bad json'), {
      type: 'entity.parse.failed'
    });
    const req = { originalUrl: '/test' } as Request;
    const jsonMock = jest.fn();
    const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    const res = { status: statusMock } as unknown as Response;

    handler(syntaxError, req, res, () => {});

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith({
      error: { code: 'MALFORMED_JSON', message: 'El cuerpo del request no es JSON valido' }
    });
  });

  it('createErrorHandler maneja errores desconocidos con INTERNAL_ERROR 500', () => {
    const errorLogMock = jest.fn();
    const customLogger = {
      ...silentLogger,
      error: errorLogMock
    };
    const handler = createErrorHandler(customLogger);
    const err = new Error('fallo grave inesperado');
    const req = { originalUrl: '/ruta-falla' } as Request;
    const jsonMock = jest.fn();
    const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    const res = { status: statusMock } as unknown as Response;

    handler(err, req, res, () => {});

    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith({
      error: { code: 'INTERNAL_ERROR', message: 'Error interno al procesar el request' }
    });
    expect(errorLogMock).toHaveBeenCalled();
  });
});

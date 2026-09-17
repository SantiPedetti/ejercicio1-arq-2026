import { randomUUID } from 'node:crypto';
import { Request, Response, Router } from 'express';
import { ReservationRequest } from '../domain/types';
import { ProcessBatchResponse, ReservationProcessingService } from '../services/reservationProcessingService';
import { HttpError } from './errorHandler';
import { processReservationsSchema, toValidationIssues } from './schemas';

function parseReservationBody(body: unknown) {
  const parsed = processReservationsSchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(
      400,
      'INVALID_REQUEST',
      'El cuerpo del request no cumple el contrato esperado',
      toValidationIssues(parsed.error)
    );
  }
  return parsed.data;
}

function sendBatchResponse(res: Response, response: ProcessBatchResponse): void {
  res.status(200).json({
    processingTimeMs: response.processingTimeMs,
    summary: response.summary,
    results: response.results
  });
}

async function handleProcess(
  req: Request,
  res: Response,
  service: ReservationProcessingService
): Promise<void> {
  const data = parseReservationBody(req.body);
  const cid = (req.headers['x-correlation-id'] as string) || randomUUID();
  const response = await service.processBatch(data.reservations as ReservationRequest[], data.config, cid);
  sendBatchResponse(res, response);
}

function handleGetStatus(req: Request, res: Response, service: ReservationProcessingService): void {
  const result = service.findResult(req.params.id as string);
  if (!result) {
    throw new HttpError(
      404,
      'RESERVATION_NOT_PROCESSED',
      `No hay resultados de procesamiento para la reserva ${req.params.id}`
    );
  }
  res.status(200).json(result);
}

export function createReservationsRouter(service: ReservationProcessingService): Router {
  const router = Router();
  router.post('/process', (req, res, next) => {
    handleProcess(req, res, service).catch(next);
  });
  router.get('/:id/status', (req, res, next) => {
    try {
      handleGetStatus(req, res, service);
    } catch (err) {
      next(err);
    }
  });
  return router;
}

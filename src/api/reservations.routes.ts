import { Router } from 'express';
import { ReservationRequest } from '../domain/types';
import { ReservationProcessingService } from '../services/reservationProcessingService';
import { HttpError } from './errorHandler';
import { processReservationsSchema, toValidationIssues } from './schemas';

export function createReservationsRouter(service: ReservationProcessingService): Router {
  const router = Router();

  router.post('/process', async (req, res, next) => {
    try {
      const parsed = processReservationsSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(
          400,
          'INVALID_REQUEST',
          'El cuerpo del request no cumple el contrato esperado',
          toValidationIssues(parsed.error)
        );
      }

      const reservations = parsed.data.reservations as ReservationRequest[];
      const response = await service.processBatch(reservations, parsed.data.config);

      res.status(200).json({
        processingTimeMs: response.processingTimeMs,
        summary: response.summary,
        results: response.results
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id/status', (req, res, next) => {
    try {
      const result = service.findResult(req.params.id);
      if (!result) {
        throw new HttpError(
          404,
          'RESERVATION_NOT_PROCESSED',
          `No hay resultados de procesamiento para la reserva ${req.params.id}`
        );
      }
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

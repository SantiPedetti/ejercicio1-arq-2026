import { Router } from 'express';
import { PipelineConfigPatch, PipelineConfigStore } from '../config/pipelineConfig';
import { ReservationProcessingService } from '../services/reservationProcessingService';
import { HttpError } from './errorHandler';
import { pipelineConfigPatchSchema, toValidationIssues } from './schemas';

export function createPipelineRouter(
  configStore: PipelineConfigStore,
  service: ReservationProcessingService
): Router {
  const router = Router();

  router.get('/config', (_req, res) => {
    res.status(200).json(configStore.get());
  });

  router.put('/config', (req, res, next) => {
    try {
      const parsed = pipelineConfigPatchSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(
          400,
          'INVALID_CONFIG',
          'La configuracion enviada no es valida',
          toValidationIssues(parsed.error)
        );
      }

      const patch = parsed.data as PipelineConfigPatch;
      const updated = configStore.update(patch);

      // Cambiar el TTL o el proveedor invalida las tasas ya cacheadas.
      if (patch.exchangeRate) service.invalidateRatesCache();

      res.status(200).json(updated);
    } catch (error) {
      next(error);
    }
  });

  router.post('/config/reset', (_req, res) => {
    service.invalidateRatesCache();
    res.status(200).json(configStore.reset());
  });

  return router;
}

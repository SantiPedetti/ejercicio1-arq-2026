import { NextFunction, Request, Response, Router } from 'express';
import { FILTER_NAMES, PipelineConfigPatch, PipelineConfigStore } from '../config/pipelineConfig';
import { ReservationProcessingService } from '../services/reservationProcessingService';
import { HttpError } from './errorHandler';
import { pipelineConfigPatchSchema, toValidationIssues } from './schemas';

function parseConfigPatch(body: unknown): PipelineConfigPatch {
  const parsed = pipelineConfigPatchSchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(
      400,
      'INVALID_CONFIG',
      'La configuracion enviada no es valida',
      toValidationIssues(parsed.error)
    );
  }
  return parsed.data as PipelineConfigPatch;
}

function handleUpdateConfig(
  req: Request,
  res: Response,
  configStore: PipelineConfigStore,
  service: ReservationProcessingService
): void {
  const patch = parseConfigPatch(req.body);
  const updated = configStore.update(patch);
  if (patch.exchangeRate) service.invalidateRatesCache();
  res.status(200).json(updated);
}

function createPutHandler(configStore: PipelineConfigStore, service: ReservationProcessingService) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      handleUpdateConfig(req, res, configStore, service);
    } catch (err) {
      next(err);
    }
  };
}

function registerPipelineRoutes(
  router: Router,
  configStore: PipelineConfigStore,
  service: ReservationProcessingService
): void {
  router.get('/config', (_req, res) => {
    res.status(200).json({ ...configStore.get(), filterOrder: [...FILTER_NAMES] });
  });
  router.put('/config', createPutHandler(configStore, service));
  router.post('/config/reset', (_req, res) => {
    service.invalidateRatesCache();
    res.status(200).json(configStore.reset());
  });
}

export function createPipelineRouter(
  configStore: PipelineConfigStore,
  service: ReservationProcessingService
): Router {
  const router = Router();
  registerPipelineRoutes(router, configStore, service);
  return router;
}

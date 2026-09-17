import express, { Express } from 'express';
import { createErrorHandler, notFoundHandler } from './api/errorHandler';
import { createPipelineRouter } from './api/pipeline.routes';
import { createReservationsRouter } from './api/reservations.routes';
import { PipelineConfigStore, pipelineConfigStore } from './config/pipelineConfig';
import { ReservationProcessingService } from './services/reservationProcessingService';
import { FetchLike } from './services/exchangeRate/exchangeRateApiClient';
import { ExchangeRateProvider } from './services/exchangeRate/exchangeRateProvider';
import { ProcessingStore, processingStore } from './store/processingStore';
import { logger as defaultLogger, Logger } from './support/logger';

export interface AppOptions {
  configStore?: PipelineConfigStore;
  store?: ProcessingStore;
  logger?: Logger;
  exchangeRateProvider?: ExchangeRateProvider;
  fetchFn?: FetchLike;
}

export function createApp(options: AppOptions = {}): Express {
  const configStore = options.configStore ?? pipelineConfigStore;
  const store = options.store ?? processingStore;
  const logger = options.logger ?? defaultLogger;

  const service = new ReservationProcessingService({
    configStore,
    store,
    logger,
    ...(options.exchangeRateProvider ? { exchangeRateProvider: options.exchangeRateProvider } : {}),
    ...(options.fetchFn ? { fetchFn: options.fetchFn } : {})
  });

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/reservations', createReservationsRouter(service));
  app.use('/pipeline', createPipelineRouter(configStore, service));

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}

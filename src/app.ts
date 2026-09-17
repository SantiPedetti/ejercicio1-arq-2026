import { randomUUID } from 'node:crypto';
import express, { Express } from 'express';
import { createErrorHandler, notFoundHandler } from './api/errorHandler';
import { createPipelineRouter } from './api/pipeline.routes';
import { createReservationsRouter } from './api/reservations.routes';
import { PipelineConfigStore, pipelineConfigStore } from './config/pipelineConfig';
import { buildMockFlights } from './data/mockFlights';
import { buildMockPassengers } from './data/mockPassengers';
import { createFlightRepository, FlightRepository } from './repositories/flightRepository';
import { createPassengerRepository, PassengerRepository } from './repositories/passengerRepository';
import { FetchLike } from './services/exchangeRate/exchangeRateApiClient';
import { ExchangeRateProvider } from './services/exchangeRate/exchangeRateProvider';
import { ReservationProcessingService } from './services/reservationProcessingService';
import { ProcessingStore, processingStore } from './store/processingStore';
import { Clock, systemClock } from './support/clock';
import { logger as defaultLogger, Logger } from './support/logger';

export interface AppOptions {
  configStore?: PipelineConfigStore;
  store?: ProcessingStore;
  logger?: Logger;
  exchangeRateProvider?: ExchangeRateProvider;
  fetchFn?: FetchLike;
  clock?: Clock;
  passengers?: PassengerRepository;
  flights?: FlightRepository;
}

const CORRELATION_ID_REGEX = /^[A-Za-z0-9-]{1,64}$/;

function sanitizeCorrelationId(headerValue: unknown): string {
  if (typeof headerValue === 'string' && CORRELATION_ID_REGEX.test(headerValue)) {
    return headerValue;
  }
  return randomUUID();
}

function resolveRepositories(opts: AppOptions, clock: Clock) {
  return {
    passengers: opts.passengers ?? createPassengerRepository(buildMockPassengers(clock.now())),
    flights: opts.flights ?? createFlightRepository(buildMockFlights(clock.now()))
  };
}

function buildService(
  opts: AppOptions,
  configStore: PipelineConfigStore,
  store: ProcessingStore,
  logger: Logger,
  clock: Clock
): ReservationProcessingService {
  const { passengers, flights } = resolveRepositories(opts, clock);
  return new ReservationProcessingService({
    configStore, store, logger, passengers, flights, now: () => clock.now(),
    ...(opts.exchangeRateProvider ? { exchangeRateProvider: opts.exchangeRateProvider } : {}),
    ...(opts.fetchFn ? { fetchFn: opts.fetchFn } : {})
  });
}

function setupCommonMiddleware(app: Express): void {
  app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => {
    const id = sanitizeCorrelationId(req.headers['x-correlation-id']);
    req.headers['x-correlation-id'] = id;
    res.setHeader('x-correlation-id', id);
    next();
  });
  app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));
}

function mountRoutes(
  app: Express,
  logger: Logger,
  configStore: PipelineConfigStore,
  service: ReservationProcessingService
): void {
  app.use('/reservations', createReservationsRouter(service));
  app.use('/pipeline', createPipelineRouter(configStore, service));
  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));
}

export function createApp(options: AppOptions = {}): Express {
  const clock = options.clock ?? systemClock;
  const configStore = options.configStore ?? pipelineConfigStore;
  const store = options.store ?? processingStore;
  const logger = options.logger ?? defaultLogger;
  const service = buildService(options, configStore, store, logger, clock);
  const app = express();
  setupCommonMiddleware(app);
  mountRoutes(app, logger, configStore, service);
  return app;
}

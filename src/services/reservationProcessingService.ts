import {
  PipelineConfig,
  PipelineConfigPatch,
  PipelineConfigStore
} from '../config/pipelineConfig';
import { ReservationRequest } from '../domain/types';
import { FilterDependencies } from '../pipeline/filter';
import { BatchSummary } from '../pipeline/pipeline';
import { createPipeline } from '../pipeline/registry';
import { flightRepository, FlightRepository } from '../repositories/flightRepository';
import { passengerRepository, PassengerRepository } from '../repositories/passengerRepository';
import { ProcessingStore } from '../store/processingStore';
import { Logger, silentLogger } from '../support/logger';
import { ExchangeRateApiClient, FetchLike } from './exchangeRate/exchangeRateApiClient';
import { ExchangeRateProvider } from './exchangeRate/exchangeRateProvider';
import { RatesCache } from './exchangeRate/ratesCache';
import { ReservationResult, toReservationResult } from './reservationResult';

export interface ProcessBatchResponse {
  results: ReservationResult[];
  summary: BatchSummary;
  processingTimeMs: number;
  /** Configuracion efectivamente usada, incluyendo overrides del request. */
  appliedConfig: PipelineConfig;
}

export interface ReservationProcessingServiceDeps {
  configStore: PipelineConfigStore;
  store: ProcessingStore;
  logger?: Logger;
  passengers?: PassengerRepository;
  flights?: FlightRepository;
  /** Permite sustituir el proveedor completo (pruebas, otro proveedor). */
  exchangeRateProvider?: ExchangeRateProvider;
  /** Permite sustituir solo el transporte HTTP manteniendo el cliente real. */
  fetchFn?: FetchLike;
  now?: () => Date;
}

/**
 * Compone el pipeline con la configuracion vigente y procesa lotes de reservas.
 * La cache de tasas es propiedad del servicio para que sobreviva entre
 * requests, aunque el cliente se reconstruya al cambiar la configuracion.
 */
export class ReservationProcessingService {
  private readonly configStore: PipelineConfigStore;
  private readonly store: ProcessingStore;
  private readonly logger: Logger;
  private readonly passengers: PassengerRepository;
  private readonly flights: FlightRepository;
  private readonly injectedProvider?: ExchangeRateProvider;
  private readonly fetchFn?: FetchLike;
  private readonly now: () => Date;
  private readonly ratesCache: RatesCache;

  constructor(deps: ReservationProcessingServiceDeps) {
    this.configStore = deps.configStore;
    this.store = deps.store;
    this.logger = deps.logger ?? silentLogger;
    this.passengers = deps.passengers ?? passengerRepository;
    this.flights = deps.flights ?? flightRepository;
    this.injectedProvider = deps.exchangeRateProvider;
    this.fetchFn = deps.fetchFn;
    this.now = deps.now ?? (() => new Date());
    this.ratesCache = new RatesCache(this.configStore.get().exchangeRate.cacheTtlMs);
  }

  async processBatch(
    requests: ReservationRequest[],
    overrides?: PipelineConfigPatch
  ): Promise<ProcessBatchResponse> {
    const config = overrides
      ? new PipelineConfigStore(this.configStore.get()).update(overrides)
      : this.configStore.get();

    const deps: FilterDependencies = {
      config,
      passengers: this.passengers,
      flights: this.flights,
      exchangeRates: this.buildProvider(config),
      logger: this.logger,
      now: this.now
    };

    const batch = await createPipeline(config, deps).processBatch(requests);
    const results = batch.contexts.map((context) => toReservationResult(context, this.now()));
    this.store.saveAll(results);

    this.logger.info('Lote de reservas procesado', {
      total: batch.summary.total,
      rejected: batch.summary.rejected,
      failed: batch.summary.failed,
      processingTimeMs: batch.processingTimeMs
    });

    return {
      results,
      summary: batch.summary,
      processingTimeMs: batch.processingTimeMs,
      appliedConfig: config
    };
  }

  findResult(reservationId: string): ReservationResult | undefined {
    return this.store.find(reservationId);
  }

  invalidateRatesCache(): void {
    this.ratesCache.invalidate();
    this.injectedProvider?.invalidateCache();
  }

  private buildProvider(config: PipelineConfig): ExchangeRateProvider {
    if (this.injectedProvider) return this.injectedProvider;
    this.ratesCache.setTtl(config.exchangeRate.cacheTtlMs);
    return new ExchangeRateApiClient({
      settings: config.exchangeRate,
      logger: this.logger,
      cache: this.ratesCache,
      ...(this.fetchFn ? { fetchFn: this.fetchFn } : {})
    });
  }
}

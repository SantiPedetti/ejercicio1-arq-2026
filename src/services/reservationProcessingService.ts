import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { singleReservationSchema } from '../api/schemas';
import {
  PipelineConfig,
  PipelineConfigPatch,
  PipelineConfigStore
} from '../config/pipelineConfig';
import { createContext, ReservationContext } from '../domain/reservationContext';
import { ReservationRequest } from '../domain/types';
import { FilterDependencies } from '../pipeline/filter';
import { BatchSummary, Pipeline } from '../pipeline/pipeline';
import { createPipeline } from '../pipeline/registry';
import { flightRepository, FlightRepository } from '../repositories/flightRepository';
import { passengerRepository, PassengerRepository } from '../repositories/passengerRepository';
import { ProcessingStore, ReservationStatusEntry } from '../store/processingStore';
import { Logger, silentLogger } from '../support/logger';
import { ExchangeRateApiClient, FetchLike } from './exchangeRate/exchangeRateApiClient';
import { ExchangeRateProvider } from './exchangeRate/exchangeRateProvider';
import { RatesCache } from './exchangeRate/ratesCache';
import { ReservationResult, toReservationResult } from './reservationResult';

export interface ProcessBatchResponse {
  results: ReservationResult[];
  summary: BatchSummary;
  processingTimeMs: number;
  appliedConfig: PipelineConfig;
}

export interface ReservationProcessingServiceDeps {
  configStore: PipelineConfigStore;
  store: ProcessingStore;
  logger?: Logger;
  passengers?: PassengerRepository;
  flights?: FlightRepository;
  exchangeRateProvider?: ExchangeRateProvider;
  fetchFn?: FetchLike;
  now?: () => Date;
}

function extractId(raw: unknown): string {
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.id === 'string' && obj.id.trim().length > 0) return obj.id;
    if (typeof obj.reservationId === 'string' && obj.reservationId.trim().length > 0) return obj.reservationId;
  }
  return randomUUID();
}

function formatIssues(error?: z.ZodError): string | undefined {
  if (!error) return undefined;
  return error.issues.map((i) => `${i.path.join('.') || 'root'}: ${i.message}`).join(', ');
}

function buildInvalidResult(id: string, now: Date, error?: z.ZodError): ReservationResult {
  const details = formatIssues(error);
  const message = details
    ? `La reserva no cumple el contrato esperado: ${details}`
    : 'La reserva no cumple el contrato esperado';
  return {
    reservationId: id,
    status: 'REJECTED',
    errors: [{ filter: 'source', code: 'INVALID_RESERVATION', message, severity: 'error', details: error?.issues }],
    warnings: [],
    trace: [],
    processedAt: now.toISOString()
  };
}

function summarizeBatch(results: ReservationResult[]): BatchSummary {
  const summary: BatchSummary = { total: results.length, confirmed: 0, rejected: 0, failed: 0 };
  for (const r of results) {
    if (r.status === 'CONFIRMED') summary.confirmed += 1;
    else if (r.status === 'REJECTED') summary.rejected += 1;
    else if (r.status === 'FAILED') summary.failed += 1;
  }
  return summary;
}

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

  private resolveConfig(overrides?: PipelineConfigPatch): PipelineConfig {
    const snapshot = this.configStore.get();
    if (!overrides) return snapshot;
    const clean: PipelineConfigPatch = { ...overrides };
    delete (clean as { exchangeRate?: unknown }).exchangeRate;
    return new PipelineConfigStore(snapshot).update(clean);
  }

  private buildFilterDeps(config: PipelineConfig): FilterDependencies {
    return {
      config,
      passengers: this.passengers,
      flights: this.flights,
      exchangeRates: this.buildProvider(config),
      logger: this.logger,
      now: this.now
    };
  }

  private logBatch(batch: { summary: BatchSummary; processingTimeMs: number }): void {
    this.logger.info('Lote de reservas procesado', {
      total: batch.summary.total,
      rejected: batch.summary.rejected,
      failed: batch.summary.failed,
      processingTimeMs: batch.processingTimeMs
    });
  }

  private buildInitialContext(req: ReservationRequest): ReservationContext {
    const passenger = this.passengers.findById(req.passengerId);
    const flight = this.flights.findByCode(req.flightCode);
    return createContext(req, { passenger, flight });
  }

  private async processItem(raw: unknown, pipeline: Pipeline, cid?: string): Promise<ReservationResult> {
    const id = extractId(raw);
    this.store.saveStatus({ reservationId: id, status: 'PROCESSING', updatedAt: this.now().toISOString() });
    const parsed = singleReservationSchema.safeParse(raw);
    if (!parsed.success) {
      const res = buildInvalidResult(id, this.now(), parsed.error);
      this.store.saveResult(res, this.now().toISOString());
      return res;
    }
    const initCtx = this.buildInitialContext({ ...parsed.data, id, reservationId: id });
    const ctx = await pipeline.process(initCtx, cid);
    const result = toReservationResult(ctx, this.now());
    this.store.saveResult(result, this.now().toISOString());
    return result;
  }

  private async executeBatch(items: unknown[], pipeline: Pipeline, cid?: string): Promise<ReservationResult[]> {
    const results: ReservationResult[] = [];
    for (const item of items) {
      results.push(await this.processItem(item, pipeline, cid));
    }
    return results;
  }

  async processBatch(
    items: unknown[],
    overrides?: PipelineConfigPatch,
    cid?: string
  ): Promise<ProcessBatchResponse> {
    const startedAt = performance.now();
    const config = this.resolveConfig(overrides);
    const pipeline = createPipeline(config, this.buildFilterDeps(config));
    const results = await this.executeBatch(items, pipeline, cid);
    const summary = summarizeBatch(results);
    const processingTimeMs = Math.round((performance.now() - startedAt) * 100) / 100;
    this.logBatch({ summary, processingTimeMs });
    return { results, summary, processingTimeMs, appliedConfig: config };
  }

  findStatus(reservationId: string): ReservationStatusEntry | undefined {
    return this.store.find(reservationId);
  }

  findResult(reservationId: string): ReservationResult | undefined {
    return this.store.findResult(reservationId);
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

import { randomUUID } from 'node:crypto';
import { FilterName } from '../config/pipelineConfig';
import {
  addError,
  addWarning,
  createContext,
  hasErrors,
  ReservationContext
} from '../domain/reservationContext';
import { ReservationInput, ReservationRequest } from '../domain/types';
import { Logger, silentLogger } from '../support/logger';
import { validateContextInvariants } from './context-guard';
import { Filter } from './filter';

export interface PipelineOptions {
  enabledFilters: Record<FilterName, boolean>;
  logger?: Logger;
}

export interface BatchSummary {
  total: number;
  confirmed: number;
  rejected: number;
  failed: number;
}

export interface BatchResult {
  contexts: ReservationContext[];
  summary: BatchSummary;
  processingTimeMs: number;
}

function reqId(req: ReservationRequest): string {
  return req.id || req.reservationId || '';
}

/**
 * Orquestador Pipes & Filters. Ejecuta los filtros en secuencia sobre el
 * contexto de cada reserva y aisla los fallos: una excepcion de un filtro no
 * interrumpe el resto del lote.
 */
export class Pipeline {
  private readonly filters: Filter[];
  private readonly enabledFilters: Record<FilterName, boolean>;
  private readonly logger: Logger;

  constructor(filters: Filter[], options: PipelineOptions) {
    this.filters = filters;
    this.enabledFilters = options.enabledFilters;
    this.logger = options.logger ?? silentLogger;
  }

  async process(context: ReservationContext, correlationId?: string): Promise<ReservationContext> {
    const cid = correlationId ?? randomUUID();
    let current: ReservationContext = { ...context, status: 'PROCESSING' };
    for (const filter of this.filters) {
      current = await this.runStep(current, filter, cid);
    }
    return finalizeStatus(current);
  }

  private async runStep(
    ctx: ReservationContext,
    filter: Filter,
    cid: string
  ): Promise<ReservationContext> {
    if (ctx.status === 'REJECTED' || ctx.status === 'FAILED') {
      return this.recordNotRun(ctx, filter, cid);
    }
    if (this.enabledFilters[filter.name] === false) {
      return this.recordSkip(ctx, filter, cid);
    }
    return this.executeFilter(ctx, filter, cid);
  }

  private recordSkip(ctx: ReservationContext, f: Filter, cid: string): ReservationContext {
    const next: ReservationContext = {
      ...ctx,
      trace: [...ctx.trace, { filter: f.name, status: 'SKIPPED', durationMs: 0 }]
    };
    this.logStep(reqId(ctx.request), cid, f.name, 'SKIPPED', 0);
    return next;
  }

  private recordNotRun(ctx: ReservationContext, f: Filter, cid: string): ReservationContext {
    const next: ReservationContext = {
      ...ctx,
      trace: [...ctx.trace, { filter: f.name, status: 'NOT_RUN', durationMs: 0 }]
    };
    this.logStep(reqId(ctx.request), cid, f.name, 'NOT_RUN', 0);
    return next;
  }

  private recordSuccess(
    next: ReservationContext,
    name: FilterName,
    cid: string,
    durationMs: number
  ): ReservationContext {
    const res: ReservationContext = {
      ...next,
      trace: [...next.trace, { filter: name, status: 'COMPLETED', durationMs }]
    };
    this.logStep(reqId(next.request), cid, name, 'COMPLETED', durationMs);
    return res;
  }

  private checkFilterResult(ctx: ReservationContext, f: Filter, cid: string, durationMs: number): ReservationContext {
    const guardError = validateContextInvariants(ctx, f.name);
    if (guardError) return this.handleGuardFailure(ctx, f, cid, guardError, durationMs);
    if (hasErrors(ctx)) return this.handleRejection(ctx, f, cid, durationMs);
    return this.recordSuccess(ctx, f.name, cid, durationMs);
  }

  private async executeFilter(
    ctx: ReservationContext,
    f: Filter,
    cid: string
  ): Promise<ReservationContext> {
    const start = performance.now();
    try {
      const next = await f.execute(ctx);
      return this.checkFilterResult(next, f, cid, round(performance.now() - start));
    } catch (err) {
      return this.handleFilterError(ctx, f, cid, err, round(performance.now() - start));
    }
  }

  private handleGuardFailure(
    ctx: ReservationContext, f: Filter, cid: string, err: string, durationMs: number
  ): ReservationContext {
    const withErr = addError(ctx, f.name, 'DATA_CORRUPTED', `Montos corruptos: ${err}`);
    this.logFilterFailure(reqId(ctx.request), cid, f.name, durationMs, err);
    return {
      ...withErr, status: 'FAILED', aborted: true,
      trace: [...withErr.trace, { filter: f.name, status: 'FAILED', durationMs, detail: err }]
    };
  }

  private handleRejection(
    ctx: ReservationContext,
    f: Filter,
    cid: string,
    durationMs: number
  ): ReservationContext {
    const rejected: ReservationContext = {
      ...ctx,
      status: 'REJECTED',
      aborted: true,
      trace: [...ctx.trace, { filter: f.name, status: 'COMPLETED', durationMs }]
    };
    this.logStep(reqId(rejected.request), cid, f.name, 'COMPLETED', durationMs);
    return rejected;
  }

  private handleFilterError(
    ctx: ReservationContext,
    f: Filter,
    cid: string,
    err: unknown,
    durationMs: number
  ): ReservationContext {
    const msg = err instanceof Error ? err.message : String(err);
    if (f.critical) return this.handleCriticalError(ctx, f, cid, msg, durationMs);
    return this.handleNonCriticalError(ctx, f, cid, msg, durationMs);
  }

  private handleCriticalError(
    ctx: ReservationContext, f: Filter, cid: string, msg: string, durationMs: number
  ): ReservationContext {
    const withErr = addError(ctx, f.name, 'FILTER_EXCEPTION', `El filtro fallo de forma inesperada: ${msg}`);
    this.logFilterFailure(reqId(ctx.request), cid, f.name, durationMs, msg);
    return {
      ...withErr, status: 'FAILED', aborted: true,
      trace: [...withErr.trace, { filter: f.name, status: 'FAILED', durationMs, detail: msg }]
    };
  }

  private handleNonCriticalError(
    ctx: ReservationContext,
    f: Filter,
    cid: string,
    msg: string,
    durationMs: number
  ): ReservationContext {
    const withWarn = addWarning(ctx, f.name, 'FILTER_EXCEPTION', `El filtro fallo de forma inesperada: ${msg}`);
    const meta = { pipeline: 'flight-reservation', reservationId: reqId(ctx.request), correlationId: cid, filter: f.name, status: 'FAILED', durationMs, error: msg };
    this.logger.warn('Filtro no critico fallo de forma inesperada', meta);
    return { ...withWarn, trace: [...withWarn.trace, { filter: f.name, status: 'FAILED', durationMs, detail: msg }] };
  }

  private logFilterFailure(
    reservationId: string,
    correlationId: string,
    filter: FilterName,
    durationMs: number,
    error: string
  ): void {
    const meta = { pipeline: 'flight-reservation', reservationId, correlationId, filter, status: 'FAILED', durationMs, error };
    this.logger.error('Excepcion no controlada en un filtro del pipeline', meta);
  }

  private logStep(
    reservationId: string,
    correlationId: string,
    filter: FilterName,
    status: string,
    durationMs: number
  ): void {
    const meta = { pipeline: 'flight-reservation', reservationId, correlationId, filter, status, durationMs };
    this.logger.info('Filtro del pipeline procesado', meta);
  }

  private async processAll(requests: (ReservationRequest | ReservationInput)[], cid: string) {
    return Promise.all(requests.map((req) => this.process(createContext(req), cid)));
  }

  async processBatch(
    requests: (ReservationRequest | ReservationInput)[],
    correlationId?: string
  ): Promise<BatchResult> {
    const startedAt = performance.now();
    const contexts = await this.processAll(requests, correlationId ?? randomUUID());
    return {
      contexts,
      summary: summarize(contexts),
      processingTimeMs: round(performance.now() - startedAt)
    };
  }
}

function finalizePricing(context: ReservationContext): ReservationContext {
  if (!context.pricing) return context;
  if (context.pricing.total === undefined && context.pricing.currentPrice !== undefined) {
    return {
      ...context,
      pricing: {
        ...context.pricing,
        subtotal: context.pricing.subtotal ?? context.pricing.currentPrice,
        total: context.pricing.currentPrice
      }
    };
  }
  return context;
}

function finalizeStatus(context: ReservationContext): ReservationContext {
  const ctx = finalizePricing(context);
  if (ctx.status === 'REJECTED' || ctx.status === 'FAILED') return ctx;
  if (hasErrors(ctx)) {
    return { ...ctx, status: 'REJECTED' };
  }
  return { ...ctx, status: 'CONFIRMED' };
}

function summarize(contexts: ReservationContext[]): BatchSummary {
  const summary: BatchSummary = { total: 0, confirmed: 0, rejected: 0, failed: 0 };
  for (const ctx of contexts) {
    summary.total += 1;
    if (ctx.status === 'CONFIRMED') summary.confirmed += 1;
    else if (ctx.status === 'REJECTED') summary.rejected += 1;
    else if (ctx.status === 'FAILED') summary.failed += 1;
  }
  return summary;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

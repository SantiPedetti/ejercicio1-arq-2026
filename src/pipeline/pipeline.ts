import { randomUUID } from 'node:crypto';
import { FilterName } from '../config/pipelineConfig';
import {
  addError,
  createContext,
  hasErrors,
  hasWarnings,
  ReservationContext
} from '../domain/reservationContext';
import { ReservationRequest } from '../domain/types';
import { Logger, silentLogger } from '../support/logger';
import { Filter } from './filter';

export interface PipelineOptions {
  enabledFilters: Record<FilterName, boolean>;
  logger?: Logger;
}

export interface BatchSummary {
  total: number;
  processed: number;
  processedWithWarnings: number;
  rejected: number;
  failed: number;
}

export interface BatchResult {
  contexts: ReservationContext[];
  summary: BatchSummary;
  processingTimeMs: number;
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
    let current = context;
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
    if (this.enabledFilters[filter.name] === false) {
      return this.recordSkip(ctx, filter, cid, 'disabled');
    }
    if (ctx.aborted && filter.runOnAborted !== true) {
      return this.recordSkip(ctx, filter, cid, 'skipped', 'La reserva fue rechazada por un filtro anterior');
    }
    return this.executeFilter(ctx, filter, cid);
  }

  private recordSkip(
    ctx: ReservationContext,
    f: Filter,
    cid: string,
    status: 'disabled' | 'skipped',
    detail?: string
  ): ReservationContext {
    ctx.trace.push({ filter: f.name, status, durationMs: 0, ...(detail ? { detail } : {}) });
    this.logStep(ctx.request.reservationId, cid, f.name, status, 0);
    return ctx;
  }

  private recordSuccess(
    next: ReservationContext,
    filterName: FilterName,
    cid: string,
    durationMs: number
  ): ReservationContext {
    next.trace.push({ filter: filterName, status: 'executed', durationMs });
    this.logStep(next.request.reservationId, cid, filterName, 'executed', durationMs);
    return next;
  }

  private async executeFilter(
    ctx: ReservationContext,
    f: Filter,
    cid: string
  ): Promise<ReservationContext> {
    const start = performance.now();
    try {
      const next = await f.execute(ctx);
      return this.recordSuccess(next, f.name, cid, round(performance.now() - start));
    } catch (err) {
      return this.handleFilterError(ctx, f, cid, err, round(performance.now() - start));
    }
  }

  private logFilterFailure(
    reservationId: string,
    correlationId: string,
    filter: FilterName,
    durationMs: number,
    error: string
  ): void {
    const meta = { pipeline: 'flight-reservation', reservationId, correlationId, filter, status: 'failed', durationMs, error };
    this.logger.error('Excepcion no controlada en un filtro del pipeline', meta);
  }

  private handleFilterError(
    ctx: ReservationContext,
    f: Filter,
    cid: string,
    err: unknown,
    durationMs: number
  ): ReservationContext {
    const msg = err instanceof Error ? err.message : String(err);
    addError(ctx, f.name, 'FILTER_EXCEPTION', `El filtro fallo de forma inesperada: ${msg}`);
    ctx.status = 'failed';
    ctx.aborted = true;
    ctx.trace.push({ filter: f.name, status: 'failed', durationMs, detail: msg });
    this.logFilterFailure(ctx.request.reservationId, cid, f.name, durationMs, msg);
    return ctx;
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

  async processBatch(requests: ReservationRequest[], correlationId?: string): Promise<BatchResult> {
    const cid = correlationId ?? randomUUID();
    const startedAt = performance.now();
    const contexts: ReservationContext[] = [];
    for (const req of requests) {
      contexts.push(await this.process(createContext(req), cid));
    }
    return {
      contexts,
      summary: summarize(contexts),
      processingTimeMs: round(performance.now() - startedAt)
    };
  }
}

function finalizeStatus(context: ReservationContext): ReservationContext {
  if (context.status === 'rejected' || context.status === 'failed') return context;
  if (hasErrors(context)) {
    context.status = 'rejected';
    return context;
  }
  context.status = hasWarnings(context) ? 'processed_with_warnings' : 'processed';
  return context;
}

function summarize(contexts: ReservationContext[]): BatchSummary {
  const summary: BatchSummary = { total: 0, processed: 0, processedWithWarnings: 0, rejected: 0, failed: 0 };
  for (const ctx of contexts) {
    summary.total += 1;
    if (ctx.status === 'processed') summary.processed += 1;
    else if (ctx.status === 'processed_with_warnings') summary.processedWithWarnings += 1;
    else if (ctx.status === 'rejected') summary.rejected += 1;
    else if (ctx.status === 'failed') summary.failed += 1;
  }
  return summary;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

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

  async process(context: ReservationContext): Promise<ReservationContext> {
    for (const filter of this.filters) {
      if (this.enabledFilters[filter.name] === false) {
        context.trace.push({ filter: filter.name, status: 'disabled', durationMs: 0 });
        continue;
      }

      if (context.aborted && filter.runOnAborted !== true) {
        context.trace.push({
          filter: filter.name,
          status: 'skipped',
          durationMs: 0,
          detail: 'La reserva fue rechazada por un filtro anterior'
        });
        continue;
      }

      const startedAt = performance.now();
      try {
        context = await filter.execute(context);
        context.trace.push({
          filter: filter.name,
          status: 'executed',
          durationMs: round(performance.now() - startedAt)
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addError(context, filter.name, 'FILTER_EXCEPTION', `El filtro fallo de forma inesperada: ${message}`);
        context.status = 'failed';
        context.aborted = true;
        context.trace.push({
          filter: filter.name,
          status: 'failed',
          durationMs: round(performance.now() - startedAt),
          detail: message
        });
        this.logger.error('Excepcion no controlada en un filtro del pipeline', {
          filter: filter.name,
          reservationId: context.request.reservationId,
          error: message
        });
      }
    }

    return finalizeStatus(context);
  }

  /** Procesa un lote completo; cada reserva es independiente de las demas. */
  async processBatch(requests: ReservationRequest[]): Promise<BatchResult> {
    const startedAt = performance.now();
    const contexts: ReservationContext[] = [];

    for (const request of requests) {
      contexts.push(await this.process(createContext(request)));
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
  return contexts.reduce<BatchSummary>(
    (summary, context) => {
      summary.total += 1;
      if (context.status === 'processed') summary.processed += 1;
      else if (context.status === 'processed_with_warnings') summary.processedWithWarnings += 1;
      else if (context.status === 'rejected') summary.rejected += 1;
      else if (context.status === 'failed') summary.failed += 1;
      return summary;
    },
    { total: 0, processed: 0, processedWithWarnings: 0, rejected: 0, failed: 0 }
  );
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

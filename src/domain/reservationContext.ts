import { randomUUID } from 'node:crypto';
import {
  CurrencyMetadata,
  ExchangeRateData,
  FilterTrace,
  Flight,
  LocalConversionData,
  Passenger,
  PriceBreakdown,
  ProcessingIssue,
  ReservationInput,
  ReservationRequest
} from './types';

export type ReservationStatus = 'PENDING' | 'PROCESSING' | 'CONFIRMED' | 'REJECTED' | 'FAILED';

/**
 * Objeto que viaja por los pipes del pipeline. Cada filtro lee lo que necesita,
 * escribe su aporte y acumula errores o warnings sin conocer a los demas filtros.
 */
export interface ReservationContext {
  request: ReservationRequest;
  status: ReservationStatus;
  /** Cuando es true, los filtros posteriores de negocio no deben ejecutarse. */
  aborted: boolean;
  passenger?: Passenger;
  flight?: Flight;
  pricing?: PriceBreakdown;
  exchangeRate?: ExchangeRateData;
  conversion?: LocalConversionData;
  currency?: CurrencyMetadata;
  issues: ProcessingIssue[];
  trace: FilterTrace[];
  metadata: Record<string, unknown>;
}

export function createNeutralPricing(baseFare: number): PriceBreakdown {
  return {
    baseFare,
    classPrice: baseFare,
    currentPrice: baseFare,
    loyaltyDiscount: 0,
    passengerTypeDiscount: 0
  };
}

export interface ContextOptions {
  passenger?: Passenger;
  flight?: Flight;
  pricing?: PriceBreakdown;
}

function resolveInitialPricing(options?: ContextOptions): PriceBreakdown | undefined {
  return options?.pricing ?? (options?.flight ? createNeutralPricing(options.flight.baseFare) : undefined);
}

export function createContext(req: ReservationRequest | ReservationInput, opts?: ContextOptions): ReservationContext {
  const id = req.id || randomUUID();
  return {
    request: { ...req, id, reservationId: id }, status: 'PENDING', aborted: false,
    passenger: opts?.passenger, flight: opts?.flight, pricing: resolveInitialPricing(opts),
    issues: [], trace: [], metadata: {}
  };
}

export function addError(
  context: ReservationContext,
  filter: string,
  code: string,
  message: string,
  details?: unknown
): ReservationContext {
  const issue: ProcessingIssue = { filter, code, message, severity: 'error', ...(details !== undefined ? { details } : {}) };
  return { ...context, issues: [...context.issues, issue] };
}

/**
 * Registra un error de negocio que invalida la reserva y detiene los filtros
 * posteriores, sin afectar al resto del lote.
 */
export function rejectReservation(
  context: ReservationContext,
  filter: string,
  code: string,
  message: string,
  details?: unknown
): ReservationContext {
  const issue: ProcessingIssue = { filter, code, message, severity: 'error', ...(details !== undefined ? { details } : {}) };
  return { ...context, status: 'REJECTED', aborted: true, issues: [...context.issues, issue] };
}

export function addWarning(
  context: ReservationContext,
  filter: string,
  code: string,
  message: string,
  details?: unknown
): ReservationContext {
  const issue: ProcessingIssue = { filter, code, message, severity: 'warning', ...(details !== undefined ? { details } : {}) };
  return { ...context, issues: [...context.issues, issue] };
}

export function hasErrors(context: ReservationContext): boolean {
  return context.issues.some((issue) => issue.severity === 'error');
}

export function hasWarnings(context: ReservationContext): boolean {
  return context.issues.some((issue) => issue.severity === 'warning');
}

export function errorsOf(context: ReservationContext): ProcessingIssue[] {
  return context.issues.filter((issue) => issue.severity === 'error');
}

export function warningsOf(context: ReservationContext): ProcessingIssue[] {
  return context.issues.filter((issue) => issue.severity === 'warning');
}

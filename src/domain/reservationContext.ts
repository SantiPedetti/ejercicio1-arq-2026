import { randomUUID } from 'node:crypto';
import {
  CurrencyMetadata,
  FilterTrace,
  Flight,
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
  currency?: CurrencyMetadata;
  issues: ProcessingIssue[];
  trace: FilterTrace[];
  metadata: Record<string, unknown>;
}

export function createContext(request: ReservationRequest | ReservationInput): ReservationContext {
  const id = request.id || randomUUID();
  return {
    request: { ...request, id, reservationId: id },
    status: 'PENDING',
    aborted: false,
    issues: [],
    trace: [],
    metadata: {}
  };
}

export function addError(
  context: ReservationContext,
  filter: string,
  code: string,
  message: string
): ReservationContext {
  context.issues.push({ filter, code, message, severity: 'error' });
  return context;
}

/**
 * Registra un error de negocio que invalida la reserva y detiene los filtros
 * posteriores, sin afectar al resto del lote.
 */
export function rejectReservation(
  context: ReservationContext,
  filter: string,
  code: string,
  message: string
): ReservationContext {
  addError(context, filter, code, message);
  context.status = 'REJECTED';
  context.aborted = true;
  return context;
}

export function addWarning(
  context: ReservationContext,
  filter: string,
  code: string,
  message: string
): ReservationContext {
  context.issues.push({ filter, code, message, severity: 'warning' });
  return context;
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

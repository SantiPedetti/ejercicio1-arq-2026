import { DEFAULT_PIPELINE_CONFIG, PipelineConfig, PipelineConfigStore } from '../../src/config/pipelineConfig';
import { buildMockFlights } from '../../src/data/mockFlights';
import { buildMockPassengers } from '../../src/data/mockPassengers';
import { createContext, ReservationContext } from '../../src/domain/reservationContext';
import { ReservationInput, ReservationRequest } from '../../src/domain/types';
import { FilterDependencies } from '../../src/pipeline/filter';
import { createFlightRepository } from '../../src/repositories/flightRepository';
import { createPassengerRepository } from '../../src/repositories/passengerRepository';
import {
  ExchangeRateError,
  ExchangeRateProvider,
  RatesResult
} from '../../src/services/exchangeRate/exchangeRateProvider';
import { FixedClock } from '../../src/support/clock';
import { silentLogger } from '../../src/support/logger';

export const TEST_NOW = new Date('2026-09-17T12:00:00.000Z');
export const testClock = new FixedClock(TEST_NOW);
export const testPassengers = createPassengerRepository(buildMockPassengers(TEST_NOW));
export const testFlights = createFlightRepository(buildMockFlights(TEST_NOW));

export function configWith(patch: Parameters<PipelineConfigStore['update']>[0] = {}): PipelineConfig {
  return new PipelineConfigStore(DEFAULT_PIPELINE_CONFIG).update(patch);
}

/** Proveedor de tasas determinista: no toca la red. */
export function stubRateProvider(
  result?: Partial<RatesResult & { rate?: number; targetCurrency?: string; source?: RatesResult['source'] }>
): ExchangeRateProvider {
  const rate = result?.rate ?? 5;
  const rates: Record<string, number> = result?.rates ?? {
    ARS: 1450,
    BRL: 5.2,
    EUR: 0.92,
    GBP: 0.79,
    CLP: 950,
    MXN: 17.5,
    PEN: 3.75,
    UYU: 39.5
  };
  if (result?.targetCurrency) {
    rates[result.targetCurrency] = rate;
  }
  if (result?.rate !== undefined && !result?.rates) {
    for (const key of Object.keys(rates)) {
      rates[key] = result.rate;
    }
  }
  const source = result?.source ?? 'api';
  const fetchedAt = result?.fetchedAt instanceof Date ? result.fetchedAt : new Date('2026-01-01T00:00:00.000Z');
  return {
    getRates: async () => ({
      rates,
      source,
      fetchedAt
    }),
    getRate: async (targetCurrency) => ({
      baseCurrency: 'USD',
      targetCurrency,
      rate: rates[targetCurrency] ?? rate,
      source,
      retrievedAt: fetchedAt.toISOString()
    }),
    invalidate: () => undefined,
    invalidateCache: () => undefined
  };
}

export function failingRateProvider(message = 'la API no responde'): ExchangeRateProvider {
  return {
    getRates: async () => {
      throw new ExchangeRateError(message);
    },
    getRate: async () => {
      throw new ExchangeRateError(message);
    },
    invalidate: () => undefined,
    invalidateCache: () => undefined
  };
}

export function testDeps(overrides: Partial<FilterDependencies> = {}): FilterDependencies {
  return {
    config: configWith(),
    passengers: testPassengers,
    flights: testFlights,
    exchangeRates: stubRateProvider(),
    logger: silentLogger,
    now: () => testClock.now(),
    ...overrides
  };
}

export function reservation(overrides: Partial<ReservationInput> = {}): ReservationInput {
  return {
    id: 'R-001',
    passengerId: 'P001',
    flightCode: 'AA001',
    origin: 'JFK',
    destination: 'EZE',
    departureDate: '2026-10-08',
    seatClass: 'economy',
    passengerType: 'adult',
    ...overrides
  };
}

export function contextFor(overrides: Partial<ReservationInput> = {}): ReservationContext {
  const input = reservation(overrides);
  const req: ReservationRequest = {
    ...input,
    id: input.id ?? 'R-001',
    reservationId: input.id ?? 'R-001'
  };
  return createContext(req);
}

export function issueCodes(context: ReservationContext): string[] {
  return context.issues.map((issue) => issue.code);
}

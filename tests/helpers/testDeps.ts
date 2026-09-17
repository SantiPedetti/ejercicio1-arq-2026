import { DEFAULT_PIPELINE_CONFIG, PipelineConfig, PipelineConfigStore } from '../../src/config/pipelineConfig';
import { buildMockFlights } from '../../src/data/mockFlights';
import { buildMockPassengers } from '../../src/data/mockPassengers';
import { createContext, ReservationContext } from '../../src/domain/reservationContext';
import { ReservationInput, ReservationRequest } from '../../src/domain/types';
import { FilterDependencies } from '../../src/pipeline/filter';
import { createFlightRepository } from '../../src/repositories/flightRepository';
import { createPassengerRepository } from '../../src/repositories/passengerRepository';
import {
  ExchangeRateProvider,
  ExchangeRateResult
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
export function stubRateProvider(result?: Partial<ExchangeRateResult>): ExchangeRateProvider {
  return {
    getRate: async (targetCurrency) => ({
      baseCurrency: 'USD',
      targetCurrency,
      rate: 5,
      source: 'api',
      retrievedAt: '2026-01-01T00:00:00.000Z',
      ...result
    }),
    invalidateCache: () => undefined
  };
}

export function failingRateProvider(message = 'la API no responde'): ExchangeRateProvider {
  return {
    getRate: async () => {
      throw new Error(message);
    },
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

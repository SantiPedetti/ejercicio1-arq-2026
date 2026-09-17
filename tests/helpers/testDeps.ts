import { DEFAULT_PIPELINE_CONFIG, PipelineConfig, PipelineConfigStore } from '../../src/config/pipelineConfig';
import { createContext, ReservationContext } from '../../src/domain/reservationContext';
import { ReservationRequest } from '../../src/domain/types';
import { FilterDependencies } from '../../src/pipeline/filter';
import { flightRepository } from '../../src/repositories/flightRepository';
import { passengerRepository } from '../../src/repositories/passengerRepository';
import {
  ExchangeRateProvider,
  ExchangeRateResult
} from '../../src/services/exchangeRate/exchangeRateProvider';
import { silentLogger } from '../../src/support/logger';

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
    passengers: passengerRepository,
    flights: flightRepository,
    exchangeRates: stubRateProvider(),
    logger: silentLogger,
    now: () => new Date('2026-09-17T12:00:00.000Z'),
    ...overrides
  };
}

export function reservation(overrides: Partial<ReservationRequest> = {}): ReservationRequest {
  return {
    reservationId: 'R-001',
    passengerId: 'P012',
    flightCode: 'AA001',
    origin: 'EZE',
    destination: 'MIA',
    seatClass: 'economy',
    ...overrides
  };
}

export function contextFor(overrides: Partial<ReservationRequest> = {}): ReservationContext {
  return createContext(reservation(overrides));
}

export function issueCodes(context: ReservationContext): string[] {
  return context.issues.map((issue) => issue.code);
}

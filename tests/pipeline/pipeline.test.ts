import { DEFAULT_PIPELINE_CONFIG, FilterName, PipelineConfigStore } from '../../src/config/pipelineConfig';
import { addWarning, createContext, rejectReservation, ReservationContext } from '../../src/domain/reservationContext';
import { Filter } from '../../src/pipeline/filter';
import { Pipeline } from '../../src/pipeline/pipeline';
import { createBasePriceFilter } from '../../src/pipeline/filters/basePrice.filter';
import { FilterTrace } from '../../src/domain/types';
import { ReservationProcessingService } from '../../src/services/reservationProcessingService';
import { ProcessingStore } from '../../src/store/processingStore';
import { reservation, stubRateProvider, testDeps, testFlights } from '../helpers/testDeps';

const allEnabled: Record<FilterName, boolean> = {
  validatePassenger: true,
  validateFlight: true,
  exchangeRateEnrichment: true,
  basePrice: true,
  loyaltyDiscount: true,
  passengerTypeAdjustment: true,
  taxesAndFees: true,
  currencyConversion: true
};

function spyFilter(name: FilterName, calls: FilterName[], critical = true): Filter {
  return {
    name,
    critical,
    execute: (context) => {
      calls.push(name);
      return context;
    }
  };
}

function testContextWithPricing(overrides = {}): ReservationContext {
  const flight = testFlights.findByCode('AA001');
  return createContext(reservation(overrides), { flight });
}

describe('orquestador del pipeline', () => {
  it('ejecuta los filtros en el orden recibido y registra la traza COMPLETED', async () => {
    const calls: FilterName[] = [];
    const pipeline = new Pipeline(
      [spyFilter('basePrice', calls), spyFilter('loyaltyDiscount', calls), spyFilter('taxesAndFees', calls)],
      { enabledFilters: allEnabled }
    );

    const context = await pipeline.process(testContextWithPricing());

    expect(calls).toEqual(['basePrice', 'loyaltyDiscount', 'taxesAndFees']);
    expect(context.trace.map((entry) => entry.status)).toEqual(['COMPLETED', 'COMPLETED', 'COMPLETED']);
    expect(context.status).toBe('CONFIRMED');
  });

  it('no ejecuta un filtro deshabilitado y lo deja marcado como SKIPPED en la traza', async () => {
    const calls: FilterName[] = [];
    const pipeline = new Pipeline([spyFilter('basePrice', calls), spyFilter('loyaltyDiscount', calls)], {
      enabledFilters: { ...allEnabled, loyaltyDiscount: false }
    });

    const context = await pipeline.process(testContextWithPricing());

    expect(calls).toEqual(['basePrice']);
    expect(context.trace).toEqual([
      expect.objectContaining({ filter: 'basePrice', status: 'COMPLETED' }),
      expect.objectContaining({ filter: 'loyaltyDiscount', status: 'SKIPPED' })
    ]);
  });

  it('marca como NOT_RUN los filtros posteriores cuando una reserva es rechazada', async () => {
    const calls: FilterName[] = [];
    const rejecting: Filter = {
      name: 'validatePassenger',
      critical: true,
      execute: (context) => rejectReservation(context, 'validatePassenger', 'PASSENGER_NOT_FOUND', 'no existe')
    };
    const pipeline = new Pipeline([rejecting, spyFilter('basePrice', calls)], { enabledFilters: allEnabled });

    const context = await pipeline.process(createContext(reservation()));

    expect(calls).toEqual([]);
    expect(context.status).toBe('REJECTED');
    expect(context.trace[1]).toMatchObject({ filter: 'basePrice', status: 'NOT_RUN' });
  });

  it('excepcion critica: marca la reserva como FAILED, traza FAILED y restantes NOT_RUN', async () => {
    const calls: FilterName[] = [];
    const exploding: Filter = {
      name: 'basePrice',
      critical: true,
      execute: () => {
        throw new Error('error critico en basePrice');
      }
    };
    const pipeline = new Pipeline([exploding, spyFilter('loyaltyDiscount', calls)], { enabledFilters: allEnabled });

    const context = await pipeline.process(createContext(reservation()));

    expect(context.status).toBe('FAILED');
    expect(context.issues).toEqual([
      expect.objectContaining({ code: 'FILTER_EXCEPTION', filter: 'basePrice', severity: 'error' })
    ]);
    expect(context.trace[0]).toMatchObject({ status: 'FAILED', detail: 'error critico en basePrice' });
    expect(context.trace[1]).toMatchObject({ status: 'NOT_RUN' });
    expect(calls).toEqual([]);
  });

  it('excepcion no critica: agrega warning FILTER_EXCEPTION y el pipeline continua', async () => {
    const calls: FilterName[] = [];
    const nonCriticalExploding: Filter = {
      name: 'exchangeRateEnrichment',
      critical: false,
      execute: () => {
        throw new Error('fallo no critico de red');
      }
    };
    const pipeline = new Pipeline([nonCriticalExploding, spyFilter('basePrice', calls)], { enabledFilters: allEnabled });

    const context = await pipeline.process(testContextWithPricing());

    expect(context.status).toBe('CONFIRMED');
    expect(context.issues).toEqual([
      expect.objectContaining({ code: 'FILTER_EXCEPTION', filter: 'exchangeRateEnrichment', severity: 'warning' })
    ]);
    expect(context.trace[0]).toMatchObject({ status: 'FAILED', detail: 'fallo no critico de red' });
    expect(context.trace[1]).toMatchObject({ status: 'COMPLETED' });
    expect(calls).toEqual(['basePrice']);
  });

  it('context-guard: si el filtro basePrice no deja classPrice produce DATA_CORRUPTED y FAILED', async () => {
    const calls: FilterName[] = [];
    const missingClassPriceFilter: Filter = {
      name: 'basePrice',
      critical: true,
      execute: (context) => ({
        ...context,
        pricing: {
          baseFare: 100,
          currentPrice: 100,
          total: 100
        }
      })
    };
    const pipeline = new Pipeline(
      [missingClassPriceFilter, spyFilter('loyaltyDiscount', calls)],
      { enabledFilters: allEnabled }
    );

    const context = await pipeline.process(createContext(reservation()));

    expect(context.status).toBe('FAILED');
    expect(context.issues).toEqual([
      expect.objectContaining({
        code: 'DATA_CORRUPTED',
        filter: 'basePrice',
        severity: 'error'
      })
    ]);
    expect(context.trace[0]).toMatchObject({
      status: 'FAILED',
      detail: expect.stringContaining('precio de clase')
    });
    expect(context.trace[1]).toMatchObject({ status: 'NOT_RUN' });
    expect(calls).toEqual([]);
  });

  it('context-guard: si un filtro corrompe datos marca DATA_CORRUPTED, FAILED y restantes NOT_RUN', async () => {
    const calls: FilterName[] = [];
    const corrupting: Filter = {
      name: 'basePrice',
      critical: true,
      execute: (context) => ({
        ...context,
        pricing: {
          baseFare: -100,
          classPrice: -100,
          loyaltyDiscount: 0,
          passengerTypeDiscount: 0,
          currentPrice: -100,
          subtotal: -100,
          taxes: 0,
          airportFee: 0,
          fuelSurcharge: 0,
          total: -100
        }
      })
    };
    const pipeline = new Pipeline([corrupting, spyFilter('loyaltyDiscount', calls)], { enabledFilters: allEnabled });

    const context = await pipeline.process(createContext(reservation()));

    expect(context.status).toBe('FAILED');
    expect(context.issues).toEqual([
      expect.objectContaining({ code: 'DATA_CORRUPTED', filter: 'basePrice', severity: 'error' })
    ]);
    expect(context.trace[0]).toMatchObject({ status: 'FAILED' });
    expect(context.trace[1]).toMatchObject({ status: 'NOT_RUN' });
    expect(calls).toEqual([]);
  });

  it('source con valores neutros: inicializa pricing para tolerar la deshabilitacion de filtros de precio', () => {
    const flight = testFlights.findByCode('AA001');
    expect(flight).toBeDefined();
    if (!flight) return;

    const ctx = createContext(reservation(), { flight });

    expect(ctx.pricing).toEqual(
      expect.objectContaining({
        baseFare: flight.baseFare,
        classPrice: flight.baseFare,
        currentPrice: flight.baseFare
      })
    );
  });

  it('MISSING_DATA: rechaza si faltan datos requeridos por un filtro de precio', async () => {
    const deps = testDeps();
    const basePriceFilter = createBasePriceFilter(deps);
    const ctxSinVuelo = createContext(reservation()); // sin vuelo cargado

    const result = await basePriceFilter.execute(ctxSinVuelo);

    expect(result.status).toBe('REJECTED');
    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'MISSING_DATA', filter: 'basePrice' })
    ]);
  });

  it('snapshot de configuracion: la ejecucion del lote usa un snapshot inmutable', async () => {
    const configStore = new PipelineConfigStore(DEFAULT_PIPELINE_CONFIG);
    const store = new ProcessingStore();
    const service = new ReservationProcessingService({
      configStore,
      store,
      exchangeRateProvider: stubRateProvider()
    });

    // Modificar el store mientras el batch corre no debe mutar la configuracion del batch
    const batchPromise = service.processBatch([reservation({ id: 'R-1' })]);
    configStore.update({ enabledFilters: { loyaltyDiscount: false } });

    const response = await batchPromise;
    expect(response.appliedConfig.enabledFilters.loyaltyDiscount).toBe(true);
    const trace = response.results[0]?.trace;
    const loyaltyTrace = trace?.find((t: FilterTrace) => t.filter === 'loyaltyDiscount');
    expect(loyaltyTrace?.status).toBe('COMPLETED');
  });

  it('mantiene la reserva como CONFIRMED cuando hay solo avisos (warnings)', async () => {
    const warning: Filter = {
      name: 'exchangeRateEnrichment',
      critical: false,
      execute: (context) => addWarning(context, 'exchangeRateEnrichment', 'EXCHANGE_RATE_FALLBACK', 'tasa de respaldo')
    };
    const pipeline = new Pipeline([warning], { enabledFilters: allEnabled });

    const context = await pipeline.process(createContext(reservation()));

    expect(context.status).toBe('CONFIRMED');
  });

  it('procesa el lote completo aunque una reserva falle y resume los estados', async () => {
    const conditional: Filter = {
      name: 'validatePassenger',
      critical: true,
      execute: (context) => {
        const id = context.request.id || context.request.reservationId;
        if (id === 'R-BOOM') throw new Error('datos corruptos');
        if (id === 'R-BAD') {
          return rejectReservation(context, 'validatePassenger', 'PASSENGER_NOT_FOUND', 'no existe');
        }
        return context;
      }
    };
    const pipeline = new Pipeline([conditional], { enabledFilters: allEnabled });

    const batch = await pipeline.processBatch([
      reservation({ id: 'R-OK' }),
      reservation({ id: 'R-BOOM' }),
      reservation({ id: 'R-BAD' })
    ]);

    expect(batch.summary).toEqual({
      total: 3,
      confirmed: 1,
      rejected: 1,
      failed: 1
    });
    expect(batch.processingTimeMs).toBeGreaterThanOrEqual(0);
    expect(batch.contexts.map((context) => context.status)).toEqual(['CONFIRMED', 'FAILED', 'REJECTED']);
  });
});

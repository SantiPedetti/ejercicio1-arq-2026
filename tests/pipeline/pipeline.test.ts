import { FilterName } from '../../src/config/pipelineConfig';
import { addWarning, createContext, rejectReservation } from '../../src/domain/reservationContext';
import { Filter } from '../../src/pipeline/filter';
import { Pipeline } from '../../src/pipeline/pipeline';
import { reservation } from '../helpers/testDeps';

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

function spyFilter(name: FilterName, calls: FilterName[]): Filter {
  return {
    name,
    execute: (context) => {
      calls.push(name);
      return context;
    }
  };
}

describe('orquestador del pipeline', () => {
  it('ejecuta los filtros en el orden recibido y registra la traza', async () => {
    const calls: FilterName[] = [];
    const pipeline = new Pipeline(
      [spyFilter('basePrice', calls), spyFilter('loyaltyDiscount', calls), spyFilter('taxesAndFees', calls)],
      { enabledFilters: allEnabled }
    );

    const context = await pipeline.process(createContext(reservation()));

    expect(calls).toEqual(['basePrice', 'loyaltyDiscount', 'taxesAndFees']);
    expect(context.trace.map((entry) => entry.status)).toEqual(['executed', 'executed', 'executed']);
    expect(context.status).toBe('CONFIRMED');
  });

  it('no ejecuta un filtro deshabilitado y lo deja marcado en la traza', async () => {
    const calls: FilterName[] = [];
    const pipeline = new Pipeline([spyFilter('basePrice', calls), spyFilter('loyaltyDiscount', calls)], {
      enabledFilters: { ...allEnabled, loyaltyDiscount: false }
    });

    const context = await pipeline.process(createContext(reservation()));

    expect(calls).toEqual(['basePrice']);
    expect(context.trace).toEqual([
      expect.objectContaining({ filter: 'basePrice', status: 'executed' }),
      expect.objectContaining({ filter: 'loyaltyDiscount', status: 'disabled' })
    ]);
  });

  it('saltea los filtros posteriores cuando una reserva es rechazada', async () => {
    const calls: FilterName[] = [];
    const rejecting: Filter = {
      name: 'validatePassenger',
      execute: (context) => rejectReservation(context, 'validatePassenger', 'PASSENGER_NOT_FOUND', 'no existe')
    };
    const pipeline = new Pipeline([rejecting, spyFilter('basePrice', calls)], { enabledFilters: allEnabled });

    const context = await pipeline.process(createContext(reservation()));

    expect(calls).toEqual([]);
    expect(context.status).toBe('REJECTED');
    expect(context.trace[1]).toMatchObject({ filter: 'basePrice', status: 'skipped' });
  });

  it('aisla la excepcion de un filtro: marca la reserva como failed sin propagar el error', async () => {
    const calls: FilterName[] = [];
    const exploding: Filter = {
      name: 'exchangeRateEnrichment',
      execute: () => {
        throw new Error('fallo de red inesperado');
      }
    };
    const pipeline = new Pipeline([exploding, spyFilter('basePrice', calls)], { enabledFilters: allEnabled });

    const context = await pipeline.process(createContext(reservation()));

    expect(context.status).toBe('FAILED');
    expect(context.issues).toEqual([
      expect.objectContaining({ code: 'FILTER_EXCEPTION', filter: 'exchangeRateEnrichment', severity: 'error' })
    ]);
    expect(context.trace[0]).toMatchObject({ status: 'failed', detail: 'fallo de red inesperado' });
    expect(calls).toEqual([]);
  });

  it('mantiene la reserva como CONFIRMED cuando hay solo avisos (warnings)', async () => {
    const warning: Filter = {
      name: 'exchangeRateEnrichment',
      execute: (context) => addWarning(context, 'exchangeRateEnrichment', 'EXCHANGE_RATE_FALLBACK', 'tasa de respaldo')
    };
    const pipeline = new Pipeline([warning], { enabledFilters: allEnabled });

    const context = await pipeline.process(createContext(reservation()));

    expect(context.status).toBe('CONFIRMED');
  });

  it('procesa el lote completo aunque una reserva falle y resume los estados', async () => {
    const conditional: Filter = {
      name: 'validatePassenger',
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

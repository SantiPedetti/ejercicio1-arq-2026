import {
  DEFAULT_PIPELINE_CONFIG,
  FILTER_NAMES,
  PipelineConfigStore,
  pipelineConfigStore
} from '../../src/config/pipelineConfig';

describe('PipelineConfig y PipelineConfigStore', () => {
  it('contiene la lista de los 8 filtros del pipeline en orden estricto', () => {
    expect(FILTER_NAMES).toEqual([
      'validatePassenger',
      'validateFlight',
      'exchangeRateEnrichment',
      'basePrice',
      'loyaltyDiscount',
      'passengerTypeAdjustment',
      'taxesAndFees',
      'currencyConversion'
    ]);
  });

  it('devuelve una copia profunda inmutable con get()', () => {
    const store = new PipelineConfigStore();
    const config1 = store.get();
    config1.seatClassMultipliers.economy = 999;

    const config2 = store.get();
    expect(config2.seatClassMultipliers.economy).toBe(1);
  });

  it('actualiza campos anidados con update()', () => {
    const store = new PipelineConfigStore();
    const updated = store.update({
      taxes: { airportFeeUsd: 50 },
      enabledFilters: { loyaltyDiscount: false },
      exchangeRate: { timeoutMs: 3000 }
    });

    expect(updated.taxes.airportFeeUsd).toBe(50);
    expect(updated.taxes.taxRate).toBe(0.12);
    expect(updated.enabledFilters.loyaltyDiscount).toBe(false);
    expect(updated.exchangeRate.timeoutMs).toBe(3000);
    expect(updated.exchangeRate.baseCurrency).toBe('USD');
  });

  it('restablece la configuracion inicial con reset()', () => {
    const store = new PipelineConfigStore();
    store.update({ taxes: { airportFeeUsd: 100 } });
    expect(store.get().taxes.airportFeeUsd).toBe(100);

    const reset = store.reset();
    expect(reset.taxes.airportFeeUsd).toBe(DEFAULT_PIPELINE_CONFIG.taxes.airportFeeUsd);
  });

  it('permite usar la instancia exportada pipelineConfigStore', () => {
    const original = pipelineConfigStore.get();
    expect(original.enabledFilters.validatePassenger).toBe(true);
    pipelineConfigStore.reset();
  });
});

import { Express } from 'express';
import request from 'supertest';
import { createApp } from '../../src/app';
import { DEFAULT_PIPELINE_CONFIG, PipelineConfigStore } from '../../src/config/pipelineConfig';
import { ProcessingStore } from '../../src/store/processingStore';
import { reservation, stubRateProvider } from '../helpers/testDeps';

function appWith(): Express {
  return createApp({
    configStore: new PipelineConfigStore(DEFAULT_PIPELINE_CONFIG),
    store: new ProcessingStore(),
    exchangeRateProvider: stubRateProvider()
  });
}

describe('GET /pipeline/config', () => {
  it('expone la configuracion vigente del pipeline', async () => {
    const response = await request(appWith()).get('/pipeline/config');

    expect(response.status).toBe(200);
    expect(response.body.filterOrder).toEqual(DEFAULT_PIPELINE_CONFIG.filterOrder);
    expect(response.body.seatClassMultipliers).toEqual({ economy: 1, business: 2.5, first: 4 });
    expect(response.body.taxes).toEqual({ taxRate: 0.12, airportFeeUsd: 25, fuelSurchargeRate: 0.08 });
  });
});

describe('PUT /pipeline/config', () => {
  it('aplica un parche parcial y lo usa en el siguiente procesamiento', async () => {
    const app = appWith();

    const put = await request(app)
      .put('/pipeline/config')
      .send({ taxes: { airportFeeUsd: 40 }, enabledFilters: { currencyConversion: false } });

    expect(put.status).toBe(200);
    expect(put.body.taxes).toEqual({ taxRate: 0.12, airportFeeUsd: 40, fuelSurchargeRate: 0.08 });
    expect(put.body.enabledFilters.currencyConversion).toBe(false);

    const process = await request(app)
      .post('/reservations/process')
      .send({ reservations: [reservation({ passengerId: 'P012' })] });

    expect(process.body.results[0].pricing.airportFeeUsd).toBe(40);
    expect(process.body.results[0].currency.convertedTotal).toBeUndefined();
  });

  it('permite reordenar los filtros del pipeline', async () => {
    const app = appWith();

    const put = await request(app)
      .put('/pipeline/config')
      .send({ filterOrder: ['validatePassenger', 'validateFlight', 'basePrice', 'taxesAndFees'] });

    expect(put.status).toBe(200);

    const process = await request(app)
      .post('/reservations/process')
      .send({ reservations: [reservation({ passengerId: 'P001' })] });

    expect(process.body.results[0].trace.map((entry: { filter: string }) => entry.filter)).toEqual([
      'validatePassenger',
      'validateFlight',
      'basePrice',
      'taxesAndFees'
    ]);
    expect(process.body.results[0].pricing.loyaltyDiscountUsd).toBe(0);
  });

  it('rechaza configuraciones invalidas con 400', async () => {
    const response = await request(appWith())
      .put('/pipeline/config')
      .send({ loyaltyDiscounts: { gold: 3 }, filtrosInventados: true });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_CONFIG');
  });

  it('restaura los valores por defecto', async () => {
    const app = appWith();
    await request(app).put('/pipeline/config').send({ taxes: { taxRate: 0.5 } });

    const reset = await request(app).post('/pipeline/config/reset');

    expect(reset.status).toBe(200);
    expect(reset.body.taxes.taxRate).toBe(0.12);
  });
});

describe('rutas inexistentes', () => {
  it('devuelve 404 con codigo de error uniforme', async () => {
    const response = await request(appWith()).get('/no-existe');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ROUTE_NOT_FOUND');
  });
});

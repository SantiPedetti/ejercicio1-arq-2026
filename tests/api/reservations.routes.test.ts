import { Express } from 'express';
import request from 'supertest';
import { createApp } from '../../src/app';
import { DEFAULT_PIPELINE_CONFIG, PipelineConfigStore } from '../../src/config/pipelineConfig';
import { ProcessingStore } from '../../src/store/processingStore';
import { failingRateProvider, reservation, stubRateProvider } from '../helpers/testDeps';

function appWith(provider = stubRateProvider({ rate: 5.2 })): Express {
  return createApp({
    configStore: new PipelineConfigStore(DEFAULT_PIPELINE_CONFIG),
    store: new ProcessingStore(),
    exchangeRateProvider: provider
  });
}

describe('POST /reservations/process', () => {
  it('procesa una reserva valida y devuelve precios, conversion y tiempos', async () => {
    const response = await request(appWith())
      .post('/reservations/process')
      .send({ reservations: [reservation({ passengerId: 'P012' })] });

    expect(response.status).toBe(200);
    expect(response.body.summary).toEqual({
      total: 1,
      processed: 1,
      processedWithWarnings: 0,
      rejected: 0,
      failed: 0
    });
    expect(typeof response.body.processingTimeMs).toBe('number');
    expect(response.body.results[0]).toMatchObject({
      reservationId: 'R-001',
      status: 'processed',
      pricing: { totalUsd: 565 },
      currency: { targetCurrency: 'USD' }
    });
    expect(response.body.results[0].trace).toHaveLength(8);
  });

  it('convierte el total a la moneda del pais de destino', async () => {
    const response = await request(appWith())
      .post('/reservations/process')
      .send({
        reservations: [
          reservation({
            passengerId: 'P002',
            flightCode: 'LA4567',
            origin: 'EZE',
            destination: 'GRU'
          })
        ]
      });

    expect(response.body.results[0].currency).toMatchObject({ targetCurrency: 'BRL', rate: 5.2 });
    expect(response.body.results[0].currency.convertedTotal).toBeCloseTo(
      response.body.results[0].pricing.totalUsd * 5.2,
      1
    );
  });

  it('rechaza reservas con pasajero inexistente o vuelo sin asientos sin afectar al resto del lote', async () => {
    const response = await request(appWith())
      .post('/reservations/process')
      .send({
        reservations: [
          reservation({ reservationId: 'R-OK', passengerId: 'P012' }),
          reservation({ reservationId: 'R-NOPAX', passengerId: 'P999' }),
          reservation({
            reservationId: 'R-NOSEAT',
            passengerId: 'P012',
            flightCode: 'AM0404',
            origin: 'MEX',
            destination: 'JFK'
          })
        ]
      });

    expect(response.status).toBe(200);
    expect(response.body.summary).toMatchObject({ total: 3, processed: 1, rejected: 2 });
    const codes = response.body.results.map((result: { errors: { code: string }[] }) => result.errors[0]?.code);
    expect(codes).toEqual([undefined, 'PASSENGER_NOT_FOUND', 'NO_SEATS_AVAILABLE']);
  });

  it('continua en USD con warning cuando la API de tipo de cambio falla', async () => {
    const response = await request(appWith(failingRateProvider('timeout de 5000 ms')))
      .post('/reservations/process')
      .send({
        reservations: [
          reservation({ passengerId: 'P002', flightCode: 'LA4567', origin: 'EZE', destination: 'GRU' })
        ]
      });

    expect(response.status).toBe(200);
    expect(response.body.results[0].status).toBe('processed_with_warnings');
    expect(response.body.results[0].warnings[0].code).toBe('EXCHANGE_RATE_UNAVAILABLE');
    expect(response.body.results[0].currency).toMatchObject({ targetCurrency: 'USD', rate: 1 });
    expect(response.body.results[0].pricing.totalUsd).toBeGreaterThan(0);
  });

  it('permite deshabilitar filtros solo para el request', async () => {
    const response = await request(appWith())
      .post('/reservations/process')
      .send({
        reservations: [reservation({ passengerId: 'P001' })],
        config: { enabledFilters: { loyaltyDiscount: false } }
      });

    expect(response.body.results[0].pricing.loyaltyDiscountUsd).toBe(0);
    expect(response.body.results[0].trace).toEqual(
      expect.arrayContaining([expect.objectContaining({ filter: 'loyaltyDiscount', status: 'disabled' })])
    );
  });

  it('devuelve 400 con detalle cuando el payload esta malformado', async () => {
    const response = await request(appWith())
      .post('/reservations/process')
      .send({ reservations: [{ reservationId: 'R-1', passengerId: 'P001', seatClass: 'luxury' }] });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_REQUEST');
    expect(response.body.error.details.length).toBeGreaterThan(0);
  });

  it('devuelve 400 cuando el cuerpo no es JSON valido', async () => {
    const response = await request(appWith())
      .post('/reservations/process')
      .set('Content-Type', 'application/json')
      .send('{"reservations": [');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('MALFORMED_JSON');
  });
});

describe('GET /reservations/:id/status', () => {
  it('devuelve el resultado del ultimo procesamiento de la reserva', async () => {
    const app = appWith();
    await request(app)
      .post('/reservations/process')
      .send({ reservations: [reservation({ reservationId: 'R-777', passengerId: 'P012' })] });

    const response = await request(app).get('/reservations/R-777/status');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ reservationId: 'R-777', status: 'processed' });
  });

  it('devuelve 404 si la reserva nunca fue procesada', async () => {
    const response = await request(appWith()).get('/reservations/R-INEXISTENTE/status');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('RESERVATION_NOT_PROCESSED');
  });
});

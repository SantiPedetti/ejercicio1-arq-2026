import { Express } from 'express';
import request from 'supertest';
import { createApp } from '../../src/app';
import { DEFAULT_PIPELINE_CONFIG, PipelineConfigStore } from '../../src/config/pipelineConfig';
import { ProcessingStore } from '../../src/store/processingStore';
import { failingRateProvider, reservation, stubRateProvider, testClock } from '../helpers/testDeps';

function appWith(provider = stubRateProvider({ rate: 5.2 })): Express {
  return createApp({
    configStore: new PipelineConfigStore(DEFAULT_PIPELINE_CONFIG),
    store: new ProcessingStore(),
    exchangeRateProvider: provider,
    clock: testClock
  });
}

describe('POST /reservations/process', () => {
  it('procesa una reserva valida y devuelve precios, conversion y tiempos', async () => {
    const response = await request(appWith())
      .post('/reservations/process')
      .send({ reservations: [reservation({ passengerId: 'P007' })] });

    expect(response.status).toBe(200);
    expect(response.body.summary).toEqual({
      total: 1,
      confirmed: 1,
      rejected: 0,
      failed: 0
    });
    expect(typeof response.body.processingTimeMs).toBe('number');
    expect(response.body.results[0]).toMatchObject({
      reservationId: 'R-001',
      status: 'CONFIRMED',
      pricing: { total: 565 },
      currency: { targetCurrency: 'ARS' }
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
            origin: 'SCL',
            destination: 'GRU',
            departureDate: '2026-09-27'
          })
        ]
      });

    expect(response.body.results[0].currency).toMatchObject({ targetCurrency: 'BRL', rate: 5.2 });
    expect(response.body.results[0].currency.convertedTotal).toBeCloseTo(
      response.body.results[0].pricing.total * 5.2,
      1
    );
  });

  it('rechaza reservas con pasajero inexistente o vuelo sin asientos sin afectar al resto del lote', async () => {
    const response = await request(appWith())
      .post('/reservations/process')
      .send({
        reservations: [
          reservation({ id: 'R-OK', passengerId: 'P001' }),
          reservation({ id: 'R-NOPAX', passengerId: 'P999' }),
          reservation({
            id: 'R-NOSEAT',
            passengerId: 'P001',
            flightCode: 'AA0002',
            origin: 'MIA',
            destination: 'JFK',
            departureDate: '2026-10-01'
          })
        ]
      });

    expect(response.status).toBe(200);
    expect(response.body.summary).toMatchObject({ total: 3, confirmed: 1, rejected: 2 });
    const codes = response.body.results.map((result: { errors: { code: string }[] }) => result.errors[0]?.code);
    expect(codes).toEqual([undefined, 'PASSENGER_NOT_FOUND', 'NO_SEATS']);
  });

  it('continua en USD con warning cuando la API de tipo de cambio falla', async () => {
    const response = await request(appWith(failingRateProvider('timeout de 5000 ms')))
      .post('/reservations/process')
      .send({
        reservations: [
          reservation({
            passengerId: 'P002',
            flightCode: 'LA4567',
            origin: 'SCL',
            destination: 'GRU',
            departureDate: '2026-09-27'
          })
        ]
      });

    expect(response.status).toBe(200);
    expect(response.body.results[0].status).toBe('CONFIRMED');
    expect(response.body.results[0].warnings[0].code).toBe('EXCHANGE_RATE_UNAVAILABLE');
    expect(response.body.results[0].currency).toMatchObject({ targetCurrency: 'USD', rate: 1 });
    expect(response.body.results[0].pricing.total).toBeGreaterThan(0);
  });

  it('permite deshabilitar filtros solo para el request', async () => {
    const response = await request(appWith())
      .post('/reservations/process')
      .send({
        reservations: [reservation({ passengerId: 'P001' })],
        config: { enabledFilters: { loyaltyDiscount: false } }
      });

    expect(response.body.results[0].pricing.loyaltyDiscount).toBe(0);
    expect(response.body.results[0].trace).toEqual(
      expect.arrayContaining([expect.objectContaining({ filter: 'loyaltyDiscount', status: 'SKIPPED' })])
    );
  });

  it('rechaza con 400 si se intenta sobreescribir exchangeRate en config del request', async () => {
    const response = await request(appWith())
      .post('/reservations/process')
      .send({
        reservations: [reservation()],
        config: { exchangeRate: { defaultRate: 2 } }
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_REQUEST');
  });

  it('marca REJECTED con INVALID_RESERVATION a una reserva malformada dentro del lote sin dar 400', async () => {
    const response = await request(appWith())
      .post('/reservations/process')
      .send({ reservations: [{ id: 'R-1', passengerId: 'P001', seatClass: 'luxury' }] });

    expect(response.status).toBe(200);
    expect(response.body.summary).toEqual({ total: 1, confirmed: 0, rejected: 1, failed: 0 });
    expect(response.body.results[0]).toMatchObject({
      reservationId: 'R-1',
      status: 'REJECTED'
    });
    expect(response.body.results[0].errors[0].code).toBe('INVALID_RESERVATION');
    expect(response.body.results[0].errors[0].message).toContain('seatClass');
  });

  it('devuelve 400 cuando el sobre contiene IDs duplicados', async () => {
    const response = await request(appWith())
      .post('/reservations/process')
      .send({
        reservations: [
          reservation({ id: 'R-DUP' }),
          reservation({ id: 'R-DUP' })
        ]
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_REQUEST');
  });

  it('devuelve 400 cuando reservations esta vacio o no es un array', async () => {
    const response = await request(appWith())
      .post('/reservations/process')
      .send({ reservations: [] });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_REQUEST');
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
      .send({ reservations: [reservation({ id: 'R-777', passengerId: 'P007' })] });

    const response = await request(app).get('/reservations/R-777/status');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      reservationId: 'R-777',
      status: 'CONFIRMED',
      result: expect.objectContaining({ reservationId: 'R-777' })
    });
    expect(typeof response.body.updatedAt).toBe('string');
  });

  it('devuelve 404 si la reserva nunca fue procesada', async () => {
    const response = await request(appWith()).get('/reservations/R-INEXISTENTE/status');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('RESERVATION_NOT_PROCESSED');
  });
});

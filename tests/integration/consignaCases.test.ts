import request from 'supertest';
import { createApp } from '../../src/app';
import { DEFAULT_PIPELINE_CONFIG, PipelineConfigStore } from '../../src/config/pipelineConfig';
import { ProcessingStore } from '../../src/store/processingStore';
import {
  failingRateProvider,
  reservation,
  stubRateProvider,
  testClock,
  testFlights,
  testPassengers
} from '../helpers/testDeps';
import { Pipeline } from '../../src/pipeline/pipeline';
import { Filter } from '../../src/pipeline/filter';
import { createContext } from '../../src/domain/reservationContext';

function buildApp(rateProvider = stubRateProvider({ rate: 5.2 })) {
  const configStore = new PipelineConfigStore(DEFAULT_PIPELINE_CONFIG);
  const store = new ProcessingStore();
  return {
    app: createApp({
      configStore,
      store,
      exchangeRateProvider: rateProvider,
      clock: testClock,
      passengers: testPassengers,
      flights: testFlights
    }),
    configStore,
    store
  };
}

describe('Flujo básico de reserva', () => {
  test('1. Reserva válida con pasajero existente y vuelo disponible', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/reservations/process')
      .send({
        reservations: [
          reservation({
            id: 'R-OK-01',
            passengerId: 'P001',
            flightCode: 'AA001',
            origin: 'JFK',
            destination: 'EZE',
            departureDate: '2026-10-08',
            seatClass: 'economy',
            passengerType: 'adult'
          })
        ]
      });

    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({
      total: 1,
      confirmed: 1,
      rejected: 0,
      failed: 0
    });
    expect(res.body.results[0]).toMatchObject({
      reservationId: 'R-OK-01',
      status: 'CONFIRMED'
    });
    expect(res.body.results[0].errors).toHaveLength(0);
    expect(res.body.results[0].trace).toHaveLength(8);
  });

  test('2. Reserva con pasajero inexistente', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/reservations/process')
      .send({
        reservations: [
          reservation({
            id: 'R-NO-PAX',
            passengerId: 'P999',
            flightCode: 'AA001',
            origin: 'JFK',
            destination: 'EZE',
            departureDate: '2026-10-08'
          })
        ]
      });

    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({
      total: 1,
      confirmed: 0,
      rejected: 1,
      failed: 0
    });
    expect(res.body.results[0].status).toBe('REJECTED');
    expect(res.body.results[0].errors[0].code).toBe('PASSENGER_NOT_FOUND');
  });

  test('3. Reserva para vuelo sin asientos disponibles', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/reservations/process')
      .send({
        reservations: [
          reservation({
            id: 'R-NO-SEAT',
            passengerId: 'P001',
            flightCode: 'AA0002',
            origin: 'MIA',
            destination: 'JFK',
            departureDate: '2026-10-01'
          })
        ]
      });

    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({
      total: 1,
      confirmed: 0,
      rejected: 1,
      failed: 0
    });
    expect(res.body.results[0].status).toBe('REJECTED');
    expect(res.body.results[0].errors[0].code).toBe('NO_SEATS');
  });

  test('4. Reserva con datos malformados', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/reservations/process')
      .send({
        reservations: [
          {
            id: 'R-BAD',
            passengerId: 'P001',
            flightCode: 'AA001',
            seatClass: 'primera-invalida'
          },
          reservation({ id: 'R-VALID', passengerId: 'P007' })
        ]
      });

    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({
      total: 2,
      confirmed: 1,
      rejected: 1,
      failed: 0
    });
    expect(res.body.results[0]).toMatchObject({
      reservationId: 'R-BAD',
      status: 'REJECTED'
    });
    expect(res.body.results[0].errors[0].code).toBe('INVALID_RESERVATION');
    expect(res.body.results[1]).toMatchObject({
      reservationId: 'R-VALID',
      status: 'CONFIRMED'
    });
  });
});

describe('Flujo de cálculo de precios', () => {
  test('1. Reserva economy sin descuentos', async () => {
    const { app } = buildApp();
    // P007 (adulto, NONE) en AA001 (450 USD) -> 565.00 USD
    const res = await request(app)
      .post('/reservations/process')
      .send({
        reservations: [
          reservation({
            passengerId: 'P007',
            flightCode: 'AA001',
            origin: 'JFK',
            destination: 'EZE',
            departureDate: '2026-10-08',
            seatClass: 'economy',
            passengerType: 'adult'
          })
        ]
      });

    expect(res.status).toBe(200);
    const pricing = res.body.results[0].pricing;
    expect(pricing.baseFare).toBeCloseTo(450, 2);
    expect(pricing.classPrice).toBeCloseTo(450, 2);
    expect(pricing.loyaltyDiscount).toBeCloseTo(0, 2);
    expect(pricing.passengerTypeDiscount).toBeCloseTo(0, 2);
    expect(pricing.currentPrice).toBeCloseTo(450, 2);
    expect(pricing.subtotal).toBeCloseTo(450, 2);
    expect(pricing.taxes).toBeCloseTo(54, 2);
    expect(pricing.fuelSurcharge).toBeCloseTo(36, 2);
    expect(pricing.airportFee).toBeCloseTo(25, 2);
    expect(pricing.total).toBeCloseTo(565, 2);
  });

  test('2. Pasajero Gold con descuento por lealtad', async () => {
    const { app } = buildApp();
    // P001 (adulto, GOLD 15%) en AA001 (450 USD) -> 489.40 USD
    const res = await request(app)
      .post('/reservations/process')
      .send({
        reservations: [
          reservation({
            passengerId: 'P001',
            flightCode: 'AA001',
            origin: 'JFK',
            destination: 'EZE',
            departureDate: '2026-10-08',
            seatClass: 'economy',
            passengerType: 'adult'
          })
        ]
      });

    expect(res.status).toBe(200);
    const pricing = res.body.results[0].pricing;
    expect(pricing.baseFare).toBeCloseTo(450, 2);
    expect(pricing.classPrice).toBeCloseTo(450, 2);
    expect(pricing.loyaltyDiscount).toBeCloseTo(67.5, 2);
    expect(pricing.currentPrice).toBeCloseTo(382.5, 2);
    expect(pricing.subtotal).toBeCloseTo(382.5, 2);
    expect(pricing.taxes).toBeCloseTo(45.9, 2);
    expect(pricing.fuelSurcharge).toBeCloseTo(36, 2);
    expect(pricing.airportFee).toBeCloseTo(25, 2);
    expect(pricing.total).toBeCloseTo(489.4, 2);
  });

  test('3. Niño en clase business con descuentos combinados', async () => {
    const provider = stubRateProvider({ rate: 5.2, targetCurrency: 'BRL' });
    const { app } = buildApp(provider);
    // P008 (nino, GOLD 15%, child 25%) en LA4567 (200 USD base, business x2.5 = 500) -> 422.00 USD
    const res = await request(app)
      .post('/reservations/process')
      .send({
        reservations: [
          reservation({
            passengerId: 'P008',
            flightCode: 'LA4567',
            origin: 'SCL',
            destination: 'GRU',
            departureDate: '2026-09-27',
            seatClass: 'business',
            passengerType: 'child'
          })
        ]
      });

    expect(res.status).toBe(200);
    const r = res.body.results[0];
    expect(r.pricing.baseFare).toBeCloseTo(200, 2);
    expect(r.pricing.classPrice).toBeCloseTo(500, 2);
    expect(r.pricing.loyaltyDiscount).toBeCloseTo(75, 2);
    expect(r.pricing.passengerTypeDiscount).toBeCloseTo(106.25, 2);
    expect(r.pricing.currentPrice).toBeCloseTo(318.75, 2);
    expect(r.pricing.subtotal).toBeCloseTo(318.75, 2);
    expect(r.pricing.taxes).toBeCloseTo(38.25, 2);
    expect(r.pricing.fuelSurcharge).toBeCloseTo(40, 2);
    expect(r.pricing.airportFee).toBeCloseTo(25, 2);
    expect(r.pricing.total).toBeCloseTo(422, 2);

    expect(r.conversion).toBeDefined();
    expect(r.conversion.currency).toBe('BRL');
    expect(r.conversion.totalLocal).toBeCloseTo(422 * 5.2, 2);
  });

  test('4. Senior en primera clase con múltiples ajustes', async () => {
    const { app } = buildApp();
    // P009 (senior, SILVER 10%, senior 15%) en IB6841 (900 USD base, first x4 = 3600) -> 3397.48 USD
    const res = await request(app)
      .post('/reservations/process')
      .send({
        reservations: [
          reservation({
            id: 'R-P009',
            passengerId: 'P009',
            flightCode: 'IB6841',
            origin: 'MAD',
            destination: 'EZE',
            departureDate: '2026-11-01',
            seatClass: 'first',
            passengerType: 'senior'
          }),
          // Caso extra sin lealtad: P004 (senior, NONE) -> 3740.20 USD
          reservation({
            id: 'R-P004',
            passengerId: 'P004',
            flightCode: 'IB6841',
            origin: 'MAD',
            destination: 'EZE',
            departureDate: '2026-11-01',
            seatClass: 'first',
            passengerType: 'senior'
          })
        ]
      });

    expect(res.status).toBe(200);
    const rP009 = res.body.results.find((result: { reservationId: string }) => result.reservationId === 'R-P009');
    expect(rP009.pricing.baseFare).toBeCloseTo(900, 2);
    expect(rP009.pricing.classPrice).toBeCloseTo(3600, 2);
    expect(rP009.pricing.loyaltyDiscount).toBeCloseTo(360, 2);
    expect(rP009.pricing.passengerTypeDiscount).toBeCloseTo(486, 2);
    expect(rP009.pricing.currentPrice).toBeCloseTo(2754, 2);
    expect(rP009.pricing.subtotal).toBeCloseTo(2754, 2);
    expect(rP009.pricing.taxes).toBeCloseTo(330.48, 2);
    expect(rP009.pricing.fuelSurcharge).toBeCloseTo(288, 2);
    expect(rP009.pricing.airportFee).toBeCloseTo(25, 2);
    expect(rP009.pricing.total).toBeCloseTo(3397.48, 2);

    const rP004 = res.body.results.find((result: { reservationId: string }) => result.reservationId === 'R-P004');
    expect(rP004.pricing.total).toBeCloseTo(3740.2, 2);
  });
});

describe('Integración con API de tipo de cambio', () => {
  test('1. Reserva exitosa con conversión de moneda aplicada', async () => {
    const provider = stubRateProvider({ rates: { ARS: 1400 } });
    const { app } = buildApp(provider);
    const res = await request(app)
      .post('/reservations/process')
      .send({
        reservations: [
          reservation({
            passengerId: 'P001',
            flightCode: 'AA001', // destino EZE -> AR -> ARS
            origin: 'JFK',
            destination: 'EZE',
            departureDate: '2026-10-08'
          })
        ]
      });

    expect(res.status).toBe(200);
    const conversion = res.body.results[0].conversion;
    expect(conversion).toBeDefined();
    expect(conversion.currency).toBe('ARS');
    expect(conversion.rate).toBe(1400);
    expect(conversion.source).toBe('api');
    expect(conversion.baseFareLocal).toBeCloseTo(450 * 1400, 2);
    expect(conversion.totalLocal).toBeCloseTo(489.4 * 1400, 2);
  });

  test('2. Reserva con destino en país con moneda diferente', async () => {
    const provider = stubRateProvider({ rates: { EUR: 0.92 } });
    const { app } = buildApp(provider);
    const res = await request(app)
      .post('/reservations/process')
      .send({
        reservations: [
          reservation({
            passengerId: 'P001',
            flightCode: 'AF0010', // destino CDG -> FR -> EUR
            origin: 'JFK',
            destination: 'CDG',
            departureDate: '2026-10-17'
          })
        ]
      });

    expect(res.status).toBe(200);
    const conversion = res.body.results[0].conversion;
    expect(conversion).toBeDefined();
    expect(conversion.currency).toBe('EUR');
    expect(conversion.rate).toBe(0.92);
    expect(conversion.baseFareLocal).toBeCloseTo(700 * 0.92, 2);
  });

  test('3. Manejo de errores cuando API de tipo de cambio falla', async () => {
    const { app } = buildApp(failingRateProvider('Servicio no disponible'));
    const res = await request(app)
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

    expect(res.status).toBe(200);
    const r = res.body.results[0];
    expect(r.status).toBe('CONFIRMED');
    expect(r.warnings.some((w: { code: string }) => w.code === 'EXCHANGE_RATE_UNAVAILABLE')).toBe(true);
    expect(r.conversion).toBeNull();
    expect(r.pricing.total).toBeGreaterThan(0);
  });

  test('4. Uso de cache de tasas de cambio', async () => {
    const getRatesSpy = jest.fn().mockResolvedValue({
      rates: { BRL: 5.2 },
      source: 'api' as const,
      fetchedAt: new Date()
    });
    const customProvider = {
      getRates: getRatesSpy,
      invalidate: () => {},
      invalidateCache: () => {}
    };

    const { app } = buildApp(customProvider);
    // Primera llamada
    await request(app)
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
    expect(getRatesSpy).toHaveBeenCalledTimes(1);

    // Segunda llamada para el mismo destino dentro de la vigencia de cache
    await request(app)
      .post('/reservations/process')
      .send({
        reservations: [
          reservation({
            passengerId: 'P008',
            flightCode: 'LA4567',
            origin: 'SCL',
            destination: 'GRU',
            departureDate: '2026-09-27'
          })
        ]
      });
    // Sigue siendo 1 porque uso la cache
    expect(getRatesSpy).toHaveBeenCalledTimes(1);
  });
});

describe('Casos de error', () => {
  test('1. Timeout en llamada a API externa', async () => {
    const { app } = buildApp(failingRateProvider('timeout de 5000 ms'));
    const res = await request(app)
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

    expect(res.status).toBe(200);
    const r = res.body.results[0];
    expect(r.status).toBe('CONFIRMED');
    expect(r.warnings[0].code).toBe('EXCHANGE_RATE_UNAVAILABLE');
    expect(r.conversion).toBeNull();
  });

  test('2. Filtro que lanza excepción', async () => {
    const explodingFilter: Filter = {
      name: 'basePrice',
      critical: true,
      execute: (ctx) => {
        if (ctx.request.id === 'R-EXPLODE') throw new Error('fallo critico');
        return {
          ...ctx,
          pricing: {
            baseFare: 100,
            classPrice: 100,
            currentPrice: 100,
            subtotal: 100,
            total: 100
          }
        };
      }
    };
    const pipeline = new Pipeline([explodingFilter], {
      enabledFilters: { ...DEFAULT_PIPELINE_CONFIG.enabledFilters }
    });

    const batch = await pipeline.processBatch([
      reservation({ id: 'R-OK-EX' }),
      reservation({ id: 'R-EXPLODE' })
    ]);

    expect(batch.summary.total).toBe(2);
    expect(batch.summary.confirmed).toBe(1);
    expect(batch.summary.failed).toBe(1);

    const failCtx = batch.contexts.find((c) => c.request.id === 'R-EXPLODE');
    expect(failCtx?.status).toBe('FAILED');
    expect(failCtx?.issues.some((i) => i.code === 'FILTER_EXCEPTION')).toBe(true);
  });

  test('3. Pipeline interrumpido por falla de red', async () => {
    // Si la red falla a mitad del procesamiento, el pipeline no se interrumpe y completa en USD
    const { app } = buildApp(failingRateProvider('Network connection reset'));
    const res = await request(app)
      .post('/reservations/process')
      .send({
        reservations: [
          reservation({ id: 'R-NET-1', passengerId: 'P001', flightCode: 'AA001' }),
          reservation({
            id: 'R-NET-2',
            passengerId: 'P002',
            flightCode: 'LA4567',
            origin: 'SCL',
            destination: 'GRU',
            departureDate: '2026-09-27'
          })
        ]
      });

    expect(res.status).toBe(200);
    expect(res.body.summary.confirmed).toBe(2);
    expect(res.body.summary.failed).toBe(0);
    expect(res.body.results[0].status).toBe('CONFIRMED');
    expect(res.body.results[1].status).toBe('CONFIRMED');
  });

  test('4. Datos corruptos en mitad del pipeline', async () => {
    const corruptingFilter: Filter = {
      name: 'basePrice',
      critical: true,
      execute: (ctx) => ({
        ...ctx,
        pricing: {
          baseFare: Number.NaN,
          classPrice: Number.NaN,
          currentPrice: Number.NaN,
          total: Number.NaN
        }
      })
    };
    const pipeline = new Pipeline([corruptingFilter], {
      enabledFilters: { ...DEFAULT_PIPELINE_CONFIG.enabledFilters }
    });

    const ctx = await pipeline.process(createContext(reservation()));
    expect(ctx.status).toBe('FAILED');
    expect(ctx.issues.some((i) => i.code === 'DATA_CORRUPTED')).toBe(true);
  });
});

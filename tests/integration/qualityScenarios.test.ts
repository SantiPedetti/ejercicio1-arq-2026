import request from 'supertest';
import { createApp } from '../../src/app';
import { DEFAULT_PIPELINE_CONFIG, PipelineConfigStore } from '../../src/config/pipelineConfig';
import { createContext } from '../../src/domain/reservationContext';
import { Filter } from '../../src/pipeline/filter';
import { Pipeline } from '../../src/pipeline/pipeline';
import { ProcessingStore } from '../../src/store/processingStore';
import {
  reservation,
  stubRateProvider,
  testClock,
  testFlights,
  testPassengers
} from '../helpers/testDeps';
import { ExchangeRateApiClient, FetchLike } from '../../src/services/exchangeRate/exchangeRateApiClient';
import { ReservationProcessingService } from '../../src/services/reservationProcessingService';

describe('Escenarios de Calidad (PLAN §10.3)', () => {
  describe('AC 1 Disponibilidad: degradacion ante caida de la API de tipo de cambio', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('lote de 10 reservas con API caida hace <= 3 intentos totales y termina 100% en estado final con HTTP 200', async () => {
      const fetchFn = jest.fn<Promise<Response>, Parameters<FetchLike>>().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({})
      } as unknown as Response);

      const client = new ExchangeRateApiClient({
        settings: {
          ...DEFAULT_PIPELINE_CONFIG.exchangeRate,
          timeoutMs: 100,
          retryDelayMs: 20,
          maxAttempts: 3
        },
        fetchFn
      });

      const configStore = new PipelineConfigStore(DEFAULT_PIPELINE_CONFIG);
      const store = new ProcessingStore();
      const service = new ReservationProcessingService({
        configStore,
        store,
        exchangeRateProvider: client,
        passengers: testPassengers,
        flights: testFlights,
        now: () => testClock.now()
      });

      const batchPromise = service.processBatch(
        Array.from({ length: 10 }, (_, i) =>
          reservation({
            id: `R-AC1-${i}`,
            passengerId: 'P002',
            flightCode: 'LA4567', // destino GRU -> BRL
            origin: 'SCL',
            destination: 'GRU',
            departureDate: '2026-09-27'
          })
        )
      );

      // Avanzamos los timers para completar los reintentos
      await jest.advanceTimersByTimeAsync(2000);
      const batchResult = await batchPromise;

      // Medida: 100% de las reservas con estado final, 0 errores 5xx
      expect(batchResult.summary.total).toBe(10);
      expect(batchResult.summary.confirmed).toBe(10);
      expect(batchResult.summary.failed).toBe(0);
      expect(batchResult.summary.rejected).toBe(0);

      // Medida: como maximo 3 intentos en total gracias al single-flight (no 3 por reserva)
      expect(fetchFn).toHaveBeenCalledTimes(3);

      for (const res of batchResult.results) {
        expect(res.status).toBe('CONFIRMED');
        expect(res.conversion).toBeNull();
        expect(res.warnings.some((w) => w.code === 'EXCHANGE_RATE_UNAVAILABLE')).toBe(true);
      }
    });
  });

  describe('AC 2 Modificabilidad: incorporacion de filtros sin tocar el runner', () => {
    test('se puede agregar un filtro nuevo implementando Filter sin modificar el runner', async () => {
      const customFilterCalls: string[] = [];
      const customAuditFilter: Filter = {
        name: 'loyaltyDiscount', // usa interfaz Filter
        critical: true,
        execute: (ctx) => {
          customFilterCalls.push(ctx.request.id);
          return { ...ctx, metadata: { ...ctx.metadata, audited: true } };
        }
      };

      const pipeline = new Pipeline([customAuditFilter], {
        enabledFilters: { ...DEFAULT_PIPELINE_CONFIG.enabledFilters }
      });

      const ctx = await pipeline.process(createContext(reservation({ id: 'R-AC2' })));
      expect(ctx.metadata.audited).toBe(true);
      expect(customFilterCalls).toEqual(['R-AC2']);
    });
  });

  describe('AC 3 Modificabilidad en ejecucion: snapshot inmutable por lote', () => {
    test('un cambio de configuracion en tiempo de ejecucion toma efecto desde el siguiente lote', async () => {
      const configStore = new PipelineConfigStore(DEFAULT_PIPELINE_CONFIG);
      const store = new ProcessingStore();
      const service = new ReservationProcessingService({
        configStore,
        store,
        exchangeRateProvider: stubRateProvider(),
        passengers: testPassengers,
        flights: testFlights
      });

      // Lote 1 con configuracion inicial (loyaltyDiscount activo)
      const batch1 = await service.processBatch([
        reservation({ id: 'R-L1', passengerId: 'P001' }) // Gold 15%
      ]);
      expect(batch1.results[0]?.pricing?.loyaltyDiscount).toBe(67.5);

      // Operador actualiza la configuracion en caliente
      configStore.update({ enabledFilters: { loyaltyDiscount: false } });

      // Lote 2 con la nueva configuracion
      const batch2 = await service.processBatch([
        reservation({ id: 'R-L2', passengerId: 'P001' })
      ]);
      expect(batch2.results[0]?.pricing?.loyaltyDiscount).toBe(0);
      expect(batch2.results[0]?.pricing?.total).toBe(565);
    });
  });

  describe('AC 4 Disponibilidad: aislamiento de fallos ante excepcion no controlada', () => {
    test('la excepcion en una reserva marca FAILED esa reserva y las demas N-1 continúan', async () => {
      const failingFilter: Filter = {
        name: 'basePrice',
        critical: true,
        execute: (ctx) => {
          if (ctx.request.id === 'R-FAIL') {
            throw new Error('error inesperado en calculo');
          }
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

      const pipeline = new Pipeline([failingFilter], {
        enabledFilters: { ...DEFAULT_PIPELINE_CONFIG.enabledFilters }
      });

      const batch = await pipeline.processBatch([
        reservation({ id: 'R-OK-1' }),
        reservation({ id: 'R-FAIL' }),
        reservation({ id: 'R-OK-2' })
      ]);

      // N-1 reservas procesadas con exito (CONFIRMED)
      expect(batch.summary.total).toBe(3);
      expect(batch.summary.confirmed).toBe(2);
      expect(batch.summary.failed).toBe(1);

      const failedItem = batch.contexts.find((c) => c.request.id === 'R-FAIL');
      expect(failedItem?.status).toBe('FAILED');
      expect(failedItem?.issues.some((i) => i.code === 'FILTER_EXCEPTION')).toBe(true);

      const ok1 = batch.contexts.find((c) => c.request.id === 'R-OK-1');
      const ok2 = batch.contexts.find((c) => c.request.id === 'R-OK-2');
      expect(ok1?.status).toBe('CONFIRMED');
      expect(ok2?.status).toBe('CONFIRMED');
    });
  });

  describe('AC 5 Rendimiento: cache y single-flight evitan llamadas redundantes', () => {
    test('lote de 100 reservas hace 1 llamada con cache fria y 0 llamadas con cache caliente', async () => {
      const fetchFn = jest.fn<Promise<Response>, Parameters<FetchLike>>().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          base: 'USD',
          rates: { BRL: 5.2 }
        })
      } as unknown as Response);

      const client = new ExchangeRateApiClient({
        settings: {
          ...DEFAULT_PIPELINE_CONFIG.exchangeRate,
          cacheTtlMs: 3600000
        },
        fetchFn
      });

      const configStore = new PipelineConfigStore(DEFAULT_PIPELINE_CONFIG);
      const store = new ProcessingStore();
      const service = new ReservationProcessingService({
        configStore,
        store,
        exchangeRateProvider: client,
        passengers: testPassengers,
        flights: testFlights
      });

      const reservations100 = Array.from({ length: 100 }, (_, i) =>
        reservation({
          id: `R-PERF-${i}`,
          passengerId: 'P002',
          flightCode: 'LA4567', // destino GRU -> BRL
          origin: 'SCL',
          destination: 'GRU',
          departureDate: '2026-09-27'
        })
      );

      // Primer lote de 100 (cache fria)
      const res1 = await service.processBatch(reservations100);
      expect(res1.summary.total).toBe(100);
      expect(res1.summary.confirmed).toBe(100);
      expect(fetchFn).toHaveBeenCalledTimes(1);

      // Segundo lote de 100 (cache caliente dentro de 1 hora)
      const res2 = await service.processBatch(reservations100);
      expect(res2.summary.total).toBe(100);
      expect(res2.summary.confirmed).toBe(100);
      // No hubo llamadas adicionales
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('AC 6 Testeabilidad: aislamiento de red y pruebas sin levantar servidor', () => {
    test('el fetch global falso bloquea cualquier intento de usar la red en tests', () => {
      expect(() => {
        void fetch('https://api.exchangerate-api.com/v4/latest/USD');
      }).toThrow(/Network call blocked/);
    });

    test('cada filtro se puede probar de forma unitaria sin Express', async () => {
      const customFilter: Filter = {
        name: 'basePrice',
        critical: true,
        execute: (ctx) => ({ ...ctx, metadata: { unitTested: true } })
      };
      const result = await customFilter.execute(createContext(reservation()));
      expect(result.metadata.unitTested).toBe(true);
    });
  });

  describe('AC 7 Confiabilidad de la entrada: rechazo individual de malformadas y 400 en sobre invalido', () => {
    test('reserva malformada en lote queda REJECTED con INVALID_RESERVATION sin lanzar excepcion y las demas siguen', async () => {
      const configStore = new PipelineConfigStore(DEFAULT_PIPELINE_CONFIG);
      const store = new ProcessingStore();
      const app = createApp({
        configStore,
        store,
        exchangeRateProvider: stubRateProvider(),
        passengers: testPassengers,
        flights: testFlights
      });

      const res = await request(app)
        .post('/reservations/process')
        .send({
          reservations: [
            reservation({ id: 'R-OK-A' }),
            { id: 'R-MALFORMADA', passengerId: 'P001', seatClass: 'invalid' },
            reservation({ id: 'R-OK-B' })
          ]
        });

      expect(res.status).toBe(200);
      expect(res.body.summary).toEqual({
        total: 3,
        confirmed: 2,
        rejected: 1,
        failed: 0
      });

      const malformed = res.body.results.find((r: { reservationId: string }) => r.reservationId === 'R-MALFORMADA');
      expect(malformed.status).toBe('REJECTED');
      expect(malformed.errors[0].code).toBe('INVALID_RESERVATION');

      const okA = res.body.results.find((r: { reservationId: string }) => r.reservationId === 'R-OK-A');
      const okB = res.body.results.find((r: { reservationId: string }) => r.reservationId === 'R-OK-B');
      expect(okA.status).toBe('CONFIRMED');
      expect(okB.status).toBe('CONFIRMED');
    });

    test('sobre invalido responde con HTTP 400 y formato { error: { code, message } }', async () => {
      const configStore = new PipelineConfigStore(DEFAULT_PIPELINE_CONFIG);
      const store = new ProcessingStore();
      const app = createApp({
        configStore,
        store,
        exchangeRateProvider: stubRateProvider(),
        passengers: testPassengers,
        flights: testFlights
      });

      const res = await request(app)
        .post('/reservations/process')
        .send({
          reservations: 'no-es-un-array'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('INVALID_REQUEST');
      expect(typeof res.body.error.message).toBe('string');
    });

    test('cuerpo con JSON malformado responde con HTTP 400 MALFORMED_JSON', async () => {
      const configStore = new PipelineConfigStore(DEFAULT_PIPELINE_CONFIG);
      const store = new ProcessingStore();
      const app = createApp({
        configStore,
        store,
        exchangeRateProvider: stubRateProvider(),
        passengers: testPassengers,
        flights: testFlights
      });

      const res = await request(app)
        .post('/reservations/process')
        .set('Content-Type', 'application/json')
        .send('{"reservations": [');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('MALFORMED_JSON');
    });
  });
});

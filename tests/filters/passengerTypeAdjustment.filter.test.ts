import { createPassengerTypeAdjustmentFilter } from '../../src/pipeline/filters/passengerTypeAdjustment.filter';
import { createContext, createNeutralPricing } from '../../src/domain/reservationContext';
import { contextFor, issueCodes, testDeps } from '../helpers/testDeps';
import { PassengerType } from '../../src/domain/types';

describe('filtro 6: passengerTypeAdjustment (ajuste por tipo de pasajero)', () => {
  const deps = testDeps();
  const filter = createPassengerTypeAdjustmentFilter(deps);

  it('aplica descuento para child (25%) y senior (15%), y nada para adult (0%)', async () => {
    const ctxChild = createContext(contextFor({ passengerType: 'child' }).request, {
      pricing: createNeutralPricing(100)
    });
    const resChild = await filter.execute(ctxChild);
    expect(resChild.pricing?.passengerTypeDiscount).toBe(25);
    expect(resChild.pricing?.currentPrice).toBe(75);

    const ctxSenior = createContext(contextFor({ passengerType: 'senior' }).request, {
      pricing: createNeutralPricing(100)
    });
    const resSenior = await filter.execute(ctxSenior);
    expect(resSenior.pricing?.passengerTypeDiscount).toBe(15);
    expect(resSenior.pricing?.currentPrice).toBe(85);

    const ctxAdult = createContext(contextFor({ passengerType: 'adult' }).request, {
      pricing: createNeutralPricing(100)
    });
    const resAdult = await filter.execute(ctxAdult);
    expect(resAdult.pricing?.passengerTypeDiscount).toBe(0);
    expect(resAdult.pricing?.currentPrice).toBe(100);
  });

  it('rechaza con MISSING_DATA si no hay pricing en el contexto', async () => {
    const ctx = createContext(contextFor().request);
    const result = await filter.execute(ctx);
    expect(result.status).toBe('REJECTED');
    expect(issueCodes(result)).toEqual(['MISSING_DATA']);
  });

  it('emite warning PASSENGER_NOT_RESOLVED si no viene passengerType en el request', async () => {
    const reqSinTipo = {
      ...contextFor().request,
      passengerType: '' as unknown as PassengerType
    };
    const ctx = createContext(reqSinTipo, {
      pricing: { baseFare: 100, classPrice: 100, currentPrice: 100 }
    });
    const result = await filter.execute(ctx);
    expect(result.status).toBe('PENDING');
    expect(issueCodes(result)).toContain('PASSENGER_NOT_RESOLVED');
  });
});

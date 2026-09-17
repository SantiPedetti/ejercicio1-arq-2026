import { createLoyaltyDiscountFilter } from '../../src/pipeline/filters/loyaltyDiscount.filter';
import { createContext, createNeutralPricing } from '../../src/domain/reservationContext';
import { contextFor, issueCodes, testDeps, testPassengers } from '../helpers/testDeps';

describe('filtro 5: loyaltyDiscount (descuento por lealtad)', () => {
  const deps = testDeps();
  const filter = createLoyaltyDiscountFilter(deps);

  it('aplica los porcentajes de lealtad para none, bronze, silver y gold', async () => {
    const pGold = testPassengers.findById('P001'); // gold 15%
    const ctxGold = createContext(contextFor().request, {
      passenger: pGold,
      pricing: createNeutralPricing(100)
    });
    const resGold = await filter.execute(ctxGold);
    expect(resGold.pricing?.loyaltyDiscount).toBe(15);
    expect(resGold.pricing?.currentPrice).toBe(85);

    const pSilver = testPassengers.findById('P002'); // silver 10%
    const ctxSilver = createContext(contextFor().request, {
      passenger: pSilver,
      pricing: createNeutralPricing(100)
    });
    const resSilver = await filter.execute(ctxSilver);
    expect(resSilver.pricing?.loyaltyDiscount).toBe(10);
    expect(resSilver.pricing?.currentPrice).toBe(90);

    const pBronze = testPassengers.findById('P003'); // bronze 5%
    const ctxBronze = createContext(contextFor().request, {
      passenger: pBronze,
      pricing: createNeutralPricing(100)
    });
    const resBronze = await filter.execute(ctxBronze);
    expect(resBronze.pricing?.loyaltyDiscount).toBe(5);
    expect(resBronze.pricing?.currentPrice).toBe(95);

    const pNone = testPassengers.findById('P007'); // none 0%
    const ctxNone = createContext(contextFor().request, {
      passenger: pNone,
      pricing: createNeutralPricing(100)
    });
    const resNone = await filter.execute(ctxNone);
    expect(resNone.pricing?.loyaltyDiscount).toBe(0);
    expect(resNone.pricing?.currentPrice).toBe(100);
  });

  it('rechaza con MISSING_DATA si no hay pricing en el contexto', async () => {
    const ctx = createContext(contextFor().request);
    const result = await filter.execute(ctx);
    expect(result.status).toBe('REJECTED');
    expect(issueCodes(result)).toEqual(['MISSING_DATA']);
  });

  it('emite warning PASSENGER_NOT_RESOLVED si no hay pasajero en el contexto', async () => {
    const ctx = createContext(contextFor().request, {
      pricing: { baseFare: 100, classPrice: 100, currentPrice: 100 }
    });
    const result = await filter.execute(ctx);
    expect(result.status).toBe('PENDING');
    expect(issueCodes(result)).toContain('PASSENGER_NOT_RESOLVED');
  });
});

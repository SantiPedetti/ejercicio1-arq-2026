import { createTaxesAndFeesFilter } from '../../src/pipeline/filters/taxesAndFees.filter';
import { createContext } from '../../src/domain/reservationContext';
import { contextFor, issueCodes, testDeps } from '../helpers/testDeps';

describe('filtro 7: taxesAndFees (impuestos, sobrecargo de combustible y tasa de aeropuerto)', () => {
  const deps = testDeps();
  const filter = createTaxesAndFeesFilter(deps);

  it('calcula impuestos (12% subtotal), combustible (8% classPrice) y tasa fija (25)', async () => {
    const ctx = createContext(contextFor().request, {
      pricing: {
        baseFare: 200,
        classPrice: 500,
        currentPrice: 318.75,
        loyaltyDiscount: 75,
        passengerTypeDiscount: 106.25
      }
    });

    const result = await filter.execute(ctx);

    expect(result.pricing).toMatchObject({
      subtotal: 318.75,
      taxes: 318.75 * 0.12, // 38.25
      fuelSurcharge: 500 * 0.08, // 40
      airportFee: 25,
      total: 422
    });
  });

  it('rechaza con MISSING_DATA si no hay pricing en el contexto', async () => {
    const ctx = createContext(contextFor().request);
    const result = await filter.execute(ctx);

    expect(result.status).toBe('REJECTED');
    expect(issueCodes(result)).toEqual(['MISSING_DATA']);
  });
});

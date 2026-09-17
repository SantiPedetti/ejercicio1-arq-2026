import { createBasePriceFilter } from '../../src/pipeline/filters/basePrice.filter';
import { createContext } from '../../src/domain/reservationContext';
import { contextFor, issueCodes, testDeps, testFlights } from '../helpers/testDeps';
import { SeatClass } from '../../src/domain/types';

describe('filtro 4: basePrice (precio base por clase)', () => {
  const deps = testDeps();
  const filter = createBasePriceFilter(deps);

  it('calcula classPrice para economy, business y first', async () => {
    const flight = testFlights.findByCode('AA001'); // baseFare 450
    const ctxEconomy = await filter.execute(createContext(contextFor({ seatClass: 'economy' }).request, { flight }));
    expect(ctxEconomy.pricing?.classPrice).toBe(450);
    expect(ctxEconomy.pricing?.currentPrice).toBe(450);

    const ctxBusiness = await filter.execute(createContext(contextFor({ seatClass: 'business' }).request, { flight }));
    expect(ctxBusiness.pricing?.classPrice).toBe(450 * 2.5);

    const ctxFirst = await filter.execute(createContext(contextFor({ seatClass: 'first' }).request, { flight }));
    expect(ctxFirst.pricing?.classPrice).toBe(450 * 4);
  });

  it('rechaza con MISSING_DATA si no hay vuelo en el contexto', async () => {
    const ctx = await filter.execute(createContext(contextFor().request));
    expect(ctx.status).toBe('REJECTED');
    expect(issueCodes(ctx)).toEqual(['MISSING_DATA']);
  });

  it('rechaza con SEAT_CLASS_NOT_CONFIGURED si la clase no tiene multiplicador', async () => {
    const flight = testFlights.findByCode('AA001');
    const customDeps = testDeps({
      config: {
        ...deps.config,
        seatClassMultipliers: {} as Record<SeatClass, number>
      }
    });
    const customFilter = createBasePriceFilter(customDeps);
    const ctx = await customFilter.execute(createContext(contextFor({ seatClass: 'economy' }).request, { flight }));

    expect(ctx.status).toBe('REJECTED');
    expect(issueCodes(ctx)).toEqual(['SEAT_CLASS_NOT_CONFIGURED']);
  });
});

import { ReservationContext } from '../../src/domain/reservationContext';
import { ReservationInput } from '../../src/domain/types';
import { FilterDependencies } from '../../src/pipeline/filter';
import { createBasePriceFilter } from '../../src/pipeline/filters/basePrice.filter';
import { createLoyaltyDiscountFilter } from '../../src/pipeline/filters/loyaltyDiscount.filter';
import { createPassengerTypeAdjustmentFilter } from '../../src/pipeline/filters/passengerTypeAdjustment.filter';
import { createTaxesAndFeesFilter } from '../../src/pipeline/filters/taxesAndFees.filter';
import { createValidateFlightFilter } from '../../src/pipeline/filters/validateFlight.filter';
import { createValidatePassengerFilter } from '../../src/pipeline/filters/validatePassenger.filter';
import { createPipeline } from '../../src/pipeline/registry';
import { configWith, contextFor, issueCodes, testDeps } from '../helpers/testDeps';

/** Ejecuta la cadena de precios completa sobre una reserva valida. */
async function priceReservation(
  overrides: Partial<ReservationInput>,
  deps: FilterDependencies = testDeps()
): Promise<ReservationContext> {
  const chain = [
    createValidatePassengerFilter(deps),
    createValidateFlightFilter(deps),
    createBasePriceFilter(deps),
    createLoyaltyDiscountFilter(deps),
    createPassengerTypeAdjustmentFilter(deps),
    createTaxesAndFeesFilter(deps)
  ];

  let context = contextFor(overrides);
  for (const filter of chain) {
    context = await filter.execute(context);
  }
  return context;
}

describe('cadena de filtros de precio', () => {
  it('reserva economy de un adulto sin programa de lealtad: sin descuentos (P007 en AA001 = 565.00)', async () => {
    const context = await priceReservation({ passengerId: 'P007' });

    expect(context.pricing).toMatchObject({
      baseFare: 450,
      classPrice: 450,
      currentPrice: 450,
      loyaltyDiscount: 0,
      passengerTypeDiscount: 0,
      subtotal: 450,
      taxes: 54,
      airportFee: 25,
      fuelSurcharge: 36,
      total: 565
    });
    expect(context.issues).toHaveLength(0);
  });

  it('pasajero gold: aplica 15% de descuento por lealtad (P001 en AA001 = 489.40)', async () => {
    const context = await priceReservation({ passengerId: 'P001' });

    expect(context.pricing).toMatchObject({
      baseFare: 450,
      classPrice: 450,
      currentPrice: 382.5,
      loyaltyDiscount: 67.5,
      passengerTypeDiscount: 0,
      subtotal: 382.5,
      taxes: 45.9,
      airportFee: 25,
      fuelSurcharge: 36,
      total: 489.4
    });
  });

  it('nino gold en business: combina clase, lealtad y tipo (P008 en LA4567 = 422.00)', async () => {
    const context = await priceReservation({
      passengerId: 'P008',
      flightCode: 'LA4567',
      origin: 'SCL',
      destination: 'GRU',
      departureDate: '2026-09-27',
      seatClass: 'business',
      passengerType: 'child'
    });

    expect(context.pricing).toMatchObject({
      baseFare: 200,
      classPrice: 500,
      loyaltyDiscount: 75,
      currentPrice: 318.75,
      passengerTypeDiscount: 106.25,
      subtotal: 318.75,
      taxes: 38.25,
      airportFee: 25,
      fuelSurcharge: 40,
      total: 422
    });
  });

  it('senior silver en primera clase: combina lealtad y tipo (P009 en IB6841 = 3397.48)', async () => {
    const context = await priceReservation({
      passengerId: 'P009',
      flightCode: 'IB6841',
      origin: 'MAD',
      destination: 'EZE',
      departureDate: '2026-11-01',
      seatClass: 'first',
      passengerType: 'senior'
    });

    expect(context.pricing).toMatchObject({
      baseFare: 900,
      classPrice: 3600,
      loyaltyDiscount: 360,
      passengerTypeDiscount: 486,
      currentPrice: 2754,
      subtotal: 2754,
      taxes: expect.closeTo(330.48, 2),
      airportFee: 25,
      fuelSurcharge: 288,
      total: 3397.48
    });
  });

  it('senior en primera clase sin lealtad: aplica ajustes en cascada (P004 en IB6841 = 3740.20)', async () => {
    const context = await priceReservation({
      passengerId: 'P004',
      flightCode: 'IB6841',
      origin: 'MAD',
      destination: 'EZE',
      departureDate: '2026-11-01',
      seatClass: 'first',
      passengerType: 'senior'
    });

    expect(context.pricing).toMatchObject({
      baseFare: 900,
      classPrice: 3600,
      loyaltyDiscount: 0,
      passengerTypeDiscount: 540,
      currentPrice: 3060,
      subtotal: 3060,
      taxes: 367.2,
      airportFee: 25,
      fuelSurcharge: 288,
      total: 3740.2
    });
  });

  it('filtro 5 (loyaltyDiscount) deshabilitado no modifica currentPrice', async () => {
    const deps = testDeps({
      config: configWith({
        enabledFilters: { loyaltyDiscount: false }
      })
    });
    const pipeline = createPipeline(deps.config, deps);
    const context = await pipeline.process(
      contextFor({ passengerId: 'P001' })
    );

    expect(context.pricing?.classPrice).toBe(450);
    expect(context.pricing?.currentPrice).toBe(450);
    expect(context.pricing?.loyaltyDiscount).toBe(0);
    expect(context.pricing?.total).toBe(565);
  });

  it('filtro 6 (passengerTypeAdjustment) deshabilitado no modifica currentPrice', async () => {
    const deps = testDeps({
      config: configWith({
        enabledFilters: { passengerTypeAdjustment: false }
      })
    });
    const pipeline = createPipeline(deps.config, deps);
    const context = await pipeline.process(
      contextFor({
        passengerId: 'P008',
        flightCode: 'LA4567',
        origin: 'SCL',
        destination: 'GRU',
        departureDate: '2026-09-27',
        seatClass: 'business',
        passengerType: 'child'
      })
    );

    expect(context.pricing?.classPrice).toBe(500);
    expect(context.pricing?.loyaltyDiscount).toBe(75);
    expect(context.pricing?.currentPrice).toBe(425);
    expect(context.pricing?.passengerTypeDiscount).toBe(0);
  });

  it('filtro 7 (taxesAndFees) deshabilitado deja total = currentPrice', async () => {
    const deps = testDeps({
      config: configWith({
        enabledFilters: { taxesAndFees: false }
      })
    });
    const pipeline = createPipeline(deps.config, deps);
    const context = await pipeline.process(
      contextFor({
        passengerId: 'P008',
        flightCode: 'LA4567',
        origin: 'SCL',
        destination: 'GRU',
        departureDate: '2026-09-27',
        seatClass: 'business',
        passengerType: 'child'
      })
    );

    expect(context.pricing?.currentPrice).toBe(318.75);
    expect(context.pricing?.total).toBe(context.pricing?.currentPrice);
    expect(context.pricing?.total).toBe(318.75);
  });

  it('usa los porcentajes de la configuracion, no constantes embebidas', async () => {
    const deps = testDeps({
      config: {
        ...testDeps().config,
        loyaltyDiscounts: { none: 0, bronze: 0.5, silver: 0.5, gold: 0.5 },
        taxes: { taxRate: 0, airportFeeUsd: 0, fuelSurchargeRate: 0 }
      }
    });

    const context = await priceReservation({ passengerId: 'P001' }, deps);

    expect(context.pricing).toMatchObject({
      loyaltyDiscount: 225,
      currentPrice: 225,
      subtotal: 225,
      taxes: 0,
      airportFee: 0,
      fuelSurcharge: 0,
      total: 225
    });
  });

  it('rechaza el calculo si el precio base no fue inicializado', async () => {
    const deps = testDeps();
    const context = await createLoyaltyDiscountFilter(deps).execute(contextFor());

    expect(context.status).toBe('REJECTED');
    expect(issueCodes(context)).toEqual(['MISSING_DATA']);
  });
});

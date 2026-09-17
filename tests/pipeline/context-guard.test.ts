import { validateContextInvariants } from '../../src/pipeline/context-guard';
import { contextFor } from '../helpers/testDeps';

describe('context-guard (validateContextInvariants)', () => {
  it('acepta un contexto con montos validos finitos y positivos', () => {
    const ctx = contextFor();
    ctx.pricing = {
      baseFare: 100,
      classPrice: 150,
      loyaltyDiscount: 0,
      passengerTypeDiscount: 0,
      currentPrice: 150,
      subtotal: 150,
      taxes: 18,
      airportFee: 25,
      fuelSurcharge: 8,
      total: 201
    };

    expect(validateContextInvariants(ctx, 'taxesAndFees')).toBeNull();
  });

  it('detecta numeros negativos en el desglose de precios', () => {
    const ctx = contextFor();
    ctx.pricing = {
      baseFare: -50,
      classPrice: 100,
      loyaltyDiscount: 0,
      passengerTypeDiscount: 0,
      currentPrice: 100,
      subtotal: 100,
      taxes: 0,
      airportFee: 0,
      fuelSurcharge: 0,
      total: 100
    };

    const err = validateContextInvariants(ctx, 'basePrice');
    expect(err).toContain('no es un monto valido');
  });

  it('detecta valores NaN en los precios', () => {
    const ctx = contextFor();
    ctx.pricing = {
      baseFare: Number.NaN,
      classPrice: 100,
      loyaltyDiscount: 0,
      passengerTypeDiscount: 0,
      currentPrice: 100,
      subtotal: 100,
      taxes: 0,
      airportFee: 0,
      fuelSurcharge: 0,
      total: 100
    };

    const err = validateContextInvariants(ctx, 'basePrice');
    expect(err).toContain('no es un numero finito');
  });

  it('detecta valores Infinity en los precios', () => {
    const ctx = contextFor();
    ctx.pricing = {
      baseFare: Number.POSITIVE_INFINITY,
      classPrice: 100,
      loyaltyDiscount: 0,
      passengerTypeDiscount: 0,
      currentPrice: 100,
      subtotal: 100,
      taxes: 0,
      airportFee: 0,
      fuelSurcharge: 0,
      total: 100
    };

    const err = validateContextInvariants(ctx, 'basePrice');
    expect(err).toContain('no es un numero finito');
  });

  it('falla en basePrice si el filtro no inicializo classPrice', () => {
    const ctx = contextFor();
    ctx.pricing = {
      baseFare: 100,
      currentPrice: 100,
      total: 100
    };

    const err = validateContextInvariants(ctx, 'basePrice');
    expect(err).toContain('no establecio el precio de clase');
  });

  it('detecta tasas de cambio no validas (cero, negativas o no finitas)', () => {
    const ctxZero = contextFor();
    ctxZero.currency = {
      baseCurrency: 'USD',
      targetCurrency: 'EUR',
      rate: 0,
      rateSource: 'api',
      retrievedAt: '2026-09-17T12:00:00.000Z'
    };
    expect(validateContextInvariants(ctxZero, 'exchangeRateEnrichment')).toContain('no es un monto valido');

    const ctxNeg = contextFor();
    ctxNeg.currency = {
      baseCurrency: 'USD',
      targetCurrency: 'EUR',
      rate: -1.5,
      rateSource: 'api',
      retrievedAt: '2026-09-17T12:00:00.000Z'
    };
    expect(validateContextInvariants(ctxNeg, 'exchangeRateEnrichment')).toContain('no es un monto valido');

    const ctxNan = contextFor();
    ctxNan.currency = {
      baseCurrency: 'USD',
      targetCurrency: 'EUR',
      rate: Number.NaN,
      rateSource: 'api',
      retrievedAt: '2026-09-17T12:00:00.000Z'
    };
    expect(validateContextInvariants(ctxNan, 'exchangeRateEnrichment')).toContain('no es un numero finito');
  });

  it('detecta total convertido invalido en metadata de moneda', () => {
    const ctx = contextFor();
    ctx.currency = {
      baseCurrency: 'USD',
      targetCurrency: 'EUR',
      rate: 1.2,
      rateSource: 'api',
      retrievedAt: '2026-09-17T12:00:00.000Z',
      convertedTotal: -10
    };
    expect(validateContextInvariants(ctx, 'currencyConversion')).toContain('no es un monto valido');
  });
});

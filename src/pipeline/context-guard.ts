import { FilterName } from '../config/pipelineConfig';
import { ReservationContext } from '../domain/reservationContext';
import {
  CurrencyMetadata,
  ExchangeRateData,
  LocalConversionData,
  PriceBreakdown
} from '../domain/types';

function checkNumber(key: string, val: number, allowZero = true): string | null {
  if (!Number.isFinite(val)) {
    return `El campo ${key} no es un numero finito (valor: ${val})`;
  }
  if (allowZero ? val < 0 : val <= 0) {
    return `El campo ${key} no es un monto valido (valor: ${val})`;
  }
  return null;
}

function checkPricing(pricing?: PriceBreakdown): string | null {
  if (!pricing) return null;
  for (const [key, val] of Object.entries(pricing)) {
    if (typeof val === 'number') {
      const err = checkNumber(`pricing.${key}`, val);
      if (err) return err;
    }
  }
  return null;
}

function checkBasePriceInvariant(pricing?: PriceBreakdown): string | null {
  if (!pricing || pricing.classPrice === undefined) {
    return 'El filtro basePrice no establecio el precio de clase en el contexto';
  }
  return null;
}

function checkCurrency(currency?: CurrencyMetadata): string | null {
  if (!currency) return null;
  if (typeof currency.rate === 'number') {
    const err = checkNumber('currency.rate', currency.rate, false);
    if (err) return err;
  }
  if (typeof currency.convertedTotal === 'number') {
    const err = checkNumber('currency.convertedTotal', currency.convertedTotal);
    if (err) return err;
  }
  return null;
}

function checkExchangeRate(rate?: ExchangeRateData): string | null {
  if (!rate) return null;
  return checkNumber('exchangeRate.rate', rate.rate, false);
}

function checkConversion(conversion?: LocalConversionData): string | null {
  if (!conversion) return null;
  if (typeof conversion.baseFareLocal === 'number') {
    const err = checkNumber('conversion.baseFareLocal', conversion.baseFareLocal);
    if (err) return err;
  }
  if (typeof conversion.totalLocal === 'number') {
    const err = checkNumber('conversion.totalLocal', conversion.totalLocal);
    if (err) return err;
  }
  return null;
}

function checkCurrencyInvariants(context: ReservationContext): string | null {
  const exErr = checkExchangeRate(context.exchangeRate);
  if (exErr) return exErr;
  const convErr = checkConversion(context.conversion);
  if (convErr) return convErr;
  return checkCurrency(context.currency);
}

export function validateContextInvariants(
  context: ReservationContext,
  filterName: FilterName
): string | null {
  const pricingErr = checkPricing(context.pricing);
  if (pricingErr) return pricingErr;

  if (filterName === 'basePrice') {
    const bpErr = checkBasePriceInvariant(context.pricing);
    if (bpErr) return bpErr;
  }

  return checkCurrencyInvariants(context);
}

import { FilterName } from '../config/pipelineConfig';
import { ReservationContext } from '../domain/reservationContext';
import { CurrencyMetadata, PriceBreakdown } from '../domain/types';

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

  const currencyErr = checkCurrency(context.currency);
  if (currencyErr) return currencyErr;

  return null;
}

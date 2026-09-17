/**
 * Mapa de codigo de pais ISO-3166 alpha-2 a moneda local ISO-4217.
 * "EU" no es un pais sino una region, pero la consigna lo usa como sinonimo de
 * la zona euro, por lo que se lo mantiene como alias.
 */
export const COUNTRY_TO_CURRENCY: Record<string, string> = {
  AR: 'ARS',
  BR: 'BRL',
  US: 'USD',
  EU: 'EUR',
  ES: 'EUR',
  FR: 'EUR',
  IT: 'EUR',
  DE: 'EUR',
  PT: 'EUR',
  GB: 'GBP',
  CL: 'CLP',
  MX: 'MXN',
  PE: 'PEN',
  UY: 'UYU',
  CO: 'COP',
  CA: 'CAD',
  AU: 'AUD',
  JP: 'JPY'
};

export const UNKNOWN_COUNTRY_FALLBACK_CURRENCY = 'USD';

export function currencyForCountry(countryCode: string): string | undefined {
  return COUNTRY_TO_CURRENCY[countryCode.toUpperCase()];
}

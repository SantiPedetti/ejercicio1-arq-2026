export type LoyaltyTier = 'none' | 'bronze' | 'silver' | 'gold';

export type PassengerType = 'child' | 'adult' | 'senior';

export type SeatClass = 'economy' | 'business' | 'first';

export interface Passenger {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  age: number;
  passengerType: PassengerType;
  loyaltyTier: LoyaltyTier;
  countryCode: string;
  isActive: boolean;
}

export interface Flight {
  flightCode: string;
  airline: string;
  origin: string;
  destination: string;
  destinationCountryCode: string;
  departureDate: string;
  durationMinutes: number;
  basePriceUsd: number;
  availableSeats: number;
}

/** Payload que el cliente envia por cada reserva a procesar. */
export interface ReservationRequest {
  reservationId: string;
  passengerId: string;
  flightCode: string;
  origin: string;
  destination: string;
  seatClass: SeatClass;
  seats?: number;
}

export interface PriceBreakdown {
  /** Precio base del vuelo publicado por la aerolinea, en USD. */
  flightBasePriceUsd: number;
  /** Precio luego de aplicar el multiplicador de clase de asiento. */
  classAdjustedPriceUsd: number;
  loyaltyDiscountUsd: number;
  passengerTypeDiscountUsd: number;
  /** Precio neto luego de descuentos y antes de impuestos. */
  netPriceUsd: number;
  taxesUsd: number;
  airportFeeUsd: number;
  fuelSurchargeUsd: number;
  totalUsd: number;
}

/**
 * Origen de la tasa aplicada: llamada real a la API, cache en memoria, tasa de
 * respaldo configurada, o conversion trivial cuando la moneda destino es USD.
 */
export type RateSource = 'api' | 'cache' | 'fallback' | 'identity';

export interface CurrencyMetadata {
  baseCurrency: string;
  targetCurrency: string;
  rate: number;
  rateSource: RateSource;
  retrievedAt: string;
  convertedTotal?: number;
}

export type IssueSeverity = 'error' | 'warning';

export interface ProcessingIssue {
  filter: string;
  code: string;
  message: string;
  severity: IssueSeverity;
}

export interface FilterTrace {
  filter: string;
  status: 'executed' | 'skipped' | 'disabled' | 'failed';
  durationMs: number;
  detail?: string;
}

export type LoyaltyTier = 'none' | 'bronze' | 'silver' | 'gold';

export type PassengerType = 'child' | 'adult' | 'senior';

export type SeatClass = 'economy' | 'business' | 'first';

export interface Passenger {
  id: string;
  name: string;
  email: string;
  birthDate: string;
  country: string;
  loyaltyTier: LoyaltyTier;
  isActive: boolean;
  countryCode?: string;
  firstName?: string;
  lastName?: string;
}

export interface Flight {
  code: string;
  flightCode: string;
  origin: string;
  destination: string;
  originCountry: string;
  destinationCountry: string;
  destinationCountryCode: string;
  departureAt: string;
  departureDate: string;
  durationMinutes: number;
  baseFare: number;
  basePriceUsd: number;
  availableSeats: number;
  airline?: string;
}

/** Contrato publico de entrada por cada reserva (BUILD-TASKS F2). */
export interface ReservationInput {
  id?: string;
  passengerId: string;
  flightCode: string;
  origin: string;
  destination: string;
  departureDate: string;
  seatClass: SeatClass;
  passengerType: PassengerType;
}

/** Representacion interna de la reserva dentro del contexto del pipeline. */
export interface ReservationRequest extends ReservationInput {
  id: string;
  reservationId?: string;
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
  details?: unknown;
}

export interface FilterTrace {
  filter: string;
  status: 'executed' | 'skipped' | 'disabled' | 'failed';
  durationMs: number;
  detail?: string;
}

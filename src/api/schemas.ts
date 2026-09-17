import { z } from 'zod';
import { FILTER_NAMES } from '../config/pipelineConfig';

const filterNameSchema = z.enum(FILTER_NAMES);
const seatClassSchema = z.enum(['economy', 'business', 'first']);
const loyaltyTierSchema = z.enum(['none', 'bronze', 'silver', 'gold']);
const passengerTypeSchema = z.enum(['child', 'adult', 'senior']);
const airportCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/, 'debe ser un codigo IATA de 3 letras');
const rateSchema = z.number().min(0).max(1);

export const reservationRequestSchema = z
  .object({
    reservationId: z.string().trim().min(1),
    passengerId: z.string().trim().min(1),
    flightCode: z.string().trim().min(1),
    origin: airportCodeSchema,
    destination: airportCodeSchema,
    seatClass: seatClassSchema,
    seats: z.number().int().positive().max(9).optional()
  })
  .strict();

export const pipelineConfigPatchSchema = z
  .object({
    filterOrder: z.array(filterNameSchema).min(1).optional(),
    enabledFilters: z.partialRecord(filterNameSchema, z.boolean()).optional(),
    seatClassMultipliers: z.partialRecord(seatClassSchema, z.number().positive()).optional(),
    loyaltyDiscounts: z.partialRecord(loyaltyTierSchema, rateSchema).optional(),
    passengerTypeDiscounts: z.partialRecord(passengerTypeSchema, rateSchema).optional(),
    taxes: z
      .object({
        taxRate: rateSchema.optional(),
        airportFeeUsd: z.number().min(0).optional(),
        fuelSurchargeRate: rateSchema.optional()
      })
      .strict()
      .optional(),
    exchangeRate: z
      .object({
        baseCurrency: z.string().trim().length(3).optional(),
        timeoutMs: z.number().int().min(100).max(30000).optional(),
        maxRetries: z.number().int().min(1).max(10).optional(),
        retryDelayMs: z.number().int().min(0).max(10000).optional(),
        cacheTtlMs: z.number().int().min(0).optional(),
        fallbackRates: z.record(z.string().trim().length(3), z.number().positive()).optional()
      })
      .strict()
      .optional()
  })
  .strict();

export const processReservationsSchema = z
  .object({
    reservations: z.array(reservationRequestSchema).min(1).max(200),
    /** Overrides validos solo para este request, sin mutar la config global. */
    config: pipelineConfigPatchSchema.optional()
  })
  .strict();

export type ProcessReservationsBody = z.infer<typeof processReservationsSchema>;
export type PipelineConfigPatchBody = z.infer<typeof pipelineConfigPatchSchema>;

export interface ValidationIssue {
  path: string;
  message: string;
}

export function toValidationIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(raiz)',
    message: issue.message
  }));
}

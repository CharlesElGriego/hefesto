import { z } from 'zod';
import { MAINTENANCE_TYPES } from '../vehicles/schemas/maintenance-record.schema';

/**
 * The assistant contract (PRD §7): Claude ALWAYS answers with one of these
 * four actions, validated against this schema via structured outputs.
 * Unknown values are OMITTED (optional, not nullable: the Anthropic API caps
 * union-typed schema params at 16, and every nullable is a union).
 */

const extractedRecordSchema = z.object({
  /** 1-based index into the vehicle list shown in the context; null = unspecified. */
  vehicleIndex: z.number().optional(),
  type: z.enum(MAINTENANCE_TYPES),
  description: z.string(),
  items: z.array(z.string()),
  cost: z.number().optional(),
  currency: z.string().optional(),
  mileage: z.number().optional(),
  date: z.string().optional(),
  workshop: z.string().optional(),
});

const historyFiltersSchema = z.object({
  type: z.enum(MAINTENANCE_TYPES).optional(),
  year: z.number().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

export const assistantActionSchema = z.discriminatedUnion('intent', [
  z.object({
    intent: z.literal('log_maintenance'),
    record: extractedRecordSchema,
    confidence: z.number(),
    reply: z.string(),
  }),
  z.object({
    intent: z.literal('query_history'),
    query: z.object({
      kind: z.enum(['total_cost', 'last_service', 'history_filter']),
      /** 1-based vehicle index; null = across all vehicles. */
      vehicleIndex: z.number().optional(),
      filters: historyFiltersSchema.optional(),
    }),
    reply_template: z.string(),
  }),
  z.object({
    /** The user adds/corrects details of the record that was just logged. */
    intent: z.literal('amend_last_record'),
    fields: z.object({
      /** Set when the user corrects WHICH car it was (1-based index). */
      vehicleIndex: z.number().optional(),
      type: z.enum(MAINTENANCE_TYPES).optional(),
      description: z.string().optional(),
      cost: z.number().optional(),
      currency: z.string().optional(),
      mileage: z.number().optional(),
      date: z.string().optional(),
      workshop: z.string().optional(),
    }),
    reply: z.string(),
  }),
  z.object({
    /**
     * The user registers a NEW car, or CORRECTS an existing car's profile
     * (set vehicleIndex to update instead of create).
     */
    intent: z.literal('add_vehicle'),
    vehicle: z.object({
      /** 1-based index of an EXISTING car to update; omit to create a new one. */
      vehicleIndex: z.number().optional(),
      /** Empty string = "not correcting this field" (API optional-param budget). */
      make: z.string(),
      model: z.string(),
      year: z.number().optional(),
      plate: z.string().optional(),
      currentMileage: z.number().optional(),
    }),
    reply: z.string(),
  }),
  z.object({
    intent: z.literal('general'),
    reply: z.string(),
  }),
]);

/** Union of the assistant's possible decisions, inferred from the zod schemas. */
export type AssistantAction = z.infer<typeof assistantActionSchema>;

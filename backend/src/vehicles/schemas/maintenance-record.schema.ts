import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export const MAINTENANCE_TYPES = [
  'oil_change',
  'tires',
  'brakes',
  'battery',
  'inspection',
  'repair',
  'other',
] as const;

/**
 * Mongoose schema for one maintenance event; `source` tracks authorship
 * (chat / whatsapp / manual) and AI records keep confidence + raw message.
 */
@Schema({ timestamps: true })
export class MaintenanceRecord {
  @Prop({ type: Types.ObjectId, ref: 'Vehicle', required: true, index: true })
  vehicleId!: Types.ObjectId;

  @Prop({ required: true, enum: MAINTENANCE_TYPES })
  type!: string;

  @Prop({ required: true })
  description!: string;

  @Prop({ type: [String], default: [] })
  items!: string[];

  @Prop()
  cost?: number;

  @Prop()
  currency?: string;

  @Prop()
  mileage?: number;

  @Prop({ required: true, index: true })
  date!: Date;

  @Prop()
  workshop?: string;

  @Prop({ required: true, enum: ['chat', 'whatsapp', 'manual'] })
  source!: string;

  @Prop()
  aiConfidence?: number;

  @Prop()
  rawMessage?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

/** Hydrated Mongoose document for MaintenanceRecord. */
export type MaintenanceRecordDocument = HydratedDocument<MaintenanceRecord>;
export const MaintenanceRecordSchema =
  SchemaFactory.createForClass(MaintenanceRecord);

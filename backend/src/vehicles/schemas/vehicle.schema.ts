import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** Mongoose schema for a car in the garage. */
@Schema({ timestamps: true })
export class Vehicle {
  @Prop({ required: true })
  make!: string;

  @Prop({ required: true })
  model!: string;

  @Prop({ required: true })
  year!: number;

  @Prop()
  plate?: string;

  @Prop({ required: true, default: 0 })
  currentMileage!: number;

  // Added by { timestamps: true }
  createdAt!: Date;
  updatedAt!: Date;
}

/** Hydrated Mongoose document for Vehicle. */
export type VehicleDocument = HydratedDocument<Vehicle>;
export const VehicleSchema = SchemaFactory.createForClass(Vehicle);

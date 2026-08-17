import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import type { MaintenanceType } from '@hefesto/shared';
import { MAINTENANCE_TYPES } from './schemas/maintenance-record.schema';

/** Body for POST /records (manual record creation). */
export class RecordBodyDto {
  @ApiPropertyOptional({
    description: 'Target vehicle id; defaults to the first vehicle',
  })
  vehicleId?: string;

  @ApiProperty({ enum: MAINTENANCE_TYPES, example: 'oil_change' })
  type!: MaintenanceType;

  @ApiProperty({ example: 'Oil and filter change' })
  description!: string;

  @ApiPropertyOptional({ type: [String], example: ['10W40 oil', 'oil filter'] })
  items?: string[];

  @ApiPropertyOptional({ nullable: true, example: 45 })
  cost?: number | null;

  @ApiPropertyOptional({ nullable: true, example: 'USD' })
  currency?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 62400 })
  mileage?: number | null;

  @ApiPropertyOptional({
    example: '2026-08-01',
    description: 'ISO date; defaults to today',
  })
  date?: string;

  @ApiPropertyOptional({ nullable: true, example: "Miguel's garage" })
  workshop?: string | null;
}

/** Body for PUT /records/:id — every field optional. */
export class UpdateRecordDto extends PartialType(RecordBodyDto) {}

/** Body for POST /vehicles. */
export class CreateVehicleDto {
  @ApiProperty({ example: 'Toyota' })
  make!: string;

  @ApiProperty({ example: 'Hilux' })
  model!: string;

  @ApiProperty({ example: 2021 })
  year!: number;

  @ApiPropertyOptional({ example: 'ABC-123' })
  plate?: string;

  @ApiPropertyOptional({ example: 30000, default: 0 })
  currentMileage?: number;
}

/** Body for PUT /vehicles/:id — every field optional. */
export class UpdateVehicleDto {
  @ApiPropertyOptional({ example: 'Toyota' })
  make?: string;

  @ApiPropertyOptional({ example: 'Corolla' })
  model?: string;

  @ApiPropertyOptional({ example: 2018 })
  year?: number;

  @ApiPropertyOptional({ example: 'ABC-123' })
  plate?: string;

  @ApiPropertyOptional({ example: 62400 })
  currentMileage?: number;
}

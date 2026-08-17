import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import type {
  DashboardSummary,
  GarageSummary,
  MaintenanceRecord,
  Vehicle,
} from '@hefesto/shared';
import { CreateRecordInput, VehiclesService } from './vehicles.service';
import { MAINTENANCE_TYPES } from './schemas/maintenance-record.schema';
import {
  CreateVehicleDto,
  RecordBodyDto,
  UpdateRecordDto,
  UpdateVehicleDto,
} from './vehicles.dto';

/** Manual-entry validation: reject garbage and future dates outright. */
function parseRecordDate(input?: string): Date {
  if (!input) return new Date();
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`invalid date: "${input}"`);
  }
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  if (date > tomorrow) {
    throw new BadRequestException('date cannot be in the future');
  }
  return date;
}

function assertNonNegative(value: number | null | undefined, field: string) {
  if (value != null && (!Number.isFinite(value) || value < 0)) {
    throw new BadRequestException(`${field} must be a non-negative number`);
  }
}

/**
 * REST surface for vehicles, records, and dashboards. Manual entry is
 * validated strictly here (dates, non-negative numbers) before touching Mongo.
 */
@Controller()
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get('vehicles')
  @ApiTags('vehicle')
  @ApiOperation({ summary: 'List the garage (first vehicle auto-created)' })
  vehiclesList(): Promise<Vehicle[]> {
    return this.vehicles.listVehicles();
  }

  @Post('vehicles')
  @ApiTags('vehicle')
  @ApiOperation({ summary: 'Add a vehicle' })
  createVehicle(@Body() body: CreateVehicleDto): Promise<Vehicle> {
    if (!body.make?.trim() || !body.model?.trim() || !body.year) {
      throw new BadRequestException('make, model and year are required');
    }
    assertNonNegative(body.currentMileage, 'currentMileage');
    return this.vehicles.createVehicle({
      make: body.make.trim(),
      model: body.model.trim(),
      year: Number(body.year),
      plate: body.plate?.trim() || undefined,
      currentMileage: Number(body.currentMileage ?? 0),
    });
  }

  @Put('vehicles/:id')
  @ApiTags('vehicle')
  @ApiOperation({ summary: 'Update a vehicle profile' })
  @ApiParam({ name: 'id' })
  async updateVehicle(
    @Param('id') id: string,
    @Body() body: UpdateVehicleDto,
  ): Promise<Vehicle> {
    assertNonNegative(body.currentMileage, 'currentMileage');
    const updated = await this.vehicles.updateVehicle(id, {
      make: body.make,
      model: body.model,
      year: body.year,
      plate: body.plate,
      currentMileage: body.currentMileage,
    });
    if (!updated) throw new NotFoundException();
    return updated;
  }

  @Delete('vehicles/:id')
  @ApiTags('vehicle')
  @ApiOperation({
    summary: 'Delete a vehicle and its records',
    description: 'The last remaining vehicle cannot be deleted.',
  })
  @ApiParam({ name: 'id' })
  async deleteVehicle(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const deleted = await this.vehicles.deleteVehicle(id);
    if (!deleted) {
      throw new BadRequestException(
        'cannot delete the last vehicle (or vehicle not found)',
      );
    }
    return { deleted };
  }

  @Get('dashboard/garage')
  @ApiTags('dashboard')
  @ApiOperation({
    summary: 'Garage-wide overview',
    description:
      'Totals, per-vehicle spending, and upcoming services across ALL ' +
      'vehicles — the home Panel. Deterministic aggregations, not AI.',
  })
  garage(): Promise<GarageSummary> {
    return this.vehicles.garageSummary();
  }

  @Get('dashboard')
  @ApiTags('dashboard')
  @ApiOperation({
    summary: 'Aggregated summary for one vehicle',
    description:
      'Total and per-type spending (Mongo aggregations), recent records, and ' +
      'upcoming services computed from interval rules — deterministic code, not AI.',
  })
  @ApiQuery({ name: 'vehicleId', required: false })
  dashboard(@Query('vehicleId') vehicleId?: string): Promise<DashboardSummary> {
    return this.vehicles.dashboard(vehicleId);
  }

  @Get('records')
  @ApiTags('records')
  @ApiOperation({ summary: 'List maintenance records (newest first)' })
  @ApiQuery({
    name: 'vehicleId',
    required: false,
    description: 'Filter by vehicle; defaults to the first vehicle',
  })
  async records(
    @Query('vehicleId') vehicleId?: string,
  ): Promise<MaintenanceRecord[]> {
    const id = vehicleId ?? (await this.vehicles.getOrCreateDefault()).id;
    return this.vehicles.listRecords(id, undefined, 200);
  }

  @Post('records')
  @ApiTags('records')
  @ApiOperation({ summary: 'Create a record manually' })
  async createRecord(@Body() body: RecordBodyDto): Promise<MaintenanceRecord> {
    if (!body.type || !MAINTENANCE_TYPES.includes(body.type)) {
      throw new BadRequestException('valid type is required');
    }
    if (!body.description?.trim()) {
      throw new BadRequestException('description is required');
    }
    assertNonNegative(body.cost, 'cost');
    assertNonNegative(body.mileage, 'mileage');
    const vehicle = body.vehicleId
      ? await this.vehicles.getVehicle(body.vehicleId)
      : await this.vehicles.getOrCreateDefault();
    if (!vehicle) throw new NotFoundException('vehicle not found');
    const record = await this.vehicles.createRecord({
      vehicleId: vehicle.id,
      type: body.type,
      description: body.description.trim(),
      items: body.items ?? [],
      cost: body.cost ?? undefined,
      currency: body.cost != null ? (body.currency ?? 'USD') : undefined,
      mileage: body.mileage ?? undefined,
      date: parseRecordDate(body.date),
      workshop: body.workshop ?? undefined,
      source: 'manual',
    });
    if (body.mileage) {
      await this.vehicles.updateMileageIfHigher(vehicle.id, body.mileage);
    }
    return record;
  }

  @Put('records/:id')
  @ApiTags('records')
  @ApiOperation({ summary: 'Update a record' })
  @ApiParam({ name: 'id', description: 'Record id' })
  async updateRecord(
    @Param('id') id: string,
    @Body() body: UpdateRecordDto,
  ): Promise<MaintenanceRecord> {
    const patch: Partial<Omit<CreateRecordInput, 'vehicleId' | 'source'>> = {};
    if (body.type) {
      if (!MAINTENANCE_TYPES.includes(body.type)) {
        throw new BadRequestException('invalid type');
      }
      patch.type = body.type;
    }
    if (body.description !== undefined) {
      patch.description = body.description.trim();
    }
    if (body.items !== undefined) patch.items = body.items;
    assertNonNegative(body.cost, 'cost');
    assertNonNegative(body.mileage, 'mileage');
    if (body.cost !== undefined) patch.cost = body.cost ?? undefined;
    if (body.currency !== undefined)
      patch.currency = body.currency ?? undefined;
    if (body.mileage !== undefined) patch.mileage = body.mileage ?? undefined;
    if (body.workshop !== undefined)
      patch.workshop = body.workshop ?? undefined;
    if (body.date !== undefined) patch.date = parseRecordDate(body.date);

    const updated = await this.vehicles.updateRecord(id, patch);
    if (!updated) throw new NotFoundException();
    return updated;
  }

  @Delete('records/:id')
  @ApiTags('records')
  @ApiOperation({ summary: 'Delete a record' })
  @ApiParam({ name: 'id', description: 'Record id' })
  async deleteRecord(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const deleted = await this.vehicles.deleteRecord(id);
    if (!deleted) throw new NotFoundException();
    return { deleted };
  }
}

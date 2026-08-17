import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type {
  Channel,
  ChatMessage as ChatMessageDto,
  DashboardSummary,
  GarageSummary,
  GarageUpcoming,
  HistoryQuery,
  MaintenanceRecord as RecordDto,
  MaintenanceType,
  RecordSource,
  UpcomingService,
  Vehicle as VehicleDto,
} from '@hefesto/shared';
import { Vehicle, VehicleDocument } from './schemas/vehicle.schema';
import {
  MaintenanceRecord,
  MaintenanceRecordDocument,
} from './schemas/maintenance-record.schema';
import {
  ChatMessage,
  ChatMessageDocument,
} from './schemas/chat-message.schema';

interface RecordFilter {
  vehicleId?: Types.ObjectId;
  type?: string;
  date?: { $gte?: Date; $lt?: Date; $lte?: Date };
}

/** Service-level input for creating a vehicle. */
export interface CreateVehicleInput {
  make: string;
  model: string;
  year: number;
  plate?: string;
  currentMileage: number;
}

/** Simple interval rules for anticipating services (PRD F4: code, not AI). */
const SERVICE_INTERVALS: Partial<
  Record<MaintenanceType, { km?: number; months?: number; label: string }>
> = {
  oil_change: { km: 5000, months: 6, label: 'Oil change' },
  tires: { km: 10000, label: 'Tire rotation' },
  brakes: { km: 20000, label: 'Brake check' },
  battery: { months: 36, label: 'Battery replacement' },
  inspection: { months: 12, label: 'Inspection' },
};

/** Service-level input for persisting a maintenance record. */
export interface CreateRecordInput {
  vehicleId: string;
  type: MaintenanceType;
  description: string;
  items: string[];
  cost?: number;
  currency?: string;
  mileage?: number;
  date: Date;
  workshop?: string;
  source: RecordSource;
  aiConfidence?: number;
  rawMessage?: string;
}

/**
 * Mongo-backed domain logic: garage CRUD, records, and the deterministic
 * dashboard/upcoming aggregations. The AI never computes these numbers.
 */
@Injectable()
export class VehiclesService {
  constructor(
    @InjectModel(Vehicle.name)
    private readonly vehicleModel: Model<Vehicle>,
    @InjectModel(MaintenanceRecord.name)
    private readonly recordModel: Model<MaintenanceRecord>,
    @InjectModel(ChatMessage.name)
    private readonly messageModel: Model<ChatMessage>,
  ) {}

  // ── Vehicles (multi-car garage) ─────────────────────────────────────

  /** Bootstrap: guarantees at least one vehicle and returns the first. */
  async getOrCreateDefault(): Promise<VehicleDto> {
    let doc = await this.vehicleModel.findOne().sort({ createdAt: 1 }).exec();
    if (!doc) {
      // Memoized so the burst of parallel requests on a cold first boot
      // can't seed the demo garage twice.
      this.seeding ??= this.seedDemoGarage();
      doc = await this.seeding;
    }
    return this.toVehicleDto(doc);
  }

  private seeding: Promise<VehicleDocument> | null = null;

  /**
   * Fresh database only (no vehicles at all): seed a small demo garage so the
   * very first screen already tells the product story — populated dashboard,
   * upcoming services, per-car history. Never runs again once anything exists;
   * demo cars are ordinary records the user can edit or delete.
   */
  private async seedDemoGarage(): Promise<VehicleDocument> {
    const corolla = await this.vehicleModel.create({
      make: 'Toyota',
      model: 'Corolla',
      year: 2018,
      currentMileage: 62400,
    });
    const hilux = await this.vehicleModel.create({
      make: 'Toyota',
      model: 'Hilux',
      year: 2021,
      currentMileage: 48100,
    });

    const monthsAgo = (n: number): Date => {
      const d = new Date();
      d.setMonth(d.getMonth() - n);
      return d;
    };
    const rec = (
      vehicle: VehicleDocument,
      type: MaintenanceType,
      description: string,
      cost: number,
      mileage: number,
      date: Date,
      workshop?: string,
    ) => ({
      vehicleId: vehicle._id,
      type,
      description,
      items: [],
      cost,
      currency: 'USD',
      mileage,
      date,
      workshop,
      source: 'manual' as RecordSource,
    });

    await this.recordModel.insertMany([
      // Corolla: oil change slightly overdue so "due now" shows on first boot.
      rec(
        corolla,
        'oil_change',
        'Oil and filter change',
        45,
        57200,
        monthsAgo(4),
        'QuickLube',
      ),
      rec(corolla, 'tires', 'Two new front tires', 180, 54300, monthsAgo(8)),
      rec(
        corolla,
        'brakes',
        'Front brake pads replaced',
        95,
        46100,
        monthsAgo(14),
        'Brakes & Co',
      ),
      rec(corolla, 'battery', 'New battery', 120, 38900, monthsAgo(20)),
      rec(
        hilux,
        'oil_change',
        'Oil change, synthetic',
        60,
        45500,
        monthsAgo(2),
        'QuickLube',
      ),
      rec(
        hilux,
        'repair',
        'Radiator hose replacement',
        85,
        44200,
        monthsAgo(3),
      ),
      rec(hilux, 'inspection', 'Annual inspection', 30, 40800, monthsAgo(10)),
    ]);
    return corolla;
  }

  async listVehicles(): Promise<VehicleDto[]> {
    await this.getOrCreateDefault();
    const docs = await this.vehicleModel.find().sort({ createdAt: 1 }).exec();
    return docs.map((d) => this.toVehicleDto(d));
  }

  async createVehicle(input: CreateVehicleInput): Promise<VehicleDto> {
    const doc = await this.vehicleModel.create(input);
    return this.toVehicleDto(doc);
  }

  async getVehicle(id: string): Promise<VehicleDto | null> {
    const doc = await this.vehicleModel.findById(id).exec();
    return doc ? this.toVehicleDto(doc) : null;
  }

  /** Deletes a vehicle and its records. The last vehicle cannot be deleted. */
  async deleteVehicle(id: string): Promise<boolean> {
    const count = await this.vehicleModel.countDocuments().exec();
    if (count <= 1) return false;
    const res = await this.vehicleModel.deleteOne({ _id: id }).exec();
    if (res.deletedCount === 0) return false;
    await this.recordModel
      .deleteMany({ vehicleId: new Types.ObjectId(id) })
      .exec();
    return true;
  }

  async updateVehicle(
    vehicleId: string,
    patch: Partial<
      Pick<VehicleDto, 'make' | 'model' | 'year' | 'plate' | 'currentMileage'>
    >,
  ): Promise<VehicleDto | null> {
    const doc = await this.vehicleModel
      .findByIdAndUpdate(vehicleId, { $set: patch }, { new: true })
      .exec();
    return doc ? this.toVehicleDto(doc) : null;
  }

  async updateMileageIfHigher(vehicleId: string, mileage: number) {
    await this.vehicleModel
      .updateOne(
        { _id: vehicleId, currentMileage: { $lt: mileage } },
        { $set: { currentMileage: mileage } },
      )
      .exec();
  }

  // ── Maintenance records ─────────────────────────────────────────────

  async createRecord(input: CreateRecordInput): Promise<RecordDto> {
    const doc = await this.recordModel.create({
      ...input,
      vehicleId: new Types.ObjectId(input.vehicleId),
    });
    return this.toRecordDto(doc);
  }

  /** Most recently created record across the garage (for chat follow-ups). */
  async latestRecord(): Promise<RecordDto | null> {
    const doc = await this.recordModel.findOne().sort({ createdAt: -1 }).exec();
    return doc ? this.toRecordDto(doc) : null;
  }

  async updateRecord(
    id: string,
    patch: Partial<Omit<CreateRecordInput, 'source'>>,
  ): Promise<RecordDto | null> {
    const { vehicleId, ...rest } = patch;
    const $set: Record<string, unknown> = { ...rest };
    if (vehicleId) $set.vehicleId = new Types.ObjectId(vehicleId);
    const doc = await this.recordModel
      .findByIdAndUpdate(id, { $set }, { new: true })
      .exec();
    return doc ? this.toRecordDto(doc) : null;
  }

  async deleteRecord(id: string): Promise<boolean> {
    const res = await this.recordModel.deleteOne({ _id: id }).exec();
    return res.deletedCount > 0;
  }

  async listRecords(
    vehicleId: string | undefined,
    filters?: HistoryQuery['filters'],
    limit = 10,
  ): Promise<RecordDto[]> {
    const docs = await this.recordModel
      .find(this.recordFilter(vehicleId, filters))
      .sort({ date: -1 })
      .limit(limit)
      .exec();
    return docs.map((d) => this.toRecordDto(d));
  }

  async totalCost(
    vehicleId: string | undefined,
    filters?: HistoryQuery['filters'],
  ): Promise<{ total: number; count: number; currency: string }> {
    const rows = await this.recordModel.aggregate<{
      total: number;
      count: number;
      currency?: string;
    }>([
      {
        $match: { ...this.recordFilter(vehicleId, filters), cost: { $gt: 0 } },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$cost' },
          count: { $sum: 1 },
          currency: { $first: '$currency' },
        },
      },
    ]);
    const row = rows[0];
    return {
      total: row?.total ?? 0,
      count: row?.count ?? 0,
      currency: row?.currency ?? 'USD',
    };
  }

  async lastService(
    vehicleId: string | undefined,
    type?: MaintenanceType,
  ): Promise<RecordDto | null> {
    const doc = await this.recordModel
      .findOne(this.recordFilter(vehicleId, type ? { type } : undefined))
      .sort({ date: -1 })
      .exec();
    return doc ? this.toRecordDto(doc) : null;
  }

  // ── Dashboard ───────────────────────────────────────────────────────

  async dashboard(vehicleId?: string): Promise<DashboardSummary> {
    const vehicle = vehicleId
      ? ((await this.getVehicle(vehicleId)) ??
        (await this.getOrCreateDefault()))
      : await this.getOrCreateDefault();

    const [totals, byType, recent] = await Promise.all([
      this.totalCost(vehicle.id),
      this.spendByType(vehicle.id),
      this.listRecords(vehicle.id, undefined, 8),
    ]);

    return {
      vehicle,
      recordCount: await this.recordModel
        .countDocuments({ vehicleId: new Types.ObjectId(vehicle.id) })
        .exec(),
      totalSpend: totals.total,
      spendByType: byType,
      upcoming: await this.upcomingServices(vehicle),
      recent,
    };
  }

  /**
   * Garage-wide overview: totals and upcoming across ALL vehicles.
   * Per-vehicle dashboards live in `dashboard()`; this feeds the Panel.
   */
  async garageSummary(): Promise<GarageSummary> {
    const vehicles = await this.listVehicles();
    if (vehicles.length === 0) vehicles.push(await this.getOrCreateDefault());

    const perVehicle = await Promise.all(
      vehicles.map(async (v) => ({
        vehicle: v,
        total: (await this.totalCost(v.id)).total,
        upcoming: await this.upcomingServices(v),
      })),
    );

    const [totals, recent, recordCount] = await Promise.all([
      this.totalCost(undefined),
      this.listRecords(undefined, undefined, 8),
      this.recordModel.countDocuments({}).exec(),
    ]);

    const upcoming: GarageUpcoming[] = perVehicle
      .flatMap((p) =>
        p.upcoming.map((u) => ({
          ...u,
          vehicleId: p.vehicle.id,
          vehicleLabel: `${p.vehicle.make} ${p.vehicle.model}`,
          vehicleMileage: p.vehicle.currentMileage,
        })),
      )
      // Urgency across cars can't compare absolute due-km (a truck at 200k km
      // vs a city car at 30k km): rank by km remaining for THIS car, and turn
      // date-only rules into pseudo-km at ~40 km/day so both kinds interleave.
      .sort((a, b) => this.urgencyScore(a) - this.urgencyScore(b))
      .slice(0, 8);

    return {
      vehicleCount: vehicles.length,
      recordCount,
      totalSpend: totals.total,
      spendByVehicle: perVehicle
        .map((p) => ({
          vehicleId: p.vehicle.id,
          label: `${p.vehicle.make} ${p.vehicle.model}`,
          total: p.total,
        }))
        .sort((a, b) => b.total - a.total),
      upcoming,
      recent,
    };
  }

  private urgencyScore(u: GarageUpcoming): number {
    const kmLeft =
      u.dueMileage != null ? u.dueMileage - u.vehicleMileage : Infinity;
    const daysLeft = u.dueDate
      ? (new Date(u.dueDate).getTime() - Date.now()) / 86_400_000
      : Infinity;
    return Math.min(kmLeft, daysLeft * 40);
  }

  private async spendByType(
    vehicleId: string,
  ): Promise<Partial<Record<MaintenanceType, number>>> {
    const rows = await this.recordModel.aggregate<{
      _id: string;
      total: number;
    }>([
      {
        $match: {
          vehicleId: new Types.ObjectId(vehicleId),
          cost: { $gt: 0 },
        },
      },
      { $group: { _id: '$type', total: { $sum: '$cost' } } },
    ]);
    const result: Partial<Record<MaintenanceType, number>> = {};
    for (const row of rows) result[row._id as MaintenanceType] = row.total;
    return result;
  }

  private async upcomingServices(
    vehicle: VehicleDto,
  ): Promise<UpcomingService[]> {
    const upcoming: UpcomingService[] = [];
    for (const [type, rule] of Object.entries(SERVICE_INTERVALS)) {
      const last = await this.lastService(vehicle.id, type as MaintenanceType);
      if (!last) continue;

      const entry: UpcomingService = {
        type: type as MaintenanceType,
        label: rule.label,
        lastDate: last.date,
        lastMileage: last.mileage,
        basedOn: `Last one ${last.date.slice(0, 10)}${last.mileage ? ` at ${last.mileage.toLocaleString('en-US')} km` : ''}`,
      };
      if (rule.km && last.mileage) entry.dueMileage = last.mileage + rule.km;
      if (rule.months) {
        const due = new Date(last.date);
        due.setMonth(due.getMonth() + rule.months);
        entry.dueDate = due.toISOString();
      }
      if (entry.dueMileage || entry.dueDate) upcoming.push(entry);
    }
    // Soonest first: overdue-by-mileage floats up naturally via due km.
    return upcoming.sort((a, b) => {
      const av = a.dueMileage ?? Number.MAX_SAFE_INTEGER;
      const bv = b.dueMileage ?? Number.MAX_SAFE_INTEGER;
      return av !== bv
        ? av - bv
        : (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');
    });
  }

  private recordFilter(
    vehicleId: string | undefined,
    filters?: HistoryQuery['filters'],
  ): RecordFilter {
    const query: RecordFilter = {};
    if (vehicleId) query.vehicleId = new Types.ObjectId(vehicleId);
    if (filters?.type) query.type = filters.type;
    if (filters?.year) {
      query.date = {
        $gte: new Date(Date.UTC(filters.year, 0, 1)),
        $lt: new Date(Date.UTC(filters.year + 1, 0, 1)),
      };
    } else if (filters?.fromDate || filters?.toDate) {
      query.date = {};
      if (filters.fromDate) query.date.$gte = new Date(filters.fromDate);
      if (filters.toDate) query.date.$lte = new Date(filters.toDate);
    }
    return query;
  }

  // ── Chat history ────────────────────────────────────────────────────

  async saveChatMessage(
    channel: Channel,
    role: 'user' | 'assistant',
    content: string,
    recordId?: string,
  ): Promise<ChatMessageDto> {
    const doc = await this.messageModel.create({
      channel,
      role,
      content,
      recordId: recordId ? new Types.ObjectId(recordId) : undefined,
    });
    return this.toMessageDto(doc);
  }

  /** Recent messages across all channels (shared brain), oldest first. */
  async recentMessages(limit = 10): Promise<ChatMessageDto[]> {
    const docs = await this.messageModel
      .find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
    return docs.reverse().map((d) => this.toMessageDto(d));
  }

  // ── DTO mapping ─────────────────────────────────────────────────────

  private toVehicleDto(doc: VehicleDocument): VehicleDto {
    return {
      id: doc.id,
      make: doc.make,
      model: doc.model,
      year: doc.year,
      plate: doc.plate,
      currentMileage: doc.currentMileage,
      createdAt: doc.createdAt.toISOString(),
    };
  }

  private toRecordDto(doc: MaintenanceRecordDocument): RecordDto {
    return {
      id: doc.id,
      vehicleId: doc.vehicleId.toString(),
      type: doc.type as RecordDto['type'],
      description: doc.description,
      items: doc.items,
      cost: doc.cost,
      currency: doc.currency,
      mileage: doc.mileage,
      date: doc.date.toISOString(),
      workshop: doc.workshop,
      source: doc.source as RecordDto['source'],
      aiConfidence: doc.aiConfidence,
      rawMessage: doc.rawMessage,
      createdAt: doc.createdAt.toISOString(),
    };
  }

  private toMessageDto(doc: ChatMessageDocument): ChatMessageDto {
    return {
      id: doc.id,
      channel: doc.channel as ChatMessageDto['channel'],
      role: doc.role as ChatMessageDto['role'],
      content: doc.content,
      recordId: doc.recordId?.toString(),
      createdAt: doc.createdAt.toISOString(),
    };
  }
}

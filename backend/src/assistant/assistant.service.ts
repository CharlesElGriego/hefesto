import { Injectable, Logger } from '@nestjs/common';
import type {
  Channel,
  ChatResponse,
  HistoryQuery,
  MaintenanceRecord,
  Vehicle,
} from '@hefesto/shared';
import {
  CreateRecordInput,
  VehiclesService,
} from '../vehicles/vehicles.service';
import { ClaudeService } from './claude.service';
import { AssistantAction } from './assistant.schemas';
import * as guards from './assistant.utils';
import { isSpanish } from './assistant.utils';

interface PendingLog {
  input: Omit<CreateRecordInput, 'vehicleId'>;
  createdAt: number;
  spanish: boolean;
}

const PENDING_TTL_MS = 5 * 60_000;

/**
 * The channel-agnostic core (PRD §5): web chat and WhatsApp both call
 * handleMessage(). The AI extracts and classifies; every number the user
 * sees comes from a real Mongo query, never from the model.
 */
@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  /**
   * Logs waiting for a "which car?" answer, per channel. Deterministic: when
   * the user answers with a car name, the pending record is completed in code
   * — no second AI extraction, so no chance of fabricated fields.
   */
  private readonly pendingLogs = new Map<Channel, PendingLog>();

  constructor(
    private readonly vehicles: VehiclesService,
    private readonly claude: ClaudeService,
  ) {}

  async handleMessage(channel: Channel, text: string): Promise<ChatResponse> {
    this.logger.log(`[${channel}] user: "${text.slice(0, 120)}"`);
    const garage = await this.vehicles.listVehicles();
    const history = await this.vehicles.recentMessages(10);
    await this.vehicles.saveChatMessage(channel, 'user', text);

    // Pending "which car?" flow: if the answer names one of the cars,
    // complete the held record right here.
    const pending = this.pendingLogs.get(channel);
    if (pending) {
      this.pendingLogs.delete(channel);
      if (Date.now() - pending.createdAt < PENDING_TTL_MS) {
        const target = this.matchVehicle(text, garage);
        if (target) {
          const record = await this.vehicles.createRecord({
            ...pending.input,
            vehicleId: target.id,
          });
          if (pending.input.mileage) {
            await this.vehicles.updateMileageIfHigher(
              target.id,
              pending.input.mileage,
            );
          }
          const cost =
            pending.input.cost != null
              ? ` — $${pending.input.cost.toFixed(2)}`
              : '';
          const reply = pending.spanish
            ? `✅ Registrado en tu ${target.make} ${target.model}: ${pending.input.description}${cost}.`
            : `✅ Logged on your ${target.make} ${target.model}: ${pending.input.description}${cost}.`;
          await this.vehicles.saveChatMessage(
            channel,
            'assistant',
            reply,
            record.id,
          );
          this.logger.log(
            `[${channel}] pending log completed on ${target.model} (${record.id})`,
          );
          return { reply, record };
        }
      }
    }

    let action: AssistantAction;
    try {
      action = await this.claude.decide(text, history, garage);
      this.logger.log(
        `[${channel}] intent=${action.intent}` +
          (action.intent === 'log_maintenance'
            ? ` type=${action.record.type} confidence=${action.confidence}`
            : action.intent === 'query_history'
              ? ` kind=${action.query.kind}`
              : ''),
      );
    } catch (error) {
      this.logger.error(`Assistant pipeline failed: ${String(error)}`);
      const reply = isSpanish(text)
        ? 'Uy — tuve un problema procesando eso. No se guardó nada. Intenta de nuevo.'
        : 'Sorry — I had trouble processing that. Nothing was saved. Please try again.';
      await this.vehicles.saveChatMessage(channel, 'assistant', reply);
      return { reply };
    }

    let reply: string;
    let record: MaintenanceRecord | undefined;

    switch (action.intent) {
      case 'log_maintenance': {
        const r = action.record;
        // Anti-fabrication net: numeric fields only count if the number is
        // actually present in the user's CURRENT message (the model sometimes
        // carries them over from history despite instructions).
        const cost = this.verifiedNumber(r.cost, text, 'cost');
        const mileage = this.verifiedNumber(r.mileage, text, 'mileage');
        const input: Omit<CreateRecordInput, 'vehicleId'> = {
          type: r.type,
          description: r.description,
          items: r.items,
          cost,
          currency: cost != null ? (r.currency ?? 'USD') : undefined,
          mileage,
          date: this.safeDate(r.date),
          workshop: r.workshop ?? undefined,
          source: channel === 'whatsapp' ? 'whatsapp' : 'chat',
          aiConfidence: action.confidence,
          rawMessage: text,
        };
        // Backend-enforced guardrail: with several cars and no clear target,
        // never guess — hold the record and ask. (The prompt also instructs
        // this; this is the net.)
        if (
          garage.length > 1 &&
          (!r.vehicleIndex || !garage[r.vehicleIndex - 1])
        ) {
          const spanish = isSpanish(text);
          this.pendingLogs.set(channel, {
            input,
            createdAt: Date.now(),
            spanish,
          });
          const names = garage
            .map((v) => `${v.make} ${v.model} ${v.year}`)
            .join(', ');
          reply = spanish
            ? `¿En cuál de tus carros fue? (${names})`
            : `Which of your cars was it? (${names})`;
          this.logger.warn(
            `[${channel}] log without clear vehicle — held as pending and asked`,
          );
          break;
        }
        const target =
          r.vehicleIndex && garage[r.vehicleIndex - 1]
            ? garage[r.vehicleIndex - 1]
            : garage[0];
        record = await this.vehicles.createRecord({
          ...input,
          vehicleId: target.id,
        });
        if (mileage) {
          await this.vehicles.updateMileageIfHigher(target.id, mileage);
        }
        this.logger.log(`[${channel}] record ${record.id} saved (${r.type})`);
        reply = action.reply;
        break;
      }
      case 'query_history': {
        const f = action.query.filters;
        const filters: HistoryQuery['filters'] = f
          ? {
              type: f.type ?? undefined,
              year: f.year ?? undefined,
              fromDate: f.fromDate ?? undefined,
              toDate: f.toDate ?? undefined,
            }
          : undefined;
        const queryVehicleId =
          action.query.vehicleIndex && garage[action.query.vehicleIndex - 1]
            ? garage[action.query.vehicleIndex - 1].id
            : undefined; // undefined = across the whole garage
        const result = await this.runQuery(
          queryVehicleId,
          action.query.kind,
          filters,
          garage,
          channel,
        );
        this.logger.log(
          `[${channel}] query ${action.query.kind} → "${result.slice(0, 80).replace(/\n/g, ' ')}"`,
        );
        reply = action.reply_template.includes('{{result}}')
          ? action.reply_template.replace('{{result}}', result)
          : `${action.reply_template} ${result}`;
        break;
      }
      case 'amend_last_record': {
        const last = await this.vehicles.latestRecord();
        if (!last) {
          reply = action.reply;
          break;
        }
        const f = action.fields;
        const patch: Parameters<VehiclesService['updateRecord']>[1] = {};
        if (f.vehicleIndex && garage[f.vehicleIndex - 1]) {
          patch.vehicleId = garage[f.vehicleIndex - 1].id;
        }
        if (f.type) patch.type = f.type;
        if (f.description) patch.description = f.description;
        const amendCost = this.verifiedNumber(f.cost, text, 'cost');
        const amendMileage = this.verifiedNumber(f.mileage, text, 'mileage');
        if (amendCost != null) {
          patch.cost = amendCost;
          patch.currency = f.currency ?? last.currency ?? 'USD';
        }
        if (amendMileage != null) patch.mileage = amendMileage;
        if (f.date) patch.date = this.safeDate(f.date);
        if (f.workshop) patch.workshop = f.workshop;

        record =
          (await this.vehicles.updateRecord(last.id, patch)) ?? undefined;
        if (amendMileage != null) {
          // The record may have just been MOVED to another car — the odometer
          // update belongs to wherever the record ended up.
          const mileageVehicleId = patch.vehicleId ?? last.vehicleId;
          await this.vehicles.updateMileageIfHigher(
            mileageVehicleId,
            amendMileage,
          );
        }
        this.logger.log(
          `[${channel}] record ${last.id} amended (${Object.keys(patch).join(',')})`,
        );
        reply = action.reply;
        break;
      }
      case 'add_vehicle': {
        const v = action.vehicle;
        // Year and mileage go through the same anti-fabrication net.
        const year = this.verifiedNumber(v.year, text, 'year');
        const mileage = this.verifiedNumber(
          v.currentMileage,
          text,
          'currentMileage',
        );
        // Update mode: the model points at an existing car to correct its
        // profile ("the Sorento is actually a 2019, 0 km").
        const target = v.vehicleIndex
          ? garage[v.vehicleIndex - 1]
          : undefined;
        if (target) {
          const patch: Partial<
            Pick<
              Vehicle,
              'make' | 'model' | 'year' | 'plate' | 'currentMileage'
            >
          > = {};
          if (v.make?.trim()) patch.make = v.make.trim();
          if (v.model?.trim()) patch.model = v.model.trim();
          if (year) patch.year = year;
          if (mileage !== undefined) patch.currentMileage = mileage;
          if (v.plate?.trim()) patch.plate = v.plate.trim();
          if (Object.keys(patch).length === 0) {
            reply = isSpanish(text)
              ? 'No encontré ningún dato nuevo verificable en tu mensaje — dime por ejemplo "es un 2019 con 0 km".'
              : 'I couldn\'t find any verifiable new value in your message — tell me e.g. "it\'s a 2019 with 0 km".';
            break;
          }
          await this.vehicles.updateVehicle(target.id, patch);
          this.logger.log(
            `[${channel}] vehicle updated via chat: ${target.make} ${target.model} (${target.id}) patch=${JSON.stringify(patch)}`,
          );
          reply = action.reply;
          break;
        }
        if (!v.make?.trim() || !v.model?.trim() || !year) {
          reply = isSpanish(text)
            ? 'Para agregarlo necesito marca, modelo y año — ej: "agrega mi Toyota Hilux 2021".'
            : 'To add it I need make, model and year — e.g. "add my Toyota Hilux 2021".';
          break;
        }
        const created = await this.vehicles.createVehicle({
          make: v.make.trim(),
          model: v.model.trim(),
          year,
          plate: v.plate?.trim() || undefined,
          currentMileage: mileage ?? 0,
        });
        this.logger.log(
          `[${channel}] vehicle added via chat: ${created.make} ${created.model} ${created.year} (${created.id})`,
        );
        reply = action.reply;
        break;
      }
      case 'general':
        reply = action.reply;
        break;
    }

    await this.vehicles.saveChatMessage(
      channel,
      'assistant',
      reply,
      record?.id,
    );
    return { reply, record };
  }

  /** Executes history queries against Mongo and formats the result per channel. */
  private async runQuery(
    vehicleId: string | undefined,
    kind: HistoryQuery['kind'],
    filters: HistoryQuery['filters'] | undefined,
    garage: Vehicle[],
    channel: Channel,
  ): Promise<string> {
    // WhatsApp renders *bold*; the web chat shows plain text.
    const b = (s: string) => (channel === 'whatsapp' ? `*${s}*` : s);

    switch (kind) {
      case 'total_cost': {
        const { total, count, currency } = await this.vehicles.totalCost(
          vehicleId,
          filters,
        );
        if (count === 0) return this.money(0, currency);
        let result = `${this.money(total, currency)} (${count} ${count === 1 ? 'record' : 'records'})`;
        // Whole-garage question → add the per-car split inline.
        if (!vehicleId && garage.length > 1) {
          const parts: string[] = [];
          for (const v of garage) {
            const t = await this.vehicles.totalCost(v.id, filters);
            if (t.count > 0)
              parts.push(`${v.model} ${this.money(t.total, t.currency)}`);
          }
          if (parts.length > 1) result += ` — ${parts.join(' · ')}`;
        }
        return result;
      }
      case 'last_service': {
        const last = await this.vehicles.lastService(vehicleId, filters?.type);
        if (!last) return '—';
        return this.describeRecord(last);
      }
      case 'history_filter': {
        const records = await this.vehicles.listRecords(vehicleId, filters, 15);
        if (records.length === 0) return '—';

        // Group by vehicle (garage order), subtotal each, grand-total at the end.
        const sections: string[] = [];
        let grandTotal = 0;
        let grandCount = 0;
        for (const v of garage) {
          const rows = records.filter((r) => r.vehicleId === v.id);
          if (rows.length === 0) continue;
          const lines = rows.map((r) => `• ${this.recordLine(r)}`);
          const subtotal = rows.reduce((sum, r) => sum + (r.cost ?? 0), 0);
          grandTotal += subtotal;
          grandCount += rows.length;
          sections.push(
            `🚗 ${b(`${v.make} ${v.model} ${v.year}`)}\n${lines.join('\n')}\n${b(`Subtotal: ${this.money(subtotal, 'USD')}`)}`,
          );
        }
        let out = `\n\n${sections.join('\n\n')}`;
        if (sections.length > 1) {
          out += `\n\n${b(`Total: ${this.money(grandTotal, 'USD')} (${grandCount} ${grandCount === 1 ? 'record' : 'records'})`)}`;
        }
        return out;
      }
    }
  }

  /** Compact one-liner for grouped lists: date · description · cost (km). */
  private recordLine(r: MaintenanceRecord): string {
    const parts = [r.date.slice(0, 10), r.description];
    if (r.cost != null) parts.push(this.money(r.cost, r.currency ?? 'USD'));
    let line = parts.join(' · ');
    if (r.mileage) line += ` (${r.mileage.toLocaleString('en-US')} km)`;
    return line;
  }

  private describeRecord(r: MaintenanceRecord): string {
    const parts = [r.description, r.date.slice(0, 10)];
    if (r.mileage) parts.push(`${r.mileage.toLocaleString('en-US')} km`);
    if (r.cost != null) parts.push(this.money(r.cost, r.currency ?? 'USD'));
    return parts.join(' · ');
  }

  /** See assistant.utils.ts — thin wrappers that add logging. */
  private matchVehicle(text: string, garage: Vehicle[]): Vehicle | null {
    return guards.matchVehicle(text, garage);
  }

  private verifiedNumber(
    value: number | null | undefined,
    text: string,
    field: string,
  ): number | undefined {
    const verified = guards.verifiedNumber(value, text);
    if (verified === undefined && value != null) {
      this.logger.warn(
        `AI produced ${field}=${value} not present in the message — dropped`,
      );
    }
    return verified;
  }

  private safeDate(input?: string | null): Date {
    const now = new Date();
    const date = guards.safeDate(input, now);
    if (input && date === now) {
      this.logger.warn(
        `AI produced invalid/future date "${input}" — using today`,
      );
    }
    return date;
  }

  private money(amount: number, currency: string): string {
    const symbol = currency === 'USD' ? '$' : `${currency} `;
    return `${symbol}${amount.toFixed(2)}`;
  }
}

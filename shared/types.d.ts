/**
 * Hefesto — shared types between frontend (Angular) and backend (NestJS).
 *
 * Types-only declaration file: imported with `import type { ... } from '@hefesto/shared'`
 * via tsconfig path aliases in both apps. Erased at build time, so it needs no
 * build step of its own.
 */

// ── Domain ────────────────────────────────────────────────────────────────

/** Categories a maintenance record can belong to. */
export type MaintenanceType =
  | 'oil_change'
  | 'tires'
  | 'brakes'
  | 'battery'
  | 'inspection'
  | 'repair'
  | 'other';

/** Where a conversation happens. */
export type Channel = 'web' | 'whatsapp';
export type RecordSource = 'chat' | 'whatsapp' | 'manual';

/** A car in the garage. */
export interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  plate?: string;
  currentMileage: number;
  createdAt: string;
}

/** One maintenance event in a vehicle's history. */
export interface MaintenanceRecord {
  id: string;
  vehicleId: string;
  type: MaintenanceType;
  description: string;
  items: string[];
  cost?: number;
  currency?: string;
  mileage?: number;
  date: string;
  workshop?: string;
  source: RecordSource;
  /** Confidence reported by the AI extraction (0–1), absent for manual records. */
  aiConfidence?: number;
  /** Original user message that produced this record, for traceability. */
  rawMessage?: string;
  createdAt: string;
}

/** Persisted transcript message. */
export interface ChatMessage {
  id: string;
  channel: Channel;
  role: 'user' | 'assistant';
  content: string;
  /** Links an assistant message to the record it created. */
  recordId?: string;
  createdAt: string;
}

// ── Assistant contract (Claude structured output) ────────────────────────

/** Fields the model extracts from a message when logging maintenance. */
export interface ExtractedRecord {
  type: MaintenanceType;
  description: string;
  items: string[];
  cost?: number;
  currency?: string;
  mileage?: number;
  date?: string;
  workshop?: string;
}

/** Supported history-question shapes. */
export type HistoryQueryKind = 'total_cost' | 'last_service' | 'history_filter';

/** Structured history question; the backend turns it into Mongo queries. */
export interface HistoryQuery {
  kind: HistoryQueryKind;
  filters?: {
    type?: MaintenanceType;
    year?: number;
    fromDate?: string;
    toDate?: string;
  };
}

/** The assistant contract: every model response is exactly one of these. */
export type AssistantAction =
  | {
      intent: 'log_maintenance';
      record: ExtractedRecord;
      confidence: number;
      reply: string;
    }
  | {
      intent: 'query_history';
      query: HistoryQuery;
      reply_template: string;
    }
  | {
      intent: 'general';
      reply: string;
    };

// ── API DTOs ──────────────────────────────────────────────────────────────

/** Body for POST /chat. */
export interface ChatRequest {
  message: string;
}

/** POST /chat result: the reply, plus the record it created if any. */
export interface ChatResponse {
  reply: string;
  record?: MaintenanceRecord;
}

/** A projected service, computed from interval rules over the last record. */
export interface UpcomingService {
  type: MaintenanceType;
  label: string;
  dueMileage?: number;
  dueDate?: string;
  /** Raw facts of the record this projection is based on — the UI localizes. */
  lastDate: string;
  lastMileage?: number;
  /** @deprecated English-only composed string; prefer lastDate/lastMileage. */
  basedOn: string;
}

/** An upcoming service, tagged with the car it belongs to. */
export interface GarageUpcoming extends UpcomingService {
  vehicleId: string;
  vehicleLabel: string;
  /** Current mileage of that vehicle, so the UI can judge overdue. */
  vehicleMileage: number;
}

/** Total spend for one vehicle (Panel bars). */
export interface VehicleSpend {
  vehicleId: string;
  label: string;
  total: number;
}

/** Garage-wide overview: every car, one screen. */
export interface GarageSummary {
  vehicleCount: number;
  recordCount: number;
  totalSpend: number;
  spendByVehicle: VehicleSpend[];
  upcoming: GarageUpcoming[];
  recent: MaintenanceRecord[];
}

/** Per-vehicle dashboard payload. */
export interface DashboardSummary {
  vehicle: Vehicle;
  recordCount: number;
  totalSpend: number;
  spendByType: Partial<Record<MaintenanceType, number>>;
  upcoming: UpcomingService[];
  recent: MaintenanceRecord[];
}

/** Connection state of the WhatsApp channel. */
export interface WhatsappStatus {
  connected: boolean;
  connecting: boolean;
  /** Phone number of the linked account, when connected. */
  number?: string;
  /**
   * Numbers explicitly authorized to talk to Hefesto (besides the account's
   * own self-chat, which always works). Managed from the Connect screen.
   */
  allowedNumbers?: string[];
}

/** GET /health payload. */
export interface HealthStatus {
  ok: boolean;
  mongo: 'up' | 'down';
  uptimeSeconds: number;
}

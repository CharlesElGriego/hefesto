import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import type { MaintenanceRecord, MaintenanceType } from '@hefesto/shared';
import { RecordPayload, VehicleApi } from './vehicle-api.service';
import { GarageService } from './garage.service';
import { I18n } from '../../core/i18n.service';
import { ConfirmDialog } from '../../shared/confirm-dialog';

const today = () => new Date().toISOString().slice(0, 10);

/** yyyy-mm-dd strings compare correctly as strings. */
const notFuture = (c: AbstractControl) => (c.value && c.value > today() ? { future: true } : null);

const TYPES: MaintenanceType[] = [
  'oil_change',
  'tires',
  'brakes',
  'battery',
  'inspection',
  'repair',
  'other',
];

/**
 * Master–detail: one car's profile, totals, and full service history with
 * record CRUD. Route: /vehicle/:id.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-vehicle-detail-page',
  imports: [ReactiveFormsModule, RouterLink, ConfirmDialog],
  templateUrl: './vehicle-detail.page.html',
})
export class VehicleDetailPage {
  private readonly api = inject(VehicleApi);
  private readonly i18n = inject(I18n);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly garage = inject(GarageService);
  readonly t = this.i18n.t.bind(this.i18n);

  private readonly vehicleId = toSignal(this.route.paramMap.pipe(map((p) => p.get('id'))));

  readonly vehicle = computed(
    () => this.garage.vehicles().find((v) => v.id === this.vehicleId()) ?? null,
  );

  readonly records = signal<MaintenanceRecord[]>([]);
  readonly loadingRecords = signal(true);

  readonly totalSpend = computed(() => this.records().reduce((sum, r) => sum + (r.cost ?? 0), 0));

  readonly typeOptions = TYPES.map((value) => ({
    value,
    label: this.i18n.t(`type.${value}`),
  }));

  readonly addingRecord = signal(false);
  readonly editingRecordId = signal<string | null>(null);
  readonly confirmDeleteId = signal<string | null>(null);

  readonly pendingDeleteRecord = computed(
    () => this.records().find((r) => r.id === this.confirmDeleteId()) ?? null,
  );

  readonly rf = new FormGroup({
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)],
    }),
    type: new FormControl<MaintenanceType>('oil_change', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    date: new FormControl(today(), {
      nonNullable: true,
      validators: [Validators.required, notFuture],
    }),
    cost: new FormControl<number | null>(null, [Validators.min(0), Validators.max(1_000_000)]),
    mileage: new FormControl<number | null>(null, [Validators.min(0), Validators.max(2_000_000)]),
    workshop: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(80)],
    }),
  });

  constructor() {
    effect(() => {
      const id = this.vehicleId();
      if (!id) return;
      // Opening a car makes it the active context everywhere.
      const known = this.garage.vehicles();
      if (known.length > 0 && !known.some((v) => v.id === id)) {
        void this.router.navigate(['/vehicle']);
        return;
      }
      if (known.some((v) => v.id === id)) this.garage.select(id);
      this.loadRecords(id);
    });
  }

  private loadRecords(vehicleId: string) {
    this.loadingRecords.set(true);
    this.api.records(vehicleId).subscribe((r) => {
      this.records.set(r);
      this.loadingRecords.set(false);
    });
  }

  startAddRecord() {
    this.rf.reset({ date: today() });
    this.editingRecordId.set(null);
    this.addingRecord.set(true);
  }

  startEditRecord(r: MaintenanceRecord) {
    this.rf.reset({
      type: r.type,
      description: r.description,
      cost: r.cost ?? null,
      mileage: r.mileage ?? null,
      date: r.date.slice(0, 10),
      workshop: r.workshop ?? '',
    });
    this.addingRecord.set(false);
    this.editingRecordId.set(r.id);
  }

  errFor(name: keyof typeof this.rf.controls): string | null {
    const c = this.rf.controls[name];
    if (!c.touched || c.valid) return null;
    if (c.hasError('required')) return this.t('err.required');
    if (c.hasError('future')) return this.t('err.future');
    if (c.hasError('maxlength')) return this.t('err.tooLong');
    return this.t('err.nonneg');
  }

  cancelRecordForm() {
    this.addingRecord.set(false);
    this.editingRecordId.set(null);
  }

  submitRecordForm() {
    const id = this.vehicleId();
    if (!id) return;
    if (this.rf.invalid) {
      this.rf.markAllAsTouched();
      return;
    }
    const raw = this.rf.getRawValue();
    const payload: RecordPayload = {
      vehicleId: id,
      type: raw.type,
      description: raw.description.trim(),
      cost: raw.cost !== null ? Number(raw.cost) : null,
      mileage: raw.mileage !== null ? Number(raw.mileage) : null,
      date: raw.date,
      workshop: raw.workshop.trim() || null,
    };
    const editingId = this.editingRecordId();
    const request = editingId
      ? this.api.updateRecord(editingId, payload)
      : this.api.createRecord(payload);
    request.subscribe(() => {
      this.cancelRecordForm();
      this.loadRecords(id);
      this.garage.load(); // mileage may have moved
    });
  }

  deleteRecord(recordId: string) {
    const id = this.vehicleId();
    this.api.deleteRecord(recordId).subscribe(() => {
      this.confirmDeleteId.set(null);
      if (id) this.loadRecords(id);
    });
  }

  glyph(type: MaintenanceType): string {
    const glyphs: Record<MaintenanceType, string> = {
      oil_change: '🛢️',
      tires: '🛞',
      brakes: '🛑',
      battery: '🔋',
      inspection: '🔍',
      repair: '🔧',
      other: '📌',
    };
    return glyphs[type] ?? '📌';
  }

  meta(r: MaintenanceRecord): string {
    const parts = [r.date.slice(0, 10)];
    if (r.mileage) parts.push(`${r.mileage.toLocaleString('en-US')} km`);
    return parts.join(' · ');
  }

  typeLabel(r: MaintenanceRecord): string {
    return this.t(`type.${r.type}`);
  }

  sourceLabel(r: MaintenanceRecord): string {
    return this.t(`src.${r.source === 'chat' ? 'chat' : r.source}`);
  }

  money(v: number): string {
    return `$${v.toFixed(2)}`;
  }
}

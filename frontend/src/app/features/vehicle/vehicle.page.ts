import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import type { Vehicle } from '@hefesto/shared';
import { VehicleApi, VehiclePayload } from './vehicle-api.service';
import { GarageService } from './garage.service';
import { I18n } from '../../core/i18n.service';
import { ConfirmDialog } from '../../shared/confirm-dialog';

/**
 * Garage: responsive card grid of vehicles with add/edit/delete.
 * Tapping a card selects the car and opens its detail page.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-vehicle-page',
  imports: [ReactiveFormsModule, ConfirmDialog],
  templateUrl: './vehicle.page.html',
})
export class VehiclePage {
  private readonly api = inject(VehicleApi);
  private readonly i18n = inject(I18n);
  private readonly router = inject(Router);
  readonly garage = inject(GarageService);
  readonly t = this.i18n.t.bind(this.i18n);

  private readonly currentYear = new Date().getFullYear();

  readonly vf = new FormGroup({
    make: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(40)],
    }),
    model: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(40)],
    }),
    year: new FormControl(this.currentYear, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1950), Validators.max(this.currentYear + 1)],
    }),
    plate: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(12)],
    }),
    currentMileage: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.min(0), Validators.max(2_000_000)],
    }),
  });

  /** null = closed · 'new' = adding · otherwise the vehicle id being edited */
  readonly vehicleFormFor = signal<string | null>(null);
  readonly confirmDeleteVehicleId = signal<string | null>(null);

  readonly pendingDeleteVehicle = computed(
    () => this.garage.vehicles().find((v) => v.id === this.confirmDeleteVehicleId()) ?? null,
  );

  openVehicle(v: Vehicle) {
    this.garage.select(v.id);
    void this.router.navigate(['/vehicle', v.id]);
  }

  startAddVehicle() {
    this.vf.reset({ year: this.currentYear });
    this.vehicleFormFor.set('new');
  }

  startEditVehicle(v: Vehicle) {
    this.vf.reset({
      make: v.make,
      model: v.model,
      year: v.year,
      plate: v.plate ?? '',
      currentMileage: v.currentMileage,
    });
    this.vehicleFormFor.set(v.id);
  }

  errFor(name: keyof typeof this.vf.controls): string | null {
    const c = this.vf.controls[name];
    if (!c.touched || c.valid) return null;
    if (c.hasError('required')) return this.t('err.required');
    if (name === 'year') return this.t('err.year');
    if (c.hasError('maxlength')) return this.t('err.tooLong');
    return this.t('err.nonneg');
  }

  submitVehicle() {
    if (this.vf.invalid) {
      this.vf.markAllAsTouched();
      return;
    }
    const raw = this.vf.getRawValue();
    const payload: VehiclePayload = {
      make: raw.make.trim(),
      model: raw.model.trim(),
      year: Number(raw.year),
      plate: raw.plate.trim() || undefined,
      currentMileage: Number(raw.currentMileage) || 0,
    };
    const mode = this.vehicleFormFor();
    const request =
      mode === 'new' ? this.api.createVehicle(payload) : this.api.updateVehicle(mode!, payload);
    request.subscribe((v) => {
      this.vehicleFormFor.set(null);
      this.garage.load();
      if (mode === 'new') this.garage.select(v.id);
    });
  }

  deleteVehicle(id: string) {
    this.api.deleteVehicle(id).subscribe({
      next: () => {
        this.confirmDeleteVehicleId.set(null);
        this.garage.load();
      },
      error: () => this.confirmDeleteVehicleId.set(null),
    });
  }
}

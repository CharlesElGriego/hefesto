import { computed, inject, Injectable, signal } from '@angular/core';
import type { Vehicle } from '@hefesto/shared';
import { VehicleApi } from './vehicle-api.service';

const STORAGE_KEY = 'hefesto.selectedVehicle';

/** Session-wide garage state: the vehicle list and the currently selected car. */
@Injectable({ providedIn: 'root' })
export class GarageService {
  private readonly api = inject(VehicleApi);

  readonly vehicles = signal<Vehicle[]>([]);
  readonly selectedId = signal<string | null>(localStorage.getItem(STORAGE_KEY));

  readonly selected = computed(
    () => this.vehicles().find((v) => v.id === this.selectedId()) ?? this.vehicles()[0] ?? null,
  );

  readonly multi = computed(() => this.vehicles().length > 1);

  constructor() {
    this.load();
  }

  load() {
    this.api.vehicles().subscribe((vs) => {
      this.vehicles.set(vs);
      if (!vs.some((v) => v.id === this.selectedId())) {
        this.selectedId.set(vs[0]?.id ?? null);
      }
    });
  }

  select(id: string) {
    this.selectedId.set(id);
    localStorage.setItem(STORAGE_KEY, id);
  }

  /** Short label ("Toyota Corolla") for a vehicle id — for record cards. */
  label(vehicleId: string): string {
    const v = this.vehicles().find((x) => x.id === vehicleId);
    return v ? `${v.make} ${v.model}` : '';
  }
}

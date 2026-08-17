import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import type { DashboardSummary, GarageSummary, MaintenanceRecord, Vehicle } from '@hefesto/shared';

/** Request body for the records endpoints. */
export interface RecordPayload {
  vehicleId?: string;
  type: MaintenanceRecord['type'];
  description: string;
  items?: string[];
  cost?: number | null;
  mileage?: number | null;
  date?: string;
  workshop?: string | null;
}

/** Request body for the vehicles endpoints. */
export interface VehiclePayload {
  make: string;
  model: string;
  year: number;
  plate?: string;
  currentMileage?: number;
}

/** Typed HTTP client for the vehicles / records / dashboard API. */
@Injectable({ providedIn: 'root' })
export class VehicleApi {
  private readonly http = inject(HttpClient);

  vehicles() {
    return this.http.get<Vehicle[]>('/api/vehicles');
  }

  createVehicle(payload: VehiclePayload) {
    return this.http.post<Vehicle>('/api/vehicles', payload);
  }

  updateVehicle(id: string, patch: Partial<VehiclePayload>) {
    return this.http.put<Vehicle>(`/api/vehicles/${id}`, patch);
  }

  deleteVehicle(id: string) {
    return this.http.delete<{ deleted: boolean }>(`/api/vehicles/${id}`);
  }

  garageSummary() {
    return this.http.get<GarageSummary>('/api/dashboard/garage');
  }

  dashboard(vehicleId?: string) {
    const params = vehicleId ? new HttpParams().set('vehicleId', vehicleId) : undefined;
    return this.http.get<DashboardSummary>('/api/dashboard', { params });
  }

  records(vehicleId?: string) {
    const params = vehicleId ? new HttpParams().set('vehicleId', vehicleId) : undefined;
    return this.http.get<MaintenanceRecord[]>('/api/records', { params });
  }

  createRecord(payload: RecordPayload) {
    return this.http.post<MaintenanceRecord>('/api/records', payload);
  }

  updateRecord(id: string, payload: Partial<RecordPayload>) {
    return this.http.put<MaintenanceRecord>(`/api/records/${id}`, payload);
  }

  deleteRecord(id: string) {
    return this.http.delete<{ deleted: boolean }>(`/api/records/${id}`);
  }
}

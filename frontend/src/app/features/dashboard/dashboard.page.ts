import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { GarageSummary, GarageUpcoming } from '@hefesto/shared';
import { VehicleApi } from '../vehicle/vehicle-api.service';
import { GarageService } from '../vehicle/garage.service';
import { RecordCard } from '../chat/record-card';
import { I18n } from '../../core/i18n.service';

/**
 * Panel: garage-wide overview — fleet totals, spending per car (tap-through
 * to detail), upcoming services across every car, recent activity.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-dashboard-page',
  imports: [RouterLink, RecordCard],
  templateUrl: './dashboard.page.html',
})
export class DashboardPage {
  private readonly api = inject(VehicleApi);
  private readonly i18n = inject(I18n);
  readonly garage = inject(GarageService);
  readonly t = this.i18n.t.bind(this.i18n);

  readonly summary = signal<GarageSummary | null>(null);
  readonly loading = signal(true);
  readonly failed = signal(false);

  /** One bar per car, widest = biggest spender. */
  readonly carBars = computed(() => {
    const s = this.summary();
    if (!s) return [];
    const max = Math.max(...s.spendByVehicle.map((v) => v.total), 1);
    return s.spendByVehicle.map((v) => ({
      ...v,
      pct: v.total > 0 ? Math.max(6, Math.round((v.total / max) * 100)) : 0,
    }));
  });

  constructor() {
    // Refetch when the garage changes (a car added/removed from any screen).
    effect(() => {
      this.garage.vehicles();
      this.load();
    });
  }

  private load() {
    this.loading.set(true);
    this.api.garageSummary().subscribe({
      next: (s) => {
        this.summary.set(s);
        this.loading.set(false);
        this.failed.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  isOverdue(u: GarageUpcoming): boolean {
    if (u.dueMileage && u.vehicleMileage >= u.dueMileage) return true;
    if (u.dueDate && new Date(u.dueDate).getTime() <= Date.now()) return true;
    return false;
  }

  basedOnText(u: GarageUpcoming): string {
    let out = this.t('dash.lastOne', { date: u.lastDate?.slice(0, 10) ?? '' });
    if (u.lastMileage) out += ` · ${u.lastMileage.toLocaleString('en-US')} km`;
    return out;
  }

  upLabel(u: GarageUpcoming): string {
    const key = `up.${u.type}`;
    const label = this.t(key);
    return label === key ? u.label : label;
  }

  dueText(u: GarageUpcoming): string {
    const parts: string[] = [];
    if (u.dueMileage) parts.push(`${u.dueMileage.toLocaleString('en-US')} km`);
    if (u.dueDate) parts.push(u.dueDate.slice(0, 10));
    return parts.join(` ${this.t('dash.or')} `);
  }

  money(v: number): string {
    return `$${v.toFixed(2)}`;
  }
}

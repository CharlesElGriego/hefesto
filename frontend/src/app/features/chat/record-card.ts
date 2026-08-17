import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { MaintenanceRecord, MaintenanceType } from '@hefesto/shared';
import { GarageService } from '../vehicle/garage.service';
import { I18n } from '../../core/i18n.service';

const GLYPHS: Record<MaintenanceType, string> = {
  oil_change: '🛢️',
  tires: '🛞',
  brakes: '🛑',
  battery: '🔋',
  inspection: '🔍',
  repair: '🔧',
  other: '📌',
};

/**
 * Compact maintenance-record card (chat + dashboard). `flat` renders it as
 * a plain row for grouped lists.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-record-card',
  host: { class: 'block' },
  template: `
    <div class="px-4 py-3" [class.card]="!flat()">
      <div class="flex items-start gap-3">
        <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-tint text-lg">
          {{ glyph() }}
        </span>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-semibold leading-snug">{{ record().description }}</p>
          <p class="tabular mt-1 text-xs text-ink-soft">{{ meta() }}</p>
          @if (record().aiConfidence != null) {
            <p class="mt-1.5 text-[11px] text-ink-faint">
              {{ loggedByLine() }}
            </p>
          }
        </div>
      </div>
    </div>
  `,
})
export class RecordCard {
  private readonly garage = inject(GarageService);

  readonly record = input.required<MaintenanceRecord>();

  /** Render as a plain row (for grouped lists) instead of a standalone card. */
  readonly flat = input(false);

  readonly glyph = computed(() => GLYPHS[this.record().type] ?? '📌');

  private readonly i18n = inject(I18n);

  readonly loggedByLine = computed(() =>
    this.i18n.t('card.loggedBy', {
      pct: Math.round((this.record().aiConfidence ?? 0) * 100),
    }),
  );

  readonly meta = computed(() => {
    const r = this.record();
    const parts = [r.date.slice(0, 10)];
    // With several cars, say which one this record belongs to.
    if (this.garage.multi()) {
      const label = this.garage.label(r.vehicleId);
      if (label) parts.unshift(label);
    }
    if (r.mileage) parts.push(`${r.mileage.toLocaleString('en-US')} km`);
    if (r.cost != null) {
      const symbol = !r.currency || r.currency === 'USD' ? '$' : `${r.currency} `;
      parts.push(`${symbol}${r.cost.toFixed(2)}`);
    }
    if (r.workshop) parts.push(r.workshop);
    return parts.join(' · ');
  });
}

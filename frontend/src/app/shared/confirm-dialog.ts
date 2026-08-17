import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Destructive-action confirmation modal. Backdrop click and Escape cancel;
 * the confirm button is styled as danger so the weight of the action is clear.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-confirm-dialog',
  host: { '(document:keydown.escape)': 'open() && cancelled.emit()' },
  template: `
    @if (open()) {
      <div class="fixed inset-0 z-50 grid place-items-center p-4">
        <div
          class="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
          (click)="cancelled.emit()"
          aria-hidden="true"
        ></div>
        <div
          class="msg--in card relative w-full max-w-sm p-5"
          role="alertdialog"
          aria-modal="true"
          [attr.aria-label]="title()"
        >
          <h2 class="font-display text-lg font-bold tracking-tight">{{ title() }}</h2>
          <p class="mt-2 text-sm leading-relaxed text-ink-soft">{{ message() }}</p>
          <div class="mt-5 flex justify-end gap-2">
            <button type="button" class="btn--ghost" (click)="cancelled.emit()">
              {{ cancelLabel() }}
            </button>
            <button type="button" class="btn--danger" (click)="confirmed.emit()">
              {{ confirmLabel() }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ConfirmDialog {
  readonly open = input(false);
  readonly title = input('');
  readonly message = input('');
  readonly confirmLabel = input('');
  readonly cancelLabel = input('');
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();
}

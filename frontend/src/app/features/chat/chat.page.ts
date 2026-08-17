import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import type { MaintenanceRecord } from '@hefesto/shared';
import { ChatApi } from './chat-api.service';
import { RecordCard } from './record-card';
import { I18n } from '../../core/i18n.service';
import { GarageService } from '../vehicle/garage.service';

interface UiMessage {
  role: 'user' | 'assistant';
  content: string;
  record?: MaintenanceRecord;
  at: Date;
}

/**
 * Messenger-style conversation with Hefesto: bubbles, typing indicator,
 * suggestion chips, and record cards inline.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-chat-page',
  imports: [RecordCard],
  templateUrl: './chat.page.html',
})
export class ChatPage {
  private readonly api = inject(ChatApi);
  private readonly i18n = inject(I18n);
  private readonly garage = inject(GarageService);
  readonly t = this.i18n.t.bind(this.i18n);

  readonly messages = signal<UiMessage[]>([]);
  readonly sending = signal(false);
  readonly draft = signal('');

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  readonly samples = this.i18n.samples;

  constructor() {
    this.api.history().subscribe({
      next: (h) => {
        this.messages.set(
          h.map((m) => ({
            role: m.role,
            content: m.content,
            at: new Date(m.createdAt),
          })),
        );
        this.scrollSoon(false);
      },
      error: () => {
        // History is a nicety — the chat still works without it.
      },
    });
  }

  send(text?: string) {
    const message = (text ?? this.draft()).trim();
    if (!message || this.sending()) return;

    this.draft.set('');
    this.messages.update((m) => [...m, { role: 'user', content: message, at: new Date() }]);
    this.sending.set(true);
    this.scrollSoon();

    this.api.send(message).subscribe({
      next: (res) => {
        this.messages.update((m) => [
          ...m,
          {
            role: 'assistant',
            content: res.reply,
            record: res.record,
            at: new Date(),
          },
        ]);
        this.sending.set(false);
        this.scrollSoon();
        // The assistant may have added a car or moved the odometer.
        this.garage.load();
      },
      error: () => {
        this.messages.update((m) => [
          ...m,
          { role: 'assistant', content: this.t('chat.netError'), at: new Date() },
        ]);
        this.sending.set(false);
        this.scrollSoon();
      },
    });
  }

  time(d: Date): string {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  private scrollSoon(smooth = true) {
    setTimeout(() => {
      const el = this.scroller()?.nativeElement;
      if (el) {
        el.scrollTo({
          top: el.scrollHeight,
          behavior: smooth ? 'smooth' : 'auto',
        });
      }
    });
  }
}

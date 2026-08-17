import { ChangeDetectionStrategy, Component, inject, OnDestroy, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { WhatsappStatus } from '@hefesto/shared';
import { I18n } from '../../core/i18n.service';

type ConnectState = 'disconnected' | 'connecting' | 'qr' | 'connected';

interface WhatsappEvent {
  status: ConnectState;
  qr?: string;
  number?: string;
}

/**
 * WhatsApp pairing screen: QR via SSE, connection state, and the explicit
 * allowlist manager.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-connect-page',
  templateUrl: './connect.page.html',
})
export class ConnectPage implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18n);
  readonly t = this.i18n.t.bind(this.i18n);
  private source?: EventSource;

  readonly state = signal<ConnectState>('disconnected');
  readonly qr = signal<string | null>(null);
  readonly number = signal<string | null>(null);
  readonly allowed = signal<string[]>([]);
  readonly newNumber = signal('');
  readonly busy = signal(false);

  constructor() {
    this.refreshStatus();
  }

  private refreshStatus() {
    this.http.get<WhatsappStatus>('/api/whatsapp/status').subscribe((s) => {
      this.allowed.set(s.allowedNumbers ?? []);
      if (s.connected) {
        this.state.set('connected');
        this.number.set(s.number ?? null);
      } else if (s.connecting) {
        this.state.set('connecting');
        this.listen();
      }
    });
  }

  addNumber() {
    const number = this.newNumber().trim();
    if (!number) return;
    this.http.post<{ numbers: string[] }>('/api/whatsapp/allowed', { number }).subscribe({
      next: (r) => {
        this.allowed.set(r.numbers);
        this.newNumber.set('');
      },
      error: () => {
        // invalid number — keep the input for correction
      },
    });
  }

  removeNumber(number: string) {
    this.http
      .delete<{ numbers: string[] }>(`/api/whatsapp/allowed/${number}`)
      .subscribe((r) => this.allowed.set(r.numbers));
  }

  connect() {
    this.busy.set(true);
    this.state.set('connecting');
    this.listen();
    this.http.post<WhatsappStatus>('/api/whatsapp/connect', {}).subscribe({
      next: () => this.busy.set(false),
      error: () => {
        this.busy.set(false);
        this.state.set('disconnected');
      },
    });
  }

  disconnect() {
    this.busy.set(true);
    this.http.post<WhatsappStatus>('/api/whatsapp/disconnect', {}).subscribe({
      next: () => {
        this.busy.set(false);
        this.state.set('disconnected');
        this.qr.set(null);
        this.number.set(null);
      },
      error: () => this.busy.set(false),
    });
  }

  private listen() {
    if (this.source) return;
    this.source = new EventSource('/api/whatsapp/events');
    this.source.onmessage = (e) => {
      const event = JSON.parse(e.data as string) as WhatsappEvent;
      this.state.set(event.status);
      if (event.status === 'qr') {
        this.qr.set(event.qr ?? null);
      } else {
        this.qr.set(null);
      }
      if (event.status === 'connected') {
        this.number.set(event.number ?? null);
        this.refreshStatus(); // picks up the owner binding too
      }
    };
    this.source.onerror = () => {
      // Server went away — the status GET on next visit resyncs.
    };
  }

  ngOnDestroy() {
    this.source?.close();
  }
}

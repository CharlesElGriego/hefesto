import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Subject } from 'rxjs';
import { existsSync } from 'node:fs';
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { toDataURL } from 'qrcode';
import type { WhatsappStatus } from '@hefesto/shared';
import { AssistantService } from '../../assistant/assistant.service';

/** Server-sent events pushed to the Connect screen (QR, connection state). */
export type WhatsappEvent =
  | { status: 'connecting' }
  | { status: 'qr'; qr: string } // QR as data URL, rotates ~20s
  | { status: 'connected'; number: string }
  | { status: 'disconnected' };

/**
 * WhatsApp channel adapter (PRD F6) built on Baileys (unofficial WhatsApp Web
 * protocol — deliberate prototype shortcut; production would use the official
 * Cloud API). The scanned account BECOMES the assistant: message it from
 * another phone, or use "Message yourself". Optional at runtime — the rest of
 * the app works fully without it.
 */
@Injectable()
export class WhatsappService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly sessionDir =
    process.env.WHATSAPP_SESSION_DIR ?? join(process.cwd(), 'whatsapp-session');

  private sock?: import('baileys').WASocket;
  private connecting = false;
  private connected = false;
  private number?: string;
  /**
   * All JIDs that mean "this account". WhatsApp now uses hidden LIDs
   * (`...@lid`) for self-chat ("Message yourself"), so the phone-number JID
   * alone doesn't match those messages.
   */
  private selfJids = new Set<string>();
  private lastQr?: string;
  private manualDisconnect = false;
  /** IDs of replies we sent, so the self-chat flow doesn't loop on them. */
  private readonly sentIds = new Set<string>();
  /** IDs already processed — Baileys can deliver a message more than once. */
  private readonly processedIds = new Set<string>();
  /**
   * Who may talk to Hefesto (comma-separated numbers in
   * WHATSAPP_ALLOWED_NUMBERS). The linked account's self-chat is always
   * allowed. Empty list = self-chat ONLY — safe default, so a stranger (or
   * another bot!) texting the number gets silence, not an AI conversation.
   */
  private readonly allowedNumbers = (process.env.WHATSAPP_ALLOWED_NUMBERS ?? '')
    .split(',')
    .map((n) => n.trim().replace(/\D/g, ''))
    .filter(Boolean);
  /** Reply timestamps per chat — anti bot-loop rate limit. */
  private readonly replyTimes = new Map<string, number[]>();
  /**
   * Numbers explicitly authorized from the Connect screen (persisted next to
   * the session). There is deliberately NO auto-claim: an earlier
   * first-to-message design got claimed by a sports-news channel and then by
   * the owner's wife. Authorization is an explicit user action, full stop.
   */
  private storedAllowed = new Set<string>();

  readonly events$ = new Subject<WhatsappEvent>();

  constructor(private readonly assistant: AssistantService) {}

  onModuleInit() {
    // Session persisted in a volume → reconnect silently on boot, no re-scan.
    if (existsSync(join(this.sessionDir, 'creds.json'))) {
      this.connect().catch((e) =>
        this.logger.warn(`WhatsApp auto-reconnect failed: ${String(e)}`),
      );
    }
  }

  onModuleDestroy() {
    this.sock?.end(undefined);
  }

  status(): WhatsappStatus {
    return {
      connected: this.connected,
      connecting: this.connecting,
      number: this.number,
      allowedNumbers: [
        ...new Set([...this.allowedNumbers, ...this.storedAllowed]),
      ],
    };
  }

  private get allowedFile(): string {
    return join(this.sessionDir, 'allowed.json');
  }

  private async loadAllowed() {
    try {
      const raw = await readFile(this.allowedFile, 'utf8');
      this.storedAllowed = new Set(
        (JSON.parse(raw) as { numbers?: string[] }).numbers ?? [],
      );
    } catch {
      this.storedAllowed = new Set();
    }
  }

  private async persistAllowed() {
    await writeFile(
      this.allowedFile,
      JSON.stringify({ numbers: [...this.storedAllowed] }),
    ).catch(() => {});
  }

  async addAllowed(number: string): Promise<string[]> {
    const clean = number.replace(/\D/g, '');
    if (clean.length < 7 || clean.length > 15) {
      throw new Error('invalid phone number');
    }
    this.storedAllowed.add(clean);
    await this.persistAllowed();
    this.logger.log(`[whatsapp] number ${clean} authorized`);
    return this.status().allowedNumbers ?? [];
  }

  async removeAllowed(number: string): Promise<string[]> {
    const clean = number.replace(/\D/g, '');
    this.storedAllowed.delete(clean);
    await this.persistAllowed();
    this.logger.log(`[whatsapp] number ${clean} de-authorized`);
    return this.status().allowedNumbers ?? [];
  }

  currentQr(): string | undefined {
    return this.lastQr;
  }

  async connect(): Promise<WhatsappStatus> {
    if (this.connected || this.connecting) return this.status();
    this.connecting = true;
    this.manualDisconnect = false;
    this.events$.next({ status: 'connecting' });
    await this.start();
    return this.status();
  }

  async disconnect(): Promise<WhatsappStatus> {
    this.manualDisconnect = true;
    try {
      await this.sock?.logout();
    } catch {
      // Already closed — logout is best-effort.
    }
    try {
      this.sock?.end(undefined);
    } catch {
      // ignore
    }
    this.sock = undefined;
    this.connected = false;
    this.connecting = false;
    this.number = undefined;
    this.storedAllowed.clear();
    this.selfJids.clear();
    this.lastQr = undefined;
    await rm(this.sessionDir, { recursive: true, force: true }).catch(() => {});
    this.events$.next({ status: 'disconnected' });
    return this.status();
  }

  private async start(): Promise<void> {
    const {
      default: makeWASocket,
      useMultiFileAuthState,
      DisconnectReason,
      jidNormalizedUser,
    } = await import('baileys');
    const { default: pino } = await import('pino');

    const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir);
    const sock = makeWASocket({
      auth: state,
      logger: pino({ level: 'silent' }),
      markOnlineOnConnect: false,
    });
    this.sock = sock;
    // Distinguishes a fresh QR pairing from a silent session reconnect.
    let pairedViaQr = false;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      void (async () => {
        this.logger.log(
          `[whatsapp] connection.update: ${JSON.stringify({
            connection: update.connection,
            qr: update.qr ? 'yes' : undefined,
            error: (update.lastDisconnect?.error as Error | undefined)?.message,
            code: (
              update.lastDisconnect?.error as
                { output?: { statusCode?: number } } | undefined
            )?.output?.statusCode,
          })}`,
        );
        if (update.qr) {
          pairedViaQr = true;
          this.lastQr = await toDataURL(update.qr, { margin: 1, width: 280 });
          this.events$.next({ status: 'qr', qr: this.lastQr });
        }

        if (update.connection === 'open') {
          this.connected = true;
          this.connecting = false;
          this.lastQr = undefined;
          this.selfJids.clear();
          const user = sock.user as { id?: string; lid?: string } | undefined;
          if (user?.id) this.selfJids.add(jidNormalizedUser(user.id));
          if (user?.lid) this.selfJids.add(jidNormalizedUser(user.lid));
          this.number = user?.id
            ? jidNormalizedUser(user.id).split('@')[0]
            : undefined;
          await this.loadAllowed();
          this.logger.log(
            `WhatsApp connected as ${this.number} (self jids: ${[...this.selfJids].join(', ')})`,
          );
          this.events$.next({
            status: 'connected',
            number: this.number ?? '',
          });
          // Fresh pairing → greet in the self-chat so the user sees it's alive.
          if (pairedViaQr && user?.id) {
            const selfJid = jidNormalizedUser(user.id);
            const hello = await sock
              .sendMessage(selfJid, {
                text: '🔧 ¡Hefesto conectado! Escríbeme lo que le hagas a tus carros — ej: "cambié el aceite, $45". / Hefesto connected! Tell me anything you do to your cars — e.g. "changed the oil, $45".',
              })
              .catch(() => undefined);
            if (hello?.key?.id) this.sentIds.add(hello.key.id);
          }
        }

        if (update.connection === 'close') {
          const code = (
            update.lastDisconnect?.error as
              { output?: { statusCode?: number } } | undefined
          )?.output?.statusCode;
          const loggedOut = code === DisconnectReason.loggedOut;
          const wasActive = this.connected || this.connecting;
          this.connected = false;
          this.sock = undefined;

          if (loggedOut || this.manualDisconnect) {
            this.connecting = false;
            this.number = undefined;
            await this.wipeSession();
            this.events$.next({ status: 'disconnected' });
          } else if (wasActive) {
            this.logger.warn('WhatsApp connection dropped — reconnecting');
            setTimeout(() => {
              this.start().catch((e) =>
                this.logger.error(`Reconnect failed: ${String(e)}`),
              );
            }, 2000);
          }
        }
      })();
    });

    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        void this.handleIncoming(msg);
      }
    });
  }

  private async handleIncoming(
    msg: import('baileys').proto.IWebMessageInfo,
  ): Promise<void> {
    const rawJid = msg.key?.remoteJid;
    // Whitelist, not blacklist: ONLY direct chats. Groups (@g.us), channels
    // (@newsletter), status broadcasts, and anything else WhatsApp invents
    // are ignored — a sports-news channel once claimed ownership here.
    if (
      !rawJid ||
      !(rawJid.endsWith('@s.whatsapp.net') || rawJid.endsWith('@lid'))
    ) {
      return;
    }
    if (msg.key?.id) {
      if (this.sentIds.has(msg.key.id) || this.processedIds.has(msg.key.id)) {
        return;
      }
      this.processedIds.add(msg.key.id);
      // Bounded memory: this only needs to cover recent redeliveries.
      if (this.processedIds.size > 500) {
        const first = this.processedIds.values().next().value;
        if (first) this.processedIds.delete(first);
      }
    }

    const { jidNormalizedUser } = await import('baileys');
    const jid = jidNormalizedUser(rawJid);

    // Accept: messages from others, and your own messages in the self-chat
    // ("Message yourself" — arrives as the account's own JID or its LID) —
    // but never our own bot replies (sentIds above).
    const isSelfChat = this.selfJids.has(jid);
    if (msg.key?.fromMe && !isSelfChat) return;

    // Access control: self-chat always; anyone else must be EXPLICITLY
    // authorized (env var or the Connect screen). No auto-claim, ever —
    // strangers, channels, other bots, and unsuspecting spouses get silence.
    if (!isSelfChat) {
      const sender = jid.split('@')[0].replace(/\D/g, '');
      if (
        !this.allowedNumbers.includes(sender) &&
        !this.storedAllowed.has(sender)
      ) {
        this.logger.warn(
          `[whatsapp] ignored message from non-authorized ${sender}`,
        );
        return;
      }
    }

    const text =
      msg.message?.conversation ?? msg.message?.extendedTextMessage?.text;
    if (!text?.trim()) return;

    // Anti bot-loop net: never send more than 8 replies per minute to the
    // same chat. If two bots do meet, the conversation dies here.
    const now = Date.now();
    const recent = (this.replyTimes.get(jid) ?? []).filter(
      (t) => now - t < 60_000,
    );
    if (recent.length >= 8) {
      this.logger.warn(
        `[whatsapp] rate limit hit for ${jid} — possible bot loop, muting`,
      );
      this.replyTimes.set(jid, recent);
      return;
    }
    recent.push(now);
    this.replyTimes.set(jid, recent);
    this.logger.log(
      `[whatsapp] incoming from ${jid}${isSelfChat ? ' (self-chat)' : ''}: "${text.slice(0, 80)}"`,
    );

    try {
      // "typing…" while the assistant thinks, like a human contact would.
      await this.sock?.sendPresenceUpdate('composing', rawJid)?.catch(() => {});
      const res = await this.assistant.handleMessage('whatsapp', text.trim());
      await this.sock?.sendPresenceUpdate('paused', rawJid)?.catch(() => {});
      const sent = await this.sock?.sendMessage(rawJid, { text: res.reply });
      if (sent?.key?.id) this.sentIds.add(sent.key.id);
    } catch (error) {
      this.logger.error(`WhatsApp message handling failed: ${String(error)}`);
    }
  }

  /**
   * Invalidated session (logged out): wipe the Baileys credentials so the
   * next connect() starts fresh with a QR. The session dir is a Docker
   * volume MOUNT POINT — removing the dir itself fails with EBUSY, so we
   * clear its contents instead. allowed.json survives on purpose: the
   * user's allowlist is config, not session material.
   */
  private async wipeSession(): Promise<void> {
    const entries = await readdir(this.sessionDir).catch(() => [] as string[]);
    await Promise.all(
      entries
        .filter((f) => f !== 'allowed.json')
        .map((f) =>
          rm(join(this.sessionDir, f), { recursive: true, force: true }).catch(
            () => {},
          ),
        ),
    );
    this.logger.log(
      `[whatsapp] stale session wiped (${entries.length - 1} files) — ready for a fresh QR`,
    );
  }

}

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  MessageEvent,
  Param,
  Post,
  Sse,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';

class AllowNumberDto {
  @ApiProperty({
    example: '50688881111',
    description: 'Number with country code',
  })
  number!: string;
}
import { concat, map, Observable, of } from 'rxjs';
import type { WhatsappStatus } from '@hefesto/shared';
import { WhatsappEvent, WhatsappService } from './whatsapp.service';

/**
 * WhatsApp control surface: status, connect/disconnect, QR event stream
 * (SSE), and the explicit allowlist.
 */
@ApiTags('whatsapp')
@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsapp: WhatsappService) {}

  @Get('status')
  @ApiOperation({ summary: 'Connection state of the WhatsApp channel' })
  status(): WhatsappStatus {
    return this.whatsapp.status();
  }

  @Post('connect')
  @ApiOperation({
    summary: 'Start linking a WhatsApp account',
    description:
      'Kicks off Baileys; the QR code arrives on the /whatsapp/events SSE stream.',
  })
  connect(): Promise<WhatsappStatus> {
    return this.whatsapp.connect();
  }

  @Post('disconnect')
  @ApiOperation({ summary: 'Log out and wipe the persisted session' })
  disconnect(): Promise<WhatsappStatus> {
    return this.whatsapp.disconnect();
  }

  @Post('allowed')
  @ApiOperation({
    summary: 'Authorize a number to talk to Hefesto',
    description:
      'Besides the self-chat (always allowed), only explicitly authorized ' +
      'numbers get answers. There is deliberately no auto-authorization.',
  })
  async addAllowed(
    @Body() body: AllowNumberDto,
  ): Promise<{ numbers: string[] }> {
    try {
      return { numbers: await this.whatsapp.addAllowed(body?.number ?? '') };
    } catch {
      throw new BadRequestException('invalid phone number');
    }
  }

  @Delete('allowed/:number')
  @ApiOperation({ summary: 'De-authorize a number' })
  @ApiParam({ name: 'number' })
  async removeAllowed(
    @Param('number') number: string,
  ): Promise<{ numbers: string[] }> {
    return { numbers: await this.whatsapp.removeAllowed(number) };
  }

  /** SSE stream: emits the current state on subscribe, then live updates. */
  @Sse('events')
  @ApiOperation({
    summary: 'Live connection events (SSE)',
    description:
      'Server-Sent Events stream: {status: connecting|qr|connected|disconnected}. ' +
      'QR events carry the code as a data URL and rotate every ~20s.',
  })
  @ApiProduces('text/event-stream')
  events(): Observable<MessageEvent> {
    const s = this.whatsapp.status();
    const qr = this.whatsapp.currentQr();
    const initial: WhatsappEvent = s.connected
      ? { status: 'connected', number: s.number ?? '' }
      : qr
        ? { status: 'qr', qr }
        : s.connecting
          ? { status: 'connecting' }
          : { status: 'disconnected' };

    return concat(of(initial), this.whatsapp.events$).pipe(
      map((event) => ({ data: event }) as MessageEvent),
    );
  }
}

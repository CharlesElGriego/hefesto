import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ChatMessage, ChatResponse } from '@hefesto/shared';
import { AssistantService } from '../../assistant/assistant.service';
import { VehiclesService } from '../../vehicles/vehicles.service';
import { ChatRequestDto } from './chat.dto';

/** POST /api/chat — the web channel adapter over the assistant core. */
@ApiTags('assistant')
@Controller('chat')
export class ChatController {
  constructor(
    private readonly assistant: AssistantService,
    private readonly vehicles: VehiclesService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Talk to Hefesto',
    description:
      'Claude classifies the intent (log_maintenance | query_history | general) ' +
      'via structured outputs. Logging returns the created record; history ' +
      'questions are answered with backend-computed numbers.',
  })
  @ApiOkResponse({
    description: 'Assistant reply, plus the created record when one was logged',
  })
  async chat(@Body() body: ChatRequestDto): Promise<ChatResponse> {
    const message = body?.message?.trim();
    if (!message) {
      throw new BadRequestException('message is required');
    }
    return this.assistant.handleMessage('web', message);
  }

  @Get('history')
  @ApiOperation({ summary: 'Recent conversation across all channels' })
  async history(): Promise<ChatMessage[]> {
    return this.vehicles.recentMessages(50);
  }
}

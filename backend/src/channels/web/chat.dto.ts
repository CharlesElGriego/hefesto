import { ApiProperty } from '@nestjs/swagger';
import type { ChatRequest } from '@hefesto/shared';

/** Body for POST /chat. */
export class ChatRequestDto implements ChatRequest {
  @ApiProperty({
    description: 'Natural-language message for the assistant',
    example: 'changed the oil and filter, $45 at 62,400 km',
  })
  message!: string;
}

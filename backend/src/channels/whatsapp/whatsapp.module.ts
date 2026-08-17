import { Module } from '@nestjs/common';
import { AssistantModule } from '../../assistant/assistant.module';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';

/**
 * WhatsApp channel adapter (Baileys). Optional at runtime: the app is fully
 * functional with WhatsApp disconnected.
 */
@Module({
  imports: [AssistantModule],
  controllers: [WhatsappController],
  providers: [WhatsappService],
})
export class WhatsappModule {}

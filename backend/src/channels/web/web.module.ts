import { Module } from '@nestjs/common';
import { AssistantModule } from '../../assistant/assistant.module';
import { VehiclesModule } from '../../vehicles/vehicles.module';
import { ChatController } from './chat.controller';

/** Web chat channel adapter. */
@Module({
  imports: [AssistantModule, VehiclesModule],
  controllers: [ChatController],
})
export class WebModule {}

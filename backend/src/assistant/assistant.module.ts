import { Module } from '@nestjs/common';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { ClaudeService } from './claude.service';
import { AssistantService } from './assistant.service';

/** Channel-agnostic assistant core: Claude + deterministic guardrails. */
@Module({
  imports: [VehiclesModule],
  providers: [ClaudeService, AssistantService],
  exports: [AssistantService],
})
export class AssistantModule {}

import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

/** Liveness endpoint module. */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}

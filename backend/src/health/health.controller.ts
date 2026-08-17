import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import type { HealthStatus } from '@hefesto/shared';

/** GET /api/health — API + Mongo liveness (Docker healthcheck, e2e sweep). */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get()
  health(): HealthStatus {
    return {
      ok: true,
      mongo: this.connection.readyState === 1 ? 'up' : 'down',
      uptimeSeconds: Math.round(process.uptime()),
    };
  }
}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ServeStaticModule } from '@nestjs/serve-static';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { HealthModule } from './health/health.module';
import { WebModule } from './channels/web/web.module';
import { WhatsappModule } from './channels/whatsapp/whatsapp.module';

// In the Docker image the Angular build lives at /app/public, next to dist/.
// In local dev the folder doesn't exist (Angular runs on its own dev server).
const publicDir = join(__dirname, '..', 'public');

@Module({
  imports: [
    // envFilePath: local dev runs from backend/ but the .env lives at the repo
    // root (Docker injects env vars directly, so this only matters for dev).
    /** Application root: config, Mongo connection, and every feature module. */
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../.env', '.env'] }),
    MongooseModule.forRoot(
      process.env.MONGO_URI ?? 'mongodb://localhost:27017/hefesto',
    ),
    ...(existsSync(publicDir)
      ? [
          ServeStaticModule.forRoot({
            rootPath: publicDir,
            exclude: ['/api/{*splat}'],
          }),
        ]
      : []),
    HealthModule,
    WebModule,
    WhatsappModule,
  ],
})
export class AppModule {}

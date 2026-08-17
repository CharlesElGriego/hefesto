import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { LoggingInterceptor } from './common/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors();
  app.useGlobalInterceptors(new LoggingInterceptor());

  const config = new DocumentBuilder()
    .setTitle('Hefesto API')
    .setDescription(
      'AI-powered car maintenance assistant. The `/chat` endpoint drives the ' +
        'conversational pipeline (Claude structured outputs); everything else is ' +
        'conventional REST over MongoDB. WhatsApp connects via `/whatsapp/*` ' +
        '(QR streamed over SSE).',
    )
    .setVersion('1.0')
    .addTag('assistant', 'Conversational pipeline (web channel)')
    .addTag('vehicle', 'Vehicle profile')
    .addTag('records', 'Maintenance records (manual CRUD)')
    .addTag('dashboard', 'Aggregated summary')
    .addTag('whatsapp', 'WhatsApp channel (Baileys)')
    .addTag('health', 'Liveness')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
    customSiteTitle: 'Hefesto API docs',
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  new Logger('Bootstrap').log(`Hefesto API listening on :${port}`);
}
bootstrap();

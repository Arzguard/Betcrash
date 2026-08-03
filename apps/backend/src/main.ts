import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = app.get(ConfigService);

  // ── CORS ─────────────────────────────────────────────────────────────────
  const rawOrigins = config.get<string>('CORS_ORIGINS', 'http://localhost:5500');
  const allowedOrigins = rawOrigins.split(',').map((o) => o.trim());
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // ── Global pipes ─────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,       // strip unknown fields
      forbidNonWhitelisted: true,
      transform: true,       // auto-cast primitives
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── Swagger ───────────────────────────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('BetCrash API')
    .setDescription('Backend APIs for BetCrash')
    .setVersion('0.1')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api', app, document);

  const port = config.get<number>('PORT', 3333);
  await app.listen(port);
  console.log(`BetCrash backend running on http://localhost:${port}`);
  console.log(`Swagger available at http://localhost:${port}/api`);
}

bootstrap();

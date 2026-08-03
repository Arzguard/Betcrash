import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3333);

  // CORS: tokens travel in the Authorization header (not cookies), so credentials-free CORS is safe.
  // In production, set FRONTEND_URL (comma-separated origins) to lock it down.
  const frontendUrl = process.env.FRONTEND_URL;
  app.enableCors({
    origin: frontendUrl ? frontendUrl.split(',').map((s) => s.trim()) : '*',
    credentials: false,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('BetCrash API')
    .setDescription('Backend APIs for BetCrash')
    .setVersion('0.1')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api', app, document);

  await app.listen(port);
  console.log(`BetCrash backend running on http://localhost:${port}`);
  console.log(`Swagger available at http://localhost:${port}/api`);
}

bootstrap();

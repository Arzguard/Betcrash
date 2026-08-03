import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { WalletModule } from './wallet/wallet.module';
import { GameModule } from './game/game.module';
import { KycModule } from './kyc/kyc.module';
import { MpesaModule } from './mpesa/mpesa.module';
import { envValidationSchema } from './config/env.validation';

@Module({
  imports: [
    // ── Config (global, validates env at startup) ──────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: true,   // fail fast on first bad env var
      },
    }),

    // ── Infrastructure ──────────────────────────────────────────────────────
    PrismaModule,
    RedisModule,           // @Global — available across all modules

    // ── Feature modules ─────────────────────────────────────────────────────
    AuthModule,
    WalletModule,
    GameModule,
    KycModule,
    MpesaModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { MpesaService } from './mpesa.service';
import { MpesaController } from './mpesa.controller';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [WalletModule],
  controllers: [MpesaController],
  providers: [MpesaService],
  exports: [MpesaService],
})
export class MpesaModule {}

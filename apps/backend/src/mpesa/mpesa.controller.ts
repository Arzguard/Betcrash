import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { MpesaService } from './mpesa.service';
import { WalletService } from '../wallet/wallet.service';

@ApiTags('mpesa')
@Controller('mpesa')
export class MpesaController {
  constructor(
    private readonly mpesaService: MpesaService,
    private readonly walletService: WalletService,
  ) {}

  /**
   * Safaricom sends POST to this URL after STK Push completes.
   * Must respond 200 quickly — do not block with heavy logic.
   */
  @ApiExcludeEndpoint()   // hide from Swagger (Safaricom-facing endpoint)
  @Post('callback')
  @HttpCode(200)
  async callback(@Body() payload: any) {
    const { reference, success } = this.mpesaService.parseCallback(payload);

    if (success && reference) {
      try {
        await this.walletService.confirmDeposit(reference);
      } catch (err: any) {
        // Already processed or not found — log and acknowledge
        console.warn(`M-Pesa callback for ${reference}:`, err.message);
      }
    }

    // Safaricom requires this exact response shape
    return { ResultCode: 0, ResultDesc: 'Accepted' };
  }
}

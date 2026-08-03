import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WalletService } from './wallet.service';
import { DepositDto } from './dto/deposit.dto';
import { WithdrawDto } from './dto/withdraw.dto';

@ApiTags('wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  getWallet(@Req() req: any) {
    return this.walletService.getOrCreate(req.user.id);
  }

  @Get('balance')
  getBalance(@Req() req: any) {
    return this.walletService.getBalance(req.user.id);
  }

  @Get('transactions')
  getTransactions(@Req() req: any) {
    return this.walletService.getTransactions(req.user.id);
  }

  @Post('deposit')
  deposit(@Req() req: any, @Body() body: DepositDto) {
    return this.walletService.initiateDeposit(req.user.id, body.amount, body.mpesaPhone);
  }

  @Post('withdraw')
  withdraw(@Req() req: any, @Body() body: WithdrawDto) {
    return this.walletService.requestWithdrawal(req.user.id, body.amount, body.mpesaPhone);
  }
}

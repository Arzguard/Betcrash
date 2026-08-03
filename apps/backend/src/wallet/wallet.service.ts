import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionStatus, TransactionType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  /** Get or create a wallet for a user */
  async getOrCreate(userId: string) {
    const existing = await this.prisma.wallet.findUnique({
      where: { userId },
      include: { transactions: { orderBy: { createdAt: 'desc' }, take: 20 } },
    });
    if (existing) return existing;

    return this.prisma.wallet.create({
      data: { userId },
      include: { transactions: true },
    });
  }

  async getBalance(userId: string) {
    const wallet = await this.getOrCreate(userId);
    return {
      balance: wallet.balance,
      bonusBalance: wallet.bonusBalance,
    };
  }

  /**
   * Initiate an M-Pesa deposit — creates a PENDING transaction.
   * The callback from Safaricom will call confirmDeposit().
   */
  async initiateDeposit(
    userId: string,
    amount: number,
    mpesaPhone: string,
  ) {
    if (amount < 10) throw new BadRequestException('Minimum deposit is KES 10');

    const wallet = await this.getOrCreate(userId);
    const reference = `DEP-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

    const tx = await this.prisma.transaction.create({
      data: {
        walletId: wallet.id,
        type: TransactionType.DEPOSIT,
        amount,
        status: TransactionStatus.PENDING,
        reference,
        description: `M-Pesa deposit from ${mpesaPhone}`,
        metadata: { mpesaPhone },
      },
    });

    return { transactionId: tx.id, reference, status: 'pending' };
  }

  /** Called by M-Pesa callback webhook once payment confirmed */
  async confirmDeposit(reference: string) {
    const tx = await this.prisma.transaction.findUnique({ where: { reference } });
    if (!tx) throw new NotFoundException('Transaction not found');
    if (tx.status !== TransactionStatus.PENDING) {
      throw new BadRequestException('Transaction already processed');
    }

    await this.prisma.$transaction([
      this.prisma.transaction.update({
        where: { id: tx.id },
        data: { status: TransactionStatus.COMPLETED },
      }),
      this.prisma.wallet.update({
        where: { id: tx.walletId },
        data: { balance: { increment: tx.amount } },
      }),
    ]);

    return { success: true };
  }

  /**
   * Request a withdrawal — immediately deducts balance and creates a
   * PENDING tx for admin approval (if above the auto-approve threshold).
   */
  async requestWithdrawal(
    userId: string,
    amount: number,
    mpesaPhone: string,
  ) {
    const AUTO_APPROVE_LIMIT = 10_000;
    if (amount < 100) throw new BadRequestException('Minimum withdrawal is KES 100');

    const wallet = await this.getOrCreate(userId);
    if (new Decimal(wallet.balance).lt(amount)) {
      throw new BadRequestException('Insufficient balance');
    }

    const reference = `WD-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const autoApprove = amount <= AUTO_APPROVE_LIMIT;
    const status = autoApprove ? TransactionStatus.COMPLETED : TransactionStatus.PENDING;

    await this.prisma.$transaction([
      this.prisma.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: amount } },
      }),
      this.prisma.transaction.create({
        data: {
          walletId: wallet.id,
          type: TransactionType.WITHDRAWAL,
          amount,
          status,
          reference,
          description: `Withdrawal to M-Pesa ${mpesaPhone}`,
          metadata: { mpesaPhone, autoApproved: autoApprove },
        },
      }),
    ]);

    return {
      reference,
      status: autoApprove ? 'instant' : 'pending_review',
      message: autoApprove
        ? 'Payment sent to your M-Pesa number'
        : 'Withdrawal queued for admin review (over KES 10,000 limit)',
    };
  }

  async getTransactions(userId: string, take = 50) {
    const wallet = await this.getOrCreate(userId);
    return this.prisma.transaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  /** Internal: deduct stake when placing a bet */
  async deductStake(userId: string, amount: number, roundId: string) {
    const wallet = await this.getOrCreate(userId);
    if (new Decimal(wallet.balance).lt(amount)) {
      throw new BadRequestException('Insufficient balance');
    }

    await this.prisma.$transaction([
      this.prisma.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: amount } },
      }),
      this.prisma.transaction.create({
        data: {
          walletId: wallet.id,
          type: TransactionType.BET_STAKE,
          amount,
          status: TransactionStatus.COMPLETED,
          description: `Bet stake for round`,
          metadata: { roundId },
        },
      }),
    ]);
  }

  /** Internal: credit winnings after cash-out */
  async creditWin(userId: string, amount: number, roundId: string, cashoutAt: number) {
    const wallet = await this.getOrCreate(userId);

    await this.prisma.$transaction([
      this.prisma.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: amount } },
      }),
      this.prisma.transaction.create({
        data: {
          walletId: wallet.id,
          type: TransactionType.BET_WIN,
          amount,
          status: TransactionStatus.COMPLETED,
          description: `Win at ${cashoutAt}x`,
          metadata: { roundId, cashoutAt },
        },
      }),
    ]);
  }
}

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { REDIS_CLIENT } from '../redis/redis.provider';
import Redis from 'ioredis';
import * as crypto from 'crypto';
import { BetStatus, RoundStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const ROUND_KEY = 'betcrash:round:current';
const WAIT_MS = 5000; // 5 s betting window

@Injectable()
export class GameService {
  private readonly logger = new Logger(GameService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // ─── Provably-fair crash point ──────────────────────────────────────────

  /** Generate a random server seed and hash it (published to players before round). */
  generateSeed(): { seed: string; serverHash: string } {
    const seed = crypto.randomBytes(32).toString('hex');
    const serverHash = crypto.createHash('sha256').update(seed).digest('hex');
    return { seed, serverHash };
  }

  /**
   * Derive crash point from seed using the same algorithm as
   * Bustabit / BC.Game provably fair:
   *   e = 2^52
   *   h = HMAC-SHA256(seed, "0")
   *   r = h[0..13] (first 52 bits as integer)
   *   crash = max(1.0, (100 * e - r) / (e - r)) * 0.97   (house edge 3 %)
   */
  deriveCrashPoint(seed: string): number {
    const hmac = crypto.createHmac('sha256', seed).update('0').digest('hex');
    const r = parseInt(hmac.slice(0, 13), 16);
    const e = Math.pow(2, 52);
    const raw = Math.floor(((100 * e - r) / (e - r)) * 97) / 100;
    return Math.max(1.0, raw);
  }

  // ─── Round lifecycle ─────────────────────────────────────────────────────

  async createRound() {
    const { seed, serverHash } = this.generateSeed();
    const crashPoint = this.deriveCrashPoint(seed);

    const round = await this.prisma.round.create({
      data: {
        seed,
        serverHash,
        crashPoint,
        status: RoundStatus.PENDING,
      },
    });

    // Cache current round state in Redis
    await this.redis.set(
      ROUND_KEY,
      JSON.stringify({
        id: round.id,
        roundNumber: round.roundNumber,
        serverHash,          // seed NOT published until after crash
        crashPoint,
        status: 'PENDING',
        startedAt: null,
      }),
      'EX',
      300,
    );

    this.logger.log(`Round #${round.roundNumber} created — serverHash: ${serverHash}`);
    return round;
  }

  async startRound(roundId: string) {
    const round = await this.prisma.round.findUnique({ where: { id: roundId } });
    if (!round) throw new NotFoundException('Round not found');
    if (round.status !== RoundStatus.PENDING) {
      throw new BadRequestException('Round is not in PENDING state');
    }

    const started = await this.prisma.round.update({
      where: { id: roundId },
      data: { status: RoundStatus.FLYING, startedAt: new Date() },
    });

    await this.redis.set(
      ROUND_KEY,
      JSON.stringify({ ...JSON.parse((await this.redis.get(ROUND_KEY)) ?? '{}'), status: 'FLYING', startedAt: started.startedAt }),
      'EX',
      300,
    );

    return started;
  }

  async crashRound(roundId: string) {
    const round = await this.prisma.round.findUnique({
      where: { id: roundId },
      include: { bets: true },
    });
    if (!round) throw new NotFoundException('Round not found');
    if (round.status !== RoundStatus.FLYING) {
      throw new BadRequestException('Round is not FLYING');
    }

    // Mark all ACTIVE bets as LOST
    const activeBetIds = round.bets
      .filter((b) => b.status === BetStatus.ACTIVE)
      .map((b) => b.id);

    await this.prisma.$transaction([
      this.prisma.round.update({
        where: { id: roundId },
        data: { status: RoundStatus.CRASHED, crashedAt: new Date() },
      }),
      this.prisma.bet.updateMany({
        where: { id: { in: activeBetIds } },
        data: { status: BetStatus.LOST, profit: { decrement: 0 } }, // profit stays negative (stake already deducted)
      }),
    ]);

    // Reveal seed in Redis now that round is over
    const cached = JSON.parse((await this.redis.get(ROUND_KEY)) ?? '{}');
    await this.redis.set(
      ROUND_KEY,
      JSON.stringify({ ...cached, status: 'CRASHED', seed: round.seed }),
      'EX',
      60,
    );

    this.logger.log(`Round #${round.roundNumber} crashed at ${round.crashPoint}x`);
    return { roundId, crashPoint: round.crashPoint };
  }

  getCurrentRound() {
    return this.redis.get(ROUND_KEY).then((data) =>
      data ? JSON.parse(data) : null,
    );
  }

  async getRoundHistory(take = 20) {
    return this.prisma.round.findMany({
      where: { status: RoundStatus.CRASHED },
      orderBy: { createdAt: 'desc' },
      take,
      select: { roundNumber: true, crashPoint: true, crashedAt: true, serverHash: true, seed: true },
    });
  }

  // ─── Bets ─────────────────────────────────────────────────────────────────

  async placeBet(userId: string, roundId: string, stake: number, autoCashAt?: number) {
    if (stake < 10) throw new BadRequestException('Minimum bet is KES 10');

    const round = await this.prisma.round.findUnique({ where: { id: roundId } });
    if (!round) throw new NotFoundException('Round not found');
    if (round.status !== RoundStatus.PENDING) {
      throw new BadRequestException('Betting is closed — round already started');
    }

    // Check for duplicate bet in same round
    const existing = await this.prisma.bet.findFirst({
      where: { userId, roundId },
    });
    if (existing) throw new BadRequestException('You already have a bet in this round');

    // Deduct stake from wallet
    await this.walletService.deductStake(userId, stake, roundId);

    const bet = await this.prisma.bet.create({
      data: {
        userId,
        roundId,
        stake,
        autoCashAt: autoCashAt ?? null,
        status: BetStatus.PLACED,
      },
    });

    return bet;
  }

  async cashOut(userId: string, roundId: string) {
    const round = await this.prisma.round.findUnique({ where: { id: roundId } });
    if (!round) throw new NotFoundException('Round not found');
    if (round.status !== RoundStatus.FLYING) {
      throw new BadRequestException('Round is not currently flying');
    }

    const bet = await this.prisma.bet.findFirst({
      where: { userId, roundId, status: BetStatus.ACTIVE },
    });
    if (!bet) throw new NotFoundException('No active bet found for this round');

    // Calculate current multiplier from elapsed time
    const elapsed = Date.now() - (round.startedAt?.getTime() ?? Date.now());
    const currentMult = parseFloat(Math.exp(elapsed * 0.00022).toFixed(2));

    // Cannot cash out above crash point
    const crashPoint = parseFloat(round.crashPoint.toString());
    if (currentMult >= crashPoint) {
      throw new BadRequestException('Too late — round already crashed');
    }

    const payout = parseFloat(new Decimal(bet.stake).mul(currentMult).toFixed(2));
    const profit = parseFloat(new Decimal(payout).sub(bet.stake).toFixed(2));

    await this.prisma.$transaction([
      this.prisma.bet.update({
        where: { id: bet.id },
        data: {
          status: BetStatus.WON,
          cashedOutAt: currentMult,
          profit,
        },
      }),
    ]);

    await this.walletService.creditWin(userId, payout, roundId, currentMult);

    return { cashedOutAt: currentMult, payout, profit };
  }

  async getUserBets(userId: string, take = 20) {
    return this.prisma.bet.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take,
      include: { round: { select: { roundNumber: true, crashPoint: true } } },
    });
  }
}

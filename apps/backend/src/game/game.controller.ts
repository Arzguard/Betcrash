import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { GameService } from './game.service';
import { PlaceBetDto } from './dto/place-bet.dto';

@ApiTags('game')
@Controller('game')
export class GameController {
  constructor(private readonly gameService: GameService) {}

  // ── Public ────────────────────────────────────────────────────────────────

  @Get('round/current')
  getCurrentRound() {
    return this.gameService.getCurrentRound();
  }

  @Get('round/history')
  getRoundHistory() {
    return this.gameService.getRoundHistory(30);
  }

  // ── Player (authenticated) ────────────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('bet')
  placeBet(@Req() req: any, @Body() body: PlaceBetDto) {
    return this.gameService.placeBet(req.user.id, body.roundId, body.stake, body.autoCashAt);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('cashout/:roundId')
  cashOut(@Req() req: any, @Param('roundId') roundId: string) {
    return this.gameService.cashOut(req.user.id, roundId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('bets')
  getUserBets(@Req() req: any) {
    return this.gameService.getUserBets(req.user.id);
  }

  // ── Admin (ADMIN role required) ──────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('round/create')
  createRound() {
    return this.gameService.createRound();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('round/:id/start')
  startRound(@Param('id') id: string) {
    return this.gameService.startRound(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('round/:id/crash')
  crashRound(@Param('id') id: string) {
    return this.gameService.crashRound(id);
  }
}

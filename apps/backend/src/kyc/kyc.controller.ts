import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { KycStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { KycService } from './kyc.service';
import { SubmitKycDto } from './dto/submit-kyc.dto';
import { ReviewKycDto } from './dto/review-kyc.dto';

@ApiTags('kyc')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('kyc')
export class KycController {
  constructor(private readonly kycService: KycService) {}

  // ── Player ────────────────────────────────────────────────────────────────

  @Get('status')
  getStatus(@Req() req: any) {
    return this.kycService.getStatus(req.user.id);
  }

  @Post('submit')
  submit(@Req() req: any, @Body() body: SubmitKycDto) {
    return this.kycService.submit(req.user.id, body);
  }

  // ── Admin ─────────────────────────────────────────────────────────────────

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiQuery({ name: 'status', enum: KycStatus, required: false })
  @Get('queue')
  getQueue(@Query('status') status?: KycStatus) {
    return this.kycService.getQueue(status);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Patch(':id/review')
  review(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: ReviewKycDto,
  ) {
    return this.kycService.review(id, req.user.id, body);
  }
}

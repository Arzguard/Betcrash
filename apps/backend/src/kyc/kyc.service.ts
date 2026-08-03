import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KycStatus } from '@prisma/client';
import { SubmitKycDto } from './dto/submit-kyc.dto';
import { ReviewKycDto } from './dto/review-kyc.dto';

@Injectable()
export class KycService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(userId: string) {
    const kyc = await this.prisma.kycSubmission.findUnique({ where: { userId } });
    if (!kyc) return { status: 'NOT_SUBMITTED' };
    return { status: kyc.status, submittedAt: kyc.createdAt, reviewedAt: kyc.reviewedAt };
  }

  async submit(userId: string, dto: SubmitKycDto) {
    const existing = await this.prisma.kycSubmission.findUnique({ where: { userId } });
    if (existing) {
      if (existing.status === KycStatus.APPROVED) {
        throw new BadRequestException('Your identity is already verified.');
      }
      // Allow resubmission if previously rejected
      if (existing.status === KycStatus.REJECTED) {
        return this.prisma.kycSubmission.update({
          where: { userId },
          data: {
            idNumber: dto.idNumber,
            dateOfBirth: new Date(dto.dateOfBirth),
            idDocumentUrl: dto.idDocumentUrl,
            selfieUrl: dto.selfieUrl,
            status: KycStatus.PENDING,
            rejectReason: null,
            reviewedAt: null,
            reviewedBy: null,
          },
        });
      }
      throw new BadRequestException('KYC already submitted and pending review.');
    }

    // Enforce: one account per national ID number
    const idTaken = await this.prisma.kycSubmission.findUnique({
      where: { idNumber: dto.idNumber },
    });
    if (idTaken) {
      throw new BadRequestException(
        'This ID number is already linked to an existing account.',
      );
    }

    return this.prisma.kycSubmission.create({
      data: {
        userId,
        idNumber: dto.idNumber,
        dateOfBirth: new Date(dto.dateOfBirth),
        idDocumentUrl: dto.idDocumentUrl ?? null,
        selfieUrl: dto.selfieUrl ?? null,
        status: KycStatus.PENDING,
      },
    });
  }

  // ── Admin endpoints ───────────────────────────────────────────────────────

  async getQueue(status?: KycStatus) {
    return this.prisma.kycSubmission.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
      },
    });
  }

  async review(submissionId: string, adminId: string, dto: ReviewKycDto) {
    const submission = await this.prisma.kycSubmission.findUnique({
      where: { id: submissionId },
    });
    if (!submission) throw new NotFoundException('KYC submission not found');
    if (submission.status !== KycStatus.PENDING) {
      throw new BadRequestException('Submission is already reviewed');
    }

    if (dto.approved && submission.status === KycStatus.PENDING) {
      // Double-check for duplicate ID across other approved accounts
      const duplicate = await this.prisma.kycSubmission.findFirst({
        where: {
          idNumber: submission.idNumber,
          status: KycStatus.APPROVED,
          id: { not: submissionId },
        },
      });
      if (duplicate) {
        throw new ForbiddenException(
          'Cannot approve — ID number is already approved on another account.',
        );
      }
    }

    return this.prisma.kycSubmission.update({
      where: { id: submissionId },
      data: {
        status: dto.approved ? KycStatus.APPROVED : KycStatus.REJECTED,
        reviewedBy: adminId,
        reviewedAt: new Date(),
        rejectReason: dto.rejectReason ?? null,
        idMatchScore: dto.idMatchScore ?? null,
      },
    });
  }
}

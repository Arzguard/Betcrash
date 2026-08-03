import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(data: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new UnauthorizedException('Email already registered');

    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await this.prisma.user.create({
      data: { name: data.name, email: data.email, phone: data.phone, passwordHash, role: 'USER' },
    });

    // Auto-create wallet for new user
    await this.prisma.wallet.create({ data: { userId: user.id } });

    const response = await this.buildAuthResponse(user.id, user.email, user.role);
    await this.storeRefreshToken(user.id, response.refreshToken);
    return response;
  }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return null;
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return null;
    return user;
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const response = await this.buildAuthResponse(user.id, user.email, user.role);
    await this.storeRefreshToken(user.id, response.refreshToken);
    return response;
  }

  async refreshToken(token: string) {
    try {
      const decoded = this.jwtService.verify(token, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
      const user = await this.prisma.user.findUnique({ where: { id: decoded.sub } });
      if (!user || user.refreshToken !== token) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      const response = await this.buildAuthResponse(user.id, user.email, user.role);
      await this.storeRefreshToken(user.id, response.refreshToken);
      return response;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { refreshToken: null } });
    return { success: true };
  }

  private async storeRefreshToken(userId: string, refreshToken: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { refreshToken } });
  }

  private createTokens(userId: string) {
    const accessToken = this.jwtService.sign(
      { sub: userId },
      { expiresIn: '15m' },
    );
    const refreshToken = this.jwtService.sign(
      { sub: userId },
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: '7d',
      },
    );
    return { accessToken, refreshToken };
  }

  async buildAuthResponse(userId: string, email: string, role: string) {
    const tokens = this.createTokens(userId);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: { id: userId, email, role },
    };
  }
}

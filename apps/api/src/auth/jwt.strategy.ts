import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from './current-user.decorator';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'dev-secret-change-me',
    });
  }

  async validate(payload: { sub: string; phone: string | null; role: string; authVersion?: number }): Promise<CurrentUserPayload> {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(payload.sub) },
      select: {
        id: true,
        phone: true,
        role: true,
        rankLevel: true,
        status: true,
        authVersion: true,
        adminPermissionsCustomized: true,
        adminPermissionCodes: true,
      },
    });
    if (!user || user.status !== 0) throw new UnauthorizedException('账号不存在或已被冻结');
    if (user.authVersion !== (payload.authVersion ?? 0)) throw new UnauthorizedException('登录凭据已更新，请重新登录');
    return {
      id: user.id,
      phone: user.phone,
      role: user.role,
      rankLevel: user.rankLevel,
      adminPermissionsCustomized: user.adminPermissionsCustomized,
      adminPermissionCodes: user.adminPermissionCodes,
    };
  }
}

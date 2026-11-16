import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { Err } from '../common/business.exception';
import { PrismaService } from '../prisma/prisma.service';
import { RelationService } from '../relation/relation.service';
import { Public } from './public.decorator';

@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly relation: RelationService,
  ) {}

  @Public()
  @Post('register')
  async register(
    @Body() body: { phone: string; password: string; inviteCode?: string; nickname?: string; deviceFingerprint?: string },
  ) {
    if (!/^1\d{10}$/.test(body.phone ?? '')) throw Err.param('手机号格式不正确');
    if (!body.password || body.password.length < 6) throw Err.param('密码至少 6 位');
    if (await this.prisma.user.findUnique({ where: { phone: body.phone } })) {
      throw Err.param('该手机号已注册');
    }

    const parent = body.inviteCode
      ? await this.prisma.user.findUnique({ where: { inviteCode: body.inviteCode } })
      : null;
    if (body.inviteCode && (!parent || parent.status !== 0)) throw Err.param('推荐码无效或推荐人已注销');

    const inviteCode = await this.relation.generateInviteCode();
    const user = await this.prisma.user.create({
      data: {
        phone: body.phone,
        passwordHash: bcrypt.hashSync(body.password, 10),
        nickname: body.nickname ?? `会员${body.phone.slice(-4)}`,
        inviteCode,
        deviceFingerprint: body.deviceFingerprint,
        parentId: parent?.id ?? null,
        path: parent ? `${parent.path}${parent.id},` : ',',
        depth: parent ? parent.depth + 1 : 0,
      },
    });
    await this.prisma.wallet.create({ data: { userId: user.id } });
    await this.prisma.equityAccount.create({ data: { userId: user.id } });

    return this.sign(user.id, user.phone, user.role);
  }

  @Public()
  @HttpCode(200)
  @Post('login')
  async login(@Body() body: { phone: string; password: string }) {
    const user = await this.prisma.user.findUnique({ where: { phone: body.phone } });
    if (!user || !user.passwordHash || !bcrypt.compareSync(body.password ?? '', user.passwordHash)) {
      throw Err.unauthorized('手机号或密码错误');
    }
    if (user.status !== 0) throw Err.forbidden('账号已被冻结');
    return this.sign(user.id, user.phone, user.role);
  }

  private async sign(id: bigint, phone: string | null, role: string) {
    const token = this.jwt.sign({ sub: id.toString(), phone, role });
    return { token, tokenType: 'Bearer', user: { id: id.toString(), phone, role } };
  }
}

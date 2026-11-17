import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { Err } from '../common/business.exception';
import { PrismaService } from '../prisma/prisma.service';
import { RelationService, assertDepthAllowed } from '../relation/relation.service';
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
    if (!body || typeof body !== 'object') throw Err.param('请填写注册信息');
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : '';
    const inviteCode = typeof body.inviteCode === 'string' ? body.inviteCode.trim().toUpperCase() : '';
    const deviceFingerprint = typeof body.deviceFingerprint === 'string' ? body.deviceFingerprint.trim() : '';
    if (!/^1[3-9]\d{9}$/.test(phone)) throw Err.param('手机号格式不正确');
    if (password.length < 8 || password.length > 64) throw Err.param('密码长度须为 8 至 64 位');
    if (nickname && (nickname.length < 2 || nickname.length > 64)) throw Err.param('昵称长度须为 2 至 64 个字符');
    if (inviteCode && !/^[A-Z0-9]{4,32}$/.test(inviteCode)) throw Err.param('邀请码格式不正确');
    if (deviceFingerprint.length > 128) throw Err.param('设备标识格式不正确');
    if (await this.prisma.user.findUnique({ where: { phone } })) {
      throw Err.param('该手机号已注册');
    }

    const parent = inviteCode
      ? await this.prisma.user.findUnique({ where: { inviteCode } })
      : null;
    if (inviteCode && (!parent || parent.status !== 0)) throw Err.param('推荐码无效或推荐人已注销');
    if (parent) assertDepthAllowed(parent.depth + 1);

    const generatedInviteCode = await this.relation.generateInviteCode();
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          phone,
          passwordHash,
          nickname: nickname || `会员${phone.slice(-4)}`,
          inviteCode: generatedInviteCode,
          deviceFingerprint: deviceFingerprint || null,
          parentId: parent?.id ?? null,
          path: parent ? `${parent.path}${parent.id},` : ',',
          depth: parent ? parent.depth + 1 : 0,
        },
      });
      await tx.wallet.create({ data: { userId: created.id } });
      await tx.transferQuotaAccount.create({ data: { userId: created.id } });
      return created;
    });

    return this.sign(user.id, user.phone, user.role, user.authVersion);
  }

  @Public()
  @HttpCode(200)
  @Post('login')
  async login(@Body() body: { phone: string; password: string }) {
    if (!body || typeof body !== 'object') throw Err.param('请输入手机号和密码');
    const user = await this.prisma.user.findUnique({ where: { phone: body.phone } });
    if (!user || !user.passwordHash || !bcrypt.compareSync(body.password ?? '', user.passwordHash)) {
      throw Err.unauthorized('手机号或密码错误');
    }
    if (user.status !== 0) throw Err.forbidden('账号已被冻结');
    return this.sign(user.id, user.phone, user.role, user.authVersion);
  }

  private async sign(id: bigint, phone: string | null, role: string, authVersion = 0) {
    const token = this.jwt.sign({ sub: id.toString(), phone, role, authVersion });
    return { token, tokenType: 'Bearer', user: { id: id.toString(), phone, role } };
  }
}

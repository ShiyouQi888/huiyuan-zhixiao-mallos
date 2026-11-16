import { Body, Controller, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request } from 'express';
import bcrypt from 'bcryptjs';
import {
  ADMIN_PERMISSION_MODULES,
  ADMIN_ROLE_LABELS,
  ADMIN_ROLE_PERMISSION_CODES,
  isAdminRole,
  type AdminRole,
} from '@solar/shared';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { Err } from '../common/business.exception';
import { PrismaService } from '../prisma/prisma.service';
import { RelationService } from '../relation/relation.service';

const ADMIN_ROLES = Object.keys(ADMIN_ROLE_LABELS) as AdminRole[];
const accountSelect = {
  id: true,
  nickname: true,
  phone: true,
  role: true,
  status: true,
  adminPermissionsCustomized: true,
  adminPermissionCodes: true,
  createdAt: true,
  updatedAt: true,
} as const;

type AccountSnapshot = {
  nickname: string | null;
  phone: string | null;
  role: string;
  status: number;
  adminPermissionsCustomized: boolean;
  adminPermissionCodes: string[];
};

@Controller('api/admin/operators')
@Roles('SUPER_ADMIN')
export class OperatorAccountsController {
  constructor(private readonly prisma: PrismaService, private readonly relation: RelationService) {}

  @Get('access')
  @Roles('SUPER_ADMIN', 'OPERATOR', 'FINANCE', 'SUPPORT')
  access(@CurrentUser() user: CurrentUserPayload) {
    const role = user.role;
    const permissionCodes = role === 'SUPER_ADMIN'
      ? ADMIN_ROLE_PERMISSION_CODES.SUPER_ADMIN
      : user.adminPermissionsCustomized
        ? user.adminPermissionCodes
        : isAdminRole(role) ? ADMIN_ROLE_PERMISSION_CODES[role] : [];

    return {
      role,
      roleLabel: isAdminRole(role) ? ADMIN_ROLE_LABELS[role] : '管理员',
      permissionCodes,
      permissionsCustomized: user.adminPermissionsCustomized,
    };
  }

  @Get()
  list(@Query('keyword') keyword?: string, @Query('status') status?: string) {
    const statusNumber = status !== undefined && ['0', '1'].includes(status) ? Number(status) : undefined;
    return this.prisma.user.findMany({
      where: {
        role: { in: ADMIN_ROLES },
        status: statusNumber === undefined ? { not: 2 } : statusNumber,
        ...(keyword?.trim() ? {
          OR: [
            { nickname: { contains: keyword.trim(), mode: 'insensitive' } },
            { phone: { contains: keyword.trim() } },
          ],
        } : {}),
      },
      orderBy: [{ role: 'asc' }, { createdAt: 'desc' }],
      take: 200,
      select: accountSelect,
    }).then((accounts) => accounts.map((account) => ({ ...account, id: account.id.toString() })));
  }

  @Post()
  async create(
    @Body() body: { nickname?: string; phone?: string; password?: string; role?: string; permissionCodes?: string[] | null },
    @CurrentUser() operator: CurrentUserPayload,
    @Req() request: Request,
  ) {
    const nickname = this.validateNickname(body.nickname);
    const phone = this.validatePhone(body.phone);
    const password = this.validatePassword(body.password, true)!;
    const role = this.validateRole(body.role);
    const permissions = this.normalizePermissions(role, body.permissionCodes);

    if (await this.prisma.user.findUnique({ where: { phone } })) {
      throw Err.conflict('该手机号已关联系统账号，不能重复分配');
    }

    const inviteCode = await this.relation.generateInviteCode();
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.user.create({
        data: {
          nickname,
          phone,
          passwordHash: bcrypt.hashSync(password, 10),
          inviteCode,
          role,
          adminPermissionsCustomized: permissions.customized,
          adminPermissionCodes: permissions.codes,
        },
        select: accountSelect,
      });
      await this.writeAudit(tx, operator.id, 'ADMIN_ACCOUNT_CREATED', account.id, null, this.snapshot(account), request);
      return { ...account, id: account.id.toString() };
    });
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { nickname?: string; password?: string; role?: string; permissionCodes?: string[] | null },
    @CurrentUser() operator: CurrentUserPayload,
    @Req() request: Request,
  ) {
    const accountId = this.parseId(id);
    const before = await this.findAdminAccount(accountId);
    const role = body.role === undefined ? this.validateRole(before.role) : this.validateRole(body.role);
    if (operator.id === accountId && role !== before.role) throw Err.param('不能在当前会话中修改自己的管理员角色');

    const permissions = body.permissionCodes !== undefined
      ? this.normalizePermissions(role, body.permissionCodes)
      : role === before.role
        ? { customized: before.adminPermissionsCustomized, codes: before.adminPermissionCodes }
        : { customized: false, codes: [] as string[] };
    const nickname = body.nickname === undefined ? before.nickname : this.validateNickname(body.nickname);
    const password = body.password === undefined || body.password === '' ? undefined : this.validatePassword(body.password, true);

    await this.ensureSuperAdminRemains(before, role, before.status);
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.user.update({
        where: { id: accountId },
        data: {
          nickname,
          role,
          adminPermissionsCustomized: permissions.customized,
          adminPermissionCodes: permissions.codes,
          ...(password ? { passwordHash: bcrypt.hashSync(password, 10) } : {}),
        },
        select: accountSelect,
      });
      await this.writeAudit(tx, operator.id, 'ADMIN_ACCOUNT_UPDATED', account.id, this.snapshot(before), this.snapshot(account), request);
      return { ...account, id: account.id.toString() };
    });
  }

  @Put(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status?: number },
    @CurrentUser() operator: CurrentUserPayload,
    @Req() request: Request,
  ) {
    const accountId = this.parseId(id);
    const before = await this.findAdminAccount(accountId);
    if (body.status !== 0 && body.status !== 1) throw Err.param('账号状态无效');
    if (operator.id === accountId && body.status !== 0) throw Err.param('不能停用当前登录的管理员账号');
    await this.ensureSuperAdminRemains(before, before.role, body.status);

    return this.prisma.$transaction(async (tx) => {
      const account = await tx.user.update({ where: { id: accountId }, data: { status: body.status }, select: accountSelect });
      await this.writeAudit(
        tx,
        operator.id,
        body.status === 1 ? 'ADMIN_ACCOUNT_DISABLED' : 'ADMIN_ACCOUNT_ENABLED',
        account.id,
        this.snapshot(before),
        this.snapshot(account),
        request,
      );
      return { ...account, id: account.id.toString() };
    });
  }

  private validateNickname(value?: string): string {
    const nickname = value?.trim() ?? '';
    if (nickname.length < 2 || nickname.length > 64) throw Err.param('账号名称长度需为 2–64 个字符');
    return nickname;
  }

  private validatePhone(value?: string): string {
    const phone = value?.trim() ?? '';
    if (!/^1[3-9]\d{9}$/.test(phone)) throw Err.param('请输入有效的 11 位大陆手机号');
    return phone;
  }

  private validatePassword(value?: string, required = false): string | undefined {
    if (value === undefined || value === '') {
      if (required) throw Err.param('请设置至少 8 位登录密码');
      return undefined;
    }
    if (value.length < 8 || value.length > 64) throw Err.param('登录密码长度需为 8–64 位');
    return value;
  }

  private validateRole(value?: string): AdminRole {
    if (!value || !isAdminRole(value)) throw Err.param('管理员角色无效');
    return value;
  }

  private normalizePermissions(role: AdminRole, permissionCodes?: string[] | null) {
    if (role === 'SUPER_ADMIN' || permissionCodes == null) return { customized: false, codes: [] as string[] };
    if (!Array.isArray(permissionCodes)) throw Err.param('权限范围格式不正确');
    const codes = [...new Set(permissionCodes)];
    const roleCodes = ADMIN_ROLE_PERMISSION_CODES[role];
    const knownCodes = new Set(ADMIN_PERMISSION_MODULES.map((module) => module.code));
    if (codes.length === 0) throw Err.param('至少保留一个页面权限');
    if (codes.some((code) => !knownCodes.has(code) || !roleCodes.includes(code))) {
      throw Err.param('所选页面权限超出该角色的授权范围');
    }
    return { customized: true, codes };
  }

  private parseId(value: string): bigint {
    if (!/^\d+$/.test(value)) throw Err.param('运营账号 ID 无效');
    return BigInt(value);
  }

  private async findAdminAccount(id: bigint) {
    const account = await this.prisma.user.findFirst({ where: { id, role: { in: ADMIN_ROLES } } });
    if (!account) throw Err.notFound('运营账号不存在');
    return account;
  }

  private async ensureSuperAdminRemains(account: AccountSnapshot, nextRole: string, nextStatus: number) {
    const isRemovingActiveSuperAdmin = account.role === 'SUPER_ADMIN' && account.status === 0
      && (nextRole !== 'SUPER_ADMIN' || nextStatus !== 0);
    if (!isRemovingActiveSuperAdmin) return;
    const activeSuperAdmins = await this.prisma.user.count({ where: { role: 'SUPER_ADMIN', status: 0 } });
    if (activeSuperAdmins <= 1) throw Err.conflict('系统至少需要保留一名正常状态的超级管理员');
  }

  private snapshot(account: AccountSnapshot) {
    return {
      nickname: account.nickname,
      phone: account.phone ? account.phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2') : null,
      role: account.role,
      status: account.status,
      permissionsCustomized: account.adminPermissionsCustomized,
      permissionCodes: account.adminPermissionCodes,
    };
  }

  private writeAudit(
    tx: Prisma.TransactionClient,
    operatorId: bigint,
    action: string,
    targetId: bigint,
    before: ReturnType<OperatorAccountsController['snapshot']> | null,
    after: ReturnType<OperatorAccountsController['snapshot']>,
    request: Request,
  ) {
    return tx.auditLog.create({
      data: {
        operatorType: 'ADMIN',
        operatorId,
        action,
        targetType: 'ADMIN_ACCOUNT',
        targetId,
        before: before as never,
        after: after as never,
        ip: request.ip?.slice(0, 64),
        ua: request.headers['user-agent']?.slice(0, 512),
      },
    });
  }
}

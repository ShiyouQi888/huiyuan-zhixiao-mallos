import { Injectable } from '@nestjs/common';
import { BusinessException } from '../common/business.exception';
import { CurrentUserPayload } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { UserService } from '../user/user.service';
import { SettlementService } from '../settlement/settlement.service';
import { AdminAdjustService } from './admin-adjust.service';

export type ApprovalType = 'RANK_ADJUST' | 'BONUS_ADJUST' | 'SETTLEMENT_RERUN' | 'REBIND';

/** 双人复核：运营提交申请，财务/超管复核后执行。超管可单人直通。 */
@Injectable()
export class ApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UserService,
    private readonly settlement: SettlementService,
    private readonly adjust: AdminAdjustService,
  ) {}

  async apply(type: ApprovalType, payload: Record<string, unknown>, applicant: CurrentUserPayload, remark?: string) {
    // 超管单人直通，无需复核
    if (applicant.role === 'SUPER_ADMIN') {
      return { direct: true, result: await this.execute(type, payload, applicant.id) };
    }
    if (applicant.role !== 'OPERATOR') {
      throw new BusinessException(2002, '只有运营或超管可以提交申请');
    }
    const approval = await this.prisma.approval.create({
      data: {
        type,
        applicantId: applicant.id,
        applicantRole: applicant.role,
        payload: payload as never,
        remark,
      },
    });
    return { direct: false, approval };
  }

  async approve(id: bigint, reviewer: CurrentUserPayload, pass: boolean, remark?: string) {
    if (reviewer.role !== 'FINANCE' && reviewer.role !== 'SUPER_ADMIN') {
      throw new BusinessException(2002, '只有财务或超管可以复核');
    }
    const approval = await this.prisma.approval.findUnique({ where: { id } });
    if (!approval) throw new BusinessException(4003, '审批记录不存在');
    if (approval.status !== 'PENDING') throw new BusinessException(3002, '该申请已处理');
    if (approval.applicantId === reviewer.id) throw new BusinessException(2002, '不能复核自己提交的申请');

    if (!pass) {
      return this.prisma.approval.update({
        where: { id },
        data: { status: 'REJECTED', reviewerId: reviewer.id, reviewedAt: new Date(), remark },
      });
    }

    // 先执行业务，成功后再标记通过（失败则申请保持 PENDING 可重试）
    const result = await this.execute(
      approval.type as ApprovalType,
      approval.payload as Record<string, unknown>,
      reviewer.id,
    );
    return this.prisma.approval.update({
      where: { id },
      data: { status: 'APPROVED', reviewerId: reviewer.id, reviewedAt: new Date(), remark, result: result as never },
    });
  }

  private async execute(type: ApprovalType, payload: Record<string, unknown>, operatorId: bigint) {
    switch (type) {
      case 'RANK_ADJUST':
        return this.users.adjustRank(BigInt(payload.userId as string), Number(payload.level));
      case 'BONUS_ADJUST':
        return this.adjust.adjustBonus(
          BigInt(payload.userId as string), BigInt(payload.amount as number), String(payload.reason ?? '手工调整奖金'), operatorId,
        );
      case 'SETTLEMENT_RERUN':
        return this.settlement.settle(payload.date ? new Date(payload.date as string) : undefined, true);
      case 'REBIND': {
        const userId = BigInt(payload.userId as string);
        const parentId = payload.parentId ? BigInt(payload.parentId as string) : null;
        return this.prisma.$transaction(async (tx) => {
          const member = await tx.user.findUnique({ where: { id: userId }, select: { id: true, path: true, depth: true, parentId: true } });
          if (!member) throw new BusinessException(4003, '会员不存在');
          const parent = parentId ? await tx.user.findUnique({ where: { id: parentId }, select: { id: true, path: true, depth: true, role: true, status: true } }) : null;
          if (parentId && (!parent || parent.role !== 'MEMBER' || parent.status !== 0)) throw new BusinessException(3002, '新推荐人不存在或状态不可用');
          if (parent && (parent.id === userId || parent.path.includes(`,${userId},`))) throw new BusinessException(3002, '不能绑定到当前会员的下级，避免形成循环关系');

          const oldPrefix = `${member.path}${member.id},`;
          const newPath = parent ? `${parent.path}${parent.id},` : ',';
          const newPrefix = `${newPath}${member.id},`;
          const nextDepth = parent ? parent.depth + 1 : 0;
          const descendants = await tx.user.findMany({
            where: { path: { startsWith: oldPrefix } },
            select: { id: true, path: true, depth: true },
          });

          await tx.user.update({
            where: { id: userId },
            data: {
              parentId: parent?.id ?? null,
              path: newPath,
              depth: nextDepth,
              peerBonusLocked: false,
              peerBonusLockedAt: null,
            },
          });
          const depthShift = nextDepth - member.depth;
          await Promise.all(descendants.map((descendant) => tx.user.update({
            where: { id: descendant.id },
            data: {
              path: `${newPrefix}${descendant.path.slice(oldPrefix.length)}`,
              depth: descendant.depth + depthShift,
            },
          })));
          await tx.auditLog.create({
            data: {
              operatorType: 'ADMIN', operatorId, action: 'REBIND',
              targetType: 'USER', targetId: userId,
              before: { parentId: member.parentId?.toString() ?? null } as never,
              after: { parentId: parent?.id?.toString() ?? null, descendantCount: descendants.length } as never,
            },
          });
          return { userId, parentId: parent?.id ?? null, descendantCount: descendants.length };
        });
      }
      default:
        throw new BusinessException(1001, `未知的审批类型: ${type}`);
    }
  }

  async list(status?: string, page = 1, pageSize = 20, applicantId?: bigint) {
    const where = {
      ...(status ? { status } : {}),
      ...(applicantId ? { applicantId } : {}),
    };
    const [list, total] = await Promise.all([
      this.prisma.approval.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.approval.count({ where }),
    ]);
    const payloads = list.map((item) => item.payload as Record<string, unknown>);
    const memberIds = [...new Set(payloads.flatMap((payload) => [payload.userId, payload.parentId])
      .filter((id): id is string => typeof id === 'string' && /^\d+$/.test(id)))];
    const members = memberIds.length ? await this.prisma.user.findMany({
      where: { id: { in: memberIds.map((id) => BigInt(id)) } },
      select: {
        id: true, nickname: true, phone: true, rankLevel: true, status: true,
        parent: { select: { id: true, nickname: true, phone: true } },
      },
    }) : [];
    const memberMap = new Map(members.map((member) => [member.id.toString(), member]));
    return {
      list: list.map((item, index) => ({
        ...item,
        targetUser: memberMap.get(String(payloads[index].userId ?? '')) ?? null,
        newParent: memberMap.get(String(payloads[index].parentId ?? '')) ?? null,
      })),
      total,
      page,
      pageSize,
    };
  }
}

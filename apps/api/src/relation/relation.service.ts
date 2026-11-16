import { Injectable } from '@nestjs/common';
import { Err } from '../common/business.exception';
import { PrismaService } from '../prisma/prisma.service';

/** 推荐关系最大层级深度（根节点 depth=0，第 N 层 depth=N）。
 *  path 是物化路径，长度随深度线性增长（每层约 +5 字符），
 *  既要在数据库侧用 Text 承载，也要在业务侧设上限防止无限扩张。 */
export const MAX_TREE_DEPTH = 1000;

/** 校验新层级是否超出上限，超出则抛参数异常 */
export function assertDepthAllowed(nextDepth: number): void {
  if (nextDepth > MAX_TREE_DEPTH) {
    throw Err.param(`推荐关系层级已达上限（最大 ${MAX_TREE_DEPTH} 层），无法继续绑定`);
  }
}

export interface TreeNode {
  id: string;
  nickname: string | null;
  phone: string | null;
  rankLevel: number;
  depth: number;
  packageId: number | null;
  children: TreeNode[];
}

/** 关系树服务：path 物化路径，插入 O(1)，伞下查询 O(N) 前缀匹配 */
@Injectable()
export class RelationService {
  constructor(private readonly prisma: PrismaService) {}

  /** 注册时绑定推荐人。推荐人不存在/注销 → 不绑定 */
  async bindParent(userId: bigint, parentId: bigint | null): Promise<boolean> {
    if (!parentId) return false;
    const parent = await this.prisma.user.findUnique({ where: { id: parentId } });
    if (!parent || parent.status !== 0 || parent.id === userId) return false;

    const nextDepth = parent.depth + 1;
    assertDepthAllowed(nextDepth);

    const path = `${parent.path}${parent.id},`;
    await this.prisma.user.update({
      where: { id: userId },
      data: { parentId: parent.id, path, depth: nextDepth },
    });
    return true;
  }

  /** 伞下所有后代 ID（无限层，不含自己） */
  async getDescendantIds(userId: bigint): Promise<bigint[]> {
    const rows = await this.prisma.user.findMany({
      where: { path: { contains: `,${userId},` } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /** 直属下级 */
  async getDirectChildren(userId: bigint) {
    return this.prisma.user.findMany({
      where: { parentId: userId },
      select: {
        id: true,
        nickname: true,
        phone: true,
        rankLevel: true,
        packageId: true,
        equityStatus: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** 团队树（限制返回节点数，前端展示用） */
  async getTree(userId: bigint, maxDepth = 5, maxNodes = 500): Promise<TreeNode> {
    const descendants = await this.prisma.user.findMany({
      where: { path: { contains: `,${userId},` } },
      select: { id: true, parentId: true, nickname: true, phone: true, rankLevel: true, depth: true, packageId: true },
      orderBy: { depth: 'asc' },
      take: maxNodes,
    });

    const root = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, nickname: true, phone: true, rankLevel: true, depth: true, packageId: true },
    });
    if (!root) throw new Error('用户不存在');

    const toNode = (u: typeof root): TreeNode => ({
      id: u.id.toString(),
      nickname: u.nickname,
      phone: u.phone ? u.phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2') : null,
      rankLevel: u.rankLevel,
      depth: u.depth,
      packageId: u.packageId,
      children: [],
    });

    const rootNode = toNode(root);
    const map = new Map<string, TreeNode>([[rootNode.id, rootNode]]);

    for (const u of descendants) {
      if (u.depth - root.depth > maxDepth) continue;
      const node = toNode(u);
      map.set(node.id, node);
      const parent = u.parentId ? map.get(u.parentId.toString()) : undefined;
      if (parent) parent.children.push(node);
    }
    return rootNode;
  }

  /** 生成唯一邀请码 */
  async generateInviteCode(): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const code = Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, '0');
      const exists = await this.prisma.user.findUnique({ where: { inviteCode: code } });
      if (!exists) return code;
    }
    throw new Error('邀请码生成失败');
  }
}

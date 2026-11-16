import { Injectable, Logger } from '@nestjs/common';
import { FileAsset } from '@prisma/client';
import { existsSync } from 'fs';
import { mkdir, unlink } from 'fs/promises';
import { join, extname } from 'path';
import { randomUUID } from 'crypto';
import { BusinessException } from '../common/business.exception';
import { PrismaService } from '../prisma/prisma.service';

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf', 'application/zip',
]);
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

/** 本地文件管理：上传落盘 + 元数据入库，静态目录由 Nest 暴露 */
@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private readonly root = join(process.cwd(), 'uploads');

  constructor(private readonly prisma: PrismaService) {}

  /** 返回相对 URL，如 /uploads/2026/11/uuid.png */
  async upload(file: Express.Multer.File, category = 'OTHER', uploadedBy?: bigint): Promise<FileAsset> {
    if (!file) throw new BusinessException(1001, '请选择文件');
    if (!ALLOWED_MIME.has(file.mimetype)) throw new BusinessException(1001, `不支持的文件类型: ${file.mimetype}`);
    if (file.size > MAX_SIZE) throw new BusinessException(1001, '文件大小不能超过 10MB');

    const now = new Date();
    const dir = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
    const fullDir = join(this.root, dir);
    await mkdir(fullDir, { recursive: true });

    const ext = extname(file.originalname).toLowerCase() || '.bin';
    const filename = `${randomUUID()}${ext}`;
    await import('fs/promises').then((fs) => fs.writeFile(join(fullDir, filename), file.buffer));

    const url = `/uploads/${dir}/${filename}`;
    return this.prisma.fileAsset.create({
      data: {
        filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        url,
        category,
        uploadedBy: uploadedBy ?? null,
      },
    });
  }

  async list(category?: string, keyword?: string, page = 1, pageSize = 24) {
    const where: Record<string, unknown> = {};
    if (category && category !== 'ALL') where.category = category;
    if (keyword) where.originalName = { contains: keyword, mode: 'insensitive' };

    const [list, total] = await Promise.all([
      this.prisma.fileAsset.findMany({
        where: where as never,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.fileAsset.count({ where: where as never }),
    ]);
    return { list, total, page, pageSize };
  }

  async detail(id: bigint) {
    const file = await this.prisma.fileAsset.findUnique({ where: { id } });
    if (!file) throw new BusinessException(4003, '文件不存在');
    return file;
  }

  /** 删除数据库记录 + 磁盘文件 */
  async remove(id: bigint): Promise<void> {
    const file = await this.detail(id);
    const diskPath = join(process.cwd(), file.url.replace(/^\//, ''));
    if (existsSync(diskPath)) {
      await unlink(diskPath).catch((e) => this.logger.warn(`删除磁盘文件失败: ${e.message}`));
    }
    await this.prisma.fileAsset.delete({ where: { id } });
  }

  /** 批量清理未被引用的文件（可选运维操作） */
  async listUnreferenced(limit = 100) {
    const files = await this.prisma.fileAsset.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const urls = new Set<string>();
    const products = await this.prisma.product.findMany({ select: { images: true, details: true } });
    for (const p of products) {
      for (const u of [...(p.images as string[]), ...(p.details as string[])]) urls.add(u);
    }
    const categories = await this.prisma.productCategory.findMany({ select: { icon: true } });
    for (const c of categories) if (c.icon?.startsWith('/uploads/')) urls.add(c.icon);
    return files.filter((f) => !urls.has(f.url));
  }
}

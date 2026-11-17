import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { existsSync, createReadStream } from 'fs';
import { extname, isAbsolute, join, relative, resolve } from 'path';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { BusinessException } from '../common/business.exception';
import { Public } from '../auth/public.decorator';
import { FilesService } from './files.service';

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf', '.zip': 'application/zip',
};

@Controller('api/admin/files')
@Roles('SUPER_ADMIN', 'OPERATOR')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('category') category: string | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.files.upload(file, category || 'OTHER', user.id);
  }

  @Get()
  list(
    @Query('category') category?: string,
    @Query('keyword') keyword?: string,
    @Query('page') page = '1',
  ) {
    return this.files.list(category, keyword, Number(page));
  }

  @Get('unreferenced')
  unreferenced(@Query('page') page = '1') {
    return this.files.listUnreferenced(Number(page));
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.files.detail(this.fileId(id));
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'OPERATOR')
  rename(@Param('id') id: string, @Body() body: { originalName?: string }) {
    return this.files.rename(this.fileId(id), body?.originalName ?? '');
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'OPERATOR')
  remove(@Param('id') id: string) {
    return this.files.remove(this.fileId(id)).then(() => ({ success: true }));
  }

  private fileId(value: string): bigint {
    if (!/^\d{1,18}$/.test(value) || BigInt(value) <= 0n) throw new BusinessException(1001, '文件编号格式不正确');
    return BigInt(value);
  }
}

/** 静态文件访问（无需鉴权，图片可直接在页面展示） */
@Controller('uploads')
export class UploadsController {
  @Public()
  @Get('*')
  serve(@Req() req: Request, @Res() res: Response): void {
    const rel = req.params['0'] ?? req.path.replace(/^\/?uploads\//, '');
    // 防目录穿越：规范化后必须仍在 uploads 目录内
    const root = resolve(process.cwd(), 'uploads');
    const full = resolve(root, rel);
    const relativePath = relative(root, full);
    if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) {
      if (!relativePath) throw new BusinessException(2002, '非法路径');
      throw new BusinessException(2002, '非法路径');
    }
    if (!existsSync(full)) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', MIME_MAP[extname(full).toLowerCase()] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    createReadStream(full).pipe(res);
  }
}

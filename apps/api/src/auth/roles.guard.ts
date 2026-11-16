import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ADMIN_ROLE_PERMISSION_CODES, isAdminRole, resolveAdminApiPermission } from '@solar/shared';
import { CurrentUserPayload } from './current-user.decorator';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<{ user?: CurrentUserPayload; path?: string; originalUrl?: string }>();
    const user = req.user;
    if (!user || !required.includes(user.role)) return false;

    const requestPath = req.path ?? req.originalUrl?.split('?')[0] ?? '';
    if (!requestPath.startsWith('/api/admin') || user.role === 'SUPER_ADMIN') return true;
    if (requestPath === '/api/admin/operators/access') return true;

    const permission = resolveAdminApiPermission(requestPath);
    if (!permission || !isAdminRole(user.role)) return false;
    const effectivePermissions = user.adminPermissionsCustomized
      ? user.adminPermissionCodes
      : ADMIN_ROLE_PERMISSION_CODES[user.role];
    return effectivePermissions.includes(permission);
  }
}

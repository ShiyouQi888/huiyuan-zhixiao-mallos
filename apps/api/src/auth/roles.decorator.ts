import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
/** 允许访问的角色，例：@Roles('SUPER_ADMIN', 'FINANCE') */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

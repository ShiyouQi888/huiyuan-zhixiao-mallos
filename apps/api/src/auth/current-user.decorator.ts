import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentUserPayload {
  id: bigint;
  phone: string | null;
  role: string;
  rankLevel: number;
  adminPermissionsCustomized: boolean;
  adminPermissionCodes: string[];
}

export const CurrentUser = createParamDecorator(
  (data: keyof CurrentUserPayload | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<{ user: CurrentUserPayload }>();
    const user = req.user;
    return data ? user?.[data] : user;
  },
);

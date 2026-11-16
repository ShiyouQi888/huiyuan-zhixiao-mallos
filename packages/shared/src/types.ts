/** 统一响应结构 */
export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
  traceId: string;
}

/** 分页请求 */
export interface PageQuery {
  page?: number;
  pageSize?: number;
}

/** 分页响应 */
export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** 功能开关下发结构 */
export interface FeatureFlagDTO {
  code: string;
  name: string;
  enabled: boolean;
}

/** 平台标识 */
export type Platform = 'h5' | 'app';

/** 用户角色 */
export type UserRole = 'SUPER_ADMIN' | 'OPERATOR' | 'FINANCE' | 'SUPPORT' | 'MEMBER';

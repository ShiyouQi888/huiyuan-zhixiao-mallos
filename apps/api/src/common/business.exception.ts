import { HttpException, HttpStatus } from '@nestjs/common';

/** 业务异常：携带文档约定的数字错误码 */
export class BusinessException extends HttpException {
  constructor(
    public readonly code: number,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super(message, status);
  }
}

/** 常用业务异常快捷方法 */
export const Err = {
  param: (msg: string) => new BusinessException(1001, msg),
  unauthorized: (msg = '请先登录') => new BusinessException(2001, msg, HttpStatus.UNAUTHORIZED),
  forbidden: (msg = '无权限执行此操作') => new BusinessException(2002, msg, HttpStatus.FORBIDDEN),
  needRealname: (msg = '请先完成实名认证') => new BusinessException(2004, msg),
  featureDisabled: (msg = '该功能当前不可用') => new BusinessException(2005, msg),
  insufficient: (msg = '余额不足') => new BusinessException(3001, msg),
  conflict: (msg = '状态冲突') => new BusinessException(3002, msg),
  risk: (msg = '触发风控规则') => new BusinessException(3006, msg),
  notFound: (msg = '资源不存在') => new BusinessException(4003, msg, HttpStatus.NOT_FOUND),
};

import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WritableGuard implements CanActivate {
  constructor(private config: ConfigService) {}

  canActivate(_ctx: ExecutionContext): boolean {
    if (this.config.get<boolean>('readOnly')) {
      throw new ForbiddenException('service is running in read-only mode');
    }
    return true;
  }
}

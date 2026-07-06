/**
 * UsageModule — provides the active UsageService.
 *
 * Mirrors AuthModule's strategy selection: the enterprise implementation is
 * loaded via a dynamic import (variable path, so tsc never resolves it
 * statically) and only when the ee/ tree is present. OSS builds always get
 * the no-op service.
 */
import { Global, Module, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { USAGE_SERVICE, NoopUsageService } from './usage.interface';

const usageServiceProvider = {
  provide: USAGE_SERVICE,
  inject: [ConfigService],
  useFactory: async (config: ConfigService) => {
    const eeUsagePath = '../ee/usage/ee-usage.service';
    try {
      const mod = await import(eeUsagePath);
      new Logger('UsageModule').log('Usage tracking: enterprise (quota enforcement active)');
      return new mod.EeUsageService(config);
    } catch {
      return new NoopUsageService();
    }
  },
};

@Global()
@Module({
  providers: [usageServiceProvider],
  exports: [USAGE_SERVICE],
})
export class UsageModule {}

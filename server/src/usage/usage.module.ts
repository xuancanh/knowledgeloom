/**
 * UsageModule — provides the active UsageService.
 *
 * Mirrors AuthModule's strategy selection: the extensions implementation is
 * loaded via a dynamic import (variable path, so tsc never resolves it
 * statically) and only when the extensions/ tree is present. OSS builds always get
 * the no-op service.
 */
import { Global, Module, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { USAGE_SERVICE, NoopUsageService } from './usage.interface';

const usageServiceProvider = {
  provide: USAGE_SERVICE,
  inject: [ConfigService],
  useFactory: async (config: ConfigService) => {
    const eeUsagePath = '../extensions/usage/extensions-usage.service';
    try {
      const mod = await import(eeUsagePath);
      new Logger('UsageModule').log('Usage tracking: extensions (quota enforcement active)');
      return new mod.ExtensionsUsageService(config);
    } catch {
      return new NoopUsageService(config.get<number>('maxSpaces') || 0);
    }
  },
};

@Global()
@Module({
  providers: [usageServiceProvider],
  exports: [USAGE_SERVICE],
})
export class UsageModule {}

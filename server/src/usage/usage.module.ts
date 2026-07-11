/**
 * UsageModule — provides the active UsageService.
 *
 * Mirrors AuthModule: `UsageModule.forRoot(ServiceClass)` binds an explicit
 * implementation via DI for package consumers. Without an argument, the
 * extended implementation is loaded via a dynamic import (variable path, so
 * tsc never resolves it statically) and only when the extensions/ tree is
 * present. OSS builds always get the no-op service.
 */
import { Global, Module, Logger, DynamicModule, Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { USAGE_SERVICE, NoopUsageService, UsageService } from './usage.interface';

const defaultUsageServiceProvider = {
  provide: USAGE_SERVICE,
  inject: [ConfigService],
  useFactory: async (config: ConfigService) => {
    const usageServicePath = '../extensions/usage/usage.service';
    try {
      const mod = await import(usageServicePath);
      new Logger('UsageModule').log('Usage tracking: extended (quota enforcement active)');
      return new mod.ExtensionsUsageService(config);
    } catch {
      return new NoopUsageService(config.get<number>('maxSpaces') || 0);
    }
  },
};

@Global()
@Module({
  providers: [defaultUsageServiceProvider],
  exports: [USAGE_SERVICE],
})
export class UsageModule {
  /** Binds USAGE_SERVICE to an explicit implementation class (DI-resolved). */
  static forRoot(service?: Type<UsageService>): DynamicModule {
    return {
      module: UsageModule,
      global: true,
      providers: [service ? { provide: USAGE_SERVICE, useClass: service } : defaultUsageServiceProvider],
      exports: [USAGE_SERVICE],
    };
  }
}

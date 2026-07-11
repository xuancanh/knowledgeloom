/**
 * AuthModule — selects the active AuthStrategy and provides ApiAuthGuard.
 *
 * Strategy selection (AUTH_PROVIDER env var):
 *   - 'local' (default)  — LocalAuthStrategy: single-user local mode, with an
 *                          optional AUTH_SECRET bearer token.
 *   - 'supabase'         — SupabaseAuthStrategy from the optional extension
 *                          modules. Also selected implicitly when
 *                          SUPABASE_JWT_SECRET is configured, for backward
 *                          compatibility with existing deployments.
 *
 * Composition (package consumers): `AuthModule.forRoot(StrategyClass)` binds
 * AUTH_STRATEGY to the given class via DI, bypassing env-based selection.
 * A private server app importing @knowledge-loom/server passes its strategy
 * here instead of overlaying files into this tree.
 *
 * Overlay builds (legacy): the Supabase strategy lives in
 * server/src/extensions/ (linked/merged from a private repo at build time)
 * and is loaded via a dynamic import so the OSS build has no static
 * reference to it. If it is requested but extensions/ is absent, boot fails
 * loudly rather than silently falling back to unauthenticated local mode.
 */
import { Global, Module, Logger, DynamicModule, Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AUTH_STRATEGY, AuthStrategy } from './auth-strategy.interface';
import { LocalAuthStrategy } from './local-auth.strategy';
import { ApiAuthGuard } from './auth.guard';
import { SpacesRepository } from '../spaces/spaces.repository';

const defaultAuthStrategyProvider = {
  provide: AUTH_STRATEGY,
  inject: [ConfigService],
  useFactory: async (config: ConfigService) => {
    const requested = config.get<string>('authProvider')
      || (config.get<string>('supabaseJwtSecret') ? 'supabase' : 'local');

    if (requested === 'supabase') {
      // Variable path keeps tsc from resolving the module statically; it only
      // exists in builds where extensions/ has been merged into the tree.
      const strategyPath = '../extensions/auth/supabase-auth.strategy';
      try {
        const mod = await import(strategyPath);
        new Logger('AuthModule').log('Auth provider: supabase (extensions)');
        return new mod.SupabaseAuthStrategy(config);
      } catch {
        throw new Error(
          'AUTH_PROVIDER=supabase (or SUPABASE_JWT_SECRET) requires the optional extension modules, '
          + 'which are not present in this build. Unset it to run in local mode.',
        );
      }
    }

    return new LocalAuthStrategy(config);
  },
};

@Global()
@Module({
  // SpacesRepository lives here (not in SpacesModule) because ApiAuthGuard
  // needs it on every request to validate the x-space-id header.
  providers: [defaultAuthStrategyProvider, ApiAuthGuard, SpacesRepository],
  exports: [AUTH_STRATEGY, ApiAuthGuard, SpacesRepository],
})
export class AuthModule {
  /**
   * Binds AUTH_STRATEGY to an explicit strategy class (resolved through DI,
   * so its constructor may inject ConfigService etc.). Without an argument,
   * behaves exactly like the static module: env-based selection.
   */
  static forRoot(strategy?: Type<AuthStrategy>): DynamicModule {
    return {
      module: AuthModule,
      global: true,
      providers: [
        strategy ? { provide: AUTH_STRATEGY, useClass: strategy } : defaultAuthStrategyProvider,
        ApiAuthGuard,
        SpacesRepository,
      ],
      exports: [AUTH_STRATEGY, ApiAuthGuard, SpacesRepository],
    };
  }
}

/**
 * AuthModule — selects the active AuthStrategy and provides ApiAuthGuard.
 *
 * Strategy selection (AUTH_PROVIDER env var):
 *   - 'local' (default)  — LocalAuthStrategy: single-user local mode, with an
 *                          optional AUTH_SECRET bearer token.
 *   - 'supabase'         — SupabaseAuthStrategy from the extensions extensions/
 *                          modules. Also selected implicitly when
 *                          SUPABASE_JWT_SECRET is configured, for backward
 *                          compatibility with existing deployments.
 *
 * The Supabase strategy lives in server/src/extensions/ (merged from the private extensions
 * repo at build time — see docs/OPEN_SOURCE_DECISION.md) and is loaded via a
 * dynamic import so the OSS build has no static reference to extensions code. If an
 * extensions provider is requested but extensions/ is absent, boot fails loudly rather than
 * silently falling back to unauthenticated local mode.
 */
import { Global, Module, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AUTH_STRATEGY } from './auth-strategy.interface';
import { LocalAuthStrategy } from './local-auth.strategy';
import { ApiAuthGuard } from './auth.guard';

const authStrategyProvider = {
  provide: AUTH_STRATEGY,
  inject: [ConfigService],
  useFactory: async (config: ConfigService) => {
    const requested = config.get<string>('authProvider')
      || (config.get<string>('supabaseJwtSecret') ? 'supabase' : 'local');

    if (requested === 'supabase') {
      // Variable path keeps tsc from resolving the module statically; it only
      // exists in extensions builds where extensions/ has been merged into the tree.
      const eeStrategyPath = '../extensions/auth/supabase-auth.strategy';
      try {
        const mod = await import(eeStrategyPath);
        new Logger('AuthModule').log('Auth provider: supabase (ee)');
        return new mod.SupabaseAuthStrategy(config);
      } catch {
        throw new Error(
          'AUTH_PROVIDER=supabase (or SUPABASE_JWT_SECRET) requires the extensions extensions/ modules, '
          + 'which are not present in this build. Unset it to run in local mode.',
        );
      }
    }

    return new LocalAuthStrategy(config);
  },
};

@Global()
@Module({
  providers: [authStrategyProvider, ApiAuthGuard],
  exports: [AUTH_STRATEGY, ApiAuthGuard],
})
export class AuthModule {}

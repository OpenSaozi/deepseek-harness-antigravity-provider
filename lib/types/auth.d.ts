/** Google Anti Gravity OAuth implementation adapted to pi-ai's provider auth contract. */
import type { OAuthAuth } from '@earendil-works/pi-ai';
import type { AntiGravityOAuthClientConfig } from './client-config.ts';
/**
 * Headers shared by Anti Gravity's Cloud Code Assist endpoints.
 * @param access - current OAuth access token.
 * @returns request headers for an authenticated JSON call.
 */
export declare function antiGravityHeaders(access: string): Record<string, string>;
/** Build the OAuth method around a host-owned, per-operation client-config resolver. */
export declare function createAntiGravityOAuth(resolveClientConfig: () => Promise<AntiGravityOAuthClientConfig>): OAuthAuth;
//# sourceMappingURL=auth.d.ts.map
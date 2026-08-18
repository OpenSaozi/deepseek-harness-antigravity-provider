/** Resolve Anti Gravity's OAuth application identity without shipping it in source. */
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials';
/** Default credential reference for the provider's OAuth application identity. */
export declare const DEFAULT_OAUTH_CLIENT_CONFIG_REF = "GOOGLE_ANTIGRAVITY_OAUTH_CLIENT_CONFIG";
/** OAuth application identity imported from an official installed client. */
export interface AntiGravityOAuthClientConfig {
    clientId: string;
    clientSecret: string;
}
type CredentialStore = Pick<CredentialProvider, 'resolve' | 'set'>;
/** Parse one credential-store value without exposing either field in diagnostics. */
export declare function parseOAuthClientConfig(value: string): AntiGravityOAuthClientConfig;
/**
 * Extract the normal, non-GCP-ToS client pair from the official IDE module.
 * The marker and adjacent assignment shape intentionally fail closed when the
 * vendor changes its bundle instead of guessing among unrelated OAuth ids.
 */
export declare function extractOAuthClientConfig(source: string): AntiGravityOAuthClientConfig;
/** Import the client pair from a verified official macOS installation. */
export declare function importInstalledOAuthClientConfig(applicationPath?: string): Promise<AntiGravityOAuthClientConfig>;
/** Resolve the private client config, importing and persisting it once when absent. */
export declare function resolveOAuthClientConfig(credentials: CredentialStore, refValue?: string, applicationPath?: string, importer?: (applicationPath?: string) => Promise<AntiGravityOAuthClientConfig>): Promise<AntiGravityOAuthClientConfig>;
export {};
//# sourceMappingURL=client-config.d.ts.map
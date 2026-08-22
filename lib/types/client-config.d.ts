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
/**
 * Parse one credential-store value without exposing either field in diagnostics.
 * @param value - Serialized OAuth client configuration from the credential store.
 * @returns Validated client id and client secret.
 */
export declare function parseOAuthClientConfig(value: string): AntiGravityOAuthClientConfig;
/**
 * Extract the normal, non-GCP-ToS client pair from the official IDE module.
 * The marker and adjacent assignment shape intentionally fail closed when the
 * vendor changes its bundle instead of guessing among unrelated OAuth ids.
 * @param source - JavaScript source from the verified official application bundle.
 * @returns Validated client id and client secret.
 */
export declare function extractOAuthClientConfig(source: string): AntiGravityOAuthClientConfig;
/**
 * Import the client pair from a verified official macOS installation.
 * @param applicationPath - Optional explicit application bundle path.
 * @returns Client configuration extracted after signature and path verification.
 */
export declare function importInstalledOAuthClientConfig(applicationPath?: string): Promise<AntiGravityOAuthClientConfig>;
/**
 * Resolve the private client config, importing and persisting it once when absent.
 * @param credentials - Credential store that owns the private client pair.
 * @param refValue - Credential reference used for the serialized client pair.
 * @param applicationPath - Optional explicit application bundle path for first import.
 * @param importer - Import operation used when the credential reference is absent.
 * @returns Validated client configuration for the next OAuth operation.
 */
export declare function resolveOAuthClientConfig(credentials: CredentialStore, refValue?: string, applicationPath?: string, importer?: (applicationPath?: string) => Promise<AntiGravityOAuthClientConfig>): Promise<AntiGravityOAuthClientConfig>;
export {};
//# sourceMappingURL=client-config.d.ts.map
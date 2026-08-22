import type { OAuthAuth, OAuthCredential } from '@earendil-works/pi-ai';
import type { CredentialProvider, CredentialRef } from '@deepseek-ai/dsh-credentials';
/** OAuth credential fields required by Cloud Code Assist requests. */
export type AntiGravityCredential = OAuthCredential & {
    projectId: string;
};
/**
 * Parse one opaque Anti Gravity OAuth credential without exposing secret fields.
 * @param raw - JSON value resolved through the Harness credential service.
 * @param ref - safe credential reference used in diagnostics.
 * @returns canonical pi-ai OAuth credential with a Cloud Code Assist project id.
 */
export declare function parseAntiGravityCredential(raw: string, ref: CredentialRef): AntiGravityCredential;
/** Resolve, refresh, persist, and derive request auth for Anti Gravity OAuth. */
export declare class AntiGravityCredentialManager {
    private readonly credentials;
    readonly ref: CredentialRef;
    private readonly oauth;
    private refreshing;
    /**
     * @param credentials - Harness credential service.
     * @param ref - opaque JSON credential reference.
     * @param oauth - provider-native Anti Gravity OAuth handler.
     */
    constructor(credentials: CredentialProvider, ref: CredentialRef, oauth: OAuthAuth);
    /**
     * Resolve a valid canonical credential, refreshing it once across concurrent callers.
     * @returns current or newly persisted OAuth credential.
     */
    resolveCredential(): Promise<AntiGravityCredential>;
    /**
     * Derive pi-ai's request-level API-key override from the provider OAuth handler.
     * @returns JSON request credential consumed by the Anti Gravity protocol.
     */
    resolveApiKey(): Promise<string>;
    private read;
    private refreshExpired;
}
//# sourceMappingURL=credential.d.ts.map
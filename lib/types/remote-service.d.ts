import type { OAuthAuth } from '@earendil-works/pi-ai';
import type { Context } from '@deepseek-ai/cordis';
import type { CredentialProvider, CredentialRef } from '@deepseek-ai/dsh-credentials';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { AntiGravityAuthSnapshot, AntiGravityLoginId, AntiGravityLoginStart, AntiGravityLoginStatus } from './types.ts';
/** Remote-only owner of Anti Gravity login, polling, status, and logout. */
export declare class AntiGravityAuthRemote extends TypertRemoteService {
    private readonly credentials;
    private readonly ref;
    private readonly oauth;
    private attempt;
    /**
     * @param ctx - Host context carrying the credential service.
     * @param credentials - credential storage used for login and logout.
     * @param ref - OAuth JSON credential reference.
     * @param oauth - provider-native login handler.
     */
    constructor(ctx: Context, credentials: CredentialProvider, ref: CredentialRef, oauth: OAuthAuth);
    /**
     * Read credential metadata without exposing credential values.
     * @returns credential metadata safe for browser display.
     */
    describe(): Promise<AntiGravityAuthSnapshot>;
    /**
     * Start one provider-native OAuth flow and return its browser URL.
     * @returns opaque login id and authorization URL.
     */
    start(): Promise<AntiGravityLoginStart>;
    /**
     * Read one login attempt without exposing OAuth secrets.
     * @param id - opaque id returned by {@link start}.
     * @returns current terminal or pending status.
     */
    poll(id: AntiGravityLoginId): AntiGravityLoginStatus;
    /** Remove the stored OAuth credential and cancel any active login. */
    logout(): Promise<void>;
}
//# sourceMappingURL=remote-service.d.ts.map
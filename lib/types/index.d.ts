/** Google Anti Gravity provider plugin for the generic pi-ai adapter. */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { PiAiModelCatalog, PiAiProviderRegistry } from '@deepseek-ai/dsh-llm-pi-ai';
export { createAntiGravityOAuth } from './auth.ts';
export { DEFAULT_OAUTH_CLIENT_CONFIG_REF, extractOAuthClientConfig, importInstalledOAuthClientConfig, parseOAuthClientConfig, resolveOAuthClientConfig, } from './client-config.ts';
export type { AntiGravityOAuthClientConfig } from './client-config.ts';
export { fetchAvailableModels, maintainedModels, parseAvailableModels, PROVIDER } from './models.ts';
export declare const name = "llm-pi-ai-antigravity";
export declare const inject: string[];
/** Deployment configuration contains references and paths, never OAuth values. */
export interface Config {
    /** Credential reference containing the private OAuth client JSON document. */
    oauthClientConfigRef?: string;
    /** Optional nonstandard macOS application path; the Google signature is still required. */
    macosApplicationPath?: string;
}
export declare const Config: z<Config>;
/** Register Anti Gravity auth, inference, and its maintained/live model catalog. */
export declare function apply(ctx: Context & {
    piAiProviderRegistry: PiAiProviderRegistry;
    piAiModelCatalog: PiAiModelCatalog;
}, config: Config): void;
//# sourceMappingURL=index.d.ts.map
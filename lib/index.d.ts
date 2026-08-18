/** Google Anti Gravity provider plugin for the generic pi-ai adapter. */
import type { Context } from '@deepseek-ai/cordis';
import type { PiAiModelCatalog, PiAiProviderRegistry } from '@deepseek-ai/dsh-llm-pi-ai';
export { antiGravityOAuth } from './auth.ts';
export { fetchAvailableModels, maintainedModels, parseAvailableModels, PROVIDER } from './models.ts';
export declare const name = "llm-pi-ai-antigravity";
export declare const inject: string[];
/** Register Anti Gravity auth, inference, and its maintained/live model catalog. */
export declare function apply(ctx: Context & {
    piAiProviderRegistry: PiAiProviderRegistry;
    piAiModelCatalog: PiAiModelCatalog;
}): void;
//# sourceMappingURL=index.d.ts.map
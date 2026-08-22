/** Anti Gravity OAuth settings page, browser half. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type AntiGravityLocaleKey } from './locales.ts';
export type { AntiGravitySettingsInjected } from './AntiGravitySettings.tsx';
export type { AntiGravityLocaleKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Anti Gravity login settings copy. */
        'settings.antiGravity': AntiGravityLocaleKey;
    }
}
export declare const inject: string[];
/**
 * Register the Anti Gravity login page in Web Settings.
 * @param ctx - browser Cordis context.
 */
export declare function apply(ctx: ClientContext): Promise<void>;
//# sourceMappingURL=index.d.ts.map
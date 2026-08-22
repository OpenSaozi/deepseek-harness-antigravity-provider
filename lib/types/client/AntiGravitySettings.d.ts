import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { AntiGravityAuthSnapshot, AntiGravityLoginId, AntiGravityLoginStart, AntiGravityLoginStatus } from '../types.ts';
import { NS } from './locales.ts';
/** Host operations injected into the Anti Gravity settings page. */
export interface AntiGravitySettingsInjected {
    describe: () => Promise<AntiGravityAuthSnapshot>;
    start: () => Promise<AntiGravityLoginStart>;
    poll: (id: AntiGravityLoginId) => Promise<AntiGravityLoginStatus>;
    logout: () => Promise<void>;
}
/** Render login state and the complete start/poll/logout OAuth workflow. */
export declare function AntiGravitySettings({ t, describe, start, poll, logout, }: PropsRuntime<'settings.section'> & PropsLocale<typeof NS> & InjectFace<AntiGravitySettingsInjected>): import("react").JSX.Element;
//# sourceMappingURL=AntiGravitySettings.d.ts.map
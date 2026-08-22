import type { Branded } from '@deepseek-ai/dsh-brand';
/** Opaque identity of one in-process Anti Gravity login attempt. */
export type AntiGravityLoginId = Branded<'AntiGravityLoginId'>;
/** Credential status safe for browser settings surfaces. */
export interface AntiGravityAuthSnapshot {
    readonly configured: boolean;
    readonly source?: string;
}
/** Browser handoff returned once the local callback listener is ready. */
export interface AntiGravityLoginStart {
    readonly loginId: AntiGravityLoginId;
    readonly authorizationUrl: string;
}
/** Pollable state of one Anti Gravity OAuth attempt. */
export type AntiGravityLoginStatus = {
    readonly kind: 'pending';
} | {
    readonly kind: 'succeeded';
} | {
    readonly kind: 'failed';
    readonly message: string;
} | {
    readonly kind: 'cancelled';
};
//# sourceMappingURL=types.d.ts.map
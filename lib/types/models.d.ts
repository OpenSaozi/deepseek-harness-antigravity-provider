/** Maintained and live-reconciled Anti Gravity model descriptors. */
import type { Model, RefreshModelsContext } from '@earendil-works/pi-ai';
/** Private pi-ai API identity owned by this provider plugin. */
export type AntiGravityApi = 'google-antigravity';
/** Stable route and provider identity registered with the generic adapter. */
export declare const PROVIDER = "google-antigravity";
/** Cloud Code Assist endpoints in provider-preferred fallback order. */
export declare const ENDPOINTS: readonly ["https://daily-cloudcode-pa.googleapis.com", "https://cloudcode-pa.googleapis.com"];
/** Reviewed descriptors; the account-visible catalog is always reconciled online before display. */
export declare const maintainedModels: readonly Model<AntiGravityApi>[];
/**
 * Reconcile the maintained descriptors with one official `fetchAvailableModels` response.
 * @param payload - decoded Cloud Code Assist response body.
 * @returns reviewed descriptors that also appear in the response.
 */
export declare function parseAvailableModels(payload: unknown): readonly Model<AntiGravityApi>[];
/**
 * Fetch the account-authorized model list, retaining no quota or account fields.
 * @param context - pi-ai refresh context containing the OAuth credential and cancellation signal.
 * @returns reviewed account-visible Anti Gravity descriptors.
 */
export declare function fetchAvailableModels(context: RefreshModelsContext): Promise<readonly Model<AntiGravityApi>[]>;
//# sourceMappingURL=models.d.ts.map
/** Cloud Code Assist streaming implementation for Google Anti Gravity. */
import type { AssistantMessageEventStream, Context, Model, ProviderStreams, StreamOptions } from '@earendil-works/pi-ai';
import type { AntiGravityApi } from './models.ts';
/**
 * Native provider stream used by the registered pi-ai provider.
 * @param model - selected Anti Gravity model descriptor.
 * @param context - system prompt, history, and tools for this request.
 * @param options - pi-ai transport, credential, and cancellation options.
 * @returns assistant event stream backed by Cloud Code Assist SSE.
 */
export declare function streamAntiGravity(model: Model<AntiGravityApi>, context: Context, options?: StreamOptions): AssistantMessageEventStream;
/** Provider stream pair supplied to `createProvider`. */
export declare const antiGravityApi: ProviderStreams;
//# sourceMappingURL=api.d.ts.map
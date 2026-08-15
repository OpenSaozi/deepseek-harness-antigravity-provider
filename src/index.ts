/** Google Anti Gravity provider plugin for the generic pi-ai adapter. */

import { createProvider } from '@earendil-works/pi-ai'
import type { Api, Model } from '@earendil-works/pi-ai'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { PiAiModelCatalog, PiAiProviderRegistry } from '@deepseek-ai/dsh-llm-pi-ai'
import { antiGravityApi } from './api.ts'
import { createAntiGravityOAuth } from './auth.ts'
import { DEFAULT_OAUTH_CLIENT_CONFIG_REF, resolveOAuthClientConfig } from './client-config.ts'
import { ENDPOINTS, fetchAvailableModels, maintainedModels, PROVIDER } from './models.ts'

export { createAntiGravityOAuth } from './auth.ts'
export {
  DEFAULT_OAUTH_CLIENT_CONFIG_REF,
  extractOAuthClientConfig,
  importInstalledOAuthClientConfig,
  parseOAuthClientConfig,
  resolveOAuthClientConfig,
} from './client-config.ts'
export type { AntiGravityOAuthClientConfig } from './client-config.ts'
export { fetchAvailableModels, maintainedModels, parseAvailableModels, PROVIDER } from './models.ts'

export const name = 'llm-pi-ai-antigravity'
export const inject = ['piAiProviderRegistry', 'piAiModelCatalog', 'credentials']

/** Deployment configuration contains references and paths, never OAuth values. */
export interface Config {
  /** Credential reference containing the private OAuth client JSON document. */
  oauthClientConfigRef?: string
  /** Optional nonstandard macOS application path; the Google signature is still required. */
  macosApplicationPath?: string
}

export const Config: z<Config> = z.object({
  oauthClientConfigRef: z.string().role('credential-ref'),
  macosApplicationPath: z.string(),
})

/** Register Anti Gravity auth, inference, and its maintained/live model catalog. */
export function apply(ctx: Context & {
  piAiProviderRegistry: PiAiProviderRegistry
  piAiModelCatalog: PiAiModelCatalog
}, config: Config): void {
  const oauth = createAntiGravityOAuth(() => resolveOAuthClientConfig(
    ctx.credentials,
    config.oauthClientConfigRef ?? DEFAULT_OAUTH_CLIENT_CONFIG_REF,
    config.macosApplicationPath,
  ))
  const provider = createProvider({
    id: PROVIDER,
    name: 'Google Anti Gravity',
    baseUrl: ENDPOINTS[0],
    auth: { oauth },
    // The catalog registration below supplies the startup fallback. Keeping
    // the provider baseline empty lets pi-ai replace it with the authenticated
    // response instead of merging stale model ids back into the live list.
    models: [],
    fetchModels: fetchAvailableModels,
    api: antiGravityApi,
  })
  const catalogRegistration = ctx.piAiModelCatalog.register(PROVIDER, maintainedModels)
  const providerRegistration = ctx.piAiProviderRegistry.register({
    provider,
    profile: {
      displayName: 'Google Anti Gravity',
      oauthCredentialEnv: 'GOOGLE_ANTIGRAVITY_OAUTH_CREDENTIAL',
    },
  })
  ctx.effect(() => () => {
    catalogRegistration.dispose()
    providerRegistration.dispose()
  }, 'llm-pi-ai-antigravity: registrations')

  const controller = new AbortController()
  let refreshing: Promise<void> | undefined
  const refresh = (): void => {
    refreshing ??= (async () => {
      try {
        const payload = await ctx.piAiModelCatalog.fetchModels(PROVIDER, controller.signal)
        if (!Array.isArray(payload) || payload.length === 0) {
          throw new Error('Anti Gravity refresh returned no models')
        }
        catalogRegistration.replace(payload as readonly Model<Api>[])
      } catch (error) {
        if (!controller.signal.aborted) {
          ctx.logger.info('llm-pi-ai-antigravity: live model refresh unavailable; keeping the maintained catalog')
          ctx.logger.debug(error)
        }
      } finally {
        refreshing = undefined
      }
    })()
  }
  ctx.effect(() => {
    // Loader siblings can still be completing their initial file read while
    // this plugin mounts. The second bounded attempt covers that startup race;
    // later credential edits are event-driven and do not poll.
    const timers = [setTimeout(refresh, 0), setTimeout(refresh, 250)]
    return () => {
      for (const timer of timers) clearTimeout(timer)
      controller.abort()
    }
  }, 'llm-pi-ai-antigravity: live refresh')
  ctx.effect(
    () => ctx.piAiModelCatalog.subscribeConfiguration(refresh),
    'llm-pi-ai-antigravity: configuration refresh',
  )
}

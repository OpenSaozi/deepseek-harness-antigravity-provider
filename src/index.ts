/** Independent Google Anti Gravity provider route and OAuth settings service. */

import { createProvider } from '@earendil-works/pi-ai'
import type { Api, ApiKeyAuth, Model, Provider } from '@earendil-works/pi-ai'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-attachment'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { antiGravityApi } from './api.ts'
import { createAntiGravityOAuth } from './auth.ts'
import { DEFAULT_OAUTH_CLIENT_CONFIG_REF, resolveOAuthClientConfig } from './client-config.ts'
import { AntiGravityCredentialManager } from './credential.ts'
import {
  ENDPOINTS,
  fetchAvailableModelsForCredential,
  maintainedModels,
  PROVIDER,
} from './models.ts'
import { AntiGravityAuthRemote } from './remote-service.ts'

export { createAntiGravityOAuth } from './auth.ts'
export {
  DEFAULT_OAUTH_CLIENT_CONFIG_REF,
  extractOAuthClientConfig,
  importInstalledOAuthClientConfig,
  parseOAuthClientConfig,
  resolveOAuthClientConfig,
} from './client-config.ts'
export type { AntiGravityOAuthClientConfig } from './client-config.ts'
export {
  AntiGravityCredentialManager,
  parseAntiGravityCredential,
} from './credential.ts'
export {
  fetchAvailableModels,
  fetchAvailableModelsForCredential,
  maintainedModels,
  parseAvailableModels,
  PROVIDER,
} from './models.ts'
export { AntiGravityAuthRemote } from './remote-service.ts'
export type {
  AntiGravityAuthSnapshot,
  AntiGravityLoginId,
  AntiGravityLoginStart,
  AntiGravityLoginStatus,
} from './types.ts'

export const name = 'llm-pi-ai-antigravity'
export const inject = ['llm', 'credentials']

const DEFAULT_OAUTH_CREDENTIAL_REF = 'GOOGLE_ANTIGRAVITY_OAUTH_CREDENTIAL'
const DEFAULT_DISPLAY_NAME = 'Google Anti Gravity'
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000
const DEFAULT_MAX_REQUEST_IMAGE_BYTES = 20 * 1024 * 1024

/** Deployment configuration contains references and paths, never OAuth values. */
export interface Config {
  /** Credential reference containing the OAuth token JSON document. */
  oauthCredentialEnv?: string
  /** Credential reference containing the private OAuth client JSON document. */
  oauthClientConfigRef?: string
  /** Optional nonstandard macOS application path; the Google signature is still required. */
  macosApplicationPath?: string
  /** Provider label shown in model selectors. */
  displayName?: string
  /** Maximum provider idle time while one stream read is outstanding. */
  streamIdleTimeoutMs?: number
  /**
   * Base64 image payload bound for one request. Older images become text
   * placeholders once a session's accumulated images exceed it, so a long
   * session keeps completing requests instead of being refused for size.
   */
  maxRequestImageBytes?: number
}

/** Schemastery validator for the independent Anti Gravity route. */
export const Config: z<Config> = z.object({
  oauthCredentialEnv: z.string().role('credential-ref').default(DEFAULT_OAUTH_CREDENTIAL_REF),
  oauthClientConfigRef: z.string().role('credential-ref').default(DEFAULT_OAUTH_CLIENT_CONFIG_REF),
  macosApplicationPath: z.string(),
  displayName: z.string().default(DEFAULT_DISPLAY_NAME),
  streamIdleTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS).default(DEFAULT_STREAM_IDLE_TIMEOUT_MS),
  maxRequestImageBytes: z.number().step(1).min(1).default(DEFAULT_MAX_REQUEST_IMAGE_BYTES),
})

interface ResolvedConfig {
  readonly oauthCredentialEnv: ReturnType<typeof credentialRef>
  readonly oauthClientConfigRef: string
  readonly macosApplicationPath?: string
  readonly displayName: string
  readonly streamIdleTimeoutMs: number
  readonly maxRequestImageBytes: number
}

function resolveConfig(config: Config): ResolvedConfig {
  const displayName = config.displayName ?? DEFAULT_DISPLAY_NAME
  const streamIdleTimeoutMs = config.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS
  const maxRequestImageBytes = config.maxRequestImageBytes ?? DEFAULT_MAX_REQUEST_IMAGE_BYTES
  if (displayName.length === 0) throw new Error('llm-pi-ai-antigravity: displayName must not be empty')
  if (!Number.isFinite(streamIdleTimeoutMs)
    || streamIdleTimeoutMs <= 0
    || streamIdleTimeoutMs > MAX_TIMER_DELAY_MS) {
    throw new Error(
      `llm-pi-ai-antigravity: streamIdleTimeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`,
    )
  }
  if (!Number.isInteger(maxRequestImageBytes) || maxRequestImageBytes <= 0) {
    throw new Error('llm-pi-ai-antigravity: maxRequestImageBytes must be a positive integer')
  }
  return {
    oauthCredentialEnv: credentialRef(config.oauthCredentialEnv ?? DEFAULT_OAUTH_CREDENTIAL_REF),
    oauthClientConfigRef: config.oauthClientConfigRef ?? DEFAULT_OAUTH_CLIENT_CONFIG_REF,
    ...config.macosApplicationPath === undefined ? {} : { macosApplicationPath: config.macosApplicationPath },
    displayName,
    streamIdleTimeoutMs,
    maxRequestImageBytes,
  }
}

/** Auth handler that accepts only a request-level OAuth-derived override. */
const requestOverrideAuth: ApiKeyAuth = {
  name: 'Google Anti Gravity OAuth request override',
  resolve: ({ credential }) => Promise.resolve(
    credential?.key === undefined || credential.key.length === 0
      ? undefined
      : { auth: { apiKey: credential.key }, source: 'OAuth' },
  ),
}

function providerFor(
  config: ResolvedConfig,
  models: readonly Model<Api>[],
  oauth: ReturnType<typeof createAntiGravityOAuth>,
): Provider {
  const resolvedModels = models.map(model => ({
    ...model,
    provider: PROVIDER,
    baseUrl: ENDPOINTS[0],
  }))
  return createProvider({
    id: PROVIDER,
    name: config.displayName,
    baseUrl: ENDPOINTS[0],
    auth: { apiKey: requestOverrideAuth, oauth },
    models: resolvedModels,
    api: antiGravityApi,
  })
}

function profileFor(
  config: ResolvedConfig,
  models: readonly Model<Api>[],
  oauth: ReturnType<typeof createAntiGravityOAuth>,
): ReadonlyMap<string, ResolvedPiAiProviderProfile> {
  return new Map([[PROVIDER, {
    provider: PROVIDER,
    displayName: config.displayName,
    streamIdleTimeoutMs: config.streamIdleTimeoutMs,
    maxRequestImageBytes: config.maxRequestImageBytes,
    retryPolicy: resolveRetryPolicy(undefined, 'llm-pi-ai-antigravity: retryPolicy'),
    configuredMaxTokens: new Map(),
    piProvider: providerFor(config, models, oauth),
  }]])
}

/**
 * Register Anti Gravity inference, OAuth Remote methods, and the maintained/live catalog.
 * @param ctx - Cordis context providing LLM, credential, and optional attachment services.
 * @param rawConfig - validated plugin configuration.
 */
export function apply(ctx: Context, rawConfig: Config): void {
  const config = resolveConfig(rawConfig)
  const oauth = createAntiGravityOAuth(() => resolveOAuthClientConfig(
    ctx.credentials,
    config.oauthClientConfigRef,
    config.macosApplicationPath,
  ))
  const credentials = new AntiGravityCredentialManager(ctx.credentials, config.oauthCredentialEnv, oauth)
  new AntiGravityAuthRemote(ctx, ctx.credentials, config.oauthCredentialEnv, oauth)

  let profiles = profileFor(config, maintainedModels, oauth)
  const adapter = new PiAiAdapter({
    profiles: () => profiles,
    resolveApiKey: () => credentials.resolveApiKey(),
    resolveAttachments: () => ctx.get('attachments'),
  })
  const registration = ctx.llm.registerAdapter([PROVIDER], adapter)

  const controller = new AbortController()
  let refreshing: Promise<void> | undefined
  const refresh = (): void => {
    refreshing ??= (async () => {
      try {
        const credential = await credentials.resolveCredential()
        const live = await fetchAvailableModelsForCredential(credential, controller.signal)
        profiles = profileFor(config, live, oauth)
        registration.replace([PROVIDER])
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
    const timers = [setTimeout(refresh, 0), setTimeout(refresh, 250)]
    return () => {
      for (const timer of timers) clearTimeout(timer)
      controller.abort()
    }
  }, 'llm-pi-ai-antigravity: live refresh')
  ctx.on('credentials/updated', (ref) => {
    if (ref === config.oauthCredentialEnv) refresh()
  })
}

import type { OAuthAuth, OAuthCredential } from '@earendil-works/pi-ai'
import type { CredentialProvider, CredentialRef } from '@deepseek-ai/dsh-credentials'
import { assertUsableApiKey, LlmError } from '@deepseek-ai/dsh-llm'

/** OAuth credential fields required by Cloud Code Assist requests. */
export type AntiGravityCredential = OAuthCredential & { projectId: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Parse one opaque Anti Gravity OAuth credential without exposing secret fields.
 * @param raw - JSON value resolved through the Harness credential service.
 * @param ref - safe credential reference used in diagnostics.
 * @returns canonical pi-ai OAuth credential with a Cloud Code Assist project id.
 */
export function parseAntiGravityCredential(raw: string, ref: CredentialRef): AntiGravityCredential {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new LlmError(`llm-pi-ai-antigravity: OAuth credential ${ref} is not valid JSON`, 'AUTH')
  }
  if (!isRecord(parsed)
    || parsed.type !== 'oauth'
    || typeof parsed.access !== 'string'
    || parsed.access.length === 0
    || typeof parsed.refresh !== 'string'
    || parsed.refresh.length === 0
    || typeof parsed.expires !== 'number'
    || !Number.isFinite(parsed.expires)
    || parsed.expires <= 0
    || typeof parsed.projectId !== 'string'
    || parsed.projectId.length === 0) {
    throw new LlmError(
      `llm-pi-ai-antigravity: OAuth credential ${ref} must contain type "oauth", non-empty access and refresh`
      + ' tokens, a positive finite expires timestamp, and a non-empty projectId',
      'AUTH',
    )
  }
  return parsed as AntiGravityCredential
}

/** Resolve, refresh, persist, and derive request auth for Anti Gravity OAuth. */
export class AntiGravityCredentialManager {
  private refreshing: Promise<AntiGravityCredential> | undefined

  /**
   * @param credentials - Harness credential service.
   * @param ref - opaque JSON credential reference.
   * @param oauth - provider-native Anti Gravity OAuth handler.
   */
  constructor(
    private readonly credentials: CredentialProvider,
    readonly ref: CredentialRef,
    private readonly oauth: OAuthAuth,
  ) {}

  /**
   * Resolve a valid canonical credential, refreshing it once across concurrent callers.
   * @returns current or newly persisted OAuth credential.
   */
  async resolveCredential(): Promise<AntiGravityCredential> {
    let credential = await this.read()
    if (Date.now() >= credential.expires) {
      this.refreshing ??= this.refreshExpired().finally(() => { this.refreshing = undefined })
      credential = await this.refreshing
    }
    return credential
  }

  /**
   * Derive pi-ai's request-level API-key override from the provider OAuth handler.
   * @returns JSON request credential consumed by the Anti Gravity protocol.
   */
  async resolveApiKey(): Promise<string> {
    const credential = await this.resolveCredential()
    try {
      const auth = await this.oauth.toAuth(credential)
      if (auth.apiKey === undefined) throw new Error('Anti Gravity OAuth handler returned no request API key')
      return assertUsableApiKey(auth.apiKey, 'llm-pi-ai-antigravity', this.ref)
    } catch (error) {
      if (error instanceof LlmError) throw error
      throw new LlmError('llm-pi-ai-antigravity: OAuth auth derivation failed', 'AUTH', { cause: error })
    }
  }

  private async read(): Promise<AntiGravityCredential> {
    const hit = await this.credentials.resolve(this.ref)
    if (hit === undefined) {
      throw new LlmError(
        `llm-pi-ai-antigravity: no OAuth credential at ${this.ref}`,
        'MISSING_CREDENTIAL',
      )
    }
    return parseAntiGravityCredential(hit.value, this.ref)
  }

  private async refreshExpired(): Promise<AntiGravityCredential> {
    const current = await this.read()
    if (Date.now() < current.expires) return current
    let refreshed: OAuthCredential
    try {
      refreshed = await this.oauth.refresh(current)
    } catch (error) {
      throw new LlmError('llm-pi-ai-antigravity: OAuth refresh failed', 'AUTH', { cause: error })
    }
    const checked = parseAntiGravityCredential(JSON.stringify(refreshed), this.ref)
    await this.credentials.set(this.ref, JSON.stringify(checked))
    return checked
  }
}

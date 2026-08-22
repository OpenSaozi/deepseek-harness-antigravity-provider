import { randomUUID } from 'node:crypto'
import type { AuthEvent, AuthPrompt, OAuthAuth } from '@earendil-works/pi-ai'
import type { Context } from '@deepseek-ai/cordis'
import type { CredentialProvider, CredentialRef } from '@deepseek-ai/dsh-credentials'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {
  AntiGravityAuthSnapshot,
  AntiGravityLoginId,
  AntiGravityLoginStart,
  AntiGravityLoginStatus,
} from './types.ts'

interface LoginAttempt {
  readonly id: AntiGravityLoginId
  readonly controller: AbortController
  status: AntiGravityLoginStatus
}

function loginId(): AntiGravityLoginId {
  return randomUUID() as AntiGravityLoginId
}

function failureMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : 'Anti Gravity OAuth failed'
}

/** Remote-only owner of Anti Gravity login, polling, status, and logout. */
export class AntiGravityAuthRemote extends TypertRemoteService {
  private attempt: LoginAttempt | undefined

  /**
   * @param ctx - Host context carrying the credential service.
   * @param credentials - credential storage used for login and logout.
   * @param ref - OAuth JSON credential reference.
   * @param oauth - provider-native login handler.
   */
  constructor(
    ctx: Context,
    private readonly credentials: CredentialProvider,
    private readonly ref: CredentialRef,
    private readonly oauth: OAuthAuth,
  ) {
    super(ctx, 'antiGravityAuth')
    ctx.effect(() => () => {
      this.attempt?.controller.abort('Anti Gravity auth service disposed')
      this.attempt = undefined
    }, 'llm-pi-ai-antigravity: cancel login')
  }

  /**
   * Read credential metadata without exposing credential values.
   * @returns credential metadata safe for browser display.
   */
  @Remote('describe')
  describe(): Promise<AntiGravityAuthSnapshot> {
    return this.credentials.describe(this.ref).then(info => ({
      configured: info.configured,
      ...info.source === undefined ? {} : { source: info.source },
    }))
  }

  /**
   * Start one provider-native OAuth flow and return its browser URL.
   * @returns opaque login id and authorization URL.
   */
  @Remote('start')
  async start(): Promise<AntiGravityLoginStart> {
    this.attempt?.controller.abort('A newer Anti Gravity login started')
    const attempt: LoginAttempt = {
      id: loginId(),
      controller: new AbortController(),
      status: { kind: 'pending' },
    }
    this.attempt = attempt
    const url = Promise.withResolvers<string>()
    const notify = (event: AuthEvent): void => {
      if (event.type === 'auth_url') url.resolve(event.url)
    }
    const prompt = (_prompt: AuthPrompt): Promise<string> =>
      Promise.reject(new Error('Anti Gravity OAuth does not support interactive text prompts'))
    void this.oauth.login({ signal: attempt.controller.signal, notify, prompt }).then(async (credential) => {
      if (this.attempt !== attempt || attempt.controller.signal.aborted) return
      await this.credentials.set(this.ref, JSON.stringify(credential))
      attempt.status = { kind: 'succeeded' }
    }).catch((error: unknown) => {
      if (attempt.controller.signal.aborted) {
        attempt.status = { kind: 'cancelled' }
        url.reject(new Error('Anti Gravity OAuth was cancelled'))
        return
      }
      const message = failureMessage(error)
      attempt.status = { kind: 'failed', message }
      url.reject(new Error(message))
    })
    return { loginId: attempt.id, authorizationUrl: await url.promise }
  }

  /**
   * Read one login attempt without exposing OAuth secrets.
   * @param id - opaque id returned by {@link start}.
   * @returns current terminal or pending status.
   */
  @Remote('poll')
  poll(id: AntiGravityLoginId): AntiGravityLoginStatus {
    if (this.attempt?.id !== id) {
      return { kind: 'failed', message: 'Anti Gravity login attempt is no longer active' }
    }
    return this.attempt.status
  }

  /** Remove the stored OAuth credential and cancel any active login. */
  @Remote('logout')
  async logout(): Promise<void> {
    this.attempt?.controller.abort('Anti Gravity logout')
    this.attempt = undefined
    await this.credentials.unset(this.ref)
  }
}

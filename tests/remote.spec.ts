import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { AuthInteraction, OAuthAuth, OAuthCredential } from '@earendil-works/pi-ai'
import { CredentialProvider, credentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialInfo, CredentialRef, ResolvedCredential } from '@deepseek-ai/dsh-credentials'
import { AntiGravityAuthRemote } from '../src/remote-service.ts'

const REF = credentialRef('GOOGLE_ANTIGRAVITY_OAUTH_CREDENTIAL')

class MemoryCredentials extends CredentialProvider {
  value: string | undefined

  override resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    return Promise.resolve(ref === REF && this.value !== undefined
      ? { value: this.value, source: 'memory' }
      : undefined)
  }

  override describe(_ref: CredentialRef): Promise<CredentialInfo> {
    return Promise.resolve({ configured: this.value !== undefined, source: 'memory', writable: true })
  }

  override set(_ref: CredentialRef, value: string): Promise<void> {
    this.value = value
    return Promise.resolve()
  }

  override unset(_ref: CredentialRef): Promise<void> {
    this.value = undefined
    return Promise.resolve()
  }
}

describe('Anti Gravity auth Remote', () => {
  it('starts, polls, persists, and logs out without exposing the credential', async () => {
    const ctx = new Context()
    const credentials = new MemoryCredentials(ctx)
    const completion = Promise.withResolvers<OAuthCredential>()
    const oauth: OAuthAuth = {
      name: 'test Anti Gravity OAuth',
      login: (interaction: AuthInteraction) => {
        interaction.notify({ type: 'auth_url', url: 'https://accounts.example/authorize' })
        return completion.promise
      },
      refresh: credential => Promise.resolve(credential),
      toAuth: credential => Promise.resolve({ apiKey: credential.access }),
    }
    const remote = new AntiGravityAuthRemote(ctx, credentials, REF, oauth)

    expect(await remote.describe()).toEqual({ configured: false, source: 'memory' })
    const started = await remote.start()
    expect(started.authorizationUrl).toBe('https://accounts.example/authorize')
    expect(remote.poll(started.loginId)).toEqual({ kind: 'pending' })
    completion.resolve({
      type: 'oauth',
      access: 'secret-access',
      refresh: 'secret-refresh',
      expires: Date.now() + 60_000,
      projectId: 'project',
    })
    await vi.waitFor(() => {
      expect(remote.poll(started.loginId)).toEqual({ kind: 'succeeded' })
    })
    expect(await remote.describe()).toEqual({ configured: true, source: 'memory' })
    await remote.logout()
    expect(await remote.describe()).toEqual({ configured: false, source: 'memory' })
    expect(remote.poll(started.loginId)).toEqual({
      kind: 'failed',
      message: 'Anti Gravity login attempt is no longer active',
    })
    await ctx.fiber.dispose()
  })
})

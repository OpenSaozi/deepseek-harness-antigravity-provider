import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { OAuthAuth, OAuthCredential } from '@earendil-works/pi-ai'
import { CredentialProvider, credentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialInfo, CredentialRef, ResolvedCredential } from '@deepseek-ai/dsh-credentials'
import { AntiGravityCredentialManager, parseAntiGravityCredential } from '../src/credential.ts'

const REF = credentialRef('GOOGLE_ANTIGRAVITY_OAUTH_CREDENTIAL')

class MemoryCredentials extends CredentialProvider {
  writes = 0

  constructor(ctx: Context, private value: string | undefined) {
    super(ctx)
  }

  override resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    return Promise.resolve(ref === REF && this.value !== undefined
      ? { value: this.value, source: 'memory' }
      : undefined)
  }

  override describe(_ref: CredentialRef): Promise<CredentialInfo> {
    return Promise.resolve({ configured: this.value !== undefined, source: 'memory', writable: true })
  }

  override set(ref: CredentialRef, value: string): Promise<void> {
    if (ref === REF) {
      this.value = value
      this.writes += 1
    }
    return Promise.resolve()
  }

  override unset(_ref: CredentialRef): Promise<void> {
    this.value = undefined
    return Promise.resolve()
  }
}

function oauth(refreshed: OAuthCredential): OAuthAuth {
  return {
    name: 'test Anti Gravity OAuth',
    login: () => Promise.reject(new Error('unused')),
    refresh: vi.fn(() => Promise.resolve(refreshed)),
    toAuth: credential => Promise.resolve({
      apiKey: JSON.stringify({ token: credential.access, projectId: credential.projectId }),
    }),
  }
}

describe('Anti Gravity credential manager', () => {
  it('requires the provider-specific project id without exposing secrets', () => {
    expect(() => parseAntiGravityCredential('{}', REF)).toThrow('must contain type "oauth"')
  })

  it('refreshes once and returns the provider OAuth handler request auth', async () => {
    const ctx = new Context()
    const expired = JSON.stringify({
      type: 'oauth', access: 'old', refresh: 'old-refresh', expires: 1, projectId: 'project',
    })
    const refreshed: OAuthCredential = {
      type: 'oauth', access: 'new', refresh: 'new-refresh', expires: Date.now() + 60_000, projectId: 'project',
    }
    const credentials = new MemoryCredentials(ctx, expired)
    const handler = oauth(refreshed)
    const manager = new AntiGravityCredentialManager(credentials, REF, handler)

    await expect(Promise.all([manager.resolveApiKey(), manager.resolveApiKey()])).resolves.toEqual([
      JSON.stringify({ token: 'new', projectId: 'project' }),
      JSON.stringify({ token: 'new', projectId: 'project' }),
    ])
    expect(handler.refresh).toHaveBeenCalledTimes(1)
    expect(credentials.writes).toBe(1)
  })
})

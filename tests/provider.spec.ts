import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CredentialProvider, credentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialInfo, CredentialRef, ResolvedCredential } from '@deepseek-ai/dsh-credentials'
import LlmRuntime, { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import * as AntiGravity from '../src/index.ts'
import { createAntiGravityOAuth } from '../src/auth.ts'
import { maintainedModels, parseAvailableModels } from '../src/models.ts'

let context: Context | undefined

class TestCredentials extends CredentialProvider {
  private readonly store = new Map<CredentialRef, string>()

  constructor(ctx: Context, seed: Record<string, string>) {
    super(ctx)
    for (const [ref, value] of Object.entries(seed)) this.store.set(credentialRef(ref), value)
  }

  override resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    const value = this.store.get(ref)
    return Promise.resolve(value === undefined ? undefined : { value, source: 'test' })
  }

  override describe(ref: CredentialRef): Promise<CredentialInfo> {
    return Promise.resolve({ configured: this.store.has(ref), source: 'test', writable: true })
  }

  override set(ref: CredentialRef, value: string): Promise<void> {
    this.store.set(ref, value)
    this.ctx.emit('credentials/updated', ref)
    return Promise.resolve()
  }

  override unset(ref: CredentialRef): Promise<void> {
    this.store.delete(ref)
    this.ctx.emit('credentials/updated', ref)
    return Promise.resolve()
  }
}

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  vi.unstubAllGlobals()
})

describe('Anti Gravity provider catalog', () => {
  it('keeps only maintained models reported by the live endpoint', () => {
    expect(parseAvailableModels({
      models: {
        'gemini-3.7-flash-high': { displayName: 'Gemini 3.7 Flash High Live' },
        'claude-sonnet-4-6': { displayName: 'Claude Sonnet 4.6 Live' },
        unknown: { displayName: 'Unknown' },
      },
    }).map(model => [model.id, model.name])).toEqual([
      ['gemini-3.7-flash-high', 'Gemini 3.7 Flash High Live'],
      ['claude-sonnet-4-6', 'Claude Sonnet 4.6 Live'],
    ])
  })

  it('maintains reviewed descriptors for online catalog reconciliation', () => {
    expect(maintainedModels.map(model => model.id)).toContain('gemini-3.7-flash-high')
    expect(maintainedModels.map(model => model.id)).toContain('claude-opus-4-6-thinking')
    expect(maintainedModels.map(model => model.id)).toContain('gpt-oss-120b-medium')
  })

  it('builds the installed-app OAuth URL with Google\'s exact client domain', async () => {
    const controller = new AbortController()
    let authorizationUrl: string | undefined
    const oauth = createAntiGravityOAuth(async () => ({
      clientId: '123456-fixture.apps.googleusercontent.com',
      clientSecret: ['GOC', 'SPX-fixture-value'].join(''),
    }))
    const login = oauth.login({
      signal: controller.signal,
      prompt: async () => '',
      notify(event) {
        if (event.type !== 'auth_url') return
        authorizationUrl = event.url
        controller.abort()
      },
    })
    await expect(login).rejects.toThrow(/cancelled/)
    const clientId = new URL(authorizationUrl!).searchParams.get('client_id')
    expect(clientId).toMatch(/\.apps\.googleusercontent\.com$/)
  })

  it('owns inference and live discovery through an OAuth-derived request override', async () => {
    const requests: Array<{ authorization: string | null, url: string }> = []
    vi.stubGlobal('fetch', (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      requests.push({ authorization: new Headers(init?.headers).get('authorization'), url })
      if (url.endsWith('/v1internal:fetchAvailableModels')) {
        return Promise.resolve(new Response(JSON.stringify({
          models: { 'gemini-3.7-flash-high': { displayName: 'Gemini live' } },
        })))
      }
      const event = {
        response: {
          candidates: [{ content: { parts: [{ text: 'hello anti' }] }, finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 2, totalTokenCount: 4 },
        },
      }
      return Promise.resolve(new Response(`data: ${JSON.stringify(event)}\n\n`, {
        headers: { 'content-type': 'text/event-stream' },
      }))
    })
    const credential = JSON.stringify({
      type: 'oauth',
      access: 'anti-access',
      refresh: 'anti-refresh',
      expires: Date.now() + 60_000,
      projectId: 'anti-project',
    })
    context = new Context()
    await context.plugin(LlmRuntime)
    await context.plugin(TestCredentials, {
      GOOGLE_ANTIGRAVITY_OAUTH_CREDENTIAL: credential,
    })
    await context.plugin(AntiGravity, {})
    const loaded = context

    expect(loaded.llm.listProviders()).toEqual([
      { id: 'google-antigravity', name: 'Google Anti Gravity' },
    ])
    await vi.waitFor(async () => {
      expect((await loaded.llm.listModels('google-antigravity')).map(model => model.id))
        .toEqual(['gemini-3.7-flash-high'])
    })
    const assembler = new BlockAssembler()
    for await (const chunk of loaded.llm.stream({
      provider: 'google-antigravity',
      model: 'gemini-3.7-flash-high',
      messages: [createUserMessage({
        content: [{ type: 'text', text: 'hi' }],
        source: { kind: 'plugin', plugin: 'test' },
      })],
    })) assembler.push(chunk)
    expect(assembler.message({
      kind: 'model', provider: 'google-antigravity', model: 'gemini-3.7-flash-high',
    }).content).toEqual([{ type: 'text', text: 'hello anti' }])
    expect(requests.some(request =>
      request.url.endsWith('/v1internal:fetchAvailableModels')
      && request.authorization === 'Bearer anti-access')).toBe(true)
    expect(requests.some(request =>
      request.url.endsWith('/v1internal:streamGenerateContent?alt=sse')
      && request.authorization === 'Bearer anti-access')).toBe(true)
  })
})

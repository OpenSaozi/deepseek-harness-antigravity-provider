import { describe, expect, it } from 'vitest'
import { createAntiGravityOAuth } from '../src/auth.ts'
import { maintainedModels, parseAvailableModels } from '../src/models.ts'

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
})

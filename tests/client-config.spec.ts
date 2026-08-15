import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_OAUTH_CLIENT_CONFIG_REF,
  extractOAuthClientConfig,
  parseOAuthClientConfig,
  resolveOAuthClientConfig,
} from '../src/client-config.ts'

const CLIENT_ID = '123456-fixture.apps.googleusercontent.com'
const CLIENT_SECRET = ['GOC', 'SPX-fixture-value'].join('')
const CONFIG = { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET }

describe('Anti Gravity OAuth client configuration', () => {
  it('extracts the normal client pair from the bounded official module', () => {
    const source = `prefix out-build/vs/platform/cloudCode/common/oauthClient.js"(){a="${CLIENT_ID}",b="${CLIENT_SECRET}",c="987654-gcp.apps.googleusercontent.com",d="${CLIENT_SECRET}2",scopes=["https://www.googleapis.com/auth/cclog"]}`
    expect(extractOAuthClientConfig(source)).toEqual(CONFIG)
  })

  it('rejects an invalid stored document without echoing its value', () => {
    expect(() => parseOAuthClientConfig('{"clientId":"wrong","clientSecret":"also-wrong"}'))
      .toThrow('invalid clientId')
  })

  it('uses an existing credential without importing or rewriting it', async () => {
    const importer = vi.fn()
    const set = vi.fn()
    const result = await resolveOAuthClientConfig({
      resolve: vi.fn(async () => ({ value: JSON.stringify(CONFIG), source: 'file' })),
      set,
    }, DEFAULT_OAUTH_CLIENT_CONFIG_REF, undefined, importer)
    expect(result).toEqual(CONFIG)
    expect(importer).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
  })

  it('fails closed on an invalid existing credential', async () => {
    const importer = vi.fn()
    const set = vi.fn()
    await expect(resolveOAuthClientConfig({
      resolve: vi.fn(async () => ({ value: '{"clientId":"wrong"}', source: 'file' })),
      set,
    }, DEFAULT_OAUTH_CLIENT_CONFIG_REF, undefined, importer)).rejects.toThrow('invalid clientId')
    expect(importer).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
  })

  it('imports and stores the client config once when absent', async () => {
    const set = vi.fn(async () => undefined)
    const importer = vi.fn(async () => CONFIG)
    const result = await resolveOAuthClientConfig({
      resolve: vi.fn(async () => undefined),
      set,
    }, DEFAULT_OAUTH_CLIENT_CONFIG_REF, '/Applications/Antigravity IDE.app', importer)
    expect(result).toEqual(CONFIG)
    expect(importer).toHaveBeenCalledWith('/Applications/Antigravity IDE.app')
    expect(set).toHaveBeenCalledWith(DEFAULT_OAUTH_CLIENT_CONFIG_REF, JSON.stringify(CONFIG))
  })
})

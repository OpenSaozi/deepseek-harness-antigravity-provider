/** Google Anti Gravity OAuth implementation adapted to pi-ai's provider auth contract. */

import { createServer } from 'node:http'
import { randomBytes, createHash } from 'node:crypto'
import type { AuthInteraction, OAuthAuth, OAuthCredential } from '@earendil-works/pi-ai'
import type { AntiGravityOAuthClientConfig } from './client-config.ts'
const REDIRECT_URI = 'http://localhost:51121/oauth-callback'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/cclog',
  'https://www.googleapis.com/auth/experimentsandconfigs',
]

type AntiGravityCredential = OAuthCredential & { projectId?: unknown; email?: unknown }

function base64Url(input: Buffer): string {
  return input.toString('base64url')
}

async function discoverProject(access: string, signal?: AbortSignal): Promise<string> {
  const endpoints = ['https://daily-cloudcode-pa.googleapis.com', 'https://cloudcode-pa.googleapis.com']
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${endpoint}/v1internal:loadCodeAssist`, {
        method: 'POST',
        headers: antiGravityHeaders(access),
        body: JSON.stringify({ metadata: { ideName: 'antigravity', ideType: 'ANTIGRAVITY', ideVersion: '2.5.2' } }),
        ...signal === undefined ? {} : { signal },
      })
      if (!response.ok) continue
      const body = await response.json() as { cloudaicompanionProject?: unknown }
      if (typeof body.cloudaicompanionProject === 'string' && body.cloudaicompanionProject.length > 0) {
        return body.cloudaicompanionProject
      }
      if (typeof body.cloudaicompanionProject === 'object'
        && body.cloudaicompanionProject !== null
        && typeof (body.cloudaicompanionProject as { id?: unknown }).id === 'string') {
        return (body.cloudaicompanionProject as { id: string }).id
      }
    } catch (error) {
      if (signal?.aborted) throw error
    }
  }
  throw new Error('Anti Gravity OAuth succeeded, but Cloud Code Assist returned no companion project')
}

/**
 * Headers shared by Anti Gravity's Cloud Code Assist endpoints.
 * @param access - current OAuth access token.
 * @returns request headers for an authenticated JSON call.
 */
export function antiGravityHeaders(access: string): Record<string, string> {
  return {
    authorization: `Bearer ${access}`,
    'content-type': 'application/json',
    'user-agent': 'antigravity/2.5.2 darwin/arm64',
  }
}

async function exchange(params: URLSearchParams, signal?: AbortSignal): Promise<{
  access_token: string
  refresh_token?: string
  expires_in: number
}> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params,
    ...signal === undefined ? {} : { signal },
  })
  if (!response.ok) throw new Error(`Anti Gravity token exchange failed with HTTP ${response.status}`)
  return response.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number }>
}

async function login(
  interaction: AuthInteraction,
  clientConfig: AntiGravityOAuthClientConfig,
): Promise<OAuthCredential> {
  const verifier = base64Url(randomBytes(32))
  const challenge = base64Url(createHash('sha256').update(verifier).digest())
  const state = base64Url(randomBytes(24))
  const callback = new Promise<string>((resolve, reject) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', REDIRECT_URI)
      if (url.pathname !== '/oauth-callback') {
        response.writeHead(404).end()
        return
      }
      const code = url.searchParams.get('code')
      if (url.searchParams.get('state') !== state || code === null) {
        response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }).end('Anti Gravity OAuth callback is invalid.')
        server.close()
        reject(new Error('Anti Gravity OAuth state or code is invalid'))
        return
      }
      response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end('Anti Gravity login completed. You may close this page.')
      server.close()
      resolve(code)
    })
    server.on('error', reject)
    server.listen(51121, '127.0.0.1')
    interaction.signal?.addEventListener('abort', () => {
      server.close()
      reject(new Error('Anti Gravity OAuth was cancelled'))
    }, { once: true })
  })
  const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  auth.search = new URLSearchParams({
    client_id: clientConfig.clientId,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES.join(' '),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    access_type: 'offline',
    prompt: 'consent',
  }).toString()
  interaction.notify({ type: 'auth_url', url: auth.toString(), instructions: '在浏览器完成 Google Anti Gravity 授权。' })
  const code = await callback
  const tokens = await exchange(new URLSearchParams({
    client_id: clientConfig.clientId,
    client_secret: clientConfig.clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  }), interaction.signal)
  if (tokens.refresh_token === undefined) throw new Error('Anti Gravity OAuth returned no refresh token')
  const projectId = await discoverProject(tokens.access_token, interaction.signal)
  return {
    type: 'oauth',
    access: tokens.access_token,
    refresh: tokens.refresh_token,
    expires: Date.now() + tokens.expires_in * 1000 - 300_000,
    projectId,
  }
}

/**
 * Build the OAuth method around a host-owned, per-operation client-config resolver.
 * @param resolveClientConfig - Resolve the private OAuth client pair for each login or refresh.
 * @returns Provider-native OAuth operations for login, refresh, and request authentication.
 */
export function createAntiGravityOAuth(
  resolveClientConfig: () => Promise<AntiGravityOAuthClientConfig>,
): OAuthAuth {
  return {
    name: 'Google Anti Gravity',
    loginLabel: '使用 Google 账号登录 Anti Gravity',
    login: async interaction => login(interaction, await resolveClientConfig()),
    async refresh(credential, signal) {
      const current = credential as AntiGravityCredential
      if (typeof current.projectId !== 'string' || current.projectId.length === 0) {
        throw new Error('Anti Gravity credential has no Cloud Code Assist project id')
      }
      const clientConfig = await resolveClientConfig()
      const tokens = await exchange(new URLSearchParams({
        client_id: clientConfig.clientId,
        client_secret: clientConfig.clientSecret,
        refresh_token: credential.refresh,
        grant_type: 'refresh_token',
      }), signal)
      return {
        ...credential,
        access: tokens.access_token,
        refresh: tokens.refresh_token ?? credential.refresh,
        expires: Date.now() + tokens.expires_in * 1000 - 300_000,
      }
    },
    toAuth: (credential) => {
      const current = credential as AntiGravityCredential
      if (typeof current.projectId !== 'string' || current.projectId.length === 0) {
        throw new Error('Anti Gravity credential has no Cloud Code Assist project id')
      }
      return Promise.resolve({ apiKey: JSON.stringify({ token: credential.access, projectId: current.projectId }) })
    },
  }
}

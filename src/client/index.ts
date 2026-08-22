/** Anti Gravity OAuth settings page, browser half. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import antiGravityRemote from '@deepseek-ai/dsh-llm-pi-ai-antigravity/remote'
import type {
  AntiGravityAuthSnapshot,
  AntiGravityLoginId,
  AntiGravityLoginStart,
  AntiGravityLoginStatus,
} from '../types.ts'
import { AntiGravitySettings, type AntiGravitySettingsInjected } from './AntiGravitySettings.tsx'
import { en, NS, zh, type AntiGravityLocaleKey } from './locales.ts'

export type { AntiGravitySettingsInjected } from './AntiGravitySettings.tsx'
export type { AntiGravityLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Anti Gravity login settings copy. */
    'settings.antiGravity': AntiGravityLocaleKey
  }
}

interface AntiGravityRemoteClient {
  describe: () => Promise<RemoteResult<AntiGravityAuthSnapshot>>
  start: () => Promise<RemoteResult<AntiGravityLoginStart>>
  poll: (id: AntiGravityLoginId) => Promise<RemoteResult<AntiGravityLoginStatus>>
  logout: () => Promise<RemoteResult<void>>
}

function valueOf<T>(operation: string, result: RemoteResult<T>): T {
  if (result.ok) return result.value
  throw new Error(`${operation} failed: ${result.error.code}: ${result.error.message}`)
}

export const inject = ['slots', 'locale', 'remote', 'remote.antiGravityAuth']

/**
 * Register the Anti Gravity login page in Web Settings.
 * @param ctx - browser Cordis context.
 */
export async function apply(ctx: ClientContext): Promise<void> {
  const disposeRemote = await ctx.remote.$mount(antiGravityRemote)
  ctx.effect(() => disposeRemote, 'llm-pi-ai-antigravity: client Remote contribution')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'llm-pi-ai-antigravity: client dictionaries')
  const remote = (ctx.remote as unknown as { antiGravityAuth: AntiGravityRemoteClient }).antiGravityAuth
  const api: AntiGravitySettingsInjected = {
    describe: async () => valueOf('antiGravityAuth.describe', await remote.describe()),
    start: async () => valueOf('antiGravityAuth.start', await remote.start()),
    poll: async id => valueOf('antiGravityAuth.poll', await remote.poll(id)),
    logout: async () => { valueOf('antiGravityAuth.logout', await remote.logout()) },
  }
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'anti-gravity',
    order: 20,
    label: () => ctx.locale.bind(NS)('nav'),
    locale: NS,
    inject: () => api,
  }, AntiGravitySettings))
}

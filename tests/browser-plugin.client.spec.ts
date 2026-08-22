// @vitest-environment jsdom

import { cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import type { AntiGravityLoginId } from '../src/types.ts'
import { AntiGravitySettings } from '../src/client/AntiGravitySettings.tsx'
import type { AntiGravitySettingsInjected } from '../src/client/AntiGravitySettings.tsx'
import { apply, inject } from '../src/client/index.ts'

afterEach(cleanup)

class RemoteService extends Service {
  readonly $mount = vi.fn(async () => async () => {})

  constructor(ctx: Context) {
    super(ctx, 'remote')
  }
}

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  new RemoteService(ctx)
  const methods = {
    describe: vi.fn(async () => ({ ok: true as const, value: { configured: false } })),
    start: vi.fn(async () => ({
      ok: true as const,
      value: {
        loginId: 'login-1' as AntiGravityLoginId,
        authorizationUrl: 'https://accounts.example/authorize',
      },
    })),
    poll: vi.fn(async () => ({ ok: true as const, value: { kind: 'pending' as const } })),
    logout: vi.fn(async () => ({ ok: true as const, value: undefined })),
  }
  ctx.provide('remote.antiGravityAuth', methods)
  return { ctx, slots: ctx.get('slots') as SlotRegistry, locale, methods }
}

function declare(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: { 'settings.section': { kind: 'list', scope: 'root' } },
  } as never, () => null)
}

describe('Anti Gravity browser plugin', () => {
  it('registers its own localized settings section and unwraps the generated Remote', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    const entry = b.slots.entries('settings.section')[0]!
    expect(entry.component).toBe(AntiGravitySettings)
    expect(entry.options).toMatchObject({ id: 'anti-gravity', order: 20 })
    expect(resolveSlotLabel(entry.options.label)).toBe('Anti Gravity')
    const api = (entry.inject as unknown as () => AntiGravitySettingsInjected)()
    await expect(api.describe()).resolves.toEqual({ configured: false })
    await expect(api.start()).resolves.toMatchObject({
      loginId: 'login-1',
      authorizationUrl: 'https://accounts.example/authorize',
    })
    await expect(api.poll('login-1' as AntiGravityLoginId)).resolves.toEqual({ kind: 'pending' })
    await expect(api.logout()).resolves.toBeUndefined()
    expect(b.methods.describe).toHaveBeenCalledOnce()
    await b.ctx.fiber.dispose()
  })
})

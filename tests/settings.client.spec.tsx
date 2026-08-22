// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { AntiGravityLoginId } from '../src/types.ts'
import { AntiGravitySettings } from '../src/client/AntiGravitySettings.tsx'
import type { AntiGravitySettingsInjected } from '../src/client/AntiGravitySettings.tsx'
import { en } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const t: Parameters<typeof AntiGravitySettings>[0]['t'] = makeTranslate(en)

// Global standard kit stubs: this page consumes neither hook.
const unusedHook = (() => { throw new Error('unused by the Anti Gravity settings page') }) as never
const kit = { useSessions: unusedHook, useWorkspaces: unusedHook }

function props(injected: AntiGravitySettingsInjected): Parameters<typeof AntiGravitySettings>[0] {
  return { ...injected, ...kit, t, close: vi.fn() }
}

describe('Anti Gravity settings page', () => {
  it('starts login, opens the provider URL, polls success, and reloads status', async () => {
    const describe = vi.fn()
      .mockResolvedValueOnce({ configured: false })
      .mockResolvedValueOnce({ configured: true, source: 'file' })
    const start = vi.fn(async () => ({
      loginId: 'login-1' as AntiGravityLoginId,
      authorizationUrl: 'https://accounts.example/authorize',
    }))
    const poll = vi.fn(async () => ({ kind: 'succeeded' as const }))
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    render(<AntiGravitySettings {...props({
      describe,
      start,
      poll,
      logout: vi.fn(async () => {}),
    })} />)

    await waitFor(() => { expect(screen.getByText(en.missing)).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: en.signIn }))
    await waitFor(() => { expect(start).toHaveBeenCalledOnce() })
    expect(open).toHaveBeenCalledWith('https://accounts.example/authorize', '_blank', 'noopener,noreferrer')
    expect(screen.getByRole('link', { name: en.openAuthorization }).getAttribute('href'))
      .toBe('https://accounts.example/authorize')
    await waitFor(() => { expect(poll).toHaveBeenCalledWith('login-1') }, { timeout: 2_000 })
    await waitFor(() => { expect(screen.getByText(en.succeeded)).toBeTruthy() })
    expect(screen.getByText(en.configured)).toBeTruthy()
    expect(screen.getByText('Credential source: file')).toBeTruthy()
  })

  it('logs out a configured account', async () => {
    const logout = vi.fn(async () => {})
    render(<AntiGravitySettings {...props({
      describe: vi.fn(async () => ({ configured: true, source: 'file' })),
      start: vi.fn(),
      poll: vi.fn(),
      logout,
    })} />)
    await waitFor(() => { expect(screen.getByText(en.configured)).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: en.signOut }))
    await waitFor(() => { expect(logout).toHaveBeenCalledOnce() })
    expect(screen.getByText(en.missing)).toBeTruthy()
  })
})

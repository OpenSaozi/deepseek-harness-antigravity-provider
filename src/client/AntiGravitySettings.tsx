import { useEffect, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  AntiGravityAuthSnapshot,
  AntiGravityLoginId,
  AntiGravityLoginStart,
  AntiGravityLoginStatus,
} from '../types.ts'
import { NS } from './locales.ts'
import css from './AntiGravitySettings.module.css'

/** Host operations injected into the Anti Gravity settings page. */
export interface AntiGravitySettingsInjected {
  describe: () => Promise<AntiGravityAuthSnapshot>
  start: () => Promise<AntiGravityLoginStart>
  poll: (id: AntiGravityLoginId) => Promise<AntiGravityLoginStatus>
  logout: () => Promise<void>
}

/** Render login state and the complete start/poll/logout OAuth workflow. */
export function AntiGravitySettings({
  t,
  describe,
  start,
  poll,
  logout,
}: PropsRuntime<'settings.section'>
  & PropsLocale<typeof NS>
  & InjectFace<AntiGravitySettingsInjected>) {
  const [snapshot, setSnapshot] = useState<AntiGravityAuthSnapshot>()
  const [loginId, setLoginId] = useState<AntiGravityLoginId>()
  const [loginStatus, setLoginStatus] = useState<AntiGravityLoginStatus>()
  const [authorizationUrl, setAuthorizationUrl] = useState<string>()
  const [busy, setBusy] = useState<'start' | 'logout'>()
  const [error, setError] = useState('')

  const reload = (): void => {
    void describe().then(setSnapshot).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : t('loadFailed'))
    })
  }

  useEffect(reload, [describe])

  useEffect(() => {
    if (loginId === undefined || loginStatus?.kind !== 'pending') return
    let stopped = false
    const timer = window.setInterval(() => {
      void poll(loginId).then((status) => {
        if (stopped) return
        setLoginStatus(status)
        if (status.kind === 'succeeded') reload()
      }).catch((cause: unknown) => {
        if (!stopped) setError(cause instanceof Error ? cause.message : String(cause))
      })
    }, 1_000)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [describe, loginId, loginStatus?.kind, poll])

  const begin = (): void => {
    setBusy('start')
    setError('')
    setAuthorizationUrl(undefined)
    setLoginStatus(undefined)
    void start().then((started) => {
      setLoginId(started.loginId)
      setAuthorizationUrl(started.authorizationUrl)
      setLoginStatus({ kind: 'pending' })
      window.open(started.authorizationUrl, '_blank', 'noopener,noreferrer')
    }).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : String(cause))
    }).finally(() => { setBusy(undefined) })
  }

  const signOut = (): void => {
    setBusy('logout')
    setError('')
    void logout().then(() => {
      setSnapshot({ configured: false })
      setLoginId(undefined)
      setLoginStatus(undefined)
      setAuthorizationUrl(undefined)
    }).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : String(cause))
    }).finally(() => { setBusy(undefined) })
  }

  const configured = snapshot?.configured === true
  return <section className={css.section}>
    <h1 className={css.title}>{t('title')}</h1>
    <p className={css.intro}>{t('intro')}</p>
    <div className={css.card}>
      <div className={css.status}>
        <span className={configured ? `${css.dot} ${css.dotConfigured}` : css.dot} />
        {t(configured ? 'configured' : 'missing')}
      </div>
      {snapshot?.source !== undefined && <p className={css.source}>{t('source', { source: snapshot.source })}</p>}
      <div className={css.actions}>
        <Button variant="primary" disabled={busy !== undefined} onClick={begin}>
          {busy === 'start' ? t('signingIn') : t(configured ? 'signInAgain' : 'signIn')}
        </Button>
        {configured && <Button variant="outline" disabled={busy !== undefined} onClick={signOut}>
          {busy === 'logout' ? t('signingOut') : t('signOut')}
        </Button>}
      </div>
      {loginStatus?.kind === 'pending' && <p className={css.waiting}>{t('waiting')}</p>}
      {authorizationUrl !== undefined && loginStatus?.kind === 'pending'
        && <a className={css.authorization} href={authorizationUrl} target="_blank" rel="noreferrer">
          {t('openAuthorization')}
        </a>}
      {loginStatus?.kind === 'succeeded' && <p className={css.success}>{t('succeeded')}</p>}
      {loginStatus?.kind === 'failed' && <p className={css.error}>{t('failed')}: {loginStatus.message}</p>}
      {loginStatus?.kind === 'cancelled' && <p className={css.error}>{t('cancelled')}</p>}
      {error.length > 0 && <p className={css.error}>{error}</p>}
    </div>
  </section>
}

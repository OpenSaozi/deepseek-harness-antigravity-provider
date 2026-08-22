/** Locale namespace owned by the Anti Gravity settings page. */
export const NS = 'settings.antiGravity'

/** English strings and key source of truth. */
export const en = {
  nav: 'Anti Gravity',
  title: 'Google Anti Gravity',
  intro: 'Connect a Google Anti Gravity account for Cloud Code Assist models.',
  configured: 'Signed in',
  missing: 'Not signed in',
  source: 'Credential source: {source}',
  signIn: 'Sign in with Google',
  signInAgain: 'Sign in again',
  signingIn: 'Starting sign-in…',
  waiting: 'Complete authorization in the opened Google page.',
  openAuthorization: 'Open authorization page',
  succeeded: 'Authorization completed.',
  failed: 'Authorization failed',
  cancelled: 'Authorization was cancelled.',
  signOut: 'Sign out',
  signingOut: 'Signing out…',
  loadFailed: 'Could not read Anti Gravity login status.',
} as const

/** Translation keys rendered by the Anti Gravity settings page. */
export type AntiGravityLocaleKey = keyof typeof en

/** Chinese strings matching {@link en}. */
export const zh: Record<AntiGravityLocaleKey, string> = {
  nav: 'Anti Gravity',
  title: 'Google Anti Gravity',
  intro: '连接 Google Anti Gravity 账号，以使用 Cloud Code Assist 模型。',
  configured: '已登录',
  missing: '尚未登录',
  source: '凭据来源：{source}',
  signIn: '使用 Google 登录',
  signInAgain: '重新登录',
  signingIn: '正在启动登录…',
  waiting: '请在已打开的 Google 页面完成授权。',
  openAuthorization: '打开授权页面',
  succeeded: '授权完成。',
  failed: '授权失败',
  cancelled: '授权已取消。',
  signOut: '退出登录',
  signingOut: '正在退出…',
  loadFailed: '无法读取 Anti Gravity 登录状态。',
}

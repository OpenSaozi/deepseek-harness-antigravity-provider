/** Maintained and live-reconciled Anti Gravity model descriptors. */

import type { Model, RefreshModelsContext } from '@earendil-works/pi-ai'
import { antiGravityHeaders } from './auth.ts'

/** Private pi-ai API identity owned by this provider plugin. */
export type AntiGravityApi = 'google-antigravity'
/** Stable route and provider identity registered with the generic adapter. */
export const PROVIDER = 'google-antigravity'
/** Cloud Code Assist endpoints in provider-preferred fallback order. */
export const ENDPOINTS = [
  'https://daily-cloudcode-pa.googleapis.com',
  'https://cloudcode-pa.googleapis.com',
] as const

const NO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

function descriptor(
  id: string,
  name: string,
  family: 'gemini' | 'claude' | 'gpt',
  level: 'low' | 'medium' | 'high',
): Model<AntiGravityApi> {
  const contextWindow = family === 'gemini' ? 1_048_576 : family === 'claude' ? 200_000 : 131_072
  return {
    id,
    name,
    api: 'google-antigravity',
    provider: PROVIDER,
    baseUrl: ENDPOINTS[0],
    reasoning: true,
    thinkingLevelMap: {
      off: null,
      minimal: null,
      low: level === 'low' ? 'low' : null,
      medium: level === 'medium' ? 'medium' : null,
      high: level === 'high' ? 'high' : null,
      xhigh: null,
      max: null,
    },
    input: ['text', 'image'],
    cost: NO_COST,
    contextWindow,
    maxTokens: 65_536,
  }
}

/** Reviewed descriptors; the account-visible catalog is always reconciled online before display. */
export const maintainedModels: readonly Model<AntiGravityApi>[] = [
  descriptor('gemini-3.7-flash-high', 'Gemini 3.7 Flash (High)', 'gemini', 'high'),
  descriptor('gemini-3.7-flash-medium', 'Gemini 3.7 Flash (Medium)', 'gemini', 'medium'),
  descriptor('gemini-3.7-flash-low', 'Gemini 3.7 Flash (Low)', 'gemini', 'low'),
  descriptor('gemini-3.6-flash-high', 'Gemini 3.6 Flash (High)', 'gemini', 'high'),
  descriptor('gemini-3.6-flash-medium', 'Gemini 3.6 Flash (Medium)', 'gemini', 'medium'),
  descriptor('gemini-3.6-flash-low', 'Gemini 3.6 Flash (Low)', 'gemini', 'low'),
  descriptor('gemini-3.5-flash-high', 'Gemini 3.5 Flash (High)', 'gemini', 'high'),
  descriptor('gemini-3.5-flash-medium', 'Gemini 3.5 Flash (Medium)', 'gemini', 'medium'),
  descriptor('gemini-3.5-flash-low', 'Gemini 3.5 Flash (Low)', 'gemini', 'low'),
  descriptor('gemini-3.1-pro-high', 'Gemini 3.1 Pro (High)', 'gemini', 'high'),
  descriptor('gemini-3.1-pro-low', 'Gemini 3.1 Pro (Low)', 'gemini', 'low'),
  descriptor('claude-sonnet-4-6', 'Claude Sonnet 4.6 (Thinking)', 'claude', 'high'),
  descriptor('claude-opus-4-6-thinking', 'Claude Opus 4.6 (Thinking)', 'claude', 'high'),
  descriptor('gpt-oss-120b-medium', 'GPT-OSS 120B (Medium)', 'gpt', 'medium'),
]

interface AvailableModelsResponse {
  models?: Record<string, { displayName?: unknown }>
}

/**
 * Reconcile the maintained descriptors with one official `fetchAvailableModels` response.
 * @param payload - decoded Cloud Code Assist response body.
 * @returns reviewed descriptors that also appear in the response.
 */
export function parseAvailableModels(payload: unknown): readonly Model<AntiGravityApi>[] {
  if (typeof payload !== 'object' || payload === null || typeof (payload as AvailableModelsResponse).models !== 'object') {
    throw new Error('Anti Gravity model response must contain a models object')
  }
  const live = (payload as Required<AvailableModelsResponse>).models
  return maintainedModels.flatMap((model) => {
    const entry = live[model.id]
    if (entry === undefined) return []
    const name = typeof entry.displayName === 'string' && entry.displayName.length > 0 ? entry.displayName : model.name
    return [{ ...model, name }]
  })
}

/**
 * Fetch the account-authorized model list, retaining no quota or account fields.
 * @param context - pi-ai refresh context containing the OAuth credential and cancellation signal.
 * @returns reviewed account-visible Anti Gravity descriptors.
 */
export async function fetchAvailableModels(context: RefreshModelsContext): Promise<readonly Model<AntiGravityApi>[]> {
  const credential = context.credential
  if (credential?.type !== 'oauth'
    || typeof credential.projectId !== 'string'
    || credential.projectId.length === 0) {
    throw new Error('Anti Gravity model discovery requires an OAuth credential with a project id')
  }
  let lastStatus: number | undefined
  for (const endpoint of ENDPOINTS) {
    const response = await fetch(`${endpoint}/v1internal:fetchAvailableModels`, {
      method: 'POST',
      headers: antiGravityHeaders(credential.access),
      body: JSON.stringify({ project: credential.projectId }),
      ...context.signal === undefined ? {} : { signal: context.signal },
    })
    if (response.ok) {
      const models = parseAvailableModels(await response.json())
      if (models.length === 0) throw new Error('Anti Gravity returned no maintained models')
      return models
    }
    lastStatus = response.status
    if (![403, 404, 429, 500, 502, 503, 504].includes(response.status)) break
  }
  throw new Error(`Anti Gravity model discovery failed with HTTP ${lastStatus ?? 'unknown'}`)
}

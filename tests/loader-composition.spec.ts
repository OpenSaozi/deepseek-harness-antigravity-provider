import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import ApiGateway from '@deepseek-ai/dsh-api-gateway'
import { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import type { CredentialInfo, CredentialRef, ResolvedCredential } from '@deepseek-ai/dsh-credentials'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as TypertLoader from '@deepseek-ai/dsh-typert-loader'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import * as AntiGravity from '../src/index.ts'

let context: Context | undefined
let root: string | undefined

class TestCredentials extends CredentialProvider {
  override resolve(_ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    return Promise.resolve(undefined)
  }

  override describe(_ref: CredentialRef): Promise<CredentialInfo> {
    return Promise.resolve({ configured: false, writable: true })
  }

  override set(_ref: CredentialRef, _value: string): Promise<void> {
    return Promise.resolve()
  }

  override unset(_ref: CredentialRef): Promise<void> {
    return Promise.resolve()
  }
}

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

describe('real Loader and Typert composition', () => {
  it('loads the standalone provider and invokes its generated auth Remote', { timeout: 60_000 }, async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-antigravity-loader-'))
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      "- name: '@deepseek-ai/dsh-typert-registry'",
      "- name: '@deepseek-ai/dsh-llm'",
      "- name: 'test-credentials'",
      "- name: '@deepseek-ai/dsh-llm-pi-ai-antigravity'",
      "- name: '@deepseek-ai/dsh-typert-loader'",
      "- name: '@deepseek-ai/dsh-api-gateway'",
      '',
    ].join('\n'))

    context = new Context()
    context.baseUrl = pathToFileURL(root).href + '/'
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-typert-registry', TypertRegistry],
      ['@deepseek-ai/dsh-llm', LlmRuntime],
      ['test-credentials', TestCredentials],
      ['@deepseek-ai/dsh-llm-pi-ai-antigravity', AntiGravity],
      ['@deepseek-ai/dsh-typert-loader', TypertLoader],
      ['@deepseek-ai/dsh-api-gateway', ApiGateway],
    ])
    context.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
        return modules.get(specifier)
      },
    } as unknown as NonNullable<typeof context.loader.internal>
    await context.loader.create({
      name: 'cordis:include',
      config: { path: pathToFileURL(configPath).href },
    })
    await context.loader.await()

    const unloaded = [...context.loader.entries()]
      .filter(entry => entry.fiber === undefined && !entry.disabled)
      .map(entry => entry.options.name)
    expect(unloaded).toEqual([])
    expect(context.llm.listProviders()).toEqual([
      { id: 'google-antigravity', name: 'Google Anti Gravity' },
    ])
    await vi.waitFor(async () => {
      await expect(context?.typertGateway.invoke({
        namespace: 'antiGravityAuth',
        method: 'describe',
        args: {},
      })).resolves.toEqual({ configured: false })
    })
  })
})

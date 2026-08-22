import { resolve } from 'node:path'
import { clientBundle } from '../../client/tsdown.client.ts'

/**
 * Strip the checkout's absolute path from emitted chunks.
 *
 * The client build addresses stylesheets through virtual ids that carry the
 * resolved absolute path, and Rolldown writes those ids into the `#region`
 * markers it emits around each module. Committed bundles are what this
 * repository publishes, so the markers would otherwise disclose the build
 * machine's home directory and layout to everyone who reads them.
 */
function stripCheckoutPaths(harnessRoot: string) {
  const prefix = `${harnessRoot}/`
  return {
    name: 'dsh-strip-checkout-paths',
    renderChunk(code: string) {
      return code.includes(prefix) ? { code: code.replaceAll(prefix, ''), map: null } : null
    },
  }
}

const HARNESS_ROOT = resolve(import.meta.dirname, '../../..')

const preset = clientBundle(
  '@deepseek-ai/dsh-llm-pi-ai-antigravity',
  ['lib/types/index.js', 'lib/types/invariant.js'],
  { lib: { tsconfig: 'tsconfig.host.json' } },
)

/**
 * Append the path-stripping plugin to every configuration the shared client
 * preset produces.
 * @param face - the build face tsdown resolved for this run.
 * @returns the preset's configurations, each with the plugin appended.
 */
export default (env: Parameters<typeof preset>[0]) => {
  const configs = preset(env)
  return (Array.isArray(configs) ? configs : [configs]).map(config => ({
    ...config,
    plugins: [...(config.plugins ?? []), stripCheckoutPaths(HARNESS_ROOT)],
  }))
}

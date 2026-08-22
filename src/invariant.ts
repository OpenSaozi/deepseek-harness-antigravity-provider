/** Package-owned invariant companion for the Anti Gravity provider. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
export const name = 'llm-pi-ai-antigravity-invariant'
export const inject = ['invariants']
// No runtime invariant: the LLM registry owns route identity and registration lifecycle.
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register('@deepseek-ai/dsh-llm-pi-ai-antigravity', install))

/** Package-owned invariant companion for the Anti Gravity provider. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
export const name = 'llm-pi-ai-antigravity-invariant'
export const inject = ['invariants']
// No runtime invariant: the owning llm-pi-ai registry validates provider identity and lifecycle.
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register('@deepseek-ai/dsh-llm-pi-ai-antigravity', install))

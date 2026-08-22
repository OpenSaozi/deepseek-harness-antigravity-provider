import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@deepseek-ai/dsh-llm-pi-ai-antigravity',
  ['lib/types/index.js', 'lib/types/invariant.js'],
  { lib: { tsconfig: 'tsconfig.host.json' } },
)

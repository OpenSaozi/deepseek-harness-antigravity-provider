import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { WorkspaceTypertGenerator } from '@deepseek-ai/dsh-typert-generator'

const root = fileURLToPath(new URL('../../../..', import.meta.url))
const output = fileURLToPath(new URL('../lib', import.meta.url))
const [artifact] = new WorkspaceTypertGenerator(root)
  .generate(['@deepseek-ai/dsh-llm-pi-ai-antigravity'], ['host'])
if (artifact === undefined || artifact.face !== 'host' || artifact.remote === undefined) {
  throw new Error('Anti Gravity Typert generation produced no Host Remote artifact')
}
await mkdir(output, { recursive: true })
await Promise.all([
  writeFile(`${output}/typert.host.js`, artifact.js),
  writeFile(`${output}/typert.host.d.ts`, artifact.dts),
  writeFile(`${output}/typert.remote-client.js`, artifact.remote.js),
  writeFile(`${output}/typert.remote-client.d.ts`, artifact.remote.dts),
  writeFile(`${output}/typert.remote-client.d.ts.map`, artifact.remote.dtsMap),
])

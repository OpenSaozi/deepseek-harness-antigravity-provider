/** Resolve Anti Gravity's OAuth application identity without shipping it in source. */

import { execFile } from 'node:child_process'
import { readFile, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { CredentialProvider, CredentialRef } from '@deepseek-ai/dsh-credentials'

const execFileAsync = promisify(execFile)
const EXPECTED_BUNDLE_ID = 'com.google.antigravity-ide'
const EXPECTED_TEAM_ID = 'EQHXZ8M8AV'
const OAUTH_MODULE_MARKER = 'out-build/vs/platform/cloudCode/common/oauthClient.js'
const MAX_MAIN_BYTES = 32 * 1024 * 1024
const CLIENT_ID_PATTERN = /^[0-9]{6,}-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/
const CLIENT_SECRET_PATTERN = /^GOCSPX-[A-Za-z0-9_-]+$/
const CREDENTIAL_REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/
const OAUTH_ASSIGNMENT_PATTERN = new RegExp([
  '[A-Za-z_$][A-Za-z0-9_$]*="',
  '([0-9]{6,}-[A-Za-z0-9_-]+\\.apps\\.googleusercontent\\.com)",',
  '[A-Za-z_$][A-Za-z0-9_$]*="(GOCSPX-[A-Za-z0-9_-]+)"',
].join(''))

/** Default credential reference for the provider's OAuth application identity. */
export const DEFAULT_OAUTH_CLIENT_CONFIG_REF = 'GOOGLE_ANTIGRAVITY_OAUTH_CLIENT_CONFIG'

/** OAuth application identity imported from an official installed client. */
export interface AntiGravityOAuthClientConfig {
  clientId: string
  clientSecret: string
}

type CredentialStore = Pick<CredentialProvider, 'resolve' | 'set'>

function validateClientConfig(value: unknown): AntiGravityOAuthClientConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Anti Gravity OAuth client configuration must be a JSON object')
  }
  const { clientId, clientSecret } = value as Record<string, unknown>
  if (typeof clientId !== 'string' || !CLIENT_ID_PATTERN.test(clientId)) {
    throw new Error('Anti Gravity OAuth client configuration has an invalid clientId')
  }
  if (typeof clientSecret !== 'string' || !CLIENT_SECRET_PATTERN.test(clientSecret)) {
    throw new Error('Anti Gravity OAuth client configuration has an invalid clientSecret')
  }
  return { clientId, clientSecret }
}

/** Parse one credential-store value without exposing either field in diagnostics. */
export function parseOAuthClientConfig(value: string): AntiGravityOAuthClientConfig {
  try {
    return validateClientConfig(JSON.parse(value))
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Anti Gravity OAuth client configuration is not valid JSON')
    }
    throw error
  }
}

/**
 * Extract the normal, non-GCP-ToS client pair from the official IDE module.
 * The marker and adjacent assignment shape intentionally fail closed when the
 * vendor changes its bundle instead of guessing among unrelated OAuth ids.
 */
export function extractOAuthClientConfig(source: string): AntiGravityOAuthClientConfig {
  const marker = source.indexOf(OAUTH_MODULE_MARKER)
  if (marker < 0) throw new Error('Official Anti Gravity OAuth module was not found')
  const moduleSource = source.slice(marker, marker + 4096)
  if (!moduleSource.includes('https://www.googleapis.com/auth/cclog')) {
    throw new Error('Official Anti Gravity OAuth scopes were not found')
  }
  const assignment = OAUTH_ASSIGNMENT_PATTERN.exec(moduleSource)
  if (assignment === null) throw new Error('Official Anti Gravity OAuth client pair was not found')
  return validateClientConfig({ clientId: assignment[1], clientSecret: assignment[2] })
}

function defaultMacApplications(): string[] {
  return [
    '/Applications/Antigravity IDE.app',
    join(homedir(), 'Applications', 'Antigravity IDE.app'),
  ]
}

async function verifyOfficialMacApplication(applicationPath: string): Promise<string> {
  const canonical = await realpath(applicationPath)
  await execFileAsync('/usr/bin/codesign', ['--verify', '--deep', '--strict', canonical], {
    maxBuffer: 1024 * 1024,
  })
  const inspected = await execFileAsync('/usr/bin/codesign', ['-dv', '--verbose=4', canonical], {
    maxBuffer: 1024 * 1024,
  })
  const facts = `${inspected.stdout}\n${inspected.stderr}`
  if (!facts.split('\n').includes(`Identifier=${EXPECTED_BUNDLE_ID}`)
    || !facts.split('\n').includes(`TeamIdentifier=${EXPECTED_TEAM_ID}`)) {
    throw new Error('Installed Anti Gravity application is not signed by the expected Google team')
  }
  return canonical
}

async function verifyMacApplicationContents(applicationPath: string): Promise<void> {
  await execFileAsync('/usr/bin/codesign', ['--verify', '--deep', '--strict', applicationPath], {
    maxBuffer: 1024 * 1024,
  })
}

/** Import the client pair from a verified official macOS installation. */
export async function importInstalledOAuthClientConfig(applicationPath?: string): Promise<AntiGravityOAuthClientConfig> {
  if (process.platform !== 'darwin') {
    throw new Error('Automatic Anti Gravity OAuth client import currently requires macOS')
  }
  const candidates = applicationPath === undefined ? defaultMacApplications() : [applicationPath]
  const failures: unknown[] = []
  for (const candidate of candidates) {
    try {
      const canonical = await verifyOfficialMacApplication(candidate)
      const mainPath = join(canonical, 'Contents', 'Resources', 'app', 'out', 'main.js')
      const canonicalMain = await realpath(mainPath)
      if (!canonicalMain.startsWith(`${canonical}/Contents/`)) {
        throw new Error('Official Anti Gravity main bundle resolves outside the signed application')
      }
      const info = await stat(canonicalMain)
      if (!info.isFile() || info.size <= 0 || info.size > MAX_MAIN_BYTES) {
        throw new Error('Official Anti Gravity main bundle has an invalid size')
      }
      const source = await readFile(canonicalMain, 'utf8')
      await verifyMacApplicationContents(canonical)
      return extractOAuthClientConfig(source)
    } catch (error) {
      failures.push(error)
    }
  }
  throw new AggregateError(failures, 'No supported, Google-signed Anti Gravity IDE installation was found')
}

/** Resolve the private client config, importing and persisting it once when absent. */
export async function resolveOAuthClientConfig(
  credentials: CredentialStore,
  refValue = DEFAULT_OAUTH_CLIENT_CONFIG_REF,
  applicationPath?: string,
  importer: (applicationPath?: string) => Promise<AntiGravityOAuthClientConfig> = importInstalledOAuthClientConfig,
): Promise<AntiGravityOAuthClientConfig> {
  if (!CREDENTIAL_REF_PATTERN.test(refValue)) {
    throw new Error('Anti Gravity OAuth client credential reference must be a POSIX identifier')
  }
  const ref = refValue as CredentialRef
  const existing = await credentials.resolve(ref)
  if (existing !== undefined) return parseOAuthClientConfig(existing.value)
  const imported = await importer(applicationPath)
  await credentials.set(ref, JSON.stringify(imported))
  return imported
}

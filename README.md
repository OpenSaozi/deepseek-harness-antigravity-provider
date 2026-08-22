# DSH Plugin: LLM Provider - Anti Gravity

[中文](README.zh.md) | English

Allows connecting to the **Google Anti Gravity** Coding Plan as an LLM Provider, enabling [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness) to directly use all top-tier AI models under your account (including Gemini 3.7/3.6/3.5 Flash, Gemini 3.1 Pro, Claude 3.7 / Opus 4.6, GPT-OSS, etc.) for seamless web-based chat and coding.

## Target Audience and Use Cases

Designed for developers with Google Anti Gravity IDE installed or active Cloud Code Assist entitlements who want to access these high-performance models within the unified DeepSeek Harness workspace for coding, reasoning, and tool execution.

## Key Features

- **Lightweight Native Direct Connection**: Directly connects over HTTPS to Cloud Code Assist without spawning background `agy` subprocesses or IDE instances.
- **One-Click macOS Authorization**: Automatically validates and imports signed macOS Anti Gravity client configurations, opening the standard browser OAuth flow without manual Client ID/Secret copying.
- **Dynamic Model Discovery**: Queries the live `fetchAvailableModels` endpoint to surface reviewed Gemini, Claude, and GPT-OSS model variants.
- **Independent Provider Route**: The plugin registers its own `google-antigravity` adapter, owns its catalog, and resolves OAuth. It reuses the exported `PiAiAdapter` only for Harness message and stream conversion.
- **Built-in Login Page**: A package-owned Typert Remote provides login start, status polling, and logout; the browser half registers a dedicated Anti Gravity settings page.
- **Clean Native Experience**: Preserves thinking signatures, streaming output, and tool invocation contracts without injected provider system prompts, synthetic messages, or custom headers.

## Installation and Quick Start

Install a reviewed revision into a DeepSeek Harness profile. The repository provides a `dsh.bundle` patch and prebuilt runtime artifacts so no local build steps are required:

```sh
dsh plugin --profile <profile> add github:OpenSaozi/dsh-antigravity#<commit-sha>
```

The installed bundle contributes the following Cordis configuration:

```yaml
- id: llm-pi-ai-antigravity
  name: '@deepseek-ai/dsh-llm-pi-ai-antigravity'
  config:
    oauthCredentialEnv: GOOGLE_ANTIGRAVITY_OAUTH_CREDENTIAL
    oauthClientConfigRef: GOOGLE_ANTIGRAVITY_OAUTH_CLIENT_CONFIG
    displayName: Google Anti Gravity
```

Both `oauthCredentialEnv` and `oauthClientConfigRef` name credential references. The bundled local provider stores documents in `$DSH_HOME/.credentials.yaml`; deployments may use another credential backend.

## Security and Credentials

- The plugin uses two credential references: `GOOGLE_ANTIGRAVITY_OAUTH_CLIENT_CONFIG` for private OAuth application details and `GOOGLE_ANTIGRAVITY_OAUTH_CREDENTIAL` for user tokens.
- Credentials remain inside the Harness host credential service and never leak into settings, model catalogs, logs, or frontend responses.
- For inference, the plugin calls the OAuth handler's `toAuth()` and passes the resulting JSON auth value to pi-ai as a per-request override; pi-ai's model collection holds no CredentialStore.

## Contributing

Issues and scoped pull requests are welcome. Please describe observed provider responses, omit secrets and account identifiers, update both README languages, and run package tests in a matching DeepSeek Harness workspace.

## License and Disclaimer

MIT License. This independent integration is not affiliated with or endorsed by Google, DeepMind, DeepSeek, or pi-ai maintainers. Google Anti Gravity and related model names are trademarks of their respective owners.

## Model Experience

### Anti Gravity Inference

#### What the model sees

The selected model receives the Harness system prompt as `systemInstruction`, along with normalized conversation messages and tool definitions. The plugin adds no vendor prompts or instructions. The transport retains native Cloud Code Assist envelopes: sending authorized JSON/SSE headers and official fields (`project`, `model`, `request`, `requestType`, `userAgent`, and `requestId`) without compatibility headers, identity messages, or synthetic turns.

#### Token effect

No additional model-visible tokens are added beyond the system prompt, history, and tools in the request. Cloud Code Assist reports prompt, candidate, thinking, and cached token counts; the adapter maps these fields directly without estimation.

#### KV Cache effect

Logical message order is preserved. Thinking signatures and tool call IDs persist across subsequent turns. Upstream cache reuse remains governed by Cloud Code Assist and may reset when earlier turns or models change.

## Known Limitations and Deferred Work

- Google delivers this subscription path over internal `v1internal` Cloud Code Assist endpoints rather than public Gemini APIs; endpoint changes may affect this plugin independently of public Gemini services.
- OAuth starts from the plugin-owned Anti Gravity settings page, and the account must hold active service entitlements.
- Automatic OAuth client import currently supports Google-signed macOS `Antigravity IDE.app` installations. Non-standard paths can be supplied via `macosApplicationPath`; other operating systems require credentials pre-provisioned via the credentials service.
- Catalog items describe provider capabilities and do not guarantee remaining quota. Depleted quotas return as provider errors during inference.

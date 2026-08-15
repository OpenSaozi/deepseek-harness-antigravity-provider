# DeepSeek Harness Anti Gravity Provider

English | [中文](README.zh.md)

`@deepseek-ai/dsh-llm-pi-ai-antigravity` is an unofficial Google Anti Gravity and Cloud Code Assist provider plugin for [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness). It adds Google OAuth, authenticated model discovery, and native streaming for account-visible Gemini, Claude, and GPT-OSS models without invoking the Anti Gravity CLI.

The route uses two credential-service references. `GOOGLE_ANTIGRAVITY_OAUTH_CLIENT_CONFIG` holds the OAuth application's private JSON configuration, while `GOOGLE_ANTIGRAVITY_OAUTH_CREDENTIAL` holds pi-ai's canonical user OAuth document. On first login, the plugin verifies a Google-signed macOS Anti Gravity IDE, imports the application configuration into the Harness credential service, and then opens the normal browser authorization flow. Neither value is shipped in source or enters settings, model catalogs, logs, or browser responses.

## Highlights

- Direct HTTPS transport to the account-authorized Cloud Code Assist service; no `agy` subprocess.
- Live `fetchAvailableModels` reconciliation with reviewed Gemini 3.7/3.6/3.5, Gemini 3.1 Pro, Claude 4.6, and GPT-OSS descriptors.
- Harness system prompts, conversation history, tools, thought signatures, usage, cancellation, and SSE streaming remain visible to the Harness runtime.
- No hidden Anti Gravity identity prompt, synthetic user message, or compatibility header in the default inference request.
- One-click OAuth setup on macOS: no client id or client secret needs to be copied by hand.

## Installation

Install a reviewed commit into a DeepSeek Harness profile. The repository carries a `dsh.bundle` patch and prebuilt runtime files, so Git installation needs no package build permission:

```sh
dsh plugin --profile <profile> add github:OpenSaozi/deepseek-harness-antigravity-provider#<commit-sha>
```

The installed bundle contributes this Cordis row:

```yaml
- id: llm-pi-ai-antigravity
  name: '@deepseek-ai/dsh-llm-pi-ai-antigravity'
  config:
    oauthClientConfigRef: GOOGLE_ANTIGRAVITY_OAUTH_CLIENT_CONFIG
```

The reference is deployment configuration, not the credential value. The bundled local credential provider stores the imported document under `$DSH_HOME/.credentials.yaml` by default; another deployment may provide a keyring or KMS-backed `ctx.credentials` implementation without changing this plugin.

The source currently tracks the host-controlled transport proposal in DeepSeek Harness. Until that proposal is implemented, this plugin is trusted in-process code with access to its resolved OAuth credential and network transport. Review the source before authorizing an account.

## System Prompt Handling

The Harness system prompt is sent as Cloud Code Assist's `systemInstruction`. The plugin adds no hidden product prompt and does not rewrite the user's instruction.

## Model Context

The maintained descriptors cover reviewed Gemini 3.7/3.6/3.5 Flash, Gemini 3.1 Pro, Claude Sonnet/Opus 4.6, and GPT-OSS 120B variants. A successful authenticated refresh intersects them with the account-visible catalog and updates matching display metadata; unknown remote ids are not guessed into serviceable descriptors.

## Tool Schemas

Harness tools are converted with pi-ai's Google schema bridge. Claude-family routes use the legacy `parameters` field required by Cloud Code Assist; tool-call ids and thought signatures are preserved for follow-up turns.

## Contributing

Issues and focused pull requests are welcome. Please describe the observed provider response, redact credentials and account identifiers, update both README languages, and run the package tests inside a matching DeepSeek Harness checkout. Do not add unverified model ids, guessed capacity metadata, hidden prompts, or fallback mock data.

## License and Disclaimer

MIT licensed. This independent integration is not affiliated with or endorsed by Google, DeepMind, DeepSeek, or the pi-ai maintainers. Google Anti Gravity and related model names are trademarks of their respective owners.

## Model Experience

### Anti Gravity inference

#### What the model sees

The selected model receives the Harness system prompt as `systemInstruction`, converted conversation messages, and converted tool declarations. The plugin adds no provider prompt or explanatory text. Transport stays faithful to the native Cloud Code Assist envelope: by default it sends only the authenticated JSON/SSE headers and the official `project`, `model`, `request`, `requestType`, `userAgent`, and `requestId` envelope fields, without compatibility headers, identity messages, or synthetic conversation content.

#### Token effect

The plugin adds no model-visible tokens beyond the requested system prompt, history, and tools. Cloud Code Assist reports prompt, candidate, thought, and cached token usage; the adapter maps those fields without estimating missing usage.

#### KV Cache effect

Logical message order is preserved. Thought signatures and tool-call identities are retained for follow-up turns, but provider-side cache reuse remains controlled by Cloud Code Assist and can change when the model or any earlier request content changes.

## Known Limitations and Deferred Work

- Google exposes this subscription path through internal `v1internal` Cloud Code Assist endpoints, not the public Gemini API. Endpoint or entitlement changes can break the plugin independently of the public Gemini service.
- OAuth requires an interactive browser login from the Harness Models page and an account authorized for the underlying service.
- Automatic OAuth application import currently supports a Google-signed macOS `Antigravity IDE.app`. A nonstandard installation path can be supplied as `macosApplicationPath`; other operating systems need an externally provisioned credential-service value until a signed-client importer exists for them.
- Catalog values describe provider capabilities, not guaranteed per-account quota. Quota exhaustion still arrives as a provider error during inference.

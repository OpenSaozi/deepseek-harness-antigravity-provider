# DSH Plugin: LLM Provider - Anti Gravity

中文 | [English](README.md)

允许接入 **Google Anti Gravity** 的 Coding Plan 作为 LLM Provider，让 [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness) 可以直接使用你账号下绑定的全部顶尖 AI 模型（包括 Gemini 3.7/3.6/3.5 Flash、Gemini 3.1 Pro、Claude 3.7 / Opus 4.6、GPT-OSS 等），完全在浏览器网页端流畅对话与编程。

## 适用人群与场景

适合安装了 Google Anti Gravity IDE 或拥有 Cloud Code Assist 权限，希望在 DeepSeek Harness 统一工作台里直接调用这些高性能模型进行日常编码、复杂推理与工具调用的开发者。

## 核心特性

- **轻量原生直连**：直接通过 HTTPS 请求官方 Cloud Code Assist 服务，无需在后台挂起繁重的 `agy` 子进程或 IDE。
- **macOS 一键授权**：自动验证并读取本地签名的 Anti Gravity 客户端配置，点击浏览器授权即可完成登录，免去手工复制 Client ID / Secret 的麻烦。
- **模型自动发现**：通过在线 `fetchAvailableModels` 实时核对账号可用的 Gemini、Claude 与 GPT-OSS 系列模型。
- **独立供应商路由**：插件自行注册 `google-antigravity` adapter、维护目录并解析 OAuth；仅复用官方导出的 `PiAiAdapter` 做 Harness 消息与流转换。
- **自带登录页面**：插件通过自己的 Typert Remote 提供登录启动、状态轮询和退出登录，并把入口注册到独立的 Anti Gravity 设置页。
- **纯净原生体验**：完整保留模型的深度思考过程（Thinking）、流式打字与工具调用能力，不掺杂任何隐藏系统提示词、伪造消息或多余请求头。

## 极简安装与使用

请把经过评审的提交安装进指定的 DeepSeek Harness profile。仓库自带 `dsh.bundle` 配置和预构建运行文件，通过 Git 安装无需在本地执行构建：

```sh
dsh plugin --profile <profile> add github:OpenSaozi/dsh-antigravity#<commit-sha>
```

安装后，插件会自动在 Cordis 配置中注入以下内容：

```yaml
- id: llm-pi-ai-antigravity
  name: '@deepseek-ai/dsh-llm-pi-ai-antigravity'
  config:
    oauthCredentialEnv: GOOGLE_ANTIGRAVITY_OAUTH_CREDENTIAL
    oauthClientConfigRef: GOOGLE_ANTIGRAVITY_OAUTH_CLIENT_CONFIG
    displayName: Google Anti Gravity
```

配置说明：`oauthCredentialEnv` 与 `oauthClientConfigRef` 都是凭据引用名称。本地凭据提供方默认将文档保存在 `$DSH_HOME/.credentials.yaml` 中，也可切换至其他凭据后端。

## 安全与凭据管理

- 插件使用两条凭据引用：`GOOGLE_ANTIGRAVITY_OAUTH_CLIENT_CONFIG`（保存应用配置）与 `GOOGLE_ANTIGRAVITY_OAUTH_CREDENTIAL`（保存用户 OAuth 凭据）。
- 所有凭据均保存在 Harness 宿主安全存储中，不会随源码分发，也不会泄露至设置页面、模型清单、日志或前端响应。
- 推理时，插件调用 OAuth handler 的 `toAuth()`，把得到的 JSON 鉴权值作为单次请求 override 交给 pi-ai；pi-ai 的模型集合不持有 CredentialStore。

## 参与贡献

欢迎提交 issue 和范围明确的 pull request。请说明观察到的提供方响应，删除凭据和账号标识，同时更新中英文 README，并在版本匹配的 DeepSeek Harness 工作区中运行包测试。

## 许可证与声明

采用 MIT 许可证。该独立集成与 Google、DeepMind、DeepSeek 或 pi-ai 维护者无隶属或背书关系。Google Anti Gravity 及相关模型名称是其各自所有者的商标。

## 模型体验

### Anti Gravity 推理

#### 模型看到的内容

所选模型会收到作为 `systemInstruction` 的 Harness 系统提示词、转换后的对话消息和工具声明。插件不添加供应商提示词或说明性文本。传输层保持 Cloud Code Assist 原生封装：默认只发送经过授权的 JSON/SSE 必要请求头，以及官方 `project`、`model`、`request`、`requestType`、`userAgent` 和 `requestId` 外层字段，不注入兼容性请求头、身份消息或伪造的对话内容。

#### Token 影响

除请求中的系统提示词、历史与工具外，插件不增加模型可见 Token。Cloud Code Assist 会报告提示词、候选、思考和缓存 Token 用量；适配器只映射这些字段，不估算缺失用量。

#### KV Cache 影响

逻辑消息顺序保持不变。思考签名和工具调用标识会保留到后续轮次，但供应商侧缓存复用仍由 Cloud Code Assist 控制；模型或更早的请求内容变化时，复用可能改变。

## 已知限制与暂缓事项

- Google 通过内部 `v1internal` Cloud Code Assist 端点提供这条订阅路径，而不是公开 Gemini API。端点或权益变化可能在公开 Gemini 服务正常时单独破坏该插件。
- OAuth 从插件自己的 Anti Gravity 设置页发起，且账号必须拥有底层服务的使用权限。
- OAuth 应用自动导入目前支持由 Google 签名的 macOS `Antigravity IDE.app`。非标准安装路径可以通过 `macosApplicationPath` 指定；其他操作系统在拥有对应的签名客户端导入器之前，需要从外部预置凭据服务值。
- 清单值描述提供方能力，不保证账号剩余额度。额度耗尽仍会在推理时作为提供方错误返回。

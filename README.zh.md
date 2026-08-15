# DeepSeek Harness Anti Gravity 提供方插件

[English](README.md) | 中文

`@deepseek-ai/dsh-llm-pi-ai-antigravity` 是一个面向 [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness) 的非官方 Google Anti Gravity 和 Cloud Code Assist 提供方插件。它接入 Google OAuth、认证模型发现和原生流式推理，让账号可见的 Gemini、Claude 和 GPT-OSS 模型可用，且不调用 Anti Gravity CLI。

该路由使用两条凭据服务引用。`GOOGLE_ANTIGRAVITY_OAUTH_CLIENT_CONFIG` 保存 OAuth 应用的私有 JSON 配置，`GOOGLE_ANTIGRAVITY_OAUTH_CREDENTIAL` 保存 pi-ai 规范的用户 OAuth 文档。首次登录时，插件会验证一份由 Google 签名的 macOS Anti Gravity IDE，将应用配置导入 Harness 凭据服务，然后打开普通的浏览器授权流程。两类值都不会随源码分发，也不会进入设置、模型清单、日志或浏览器响应。

## 特性

- 通过 HTTPS 直接请求账号已授权的 Cloud Code Assist 服务，不启动 `agy` 子进程。
- 用在线 `fetchAvailableModels` 核对经评审的 Gemini 3.7/3.6/3.5、Gemini 3.1 Pro、Claude 4.6 和 GPT-OSS 描述。
- Harness 运行时仍然可见系统提示词、对话历史、工具、思考签名、用量、取消和 SSE 流。
- 默认推理请求不包含隐藏 Anti Gravity 身份提示、伪造用户消息或兼容性请求头。
- macOS 上一键完成 OAuth 准备，无需手工复制 client id 或 client secret。

## 安装

请把经过评审的提交安装进一个 DeepSeek Harness profile。仓库携带 `dsh.bundle` patch 和预构建运行文件，因此通过 Git 安装时无需授权包构建：

```sh
dsh plugin --profile <profile> add github:OpenSaozi/deepseek-harness-antigravity-provider#<commit-sha>
```

安装后的组合包会贡献下面这条 Cordis 配置：

```yaml
- id: llm-pi-ai-antigravity
  name: '@deepseek-ai/dsh-llm-pi-ai-antigravity'
  config:
    oauthClientConfigRef: GOOGLE_ANTIGRAVITY_OAUTH_CLIENT_CONFIG
```

该引用属于部署配置，不是凭据值。随附的本地凭据提供方默认把导入文档保存在 `$DSH_HOME/.credentials.yaml`；其他部署可以换成钥匙串或 KMS 支持的 `ctx.credentials` 实现，而无需修改本插件。

该源码当前跟踪 DeepSeek Harness 的宿主受控传输提案。在提案落地前，本插件仍是受信任的进程内代码，可以访问已解析的 OAuth 凭据和网络传输。授权账号前请先审查源码。

## System Prompt Handling

Harness 系统提示词会作为 Cloud Code Assist 的 `systemInstruction` 发送。插件不附加隐藏产品提示词，也不改写用户指令。

## Model Context

维护描述覆盖经评审的 Gemini 3.7/3.6/3.5 Flash、Gemini 3.1 Pro、Claude Sonnet/Opus 4.6 和 GPT-OSS 120B 变体。认证在线刷新成功后，会将它们与账号可见清单取交集，并更新匹配的显示元数据；不会把远端未知 id 猜测成可服务描述。

## Tool Schemas

Harness 工具经 pi-ai 的 Google schema 桥转换。Claude 系列路由使用 Cloud Code Assist 要求的旧式 `parameters` 字段；工具调用 id 与思考签名会保留到后续轮次。

## 参与贡献

欢迎提交 issue 和范围明确的 pull request。请说明观察到的提供方响应，删除凭据和账号标识，同时更新两种 README 语言，并在版本匹配的 DeepSeek Harness 工作区中运行包测试。不要添加未验证模型 id、猜测的容量元数据、隐藏提示词或后备 mock 数据。

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
- OAuth 需要从 Harness Models 页面发起交互式浏览器登录，且账号必须拥有底层服务的使用权限。
- OAuth 应用自动导入目前支持由 Google 签名的 macOS `Antigravity IDE.app`。非标准安装路径可以通过 `macosApplicationPath` 指定；其他操作系统在拥有对应的签名客户端导入器之前，需要从外部预置凭据服务值。
- 清单值描述提供方能力，不保证账号剩余额度。额度耗尽仍会在推理时作为提供方错误返回。

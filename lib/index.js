import { InMemoryCredentialStore, calculateCost, createAssistantMessageEventStream, createProvider, defaultProviderAuthContext } from "@earendil-works/pi-ai";
import z from "@deepseek-ai/schemastery";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { LlmError, assertUsableApiKey, resolveRetryPolicy } from "@deepseek-ai/dsh-llm";
import { PiAiAdapter } from "@deepseek-ai/dsh-llm-pi-ai";
import { MAX_TIMER_DELAY_MS } from "@deepseek-ai/dsh-timeout";
import { convertMessages, convertTools, isThinkingPart, mapStopReasonString, retainThoughtSignature } from "@earendil-works/pi-ai/api/google-shared";
import { createServer } from "node:http";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
//#region lib/types/auth.js
/** Google Anti Gravity OAuth implementation adapted to pi-ai's provider auth contract. */
const REDIRECT_URI = "http://localhost:51121/oauth-callback";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPES = [
	"https://www.googleapis.com/auth/cloud-platform",
	"https://www.googleapis.com/auth/userinfo.email",
	"https://www.googleapis.com/auth/userinfo.profile",
	"https://www.googleapis.com/auth/cclog",
	"https://www.googleapis.com/auth/experimentsandconfigs"
];
function base64Url(input) {
	return input.toString("base64url");
}
async function discoverProject(access, signal) {
	for (const endpoint of ["https://daily-cloudcode-pa.googleapis.com", "https://cloudcode-pa.googleapis.com"]) try {
		const response = await fetch(`${endpoint}/v1internal:loadCodeAssist`, {
			method: "POST",
			headers: antiGravityHeaders(access),
			body: JSON.stringify({ metadata: {
				ideName: "antigravity",
				ideType: "ANTIGRAVITY",
				ideVersion: "2.5.2"
			} }),
			...signal === void 0 ? {} : { signal }
		});
		if (!response.ok) continue;
		const body = await response.json();
		if (typeof body.cloudaicompanionProject === "string" && body.cloudaicompanionProject.length > 0) return body.cloudaicompanionProject;
		if (typeof body.cloudaicompanionProject === "object" && body.cloudaicompanionProject !== null && typeof body.cloudaicompanionProject.id === "string") return body.cloudaicompanionProject.id;
	} catch (error) {
		if (signal?.aborted) throw error;
	}
	throw new Error("Anti Gravity OAuth succeeded, but Cloud Code Assist returned no companion project");
}
/**
* Headers shared by Anti Gravity's Cloud Code Assist endpoints.
* @param access - current OAuth access token.
* @returns request headers for an authenticated JSON call.
*/
function antiGravityHeaders(access) {
	return {
		authorization: `Bearer ${access}`,
		"content-type": "application/json",
		"user-agent": "antigravity/2.5.2 darwin/arm64"
	};
}
async function exchange(params, signal) {
	const response = await fetch(TOKEN_URL, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: params,
		...signal === void 0 ? {} : { signal }
	});
	if (!response.ok) throw new Error(`Anti Gravity token exchange failed with HTTP ${response.status}`);
	return response.json();
}
async function login(interaction, clientConfig) {
	const verifier = base64Url(randomBytes(32));
	const challenge = base64Url(createHash("sha256").update(verifier).digest());
	const state = base64Url(randomBytes(24));
	const callback = new Promise((resolve, reject) => {
		const server = createServer((request, response) => {
			const url = new URL(request.url ?? "/", REDIRECT_URI);
			if (url.pathname !== "/oauth-callback") {
				response.writeHead(404).end();
				return;
			}
			const code = url.searchParams.get("code");
			if (url.searchParams.get("state") !== state || code === null) {
				response.writeHead(400, { "content-type": "text/plain; charset=utf-8" }).end("Anti Gravity OAuth callback is invalid.");
				server.close();
				reject(/* @__PURE__ */ new Error("Anti Gravity OAuth state or code is invalid"));
				return;
			}
			response.writeHead(200, { "content-type": "text/plain; charset=utf-8" }).end("Anti Gravity login completed. You may close this page.");
			server.close();
			resolve(code);
		});
		server.on("error", reject);
		server.listen(51121, "127.0.0.1");
		interaction.signal?.addEventListener("abort", () => {
			server.close();
			reject(/* @__PURE__ */ new Error("Anti Gravity OAuth was cancelled"));
		}, { once: true });
	});
	const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
	auth.search = new URLSearchParams({
		client_id: clientConfig.clientId,
		response_type: "code",
		redirect_uri: REDIRECT_URI,
		scope: SCOPES.join(" "),
		code_challenge: challenge,
		code_challenge_method: "S256",
		state,
		access_type: "offline",
		prompt: "consent"
	}).toString();
	interaction.notify({
		type: "auth_url",
		url: auth.toString(),
		instructions: "在浏览器完成 Google Anti Gravity 授权。"
	});
	const code = await callback;
	const tokens = await exchange(new URLSearchParams({
		client_id: clientConfig.clientId,
		client_secret: clientConfig.clientSecret,
		code,
		grant_type: "authorization_code",
		redirect_uri: REDIRECT_URI,
		code_verifier: verifier
	}), interaction.signal);
	if (tokens.refresh_token === void 0) throw new Error("Anti Gravity OAuth returned no refresh token");
	const projectId = await discoverProject(tokens.access_token, interaction.signal);
	return {
		type: "oauth",
		access: tokens.access_token,
		refresh: tokens.refresh_token,
		expires: Date.now() + tokens.expires_in * 1e3 - 3e5,
		projectId
	};
}
/**
* Build the OAuth method around a host-owned, per-operation client-config resolver.
* @param resolveClientConfig - Resolve the private OAuth client pair for each login or refresh.
* @returns Provider-native OAuth operations for login, refresh, and request authentication.
*/
function createAntiGravityOAuth(resolveClientConfig) {
	return {
		name: "Google Anti Gravity",
		loginLabel: "使用 Google 账号登录 Anti Gravity",
		login: async (interaction) => login(interaction, await resolveClientConfig()),
		async refresh(credential, signal) {
			const current = credential;
			if (typeof current.projectId !== "string" || current.projectId.length === 0) throw new Error("Anti Gravity credential has no Cloud Code Assist project id");
			const clientConfig = await resolveClientConfig();
			const tokens = await exchange(new URLSearchParams({
				client_id: clientConfig.clientId,
				client_secret: clientConfig.clientSecret,
				refresh_token: credential.refresh,
				grant_type: "refresh_token"
			}), signal);
			return {
				...credential,
				access: tokens.access_token,
				refresh: tokens.refresh_token ?? credential.refresh,
				expires: Date.now() + tokens.expires_in * 1e3 - 3e5
			};
		},
		toAuth: (credential) => {
			const current = credential;
			if (typeof current.projectId !== "string" || current.projectId.length === 0) throw new Error("Anti Gravity credential has no Cloud Code Assist project id");
			return Promise.resolve({ apiKey: JSON.stringify({
				token: credential.access,
				projectId: current.projectId
			}) });
		}
	};
}
//#endregion
//#region lib/types/models.js
/** Maintained and live-reconciled Anti Gravity model descriptors. */
/** Stable route and provider identity registered with the generic adapter. */
const PROVIDER = "google-antigravity";
/** Cloud Code Assist endpoints in provider-preferred fallback order. */
const ENDPOINTS = ["https://daily-cloudcode-pa.googleapis.com", "https://cloudcode-pa.googleapis.com"];
const NO_COST = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0
};
function descriptor(id, name, family, level) {
	const contextWindow = family === "gemini" ? 1048576 : family === "claude" ? 2e5 : 131072;
	return {
		id,
		name,
		api: "google-antigravity",
		provider: PROVIDER,
		baseUrl: ENDPOINTS[0],
		reasoning: true,
		thinkingLevelMap: {
			off: null,
			minimal: null,
			low: level === "low" ? "low" : null,
			medium: level === "medium" ? "medium" : null,
			high: level === "high" ? "high" : null,
			xhigh: null,
			max: null
		},
		input: ["text", "image"],
		cost: NO_COST,
		contextWindow,
		maxTokens: 65536
	};
}
/** Reviewed descriptors; the account-visible catalog is always reconciled online before display. */
const maintainedModels = [
	descriptor("gemini-3.7-flash-high", "Gemini 3.7 Flash (High)", "gemini", "high"),
	descriptor("gemini-3.7-flash-medium", "Gemini 3.7 Flash (Medium)", "gemini", "medium"),
	descriptor("gemini-3.7-flash-low", "Gemini 3.7 Flash (Low)", "gemini", "low"),
	descriptor("gemini-3.6-flash-high", "Gemini 3.6 Flash (High)", "gemini", "high"),
	descriptor("gemini-3.6-flash-medium", "Gemini 3.6 Flash (Medium)", "gemini", "medium"),
	descriptor("gemini-3.6-flash-low", "Gemini 3.6 Flash (Low)", "gemini", "low"),
	descriptor("gemini-3.5-flash-high", "Gemini 3.5 Flash (High)", "gemini", "high"),
	descriptor("gemini-3.5-flash-medium", "Gemini 3.5 Flash (Medium)", "gemini", "medium"),
	descriptor("gemini-3.5-flash-low", "Gemini 3.5 Flash (Low)", "gemini", "low"),
	descriptor("gemini-3.1-pro-high", "Gemini 3.1 Pro (High)", "gemini", "high"),
	descriptor("gemini-3.1-pro-low", "Gemini 3.1 Pro (Low)", "gemini", "low"),
	descriptor("claude-sonnet-4-6", "Claude Sonnet 4.6 (Thinking)", "claude", "high"),
	descriptor("claude-opus-4-6-thinking", "Claude Opus 4.6 (Thinking)", "claude", "high"),
	descriptor("gpt-oss-120b-medium", "GPT-OSS 120B (Medium)", "gpt", "medium")
];
/**
* Reconcile the maintained descriptors with one official `fetchAvailableModels` response.
* @param payload - decoded Cloud Code Assist response body.
* @returns reviewed descriptors that also appear in the response.
*/
function parseAvailableModels(payload) {
	if (typeof payload !== "object" || payload === null || typeof payload.models !== "object") throw new Error("Anti Gravity model response must contain a models object");
	const live = payload.models;
	return maintainedModels.flatMap((model) => {
		const entry = live[model.id];
		if (entry === void 0) return [];
		const name = typeof entry.displayName === "string" && entry.displayName.length > 0 ? entry.displayName : model.name;
		return [{
			...model,
			name
		}];
	});
}
/**
* Fetch the account-authorized model list, retaining no quota or account fields.
* @param context - pi-ai refresh context containing the OAuth credential and cancellation signal.
* @returns reviewed account-visible Anti Gravity descriptors.
*/
async function fetchAvailableModels(context) {
	const credential = context.credential;
	return fetchAvailableModelsForCredential(credential, context.signal);
}
/**
* Fetch the account-authorized model list from an explicitly resolved OAuth credential.
* @param credential - current credential resolved by this plugin.
* @param signal - optional cancellation signal.
* @returns reviewed account-visible Anti Gravity descriptors.
*/
async function fetchAvailableModelsForCredential(credential, signal) {
	if (credential?.type !== "oauth" || typeof credential.projectId !== "string" || credential.projectId.length === 0) throw new Error("Anti Gravity model discovery requires an OAuth credential with a project id");
	let lastStatus;
	for (const endpoint of ENDPOINTS) {
		const response = await fetch(`${endpoint}/v1internal:fetchAvailableModels`, {
			method: "POST",
			headers: antiGravityHeaders(credential.access),
			body: JSON.stringify({ project: credential.projectId }),
			...signal === void 0 ? {} : { signal }
		});
		if (response.ok) {
			const models = parseAvailableModels(await response.json());
			if (models.length === 0) throw new Error("Anti Gravity returned no maintained models");
			return models;
		}
		lastStatus = response.status;
		if (![
			403,
			404,
			429,
			500,
			502,
			503,
			504
		].includes(response.status)) break;
	}
	throw new Error(`Anti Gravity model discovery failed with HTTP ${lastStatus ?? "unknown"}`);
}
//#endregion
//#region lib/types/api.js
/** Cloud Code Assist streaming implementation for Google Anti Gravity. */
function parseAuth(value) {
	if (value === void 0) throw new Error("Anti Gravity requires OAuth authentication");
	let parsed;
	try {
		parsed = JSON.parse(value);
	} catch {
		throw new Error("Anti Gravity OAuth request credential is invalid");
	}
	if (typeof parsed !== "object" || parsed === null || typeof parsed.token !== "string" || typeof parsed.projectId !== "string") throw new Error("Anti Gravity OAuth request credential is incomplete");
	return parsed;
}
function requestBody(model, context, options, projectId) {
	const request = {
		contents: convertMessages(model, context),
		...options.sessionId === void 0 ? {} : { sessionId: options.sessionId }
	};
	if (context.systemPrompt !== void 0) request.systemInstruction = {
		role: "user",
		parts: [{ text: context.systemPrompt }]
	};
	const generationConfig = {};
	if (options.temperature !== void 0) generationConfig.temperature = options.temperature;
	if (options.maxTokens !== void 0) generationConfig.maxOutputTokens = options.maxTokens;
	if (Object.keys(generationConfig).length > 0) request.generationConfig = generationConfig;
	if (context.tools !== void 0 && context.tools.length > 0) request.tools = convertTools(context.tools, model.id.startsWith("claude-"));
	return {
		project: projectId,
		model: model.id,
		request,
		requestType: "agent",
		userAgent: "antigravity",
		requestId: `agent-${crypto.randomUUID()}`
	};
}
async function openResponse(model, context, options, auth) {
	let payload = requestBody(model, context, options, auth.projectId);
	const replacement = await options.onPayload?.(payload, model);
	if (replacement !== void 0) payload = replacement;
	const body = JSON.stringify(payload);
	let lastStatus;
	for (const endpoint of ENDPOINTS) {
		const headers = {
			...Object.fromEntries(Object.entries(options.headers ?? {}).filter((entry) => entry[1] !== null)),
			...antiGravityHeaders(auth.token),
			accept: "text/event-stream",
			...model.id.startsWith("claude-") ? { "anthropic-beta": "interleaved-thinking-2025-05-14" } : {}
		};
		const response = await fetch(`${endpoint}/v1internal:streamGenerateContent?alt=sse`, {
			method: "POST",
			headers,
			body,
			...options.signal === void 0 ? {} : { signal: options.signal }
		});
		await options.onResponse?.({
			status: response.status,
			headers: Object.fromEntries(response.headers)
		}, model);
		if (response.ok) return response;
		lastStatus = response.status;
		if (![
			403,
			404,
			429,
			500,
			502,
			503,
			504
		].includes(response.status)) break;
	}
	throw new Error(`Anti Gravity inference failed with HTTP ${lastStatus ?? "unknown"}`);
}
/**
* Native provider stream used by the registered pi-ai provider.
* @param model - selected Anti Gravity model descriptor.
* @param context - system prompt, history, and tools for this request.
* @param options - pi-ai transport, credential, and cancellation options.
* @returns assistant event stream backed by Cloud Code Assist SSE.
*/
function streamAntiGravity(model, context, options = {}) {
	const stream = createAssistantMessageEventStream();
	const output = {
		role: "assistant",
		content: [],
		api: model.api,
		provider: model.provider,
		model: model.id,
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				total: 0
			}
		},
		stopReason: "stop",
		timestamp: Date.now()
	};
	(async () => {
		try {
			const response = await openResponse(model, context, options, parseAuth(options.apiKey));
			if (response.body === null) throw new Error("Anti Gravity returned no response stream");
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";
			let started = false;
			let current;
			const ensureStarted = () => {
				if (started) return;
				started = true;
				stream.push({
					type: "start",
					partial: output
				});
			};
			const closeCurrent = () => {
				if (current === void 0) return;
				const index = output.content.length - 1;
				if (current.type === "text") stream.push({
					type: "text_end",
					contentIndex: index,
					content: current.text,
					partial: output
				});
				else stream.push({
					type: "thinking_end",
					contentIndex: index,
					content: current.thinking,
					partial: output
				});
				current = void 0;
			};
			const consume = (chunk) => {
				const data = chunk.response;
				if (data === void 0) return;
				if (output.responseId === void 0 && data.responseId !== void 0) output.responseId = data.responseId;
				const candidate = data.candidates?.[0];
				for (const part of candidate?.content?.parts ?? []) {
					if (part.text !== void 0) {
						const thinking = isThinkingPart(part);
						let active = current;
						if (current === void 0 || thinking && current.type !== "thinking" || !thinking && current.type !== "text") {
							closeCurrent();
							const created = thinking ? {
								type: "thinking",
								thinking: "",
								...part.thoughtSignature === void 0 ? {} : { thinkingSignature: part.thoughtSignature }
							} : {
								type: "text",
								text: ""
							};
							current = created;
							active = created;
							output.content.push(created);
							ensureStarted();
							const index = output.content.length - 1;
							stream.push(thinking ? {
								type: "thinking_start",
								contentIndex: index,
								partial: output
							} : {
								type: "text_start",
								contentIndex: index,
								partial: output
							});
						}
						const index = output.content.length - 1;
						if (active === void 0) throw new Error("Anti Gravity stream block was not initialized");
						if (active.type === "thinking") {
							active.thinking += part.text;
							const signature = retainThoughtSignature(active.thinkingSignature, part.thoughtSignature);
							if (signature !== void 0) active.thinkingSignature = signature;
							stream.push({
								type: "thinking_delta",
								contentIndex: index,
								delta: part.text,
								partial: output
							});
						} else {
							active.text += part.text;
							stream.push({
								type: "text_delta",
								contentIndex: index,
								delta: part.text,
								partial: output
							});
						}
					}
					if (part.functionCall !== void 0) {
						closeCurrent();
						const toolCall = {
							type: "toolCall",
							id: part.functionCall.id ?? `${part.functionCall.name ?? "tool"}_${crypto.randomUUID()}`,
							name: part.functionCall.name ?? "",
							arguments: part.functionCall.args ?? {},
							...part.thoughtSignature === void 0 ? {} : { thoughtSignature: part.thoughtSignature }
						};
						output.content.push(toolCall);
						ensureStarted();
						const index = output.content.length - 1;
						stream.push({
							type: "toolcall_start",
							contentIndex: index,
							partial: output
						});
						stream.push({
							type: "toolcall_delta",
							contentIndex: index,
							delta: JSON.stringify(toolCall.arguments),
							partial: output
						});
						stream.push({
							type: "toolcall_end",
							contentIndex: index,
							toolCall,
							partial: output
						});
					}
				}
				if (candidate?.finishReason !== void 0) output.stopReason = mapStopReasonString(candidate.finishReason);
				if (output.content.some((block) => block.type === "toolCall")) output.stopReason = "toolUse";
				const usage = data.usageMetadata;
				if (usage !== void 0) {
					const cacheRead = usage.cachedContentTokenCount ?? 0;
					output.usage = {
						input: Math.max(0, (usage.promptTokenCount ?? 0) - cacheRead),
						output: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
						reasoning: usage.thoughtsTokenCount ?? 0,
						cacheRead,
						cacheWrite: 0,
						totalTokens: usage.totalTokenCount ?? 0,
						cost: {
							input: 0,
							output: 0,
							cacheRead: 0,
							cacheWrite: 0,
							total: 0
						}
					};
					calculateCost(model, output.usage);
				}
			};
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";
				for (const line of lines) {
					if (!line.startsWith("data:")) continue;
					const text = line.slice(5).trim();
					if (text.length === 0) continue;
					consume(JSON.parse(text));
				}
			}
			closeCurrent();
			if (output.content.length === 0) throw new Error("Anti Gravity returned an empty response");
			const reason = output.stopReason === "toolUse" || output.stopReason === "length" ? output.stopReason : "stop";
			stream.push({
				type: "done",
				reason,
				message: output
			});
			stream.end();
		} catch (error) {
			output.stopReason = options.signal?.aborted ? "aborted" : "error";
			output.errorMessage = error instanceof Error ? error.message : String(error);
			stream.push({
				type: "error",
				reason: output.stopReason,
				error: output
			});
			stream.end();
		}
	})();
	return stream;
}
const streamSimple = (model, context, options) => streamAntiGravity(model, context, options);
/** Provider stream pair supplied to `createProvider`. */
const antiGravityApi = {
	stream: (model, context, options) => streamAntiGravity(model, context, options),
	streamSimple: (model, context, options) => streamSimple(model, context, options)
};
//#endregion
//#region lib/types/client-config.js
/** Resolve Anti Gravity's OAuth application identity without shipping it in source. */
const execFileAsync = promisify(execFile);
const EXPECTED_BUNDLE_ID = "com.google.antigravity-ide";
const EXPECTED_TEAM_ID = "EQHXZ8M8AV";
const OAUTH_MODULE_MARKER = "out-build/vs/platform/cloudCode/common/oauthClient.js";
const MAX_MAIN_BYTES = 32 * 1024 * 1024;
const CLIENT_ID_PATTERN = /^[0-9]{6,}-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/;
const CLIENT_SECRET_PATTERN = /^GOCSPX-[A-Za-z0-9_-]+$/;
const CREDENTIAL_REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const OAUTH_ASSIGNMENT_PATTERN = new RegExp([
	"[A-Za-z_$][A-Za-z0-9_$]*=\"",
	"([0-9]{6,}-[A-Za-z0-9_-]+\\.apps\\.googleusercontent\\.com)\",",
	"[A-Za-z_$][A-Za-z0-9_$]*=\"(GOCSPX-[A-Za-z0-9_-]+)\""
].join(""));
/** Default credential reference for the provider's OAuth application identity. */
const DEFAULT_OAUTH_CLIENT_CONFIG_REF = "GOOGLE_ANTIGRAVITY_OAUTH_CLIENT_CONFIG";
function validateClientConfig(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Anti Gravity OAuth client configuration must be a JSON object");
	const { clientId, clientSecret } = value;
	if (typeof clientId !== "string" || !CLIENT_ID_PATTERN.test(clientId)) throw new Error("Anti Gravity OAuth client configuration has an invalid clientId");
	if (typeof clientSecret !== "string" || !CLIENT_SECRET_PATTERN.test(clientSecret)) throw new Error("Anti Gravity OAuth client configuration has an invalid clientSecret");
	return {
		clientId,
		clientSecret
	};
}
/**
* Parse one credential-store value without exposing either field in diagnostics.
* @param value - Serialized OAuth client configuration from the credential store.
* @returns Validated client id and client secret.
*/
function parseOAuthClientConfig(value) {
	try {
		return validateClientConfig(JSON.parse(value));
	} catch (error) {
		if (error instanceof SyntaxError) throw new Error("Anti Gravity OAuth client configuration is not valid JSON");
		throw error;
	}
}
/**
* Extract the normal, non-GCP-ToS client pair from the official IDE module.
* The marker and adjacent assignment shape intentionally fail closed when the
* vendor changes its bundle instead of guessing among unrelated OAuth ids.
* @param source - JavaScript source from the verified official application bundle.
* @returns Validated client id and client secret.
*/
function extractOAuthClientConfig(source) {
	const marker = source.indexOf(OAUTH_MODULE_MARKER);
	if (marker < 0) throw new Error("Official Anti Gravity OAuth module was not found");
	const moduleSource = source.slice(marker, marker + 4096);
	if (!moduleSource.includes("https://www.googleapis.com/auth/cclog")) throw new Error("Official Anti Gravity OAuth scopes were not found");
	const assignment = OAUTH_ASSIGNMENT_PATTERN.exec(moduleSource);
	if (assignment === null) throw new Error("Official Anti Gravity OAuth client pair was not found");
	return validateClientConfig({
		clientId: assignment[1],
		clientSecret: assignment[2]
	});
}
function defaultMacApplications() {
	return ["/Applications/Antigravity IDE.app", join(homedir(), "Applications", "Antigravity IDE.app")];
}
async function verifyOfficialMacApplication(applicationPath) {
	const canonical = await realpath(applicationPath);
	await execFileAsync("/usr/bin/codesign", [
		"--verify",
		"--deep",
		"--strict",
		canonical
	], { maxBuffer: 1024 * 1024 });
	const inspected = await execFileAsync("/usr/bin/codesign", [
		"-dv",
		"--verbose=4",
		canonical
	], { maxBuffer: 1024 * 1024 });
	const facts = `${inspected.stdout}\n${inspected.stderr}`;
	if (!facts.split("\n").includes(`Identifier=${EXPECTED_BUNDLE_ID}`) || !facts.split("\n").includes(`TeamIdentifier=${EXPECTED_TEAM_ID}`)) throw new Error("Installed Anti Gravity application is not signed by the expected Google team");
	return canonical;
}
async function verifyMacApplicationContents(applicationPath) {
	await execFileAsync("/usr/bin/codesign", [
		"--verify",
		"--deep",
		"--strict",
		applicationPath
	], { maxBuffer: 1024 * 1024 });
}
/**
* Import the client pair from a verified official macOS installation.
* @param applicationPath - Optional explicit application bundle path.
* @returns Client configuration extracted after signature and path verification.
*/
async function importInstalledOAuthClientConfig(applicationPath) {
	if (process.platform !== "darwin") throw new Error("Automatic Anti Gravity OAuth client import currently requires macOS");
	const candidates = applicationPath === void 0 ? defaultMacApplications() : [applicationPath];
	const failures = [];
	for (const candidate of candidates) try {
		const canonical = await verifyOfficialMacApplication(candidate);
		const canonicalMain = await realpath(join(canonical, "Contents", "Resources", "app", "out", "main.js"));
		if (!canonicalMain.startsWith(`${canonical}/Contents/`)) throw new Error("Official Anti Gravity main bundle resolves outside the signed application");
		const info = await stat(canonicalMain);
		if (!info.isFile() || info.size <= 0 || info.size > MAX_MAIN_BYTES) throw new Error("Official Anti Gravity main bundle has an invalid size");
		const source = await readFile(canonicalMain, "utf8");
		await verifyMacApplicationContents(canonical);
		return extractOAuthClientConfig(source);
	} catch (error) {
		failures.push(error);
	}
	throw new AggregateError(failures, "No supported, Google-signed Anti Gravity IDE installation was found");
}
/**
* Resolve the private client config, importing and persisting it once when absent.
* @param credentials - Credential store that owns the private client pair.
* @param refValue - Credential reference used for the serialized client pair.
* @param applicationPath - Optional explicit application bundle path for first import.
* @param importer - Import operation used when the credential reference is absent.
* @returns Validated client configuration for the next OAuth operation.
*/
async function resolveOAuthClientConfig(credentials, refValue = DEFAULT_OAUTH_CLIENT_CONFIG_REF, applicationPath, importer = importInstalledOAuthClientConfig) {
	if (!CREDENTIAL_REF_PATTERN.test(refValue)) throw new Error("Anti Gravity OAuth client credential reference must be a POSIX identifier");
	const ref = refValue;
	const existing = await credentials.resolve(ref);
	if (existing !== void 0) return parseOAuthClientConfig(existing.value);
	const imported = await importer(applicationPath);
	await credentials.set(ref, JSON.stringify(imported));
	return imported;
}
//#endregion
//#region lib/types/credential.js
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/**
* Parse one opaque Anti Gravity OAuth credential without exposing secret fields.
* @param raw - JSON value resolved through the Harness credential service.
* @param ref - safe credential reference used in diagnostics.
* @returns canonical pi-ai OAuth credential with a Cloud Code Assist project id.
*/
function parseAntiGravityCredential(raw, ref) {
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new LlmError(`llm-pi-ai-antigravity: OAuth credential ${ref} is not valid JSON`, "AUTH");
	}
	if (!isRecord(parsed) || parsed.type !== "oauth" || typeof parsed.access !== "string" || parsed.access.length === 0 || typeof parsed.refresh !== "string" || parsed.refresh.length === 0 || typeof parsed.expires !== "number" || !Number.isFinite(parsed.expires) || parsed.expires <= 0 || typeof parsed.projectId !== "string" || parsed.projectId.length === 0) throw new LlmError(`llm-pi-ai-antigravity: OAuth credential ${ref} must contain type "oauth", non-empty access and refresh tokens, a positive finite expires timestamp, and a non-empty projectId`, "AUTH");
	return parsed;
}
/** Resolve, refresh, persist, and derive request auth for Anti Gravity OAuth. */
var AntiGravityCredentialManager = class {
	credentials;
	ref;
	oauth;
	refreshing;
	/**
	* @param credentials - Harness credential service.
	* @param ref - opaque JSON credential reference.
	* @param oauth - provider-native Anti Gravity OAuth handler.
	*/
	constructor(credentials, ref, oauth) {
		this.credentials = credentials;
		this.ref = ref;
		this.oauth = oauth;
	}
	/**
	* Resolve a valid canonical credential, refreshing it once across concurrent callers.
	* @returns current or newly persisted OAuth credential.
	*/
	async resolveCredential() {
		let credential = await this.read();
		if (Date.now() >= credential.expires) {
			this.refreshing ??= this.refreshExpired().finally(() => {
				this.refreshing = void 0;
			});
			credential = await this.refreshing;
		}
		return credential;
	}
	/**
	* Derive pi-ai's request-level API-key override from the provider OAuth handler.
	* @returns JSON request credential consumed by the Anti Gravity protocol.
	*/
	async resolveApiKey() {
		const credential = await this.resolveCredential();
		try {
			const auth = await this.oauth.toAuth(credential);
			if (auth.apiKey === void 0) throw new Error("Anti Gravity OAuth handler returned no request API key");
			return assertUsableApiKey(auth.apiKey, "llm-pi-ai-antigravity", this.ref);
		} catch (error) {
			if (error instanceof LlmError) throw error;
			throw new LlmError("llm-pi-ai-antigravity: OAuth auth derivation failed", "AUTH", { cause: error });
		}
	}
	async read() {
		const hit = await this.credentials.resolve(this.ref);
		if (hit === void 0) throw new LlmError(`llm-pi-ai-antigravity: no OAuth credential at ${this.ref}`, "MISSING_CREDENTIAL");
		return parseAntiGravityCredential(hit.value, this.ref);
	}
	async refreshExpired() {
		const current = await this.read();
		if (Date.now() < current.expires) return current;
		let refreshed;
		try {
			refreshed = await this.oauth.refresh(current);
		} catch (error) {
			throw new LlmError("llm-pi-ai-antigravity: OAuth refresh failed", "AUTH", { cause: error });
		}
		const checked = parseAntiGravityCredential(JSON.stringify(refreshed), this.ref);
		await this.credentials.set(this.ref, JSON.stringify(checked));
		return checked;
	}
};
//#endregion
//#region lib/types/remote-service.js
var __runInitializers = function(thisArg, initializers, value) {
	var useValue = arguments.length > 2;
	for (var i = 0; i < initializers.length; i++) value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
	return useValue ? value : void 0;
};
var __esDecorate = function(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
	function accept(f) {
		if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
		return f;
	}
	var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
	var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
	var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
	var _, done = false;
	for (var i = decorators.length - 1; i >= 0; i--) {
		var context = {};
		for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
		for (var p in contextIn.access) context.access[p] = contextIn.access[p];
		context.addInitializer = function(f) {
			if (done) throw new TypeError("Cannot add initializers after decoration has completed");
			extraInitializers.push(accept(f || null));
		};
		var result = (0, decorators[i])(kind === "accessor" ? {
			get: descriptor.get,
			set: descriptor.set
		} : descriptor[key], context);
		if (kind === "accessor") {
			if (result === void 0) continue;
			if (result === null || typeof result !== "object") throw new TypeError("Object expected");
			if (_ = accept(result.get)) descriptor.get = _;
			if (_ = accept(result.set)) descriptor.set = _;
			if (_ = accept(result.init)) initializers.unshift(_);
		} else if (_ = accept(result)) if (kind === "field") initializers.unshift(_);
		else descriptor[key] = _;
	}
	if (target) Object.defineProperty(target, contextIn.name, descriptor);
	done = true;
};
function loginId() {
	return randomUUID();
}
function failureMessage(error) {
	return error instanceof Error && error.message.length > 0 ? error.message : "Anti Gravity OAuth failed";
}
/** Remote-only owner of Anti Gravity login, polling, status, and logout. */
let AntiGravityAuthRemote = (() => {
	let _classSuper = TypertRemoteService;
	let _instanceExtraInitializers = [];
	let _describe_decorators;
	let _start_decorators;
	let _poll_decorators;
	let _logout_decorators;
	return class AntiGravityAuthRemote extends _classSuper {
		static {
			const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
			_describe_decorators = [Remote("describe")];
			_start_decorators = [Remote("start")];
			_poll_decorators = [Remote("poll")];
			_logout_decorators = [Remote("logout")];
			__esDecorate(this, null, _describe_decorators, {
				kind: "method",
				name: "describe",
				static: false,
				private: false,
				access: {
					has: (obj) => "describe" in obj,
					get: (obj) => obj.describe
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _start_decorators, {
				kind: "method",
				name: "start",
				static: false,
				private: false,
				access: {
					has: (obj) => "start" in obj,
					get: (obj) => obj.start
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _poll_decorators, {
				kind: "method",
				name: "poll",
				static: false,
				private: false,
				access: {
					has: (obj) => "poll" in obj,
					get: (obj) => obj.poll
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _logout_decorators, {
				kind: "method",
				name: "logout",
				static: false,
				private: false,
				access: {
					has: (obj) => "logout" in obj,
					get: (obj) => obj.logout
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			if (_metadata) Object.defineProperty(this, Symbol.metadata, {
				enumerable: true,
				configurable: true,
				writable: true,
				value: _metadata
			});
		}
		credentials = __runInitializers(this, _instanceExtraInitializers);
		ref;
		oauth;
		attempt;
		/**
		* @param ctx - Host context carrying the credential service.
		* @param credentials - credential storage used for login and logout.
		* @param ref - OAuth JSON credential reference.
		* @param oauth - provider-native login handler.
		*/
		constructor(ctx, credentials, ref, oauth) {
			super(ctx, "antiGravityAuth");
			this.credentials = credentials;
			this.ref = ref;
			this.oauth = oauth;
			ctx.effect(() => () => {
				this.attempt?.controller.abort("Anti Gravity auth service disposed");
				this.attempt = void 0;
			}, "llm-pi-ai-antigravity: cancel login");
		}
		/**
		* Read credential metadata without exposing credential values.
		* @returns credential metadata safe for browser display.
		*/
		describe() {
			return this.credentials.describe(this.ref).then((info) => ({
				configured: info.configured,
				...info.source === void 0 ? {} : { source: info.source }
			}));
		}
		/**
		* Start one provider-native OAuth flow and return its browser URL.
		* @returns opaque login id and authorization URL.
		*/
		async start() {
			this.attempt?.controller.abort("A newer Anti Gravity login started");
			const attempt = {
				id: loginId(),
				controller: new AbortController(),
				status: { kind: "pending" }
			};
			this.attempt = attempt;
			const url = Promise.withResolvers();
			const notify = (event) => {
				if (event.type === "auth_url") url.resolve(event.url);
			};
			const prompt = (_prompt) => Promise.reject(/* @__PURE__ */ new Error("Anti Gravity OAuth does not support interactive text prompts"));
			this.oauth.login({
				signal: attempt.controller.signal,
				notify,
				prompt
			}).then(async (credential) => {
				if (this.attempt !== attempt || attempt.controller.signal.aborted) return;
				await this.credentials.set(this.ref, JSON.stringify(credential));
				attempt.status = { kind: "succeeded" };
			}).catch((error) => {
				if (attempt.controller.signal.aborted) {
					attempt.status = { kind: "cancelled" };
					url.reject(/* @__PURE__ */ new Error("Anti Gravity OAuth was cancelled"));
					return;
				}
				const message = failureMessage(error);
				attempt.status = {
					kind: "failed",
					message
				};
				url.reject(new Error(message));
			});
			return {
				loginId: attempt.id,
				authorizationUrl: await url.promise
			};
		}
		/**
		* Read one login attempt without exposing OAuth secrets.
		* @param id - opaque id returned by {@link start}.
		* @returns current terminal or pending status.
		*/
		poll(id) {
			if (this.attempt?.id !== id) return {
				kind: "failed",
				message: "Anti Gravity login attempt is no longer active"
			};
			return this.attempt.status;
		}
		/** Remove the stored OAuth credential and cancel any active login. */
		async logout() {
			this.attempt?.controller.abort("Anti Gravity logout");
			this.attempt = void 0;
			await this.credentials.unset(this.ref);
		}
	};
})();
//#endregion
//#region lib/types/index.js
/** Independent Google Anti Gravity provider route and OAuth settings service. */
const name = "llm-pi-ai-antigravity";
const inject = ["llm", "credentials"];
const DEFAULT_OAUTH_CREDENTIAL_REF = "GOOGLE_ANTIGRAVITY_OAUTH_CREDENTIAL";
const DEFAULT_DISPLAY_NAME = "Google Anti Gravity";
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 3e5;
const DEFAULT_MAX_REQUEST_IMAGE_BYTES = 20 * 1024 * 1024;
const DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET = 2048 * 2048;
const DEFAULT_REQUEST_IMAGE_MAX_BYTES = 1024 * 1024;
/** Schemastery validator for the independent Anti Gravity route. */
const Config = z.object({
	oauthCredentialEnv: z.string().role("credential-ref").default(DEFAULT_OAUTH_CREDENTIAL_REF),
	oauthClientConfigRef: z.string().role("credential-ref").default(DEFAULT_OAUTH_CLIENT_CONFIG_REF),
	macosApplicationPath: z.string(),
	displayName: z.string().default(DEFAULT_DISPLAY_NAME),
	streamIdleTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS).default(DEFAULT_STREAM_IDLE_TIMEOUT_MS),
	maxRequestImageBytes: z.number().step(1).min(1).default(DEFAULT_MAX_REQUEST_IMAGE_BYTES),
	requestImagePixelBudget: z.number().step(1).min(1).default(DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET),
	requestImageMaxBytes: z.number().step(1).min(1).default(DEFAULT_REQUEST_IMAGE_MAX_BYTES)
});
function resolveConfig(config) {
	const displayName = config.displayName ?? DEFAULT_DISPLAY_NAME;
	const streamIdleTimeoutMs = config.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS;
	const maxRequestImageBytes = config.maxRequestImageBytes ?? DEFAULT_MAX_REQUEST_IMAGE_BYTES;
	const requestImagePixelBudget = config.requestImagePixelBudget ?? DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET;
	const requestImageMaxBytes = config.requestImageMaxBytes ?? DEFAULT_REQUEST_IMAGE_MAX_BYTES;
	if (displayName.length === 0) throw new Error("llm-pi-ai-antigravity: displayName must not be empty");
	if (!Number.isFinite(streamIdleTimeoutMs) || streamIdleTimeoutMs <= 0 || streamIdleTimeoutMs > MAX_TIMER_DELAY_MS) throw new Error(`llm-pi-ai-antigravity: streamIdleTimeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`);
	if (!Number.isInteger(maxRequestImageBytes) || maxRequestImageBytes <= 0) throw new Error("llm-pi-ai-antigravity: maxRequestImageBytes must be a positive integer");
	if (!Number.isSafeInteger(requestImagePixelBudget) || requestImagePixelBudget <= 0) throw new Error("llm-pi-ai-antigravity: requestImagePixelBudget must be a positive safe integer");
	if (!Number.isSafeInteger(requestImageMaxBytes) || requestImageMaxBytes <= 0) throw new Error("llm-pi-ai-antigravity: requestImageMaxBytes must be a positive safe integer");
	return {
		oauthCredentialEnv: credentialRef(config.oauthCredentialEnv ?? DEFAULT_OAUTH_CREDENTIAL_REF),
		oauthClientConfigRef: config.oauthClientConfigRef ?? "GOOGLE_ANTIGRAVITY_OAUTH_CLIENT_CONFIG",
		...config.macosApplicationPath === void 0 ? {} : { macosApplicationPath: config.macosApplicationPath },
		displayName,
		streamIdleTimeoutMs,
		maxRequestImageBytes,
		requestImagePixelBudget,
		requestImageMaxBytes
	};
}
/** Auth handler that accepts only a request-level OAuth-derived override. */
const requestOverrideAuth = {
	name: "Google Anti Gravity OAuth request override",
	resolve: ({ credential }) => Promise.resolve(credential?.key === void 0 || credential.key.length === 0 ? void 0 : {
		auth: { apiKey: credential.key },
		source: "OAuth"
	})
};
function providerFor(config, models, oauth) {
	const resolvedModels = models.map((model) => ({
		...model,
		provider: PROVIDER,
		baseUrl: ENDPOINTS[0]
	}));
	return createProvider({
		id: PROVIDER,
		name: config.displayName,
		baseUrl: ENDPOINTS[0],
		auth: {
			apiKey: requestOverrideAuth,
			oauth
		},
		models: resolvedModels,
		api: antiGravityApi
	});
}
function profileFor(config, models, oauth) {
	return new Map([[PROVIDER, {
		provider: PROVIDER,
		displayName: config.displayName,
		streamIdleTimeoutMs: config.streamIdleTimeoutMs,
		maxRequestImageBytes: config.maxRequestImageBytes,
		requestImagePixelBudget: config.requestImagePixelBudget,
		requestImageMaxBytes: config.requestImageMaxBytes,
		retryPolicy: resolveRetryPolicy(void 0, "llm-pi-ai-antigravity: retryPolicy"),
		configuredMaxTokens: /* @__PURE__ */ new Map(),
		piProvider: providerFor(config, models, oauth)
	}]]);
}
/**
* Register Anti Gravity inference, OAuth Remote methods, and the maintained/live catalog.
* @param ctx - Cordis context providing LLM, credential, and optional attachment services.
* @param rawConfig - validated plugin configuration.
*/
function apply(ctx, rawConfig) {
	const config = resolveConfig(rawConfig);
	const oauth = createAntiGravityOAuth(() => resolveOAuthClientConfig(ctx.credentials, config.oauthClientConfigRef, config.macosApplicationPath));
	const credentials = new AntiGravityCredentialManager(ctx.credentials, config.oauthCredentialEnv, oauth);
	new AntiGravityAuthRemote(ctx, ctx.credentials, config.oauthCredentialEnv, oauth);
	let profiles = profileFor(config, maintainedModels, oauth);
	const adapter = new PiAiAdapter({
		profiles: () => profiles,
		resolveApiKey: () => credentials.resolveApiKey(),
		auth: {
			credentials: new InMemoryCredentialStore(),
			authContext: defaultProviderAuthContext()
		},
		resolveAttachments: () => ctx.get("attachments")
	});
	const registration = ctx.llm.registerAdapter([PROVIDER], adapter);
	const controller = new AbortController();
	let refreshing;
	const refresh = () => {
		refreshing ??= (async () => {
			try {
				profiles = profileFor(config, await fetchAvailableModelsForCredential(await credentials.resolveCredential(), controller.signal), oauth);
				registration.replace([PROVIDER]);
			} catch (error) {
				if (!controller.signal.aborted) {
					ctx.logger.info("llm-pi-ai-antigravity: live model refresh unavailable; keeping the maintained catalog");
					ctx.logger.debug(error);
				}
			} finally {
				refreshing = void 0;
			}
		})();
	};
	ctx.effect(() => {
		const timers = [setTimeout(refresh, 0), setTimeout(refresh, 250)];
		return () => {
			for (const timer of timers) clearTimeout(timer);
			controller.abort();
		};
	}, "llm-pi-ai-antigravity: live refresh");
	ctx.on("credentials/reference-updated", (ref) => {
		if (ref === config.oauthCredentialEnv) refresh();
	});
}
//#endregion
export { AntiGravityAuthRemote, AntiGravityCredentialManager, Config, DEFAULT_OAUTH_CLIENT_CONFIG_REF, PROVIDER, apply, createAntiGravityOAuth, extractOAuthClientConfig, fetchAvailableModels, fetchAvailableModelsForCredential, importInstalledOAuthClientConfig, inject, maintainedModels, name, parseAntiGravityCredential, parseAvailableModels, parseOAuthClientConfig, resolveOAuthClientConfig };

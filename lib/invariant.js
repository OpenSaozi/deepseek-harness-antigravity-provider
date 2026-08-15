//#region lib/types/invariant.js
const name = "llm-pi-ai-antigravity-invariant";
const inject = ["invariants"];
const install = () => {};
const apply = (ctx) => Promise.resolve(ctx.invariants.register("@deepseek-ai/dsh-llm-pi-ai-antigravity", install));
//#endregion
export { apply, inject, name };

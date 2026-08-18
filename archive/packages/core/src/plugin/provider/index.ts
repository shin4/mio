// mimo-desktop uses a single LLM provider (Xiaomi MiMo) via the
// @opencode-ai/llm native runtime. The AI SDK provider plugins are
// entirely removed; this file exists only because callers `import`
// from `@opencode-ai/core/plugin/provider` and we want to preserve
// the import shape until those callers are pruned in Round 2.

export const ProviderPlugins: never[] = []

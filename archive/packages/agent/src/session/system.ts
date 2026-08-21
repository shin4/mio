import { Context, Effect, Layer } from "effect"
import { InstanceState } from "@/effect/instance-state"
import PROMPT_MIMO from "./prompt/mimo.txt"
import type { Provider } from "@/provider/provider"
import type { Agent } from "@/agent/agent"
import { Permission } from "@/permission"
import { Skill } from "@/skill"

// MiMo always uses a single, stable system prompt (PROMPT_MIMO). The dynamic
// environment block (working directory, worktree, git) is appended separately by
// environment() below as a system block — see session/prompt.ts where
// `system = [...env, ...instructions, ...]`. That block is the ONLY channel that
// tells the model its working directory.
export function provider(_model: Provider.Model): string[] {
  return [PROMPT_MIMO]
}

export interface Interface {
  readonly environment: (model: Provider.Model) => Effect.Effect<string[]>
  readonly skills: (agent: Agent.Info) => Effect.Effect<string | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SystemPrompt") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const skill = yield* Skill.Service

    return Service.of({
      // Returns the environment context as a system block. The working directory
      // here is the model's only source of truth for its cwd, so ctx.directory
      // must be the real session directory — workspace-routing.ts recovers it
      // from the session row (rather than falling back to the server's cwd).
      environment: Effect.fn("SystemPrompt.environment")(function* (model: Provider.Model) {
        const ctx = yield* InstanceState.context
        return [
          [
            `Working directory: ${ctx.directory}`,
            `Workspace root: ${ctx.worktree}`,
            `Git repo: ${ctx.project.vcs === "git" ? "yes" : "no"}`,
          ].join("\n"),
        ]
      }),

      skills: Effect.fn("SystemPrompt.skills")(function* (agent: Agent.Info) {
        if (Permission.disabled(["skill"], agent.permission).has("skill")) return

        const list = yield* skill.available(agent)

        return [
          "Skills provide specialized instructions and workflows for specific tasks.",
          "Use the skill tool to load a skill when a task matches its description.",
          Skill.fmt(list, { verbose: true }),
        ].join("\n")
      }),
    })
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(Skill.defaultLayer))

export * as SystemPrompt from "./system"

import { Component } from "solid-js"
import { MimoSettings } from "./settings-mimo"

// mimo-desktop is single-provider. Every "connect a provider" / "select a
// provider" entry point in the app funnels through DialogSelectProvider, so we
// route them straight to the MiMo settings panel instead of presenting a
// multi-provider catalog (which would expose anthropic/openai/google/custom
// entries that this build does not support).
export const DialogSelectProvider: Component = () => {
  return <MimoSettings />
}

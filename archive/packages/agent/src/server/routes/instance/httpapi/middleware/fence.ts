import { Layer } from "effect"

// `fenceLayer` previously enforced workspace-fenced reads in multi-tenant
// control-plane mode. mimo-desktop is single-machine, so this is a no-op layer.
export const fenceLayer = Layer.empty

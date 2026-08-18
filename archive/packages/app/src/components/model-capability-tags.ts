export type ModelCapabilityTag = "text" | "audio" | "video"

type ModelInputCapabilities = Partial<Record<ModelCapabilityTag | "image" | "pdf", boolean>>

const capabilityOrder: ModelCapabilityTag[] = ["text", "audio", "video"]

export function modelCapabilityTags(input: ModelInputCapabilities | undefined) {
  return capabilityOrder.filter((capability) => !!input?.[capability])
}

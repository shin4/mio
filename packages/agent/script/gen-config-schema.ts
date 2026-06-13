#!/usr/bin/env bun
/**
 * Export the agent's Config.Info Effect Schema as JSON Schema.
 *
 * Usage (from either the agent package or the repo root via bun):
 *   bun packages/agent/script/gen-config-schema.ts <output-path>
 *
 * The output path is required — pass the absolute or relative path where
 * schema/config.json should be written.
 */

import { JsonSchema, Schema } from "effect"
import { Info } from "@/config/config"

type JsonSchemaRecord = Record<string, unknown>

const MODEL_REF = "https://models.dev/model-schema.json#/$defs/Model"

function isRecord(value: unknown): value is JsonSchemaRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// Remove null branches from anyOf/allOf to produce cleaner schemas for editors.
function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize)
  if (!isRecord(value)) return value

  const schema = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]))

  if (Array.isArray(schema.anyOf)) {
    const anyOf = schema.anyOf.filter((item) => !isRecord(item) || item.type !== "null")
    if (anyOf.length !== schema.anyOf.length) {
      const { anyOf: _, ...rest } = schema
      if (anyOf.length === 1 && isRecord(anyOf[0])) return normalize({ ...anyOf[0], ...rest })
      return { ...rest, anyOf }
    }
  }

  if (Array.isArray(schema.allOf) && schema.allOf.length === 1 && isRecord(schema.allOf[0])) {
    const { allOf: _, ...rest } = schema
    return normalize({ ...schema.allOf[0], ...rest })
  }

  if (schema.type === "integer" && schema.maximum === undefined) {
    return { ...schema, maximum: Number.MAX_SAFE_INTEGER }
  }

  return schema
}

// Annotate model/small_model string fields with a reference to the models.dev
// catalog so editors with JSON Schema support can offer model-id completions.
function restoreModelRefs(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) return value.map((item) => restoreModelRefs(item))
  if (!isRecord(value)) return value

  const schema = Object.fromEntries(Object.entries(value).map(([name, item]) => [name, restoreModelRefs(item, name)]))
  if ((key === "model" || key === "small_model") && schema.type === "string") {
    return { ...schema, $ref: MODEL_REF }
  }
  return schema
}

const outFile = process.argv[2]
if (!outFile) throw new Error("Usage: bun gen-config-schema.ts <output-path>")

const doc = Schema.toJsonSchemaDocument(Info)
const resolved = JsonSchema.resolveTopLevel$ref(doc)

const raw: JsonSchemaRecord = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  ...resolved.schema,
  $defs: resolved.definitions,
}

const normalized = normalize(raw)
if (!isRecord(normalized)) throw new Error("schema generator produced a non-object root schema")

const result = restoreModelRefs(normalized)
if (!isRecord(result)) throw new Error("schema generator produced a non-object root schema after restoreModelRefs")

result.allowComments = true
result.allowTrailingCommas = true

await Bun.write(outFile, JSON.stringify(result, null, 2) + "\n")

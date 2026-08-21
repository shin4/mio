import { Component, For, Match, Show, Switch } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import type { MediaAttachmentPart } from "@/context/prompt"
import { attachmentTooltipRows } from "./image-attachment-tooltip"

type PromptMediaAttachmentsProps = {
  attachments: MediaAttachmentPart[]
  onOpen: (attachment: MediaAttachmentPart) => void
  onRemove: (id: string) => void
  removeLabel: string
}

const tileClass = "size-16 rounded-md border border-border-base relative overflow-hidden"
const fallbackClass = `${tileClass} bg-surface-base flex flex-col items-center justify-center gap-1`
const imageClass =
  "size-16 rounded-md object-cover border border-border-base hover:border-border-strong-base transition-colors"
const removeClass =
  "absolute -top-1.5 -right-1.5 size-5 rounded-full bg-surface-raised-stronger-non-alpha border border-border-base flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-surface-raised-base-hover z-10"
const nameClass = "absolute bottom-0 left-0 right-0 px-1 py-0.5 bg-black/50 rounded-b-md"

// Icons known to exist in the shared set (reused from the attachment buttons).
const iconFor = (type: MediaAttachmentPart["type"]) =>
  type === "audio" ? "speaker" : type === "video" ? "open-file" : type === "pdf" ? "file-tree" : "folder"

const attachmentTooltip = (attachment: MediaAttachmentPart) => (
  <div class="max-w-72 space-y-1 text-left">
    <For each={attachmentTooltipRows(attachment)}>
      {(row) => (
        <div class="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
          <span class="text-text-weaker">{row.label}</span>
          <span class="min-w-0 break-all text-text">{row.value}</span>
        </div>
      )}
    </For>
  </div>
)

export const PromptImageAttachments: Component<PromptMediaAttachmentsProps> = (props) => {
  return (
    <Show when={props.attachments.length > 0}>
      <div class="flex flex-wrap gap-2 px-3 pt-3">
        <For each={props.attachments}>
          {(attachment) => (
            <Tooltip value={attachmentTooltip(attachment)} placement="top" contentClass="break-all">
              <div class="relative group">
                <Switch
                  fallback={
                    <div class={fallbackClass}>
                      <Icon name={iconFor(attachment.type)} class="size-6 text-text-weak" />
                      <Show when={attachment.type === "pdf" && (attachment as { pageCount?: number }).pageCount}>
                        <span class="text-10-regular text-text-weaker">
                          {(attachment as { pageCount?: number }).pageCount}p
                        </span>
                      </Show>
                    </div>
                  }
                >
                  <Match when={attachment.mime.startsWith("image/")}>
                    <img
                      src={attachment.dataUrl}
                      alt={attachment.filename}
                      class={imageClass}
                      onClick={() => props.onOpen(attachment)}
                    />
                  </Match>
                  <Match when={attachment.type === "video"}>
                    <video
                      src={attachment.dataUrl}
                      class={imageClass}
                      muted
                      preload="metadata"
                      onClick={() => props.onOpen(attachment)}
                    />
                  </Match>
                </Switch>
                <button
                  type="button"
                  onClick={() => props.onRemove(attachment.id)}
                  class={removeClass}
                  aria-label={props.removeLabel}
                >
                  <Icon name="close" class="size-3 text-text-weak" />
                </button>
                <div class={nameClass}>
                  <span class="text-10-regular text-white truncate block">{attachment.filename}</span>
                </div>
              </div>
            </Tooltip>
          )}
        </For>
      </div>
    </Show>
  )
}

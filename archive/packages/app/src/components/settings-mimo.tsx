/**
 * MiMo settings dialog — thin chrome around the shared MimoConnectForm.
 *
 * The form body, connection state, and persistence live in mimo-connect-form.tsx
 * so the same UI can be reused by the first-launch onboarding screen.
 */
import { Dialog } from "@opencode-ai/ui/dialog"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Component } from "solid-js"
import { useLanguage } from "@/context/language"
import { MimoConnectForm } from "./mimo-connect-form"

// Re-exported for existing import sites.
export type { MimoProtocol, MimoModel, MimoBilling, MimoRegion } from "./mimo-connect-form"

export const MimoSettings: Component = () => {
  const dialog = useDialog()
  const t = useLanguage().t
  return (
    <Dialog
      title={
        <IconButton
          tabIndex={-1}
          icon="arrow-left"
          variant="ghost"
          onClick={() => dialog.close()}
          aria-label={t("common.goBack")}
        />
      }
      transition
    >
      <MimoConnectForm variant="dialog" onDone={() => dialog.close()} />
    </Dialog>
  )
}

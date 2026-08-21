/**
 * First-launch onboarding — full-screen, two-step (welcome → configure).
 *
 * Rendered by OnboardingGate when MiMo has no API key. Completion is detected
 * reactively: a successful save in MimoConnectForm triggers a provider refresh,
 * the gate sees "mimo" in connected providers, and swaps this screen out for the
 * routed app. No explicit completion callback is needed.
 */
import { Button } from "@opencode-ai/ui/button"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Splash } from "@opencode-ai/ui/logo"
import { createSignal, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { MimoConnectForm, MIO_PLATFORM_URL } from "../mimo-connect-form"

export function OnboardingScreen() {
  const t = useLanguage().t
  const platform = usePlatform()
  const [step, setStep] = createSignal<"welcome" | "configure">("welcome")

  return (
    <div class="h-dvh w-screen overflow-y-auto bg-background-base">
      <div class="min-h-full flex flex-col items-center justify-center p-6">
        <Show
          when={step() === "configure"}
          fallback={
            <div class="flex flex-col items-center text-center max-w-md gap-6">
              <Splash class="w-16 h-20" />
              <div class="flex flex-col gap-2">
                <h1 class="text-[22px] font-[700] text-text-strong">{t("onboarding.welcome.title")}</h1>
                <p class="text-14-regular text-text-weak">{t("onboarding.welcome.subtitle")}</p>
              </div>
              <p class="text-14-regular text-text-weak">{t("onboarding.welcome.body")}</p>
              <div class="flex flex-col gap-2 w-full max-w-xs">
                <Button variant="primary" size="large" onClick={() => platform.openLink(MIO_PLATFORM_URL)}>
                  {t("onboarding.welcome.getKey")}
                </Button>
                <Button variant="ghost" size="large" onClick={() => setStep("configure")}>
                  {t("onboarding.welcome.continue")}
                </Button>
              </div>
            </div>
          }
        >
          <div class="flex flex-col w-full max-w-md gap-5">
            <div class="flex items-center gap-2">
              <IconButton
                icon="arrow-left"
                variant="ghost"
                onClick={() => setStep("welcome")}
                aria-label={t("onboarding.back")}
              />
              <div class="flex flex-col">
                <h2 class="text-16-medium text-text-strong">{t("onboarding.configure.title")}</h2>
                <p class="text-12-regular text-text-weak">{t("onboarding.configure.subtitle")}</p>
              </div>
            </div>
            <MimoConnectForm variant="onboarding" />
          </div>
        </Show>
      </div>
    </div>
  )
}

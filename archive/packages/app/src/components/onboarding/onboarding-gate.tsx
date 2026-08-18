/**
 * Onboarding gate — blocks the routed app until MiMo has an API key.
 *
 * - While the global providers query is still loading, render a Splash so we
 *   never flash onboarding (configured users) or the app shell (new users).
 * - Once loaded: if MiMo has no API key, render the full-screen onboarding;
 *   otherwise render the routed app. Reactive on the key, so removing it later
 *   re-shows onboarding and saving one dismisses it automatically.
 *
 * Reads connection state straight off the global store (`sync.data`), which is
 * a live reference. `providersLoaded` is a function, not a getter: the context
 * return object is spread (`{ ...sync }`), which would snapshot a getter to its
 * mount value — a function stays live.
 */
import { Splash } from "@opencode-ai/ui/logo"
import { ParentProps, Show } from "solid-js"
import { useServerSync } from "@/context/server-sync"
import { OnboardingScreen } from "./onboarding-screen"

function SplashScreen() {
  return (
    <div class="h-dvh w-screen flex flex-col items-center justify-center bg-background-base">
      <Splash class="w-16 h-20 opacity-50 animate-pulse" />
    </div>
  )
}

export function OnboardingGate(props: ParentProps) {
  const sync = useServerSync()
  // `connected` lists MiMo even without a key (it's the built-in provider), so
  // gate on the actual API key — matching settings-mimo's isConnected check.
  const mimoConnected = () => Boolean(sync.data.provider.all.get("mimo")?.key)
  return (
    <Show when={sync.providersLoaded()} fallback={<SplashScreen />}>
      <Show when={mimoConnected()} fallback={<OnboardingScreen />}>
        {props.children}
      </Show>
    </Show>
  )
}

// Android (Capacitor) glue. In a plain browser or Electron this does nothing.
// Saves already work through localStorage, so the shell only adds the system Back button.
import { Capacitor } from "@capacitor/core";

export const isNative = Capacitor.isNativePlatform();

export interface NativeHooks {
  /** system Back button: return true when it was handled in-game */
  onBack(): boolean;
  /** the app went to the background or came back */
  onVisibility(visible: boolean): void;
}

export async function installNative(hooks: NativeHooks): Promise<void> {
  if (!isNative) return;
  const { App } = await import("@capacitor/app");
  window.apex = {
    version: async () => (await App.getInfo()).version,
  };
  await App.addListener("backButton", () => { if (!hooks.onBack()) void App.minimizeApp(); });
  await App.addListener("appStateChange", (s) => hooks.onVisibility(s.isActive));
}

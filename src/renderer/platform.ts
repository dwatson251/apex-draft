// Android (Capacitor) glue. In a plain browser or Electron this does nothing.
// Saves already work through localStorage, so the shell only adds sharing and the system Back button.
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
  const [{ App }, { Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
    import("@capacitor/app"), import("@capacitor/filesystem"), import("@capacitor/share"),
  ]);
  window.apex = {
    version: async () => (await App.getInfo()).version,
    exportLine: async (name, text) => {
      try {
        const path = `${name.replace(/[^\w.-]+/g, "_")}.apexline.json`;
        const { uri } = await Filesystem.writeFile({ path, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
        await Share.share({ title: name, url: uri, dialogTitle: "Share racing line" });
        return true;
      } catch { return false; }
    },
  };
  await App.addListener("backButton", () => { if (!hooks.onBack()) void App.minimizeApp(); });
  await App.addListener("appStateChange", (s) => hooks.onVisibility(s.isActive));
}

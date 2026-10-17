import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("apex", {
  get: (key: string): Promise<unknown> => ipcRenderer.invoke("store:get", key),
  set: (key: string, value: unknown): Promise<boolean> => ipcRenderer.invoke("store:set", key, value),
  version: (): Promise<string> => ipcRenderer.invoke("app:version"),
  quit: (): Promise<void> => ipcRenderer.invoke("app:quit"),
});

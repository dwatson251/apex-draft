import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("apex", {
  get: (key: string): Promise<unknown> => ipcRenderer.invoke("store:get", key),
  set: (key: string, value: unknown): Promise<boolean> => ipcRenderer.invoke("store:set", key, value),
  exportLine: (suggested: string, text: string): Promise<boolean> => ipcRenderer.invoke("lines:export", suggested, text),
  importLines: (): Promise<string[]> => ipcRenderer.invoke("lines:import"),
  version: (): Promise<string> => ipcRenderer.invoke("app:version"),
});

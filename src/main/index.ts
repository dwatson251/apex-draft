import { app, BrowserWindow, dialog, ipcMain, session, shell, type IpcMainInvokeEvent } from "electron";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DEV_URL = process.env["ELECTRON_RENDERER_URL"];
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  `connect-src 'self'${DEV_URL ? " ws://localhost:*" : ""}`,
  "object-src 'none'",
  "base-uri 'none'",
].join("; ");

let win: BrowserWindow | null = null;

const dataDir = () => {
  const d = process.env["APEX_DRAFT_DATA"] ?? app.getPath("userData");
  mkdirSync(d, { recursive: true });
  return d;
};

/** Only keys we know about may reach the disk, and only as plain file names. */
const KEYS = new Set(["settings", "cars", "best"]);
const fileFor = (key: string) => join(dataDir(), `${key}.json`);

function trusted(e: IpcMainInvokeEvent): boolean {
  const url = e.senderFrame?.url ?? "";
  return DEV_URL ? url.startsWith(DEV_URL) : url.startsWith("file://");
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 900, minHeight: 600, backgroundColor: "#12151c", title: "Apex Draft",
    autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, "../preload/index.js"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => { if (!(DEV_URL && url.startsWith(DEV_URL)) && !url.startsWith("file://")) e.preventDefault(); });
  if (DEV_URL) void win.loadURL(DEV_URL);
  else void win.loadFile(join(__dirname, "../renderer/index.html"));
  win.on("closed", () => { win = null; });
}

ipcMain.handle("store:get", (e, key: string) => {
  if (!trusted(e) || !KEYS.has(key)) return null;
  const f = fileFor(key);
  if (!existsSync(f)) return null;
  try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; }
});

ipcMain.handle("store:set", (e, key: string, value: unknown) => {
  if (!trusted(e) || !KEYS.has(key)) return false;
  const f = fileFor(key);
  writeFileSync(`${f}.tmp`, JSON.stringify(value));
  renameSync(`${f}.tmp`, f);
  return true;
});

ipcMain.handle("lines:export", async (e, suggested: string, text: string) => {
  if (!trusted(e) || !win || typeof text !== "string" || text.length > 5_000_000) return false;
  const safe = String(suggested).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "line";
  const r = await dialog.showSaveDialog(win, { defaultPath: `${safe}.apexline.json`, filters: [{ name: "Apex Draft line", extensions: ["json"] }] });
  if (r.canceled || !r.filePath) return false;
  writeFileSync(r.filePath, text);
  return true;
});

ipcMain.handle("lines:import", async (e) => {
  if (!trusted(e) || !win) return [];
  const r = await dialog.showOpenDialog(win, { properties: ["openFile", "multiSelections"], filters: [{ name: "Apex Draft line", extensions: ["json"] }] });
  if (r.canceled) return [];
  return r.filePaths.slice(0, 7).map((p) => readFileSync(p, "utf8")).filter((t) => t.length < 5_000_000);
});

ipcMain.handle("app:version", () => app.getVersion());
ipcMain.handle("app:quit", (e) => { if (trusted(e)) app.quit(); });

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  void app.whenReady().then(() => {
    session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
      cb({ responseHeaders: { ...details.responseHeaders, "Content-Security-Policy": [CSP] } });
    });
    createWindow();
  });
  app.on("window-all-closed", () => app.quit());
}

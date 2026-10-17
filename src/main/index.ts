import { app, BrowserWindow, ipcMain, session, shell, type IpcMainInvokeEvent } from "electron";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DEV_URL = process.env["ELECTRON_RENDERER_URL"];
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  `connect-src 'self' https://apexdraft.dnlwtsn.co.uk${DEV_URL ? " ws://localhost:*" : ""}`,
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
const KEYS = new Set(["settings", "cars", "best", "records", "identity"]);
const fileFor = (key: string) => join(dataDir(), `${key}.json`);

function trusted(e: IpcMainInvokeEvent): boolean {
  const url = e.senderFrame?.url ?? "";
  return DEV_URL ? url.startsWith(DEV_URL) : url.startsWith("file://");
}

/** Steam Deck: Game mode sets these, and `--fullscreen` does the same by hand. The Deck's screen is 1280x800, the window's default size. */
const onDeck = process.env["SteamDeck"] === "1" || process.env["SteamGamepadUI"] === "1" || process.argv.includes("--fullscreen");

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280, height: 800, fullscreen: onDeck, minWidth: 900, minHeight: 600, backgroundColor: "#12151c", title: "Apex Draft",
    autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, "../preload/index.js"), contextIsolation: true, nodeIntegration: false, sandbox: true, autoplayPolicy: "no-user-gesture-required" },
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

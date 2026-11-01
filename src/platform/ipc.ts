import { mobileIpcRenderer, mobileTrackBlob } from "./mobile-ipc";

const windowAny = window as any;
const electronRequire = windowAny.require;
export const isMobileApp = !(
  windowAny.process &&
  windowAny.process.versions &&
  windowAny.process.versions.electron &&
  electronRequire
);

export const ipcRenderer = isMobileApp
  ? mobileIpcRenderer
  : electronRequire("electron").ipcRenderer;

export async function readTrackBlob(fileLocation: string): Promise<Blob | null> {
  if (isMobileApp) return mobileTrackBlob(fileLocation);
  const raw = await electronRequire("fs").promises.readFile(fileLocation);
  return new Blob([new Uint8Array(raw)]);
}


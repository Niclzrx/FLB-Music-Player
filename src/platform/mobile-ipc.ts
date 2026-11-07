import { TrackType } from "@/types";
import { registerPlugin } from "@capacitor/core";

type Listener = (event: any, payload?: any) => void;
type StoredTrack = TrackType & { mobileBlobId: string; mobileSourceKey?: string };
type MobileFolder = { uri: string; name: string };
type NativeAudioFile = { uri: string; name: string; type?: string; size?: number; lastModified?: number };

const FolderAccess = registerPlugin<{
  pickFolder(): Promise<{ uri: string; name: string; files: NativeAudioFile[] }>;
  listFolder(options: { uri: string }): Promise<{ uri: string; name: string; files: NativeAudioFile[] }>;
  beginReadFile(options: { uri: string }): Promise<{ sessionId: string; mimeType: string }>;
  readFileChunk(options: { sessionId: string }): Promise<{ base64: string; done: boolean }>;
  closeReadFile(options: { sessionId: string }): Promise<void>;
}>("FolderAccess");
const PartyHost = registerPlugin<{
  startParty(options: { name: string; entryMode: string; tracks: TrackType[] }): Promise<{ code: string; lanUrl: string; qrDataUrl: string }>;
  updateLibrary(options: { tracks: Array<Partial<TrackType>> }): Promise<void>;
  updateQueue(options: { snapshot: any }): Promise<void>;
  stopParty(): Promise<void>;
  setEntryMode(options: { mode: string }): Promise<void>;
  resolvePending(options: { pendingId: string; accept: boolean }): Promise<void>;
  kickGuest(options: { guestId: string }): Promise<void>;
  blockGuest(options: { guestId: string }): Promise<void>;
  unblockGuest(options: { deviceToken: string }): Promise<void>;
  addListener(eventName: string, listener: (payload: any) => void): Promise<{ remove: () => void }>;
}>("PartyHost");
const MediaNotification = registerPlugin<{
  update(options: {
    title: string;
    artist?: string;
    playing: boolean;
    position?: number;
    duration?: number;
    artwork?: string;
  }): Promise<void>;
  clear(): Promise<void>;
  addListener(eventName: string, listener: (payload: any) => void): Promise<{ remove: () => void }>;
}>("MediaNotification");

const DB_NAME = "flb-music-mobile";
const DB_VERSION = 2;
const MEDIA_PREFIX = "flb-media://";
const ACCEPTED_AUDIO = /\.(mp3|flac|wav|m4a|aac|ogg|opus|wma|aiff|ape)$/i;
const COVER_MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ARTWORK_CACHE_LIMIT = 40;
const handlers = new Map<string, Set<Listener>>();
const mediaUrls: Record<string, string> = {};
const coverLookupMemory = new Map<string, { cover: string; updatedAt: number; miss: boolean }>();
const coverLookupRequests = new Map<string, Promise<string>>();
const artworkMemory = new Map<string, string>();
let artworkCacheKeys: string[] | null = null;
let mediaNotificationSequence = 0;
let dbPromise: Promise<IDBDatabase> | null = null;
let partyEventsAttached = false;
let mobileMediaActionHandler: ((action: string) => void) | null = null;
let mobileMediaListener: Promise<{ remove: () => void } | undefined> | null = null;

(window as any).__FLB_MEDIA_URLS__ = mediaUrls;

/**
 * Keeps the native Android media notification in sync with the player. It is
 * intentionally silent when the web build is opened outside Capacitor.
 *
 * The artwork is loaded and compressed only once per cover. The notification
 * is updated immediately without it and again as soon as the small data URL
 * is ready, so a slow network never delays the playback controls.
 */
export function updateMobileMediaNotification(
  track: TrackType | null,
  playing: boolean
): void {
  const requestSequence = ++mediaNotificationSequence;
  if (!track || !track.defaultTitle) {
    MediaNotification.clear().catch(() => undefined);
    return;
  }
  const audio = document.querySelector("audio");
  const position = audio && Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
  const duration =
    audio && Number.isFinite(audio.duration) && audio.duration > 0
      ? audio.duration
      : Number(track.duration) || 0;

  const update = (artwork: string) => {
    if (requestSequence !== mediaNotificationSequence) return;
    MediaNotification.update({
      title: track.defaultTitle,
      artist: track.defaultArtist || "",
      playing,
      position,
      duration,
      artwork,
    }).catch(() => undefined);
  };

  const source = track.albumArt || "";
  const artworkKey = source ? artworkCacheKey(source) : "";
  const cachedArtwork = artworkKey ? artworkMemory.get(artworkKey) : "";
  update(cachedArtwork || "");
  if (!source || cachedArtwork) return;
  void resolveNotificationArtwork(source).then((artwork) => {
    if (artwork) update(artwork);
  });
}

/**
 * The notification buttons live outside the Vue tree, so the player registers
 * one handler here and receives previous/next/play/pause actions from Android.
 */
export function setMobileMediaActionHandler(
  handler: ((action: string) => void) | null
): () => void {
  mobileMediaActionHandler = handler;
  if (handler && !mobileMediaListener) {
    try {
      mobileMediaListener = MediaNotification.addListener("mediaAction", (payload) => {
        const action = payload && payload.action ? String(payload.action) : "";
        if (action && mobileMediaActionHandler) mobileMediaActionHandler(action);
      }).catch((error) => {
        console.warn("Could not attach the media notification listener", error);
        return undefined;
      });
    } catch (error) {
      console.warn("Could not attach the media notification listener", error);
    }
  }
  return () => {
    if (mobileMediaActionHandler === handler) mobileMediaActionHandler = null;
  };
}

function database(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("tracks")) {
        db.createObjectStore("tracks", { keyPath: "fileLocation" });
      }
      if (!db.objectStoreNames.contains("audio")) {
        db.createObjectStore("audio", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("records")) {
        db.createObjectStore("records", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("covers")) {
        db.createObjectStore("covers", { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function readRecord<T>(key: string, fallback: T): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction("records").objectStore("records").get(key);
    request.onsuccess = () => resolve(request.result ? request.result.value : fallback);
    request.onerror = () => reject(request.error);
  });
}

async function writeRecord(key: string, value: any): Promise<void> {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("records", "readwrite");
    tx.objectStore("records").put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function allTracks(): Promise<StoredTrack[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction("tracks").objectStore("tracks").getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function emit(channel: string, payload?: any) {
  const listeners = handlers.get(channel);
  if (!listeners) return;
  listeners.forEach((listener) => {
    // One broken listener must never stop the library from being restored.
    try { listener({}, payload); }
    catch (error) { console.error(`Could not handle mobile event "${channel}"`, error); }
  });
}

function id() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function fileNameParts(name: string) {
  const base = name.replace(/\.[^.]+$/, "");
  const parts = base.split(/\s+-\s+|\s+–\s+/);
  if (parts.length > 1) return { artist: parts[0].trim(), title: parts.slice(1).join(" - ").trim() };
  return { artist: "Unknown artist", title: base.trim() || name };
}

function decodeTag(bytes: Uint8Array): string {
  if (!bytes.length) return "";
  const encoding = bytes[0];
  const content = bytes.subarray(1);
  try {
    if (encoding === 1) return new TextDecoder("utf-16").decode(content).replace(/\0/g, "").trim();
    if (encoding === 2) return new TextDecoder("utf-16be").decode(content).replace(/\0/g, "").trim();
    return new TextDecoder("utf-8").decode(content).replace(/\0/g, "").trim();
  } catch (_) {
    return "";
  }
}

function dataUrl(mime: string, bytes: Uint8Array): string {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + step)));
  }
  return `data:${mime || "image/jpeg"};base64,${btoa(binary)}`;
}

function readMp3Tags(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const tags: { title?: string; artist?: string; album?: string; albumArt?: string } = {};
  if (bytes.length < 10 || String.fromCharCode(...bytes.subarray(0, 3)) !== "ID3") return tags;
  const version = bytes[3];
  const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
  let offset = 10;
  const end = Math.min(bytes.length, 10 + size);
  while (offset + 10 <= end) {
    const frameId = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    if (!/^[A-Z0-9]{4}$/.test(frameId)) break;
    const frameSize = version === 4
      ? ((bytes[offset + 4] & 0x7f) << 21) | ((bytes[offset + 5] & 0x7f) << 14) | ((bytes[offset + 6] & 0x7f) << 7) | (bytes[offset + 7] & 0x7f)
      : new DataView(buffer).getUint32(offset + 4);
    if (!frameSize || offset + 10 + frameSize > end) break;
    const frame = bytes.subarray(offset + 10, offset + 10 + frameSize);
    if (frameId === "TIT2") tags.title = decodeTag(frame);
    if (frameId === "TPE1") tags.artist = decodeTag(frame);
    if (frameId === "TALB") tags.album = decodeTag(frame);
    if (frameId === "APIC" && frame.length > 6) {
      let cursor = 1;
      let mimeEnd = cursor;
      while (mimeEnd < frame.length && frame[mimeEnd] !== 0) mimeEnd++;
      const mime = String.fromCharCode(...frame.subarray(cursor, mimeEnd));
      cursor = mimeEnd + 2; // MIME terminator and image type
      const utf16 = frame[0] === 1 || frame[0] === 2;
      while (cursor < frame.length - 1) {
        if (frame[cursor] === 0 && (!utf16 || frame[cursor + 1] === 0)) {
          cursor += utf16 ? 2 : 1;
          break;
        }
        cursor += utf16 ? 2 : 1;
      }
      tags.albumArt = dataUrl(mime, frame.subarray(cursor));
    }
    offset += 10 + frameSize;
  }
  return tags;
}

function durationOf(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    const url = URL.createObjectURL(blob);
    let settled = false;
    let timeout: ReturnType<typeof setTimeout>;
    const finish = (duration: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      audio.onloadedmetadata = null;
      audio.onerror = null;
      try { audio.pause(); audio.removeAttribute("src"); audio.load(); } catch (_) { /* Ignore WebView cleanup errors. */ }
      URL.revokeObjectURL(url);
      resolve(duration);
    };
    timeout = setTimeout(() => finish(0), 5000);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      finish(duration);
    };
    audio.onerror = () => finish(0);
    audio.src = url;
  });
}

function formatDuration(seconds: number): string {
  if (!seconds) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

async function importFiles(
  files: File[],
  folder?: MobileFolder,
  notify = true,
  knownSourceKeys?: Set<string>,
  reportProgress = true
) {
  const db = await database();
  const valid = files.filter((file) => ACCEPTED_AUDIO.test(file.name));
  const existingTracks = knownSourceKeys ? [] : await allTracks();
  const imported: StoredTrack[] = [];
  for (const [index, file] of valid.entries()) {
    const sourceKey = (file as any).__mobileSourceKey || `${file.name}:${file.size}:${file.lastModified}`;
    if (knownSourceKeys ? knownSourceKeys.has(sourceKey) : existingTracks.some((track) => track.mobileSourceKey === sourceKey)) continue;
    const blobId = id();
    const fileLocation = `${MEDIA_PREFIX}${blobId}`;
    const parts = fileNameParts(file.name);
    let tags: ReturnType<typeof readMp3Tags> = {};
    if (/\.mp3$/i.test(file.name)) {
      try { tags = readMp3Tags(await file.slice(0, 1024 * 1024).arrayBuffer()); } catch (_) { /* Use the filename when tags are damaged. */ }
    }
    const title = tags.title || parts.title;
    const artist = tags.artist || parts.artist;
    const duration = await durationOf(file);
    const track: StoredTrack = {
      fileLocation,
      r_fileLocation: fileLocation,
      mobileBlobId: blobId,
      mobileSourceKey: sourceKey,
      albumArt: tags.albumArt || "",
      album: tags.album || "Unknown album",
      title,
      artist,
      extractedTitle: title,
      extractedArtist: artist,
      defaultTitle: title,
      defaultArtist: artist,
      fileName: file.name,
      formattedLength: formatDuration(duration),
      duration,
      dateAdded: Date.now(),
      folderInfo: folder
        ? { name: folder.name, path: folder.name }
        : { name: "On this device", path: "On this device" },
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["tracks", "audio"], "readwrite");
      tx.objectStore("tracks").put(track);
      tx.objectStore("audio").put({ id: blobId, blob: file, name: file.name, type: file.type });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    mediaUrls[fileLocation] = URL.createObjectURL(file);
    imported.push(track);
    if (knownSourceKeys) knownSourceKeys.add(sourceKey);
    if (reportProgress) emit("parsingProgress", [index + 1, valid.length]);
  }
  if (notify) {
    if (imported.length) {
      emit("addMultipleTracks", imported.map(({ mobileBlobId, ...track }) => track as TrackType));
      const all = await allTracks();
      await hydrateMediaUrls(all);
      emit("processedFiles", all.map(({ mobileBlobId, ...track }) => track as TrackType));
    }
    emit("parsingDone", { imported: imported.length, total: valid.length });
  }
  return imported;
}

function decodeBase64Blob(encoded: string, mimeType: string): Blob {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType || "application/octet-stream" });
}

async function importNativeFolder(
  folder: MobileFolder,
  notify: boolean,
  files?: NativeAudioFile[],
  reportProgress = true
) {
  const listing = files ? { files } : await FolderAccess.listFolder({ uri: folder.uri });
  if (!listing.files || !listing.files.length) {
    throw new Error("Nenhum arquivo de música compatível foi encontrado na pasta selecionada.");
  }
  const known = new Set((await allTracks()).map((track) => track.mobileSourceKey).filter(Boolean) as string[]);
  const importedTracks: StoredTrack[] = [];
  let importedCount = 0;
  const failedFiles: string[] = [];
  const audioFiles = listing.files || [];
  for (const [index, item] of audioFiles.entries()) {
    const sourceKey = `${folder.uri}|${item.uri}|${item.size || 0}|${item.lastModified || 0}`;
    try {
      if (!known.has(sourceKey)) {
        const { sessionId, mimeType } = await FolderAccess.beginReadFile({ uri: item.uri });
        const chunks: Blob[] = [];
        try {
          let done = false;
          while (!done) {
            const chunk = await FolderAccess.readFileChunk({ sessionId });
            if (chunk.base64) chunks.push(decodeBase64Blob(chunk.base64, mimeType || item.type || "application/octet-stream"));
            done = chunk.done;
          }
        } finally {
          await FolderAccess.closeReadFile({ sessionId }).catch(() => undefined);
        }
        const blob = new Blob(chunks, { type: mimeType || item.type || "application/octet-stream" });
        const file = new File([blob], item.name, {
          type: item.type || "application/octet-stream",
          lastModified: item.lastModified || Date.now(),
        });
        Object.defineProperty(file, "__mobileSourceKey", { value: sourceKey });
        const imported = await importFiles([file], folder, false, known, false);
        importedTracks.push(...imported);
        importedCount += imported.length;
        if (!imported.length) failedFiles.push(item.name || "arquivo sem nome");
      }
    } catch (error) {
      console.warn("Could not import audio file from selected folder", item.name, error);
      failedFiles.push(item.name || "arquivo sem nome");
    }
    if (notify && reportProgress) emit("parsingProgress", [index + 1, audioFiles.length]);
  }
  if (notify) {
    const hasChanges = importedTracks.length > 0 || failedFiles.length > 0;
    // A background rescan that finds nothing new must be almost free: no
    // full-library event, no cover hydration and no party synchronization.
    if (reportProgress || hasChanges) {
      const all = await allTracks();
      await hydrateMediaUrls(all);
      if (importedTracks.length) {
        emit("addMultipleTracks", importedTracks.map(({ mobileBlobId, ...track }) => track as TrackType));
      }
      emit("processedFiles", all.map(({ mobileBlobId, ...track }) => track as TrackType));
      await syncPartyLibrary(all);
      if (failedFiles.length) {
        const examples = failedFiles.slice(0, 3).join(", ");
        emit("mobileFolderScanError", {
          message: `${failedFiles.length} música(s) não puderam ser importadas${examples ? `: ${examples}` : ""}. As demais foram adicionadas.`,
        });
      } else if (!all.length) {
        emit("mobileFolderScanError", {
          message: "A pasta foi lida, mas nenhum áudio compatível foi importado.",
        });
      }
    }
    if (reportProgress) {
      emit("parsingDone", {
        imported: importedCount,
        total: audioFiles.length,
        failed: failedFiles.length,
      });
    }
  }
  return importedCount;
}

async function syncPartyLibrary(tracks?: StoredTrack[]) {
  try {
    const library = tracks || await allTracks();
    await PartyHost.updateLibrary({
      tracks: library.map((track) => ({
        fileLocation: track.fileLocation,
        defaultTitle: track.defaultTitle || track.title || track.fileName,
        defaultArtist: track.defaultArtist || track.artist || "",
        album: track.album || "",
        formattedLength: track.formattedLength || "",
        duration: Number(track.duration) || 0,
      })),
    });
  } catch (error) {
    // No room is running during normal library imports; the next room starts
    // with the current library snapshot.
    console.warn("Could not refresh the Android party library", error);
  }
}

async function chooseAndImportFolder() {
  const selected = await FolderAccess.pickFolder();
  const folder = { uri: selected.uri, name: selected.name || "Music" };
  try {
    await importNativeFolder(folder, true, selected.files);
  } catch (error: any) {
    emit("mobileFolderScanError", { message: error && error.message ? error.message : "Não foi possível ler a pasta selecionada." });
    throw error;
  }
  const folders: MobileFolder[] = await readRecord("mobileFolders", []);
  const updatedFolders = folders.some((item) => item.uri === folder.uri)
    ? folders
    : [...folders, folder];
  await writeRecord("mobileFolders", updatedFolders);
  localStorage.setItem("flb-mobile-onboard-complete", "true");
  localStorage.setItem("flb-mobile-has-library", "true");
  const settings = { ...defaultSettings, ...(await readRecord("settings", defaultSettings)) };
  settings.foldersToScan = updatedFolders.map((item) => item.name);
  await writeRecord("settings", settings);
  emit("userSettings", settings);
  emit("foldersToScan", settings.foldersToScan);
}

async function hydrateMediaUrls(tracks: StoredTrack[]) {
  const db = await database();
  for (const track of tracks) {
    if (mediaUrls[track.fileLocation]) continue;
    const blob = await new Promise<Blob | null>((resolve) => {
      const req = db.transaction("audio").objectStore("audio").get(track.mobileBlobId);
      req.onsuccess = () => resolve(req.result ? req.result.blob : null);
      req.onerror = () => resolve(null);
    });
    if (blob) mediaUrls[track.fileLocation] = URL.createObjectURL(blob);
  }
}

const defaultSettings: any = {
  includeVideo: false,
  desktopNotifications: false,
  defaultTab: "Home",
  theme: "fancy",
  accentColor: "accent_0",
  dynamicAccentColor: false,
  volume: 1,
  volumeBoost: false,
  foldersToScan: [],
  scannedFolders: [],
  enableEqualizer: false,
  language: "en",
  wallpaperMode: "dynamic",
  wallpaperImage: "",
};

async function initializeApp() {
  const storage = navigator.storage as any;
  if (storage && typeof storage.persist === "function") storage.persist().catch(() => undefined);
  const folders: MobileFolder[] = await readRecord("mobileFolders", []);
  const tracks = await allTracks();
  await hydrateMediaUrls(tracks);
  const cleanTracks = tracks.map(({ mobileBlobId, ...track }) => track as TrackType);
  const savedSettings = { ...defaultSettings, ...(await readRecord("settings", defaultSettings)) };
  savedSettings.foldersToScan = folders.map((folder) => folder.name);
  emit("userSettings", savedSettings);
  emit("userPlaylists", await readRecord("playlists", [{ name: "Favorites", tracks: [] }]));
  emit("recentlyPlayed", await readRecord("recentlyPlayed", []));
  emit("playStats", await readRecord("playStats", []));
  emit("foldersToScan", savedSettings.foldersToScan);
  if (cleanTracks.length) emit("processedFiles", cleanTracks);
  emit("isOnline", navigator.onLine);
  if (folders.length || tracks.length) {
    localStorage.setItem("flb-mobile-onboard-complete", "true");
    localStorage.setItem("flb-mobile-has-library", "true");
  }
  // Restore the cached library immediately. SAF folder rescans can take time
  // for large music collections, so do them in the background after startup.
  void (async () => {
    for (const folder of folders) {
      try { await importNativeFolder(folder, true, undefined, false); }
      catch (error) { console.warn("Could not rescan music folder", folder.name, error); }
    }
  })();
}

async function storeTrack(track: TrackType) {
  const db = await database();
  const existing: StoredTrack | undefined = await new Promise((resolve) => {
    const request = db.transaction("tracks").objectStore("tracks").get(track.fileLocation);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(undefined);
  });
  if (existing) {
    const updated = { ...existing, ...track };
    await new Promise<void>((resolve) => {
      const tx = db.transaction("tracks", "readwrite");
      tx.objectStore("tracks").put(updated);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }
}

function frame(frameId: string, payload: Uint8Array): Uint8Array {
  const output = new Uint8Array(10 + payload.length);
  for (let i = 0; i < 4; i++) output[i] = frameId.charCodeAt(i);
  new DataView(output.buffer).setUint32(4, payload.length);
  output.set(payload, 10);
  return output;
}

function textFrame(frameId: string, value: string): Uint8Array {
  const text = new TextEncoder().encode(value || "");
  const payload = new Uint8Array(text.length + 1);
  payload[0] = 3; // UTF-8, supported by ID3v2.3 readers
  payload.set(text, 1);
  return frame(frameId, payload);
}

function writeMp3Tags(blob: Blob, track: any, changes: any): Promise<Blob> {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let audioOffset = 0;
    if (bytes.length > 10 && String.fromCharCode(...bytes.subarray(0, 3)) === "ID3") {
      const tagSize = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
      audioOffset = Math.min(bytes.length, 10 + tagSize + ((bytes[5] & 0x10) ? 10 : 0));
    }
    const title = String(changes.title || track.defaultTitle || track.title || "");
    const artist = String(changes.artist || track.defaultArtist || track.artist || "");
    const album = String(changes.album || track.album || "");
    const frames = [textFrame("TIT2", title), textFrame("TPE1", artist), textFrame("TALB", album)];
    const cover = String(changes.APIC || changes.imageUrl || track.albumArt || "");
    if (cover.startsWith("data:")) {
      const match = cover.match(/^data:([^;,]+)?;base64,(.*)$/);
      if (match) {
        const mime = match[1] || "image/jpeg";
        const image = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
        const mimeBytes = new TextEncoder().encode(mime);
        const description = new Uint8Array([0, ...mimeBytes, 0, 3, 0]);
        const apic = new Uint8Array(description.length + image.length);
        apic.set(description);
        apic.set(image, description.length);
        frames.push(frame("APIC", apic));
      }
    }
    const frameLength = frames.reduce((total, item) => total + item.length, 0);
    const header = new Uint8Array(10);
    header.set([0x49, 0x44, 0x33, 0x03, 0x00, 0x00]);
    header[6] = (frameLength >> 21) & 0x7f;
    header[7] = (frameLength >> 14) & 0x7f;
    header[8] = (frameLength >> 7) & 0x7f;
    header[9] = frameLength & 0x7f;
    return new Blob([header, ...frames, bytes.subarray(audioOffset)], { type: blob.type || "audio/mpeg" });
  });
}

async function updateTags(payload: any) {
  const changes = payload.tagChanges || {};
  const track = { ...payload.track };
  if (changes.title) track.defaultTitle = track.title = changes.title;
  if (changes.artist) track.defaultArtist = track.artist = changes.artist;
  if (changes.album) track.album = changes.album;
  const artwork = changes.APIC || changes.imageUrl;
  if (artwork && artwork.startsWith("data:")) track.albumArt = artwork;
  if (/\.mp3$/i.test(track.fileName || "")) {
    const source = await mobileTrackBlob(track.fileLocation);
    if (source) {
      const updatedBlob = await writeMp3Tags(source, track, changes);
      const stored: StoredTrack | undefined = (await allTracks()).find((item) => item.fileLocation === track.fileLocation);
      if (stored) {
        const db = await database();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction("audio", "readwrite");
          tx.objectStore("audio").put({ id: stored.mobileBlobId, blob: updatedBlob, name: track.fileName, type: updatedBlob.type });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        if (mediaUrls[track.fileLocation]) URL.revokeObjectURL(mediaUrls[track.fileLocation]);
        mediaUrls[track.fileLocation] = URL.createObjectURL(updatedBlob);
      }
    }
  }
  await storeTrack(track);
  emit("updatedTrack", track);
}

async function deleteTracks(tracks: TrackType[]) {
  const db = await database();
  for (const track of tracks) {
    const record = await new Promise<StoredTrack | undefined>((resolve) => {
      const req = db.transaction("tracks").objectStore("tracks").get(track.fileLocation);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction(["tracks", "audio"], "readwrite");
      tx.objectStore("tracks").delete(track.fileLocation);
      if (record) tx.objectStore("audio").delete(record.mobileBlobId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    const url = mediaUrls[track.fileLocation];
    if (url) URL.revokeObjectURL(url);
    delete mediaUrls[track.fileLocation];
    emit("deleteComplete", track.fileLocation);
  }
}

async function saveLyrics(payload: any) {
  const lyrics: any[] = await readRecord("lyrics", []);
  const index = lyrics.findIndex((item) => item.trackName === payload.trackName && item.artist === payload.artist);
  if (index >= 0) lyrics[index] = payload;
  else lyrics.push(payload);
  await writeRecord("lyrics", lyrics);
  return true;
}

async function loadLyrics() {
  return readRecord("lyrics", []);
}

function normalizeCoverSearch(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface CoverCacheRecord {
  key: string;
  cover?: string;
  updatedAt: number;
  miss?: boolean;
}

/**
 * A track is searched with more than one query. The result is stored under
 * every key so another track of the same album (or with the same title) is
 * answered from the persistent cache without touching the network again.
 */
function coverCacheKeys(track: TrackType): string[] {
  const title = normalizeCoverSearch(track.defaultTitle || track.title || "").toLowerCase();
  const artist = normalizeCoverSearch(track.defaultArtist || track.artist || "").toLowerCase();
  const album = normalizeCoverSearch(track.album || "").toLowerCase();
  const keys: string[] = [];
  if (artist || album) keys.push(`album:${artist}|${album}`);
  if (artist || title) keys.push(`track:${artist}|${title}`);
  if (album) keys.push(`album-name:${album}`);
  if (title) keys.push(`title:${title}`);
  return Array.from(new Set(keys));
}

async function readCoverCache(key: string): Promise<CoverCacheRecord | null> {
  const memory = coverLookupMemory.get(key);
  if (memory) return { key, ...memory };
  try {
    const db = await database();
    const record = await new Promise<CoverCacheRecord | null>((resolve) => {
      const request = db.transaction("covers").objectStore("covers").get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
    if (record) {
      coverLookupMemory.set(key, {
        cover: record.cover || "",
        updatedAt: record.updatedAt || 0,
        miss: !!record.miss,
      });
    }
    return record;
  } catch (error) {
    return null;
  }
}

async function writeCoverCache(keys: string[], cover: string): Promise<void> {
  const updatedAt = Date.now();
  // A miss belongs to the track that was searched. Storing it under the
  // album key would hide a cover that another track of the album can find.
  const targetKeys = cover
    ? keys
    : keys.filter((key) => key.startsWith("track:") || key.startsWith("title:"));
  const records: CoverCacheRecord[] = (targetKeys.length ? targetKeys : keys).map((key) => ({
    key,
    cover,
    updatedAt,
    miss: !cover,
  }));
  records.forEach((record) => coverLookupMemory.set(record.key, {
    cover: record.cover || "",
    updatedAt,
    miss: !!record.miss,
  }));
  try {
    const db = await database();
    await new Promise<void>((resolve) => {
      const tx = db.transaction("covers", "readwrite");
      records.forEach((record) => tx.objectStore("covers").put(record));
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (error) {
    // The in-memory cache still prevents duplicate requests in this session.
  }
}

async function fetchOnlineCover(track: TrackType): Promise<string> {
  if (!navigator.onLine) return "";
  const title = normalizeCoverSearch(track.defaultTitle || track.title || "");
  const artist = normalizeCoverSearch(track.defaultArtist || track.artist || "");
  const album = normalizeCoverSearch(track.album || "");
  const queries = [
    [artist, album].filter(Boolean).join(" "),
    [artist, title].filter(Boolean).join(" "),
    album,
    title,
  ].filter(Boolean);
  for (const query of Array.from(new Set(queries))) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(
        `https://api.deezer.com/search?q=${encodeURIComponent(query)}`,
        { signal: controller.signal }
      );
      if (!response.ok) continue;
      const result = await response.json();
      const match = (result.data || []).find((item: any) => item.album && (item.album.cover_xl || item.album.cover_big));
      if (match) return match.album.cover_xl || match.album.cover_big;
    } catch (_) {
      // Network or provider restrictions should not stop local cover recovery.
    } finally {
      clearTimeout(timer);
    }
  }
  return "";
}

async function onlineCoverFor(track: TrackType): Promise<string> {
  const keys = coverCacheKeys(track);
  for (const key of keys) {
    const record = await readCoverCache(key);
    if (!record) continue;
    if (record.cover) return record.cover;
    if (record.miss && Date.now() - record.updatedAt < COVER_MISS_TTL_MS) return "";
  }
  // Looking for new covers while offline only wastes battery. The negative
  // cache is not written either, so the next online scan tries again.
  if (!navigator.onLine) return "";

  // Two tracks of the same album, or the cover panel and the repair job, must
  // not start the same online search at the same time.
  const requestKey = keys[0] || `track:${normalizeCoverSearch(track.defaultTitle || "").toLowerCase()}`;
  const running = coverLookupRequests.get(requestKey);
  if (running) return running;

  const request = (async () => {
    const cover = await fetchOnlineCover(track);
    await writeCoverCache(keys, cover);
    return cover;
  })();
  coverLookupRequests.set(requestKey, request);
  try {
    return await request;
  } finally {
    coverLookupRequests.delete(requestKey);
  }
}

function readArtworkCache(key: string): Promise<string> {
  return new Promise(async (resolve) => {
    try {
      const db = await database();
      const request = db.transaction("covers").objectStore("covers").get(key);
      request.onsuccess = () => resolve(request.result && request.result.dataUrl ? request.result.dataUrl : "");
      request.onerror = () => resolve("");
    } catch (error) {
      resolve("");
    }
  });
}

/**
 * Keeps at most ARTWORK_CACHE_LIMIT compressed covers on the device. The index
 * lives in the existing records store, so no extra object store is needed.
 */
async function writeArtworkCache(key: string, dataUrl: string, memoryKey: string): Promise<void> {
  artworkMemory.set(memoryKey, dataUrl);
  if (artworkMemory.size > 20) {
    const oldest = artworkMemory.keys().next().value;
    if (oldest) artworkMemory.delete(oldest);
  }
  try {
    const db = await database();
    const keys = artworkCacheKeys || await readRecord<string[]>("artworkCacheKeys", []);
    const nextKeys = [key, ...keys.filter((item) => item !== key)];
    const removed = nextKeys.splice(ARTWORK_CACHE_LIMIT);
    await new Promise<void>((resolve) => {
      const tx = db.transaction("covers", "readwrite");
      tx.objectStore("covers").put({ key, dataUrl, updatedAt: Date.now() });
      removed.forEach((item) => tx.objectStore("covers").delete(item));
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    artworkCacheKeys = nextKeys;
    await writeRecord("artworkCacheKeys", nextKeys);
  } catch (error) {
    // The notification works without artwork if the cache is unavailable.
  }
}

function dataUrlToImage(dataUrl: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (result: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => finish(null), 5000);
    image.onload = () => finish(image);
    image.onerror = () => finish(null);
    image.src = dataUrl;
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => resolve("");
    reader.readAsDataURL(blob);
  });
}

async function compressArtwork(source: string): Promise<string> {
  let dataUrl = source;
  if (!/^data:image\//i.test(source)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch(source, { signal: controller.signal });
      if (!response.ok) return "";
      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) return "";
      dataUrl = await blobToDataUrl(blob);
    } catch (error) {
      return "";
    } finally {
      clearTimeout(timer);
    }
  }
  if (!dataUrl) return "";
  const image = await dataUrlToImage(dataUrl);
  if (!image) return "";
  const maxSize = 512;
  const scale = Math.min(1, maxSize / Math.max(image.width || 1, image.height || 1));
  const width = Math.max(1, Math.round((image.width || maxSize) * scale));
  const height = Math.max(1, Math.round((image.height || maxSize) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return "";
  context.drawImage(image, 0, 0, width, height);
  try {
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch (error) {
    return "";
  }
}

async function resolveNotificationArtwork(source: string): Promise<string> {
  const key = artworkCacheKey(source);
  const memory = artworkMemory.get(key);
  if (memory) return memory;
  const cached = await readArtworkCache(key);
  if (cached) {
    artworkMemory.set(key, cached);
    return cached;
  }
  const compressed = await compressArtwork(source);
  if (compressed) await writeArtworkCache(key, compressed, key);
  return compressed;
}

function artworkCacheKey(source: string): string {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `art:${(hash >>> 0).toString(36)}:${source.length}`;
}

async function repairMobileCovers() {
  const groupKey = "mobile-cover-repair";
  emit("notification", {
    groupKey,
    isPersistent: true,
    title: "notification.repairingCovers",
    subTitle: "notification.searchingCovers",
    progress: { current: 0, total: 1 },
    type: "normal",
  });
  const records = await allTracks();
  const repaired: TrackType[] = [];
  const coverByAlbum = new Map<string, string>();
  const albumKey = (track: TrackType) =>
    `${normalizeCoverSearch(track.artist || track.defaultArtist || "").toLowerCase()}|${normalizeCoverSearch(track.album || "").toLowerCase()}`;
  emit("notification", {
    groupKey,
    isPersistent: true,
    title: "notification.repairingCovers",
    subTitle: "notification.searchingCovers",
    progress: { current: 0, total: records.length },
    type: "normal",
  });

  records.forEach((track) => {
    if (track.albumArt && /^(data:image\/|https?:\/\/|blob:)/i.test(track.albumArt)) {
      const key = albumKey(track);
      if (key !== "|") coverByAlbum.set(key, track.albumArt);
    }
  });

  for (const [index, stored] of records.entries()) {
    let track = { ...stored } as TrackType;
    const hasUsableCover = !!track.albumArt && /^(data:image\/|https?:\/\/|blob:)/i.test(track.albumArt);
    if (!hasUsableCover) track.albumArt = "";
    if (!hasUsableCover && /\.mp3$/i.test(track.fileName || "")) {
      const blob = await mobileTrackBlob(track.fileLocation);
      if (blob) {
        try {
          const tags = readMp3Tags(await blob.arrayBuffer());
          if (tags.albumArt) track.albumArt = tags.albumArt;
        } catch (_) { /* Keep looking for a cover elsewhere. */ }
      }
    }
    if (!track.albumArt) {
      const siblingCover = coverByAlbum.get(albumKey(track));
      if (siblingCover) track.albumArt = siblingCover;
    }
    if (!track.albumArt) track.albumArt = await onlineCoverFor(track);
    if (track.albumArt && track.albumArt !== stored.albumArt) {
      await storeTrack(track);
      repaired.push(track);
      const key = albumKey(track);
      if (key !== "|") coverByAlbum.set(key, track.albumArt);
    }
    emit("notification", {
      groupKey,
      isPersistent: true,
      title: "notification.repairingCovers",
      subTitle: `${index + 1}/${records.length}`,
      progress: { current: index + 1, total: records.length },
      type: "normal",
    });
  }
  emit("closeNotification", groupKey);
  emit("coversRepaired", repaired);
  emit("notification", {
    title: "notification.coversRepaired",
    subTitle: "notification.coversRepairedCount",
    values: { count: repaired.length },
    type: "success",
  });
}

async function importCoverArt() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg,image/webp";
  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    if (file) emit("importedCoverArt", await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    }));
    input.remove();
  }, { once: true });
  document.body.appendChild(input);
  input.click();
}

function attachPartyEvents() {
  if (partyEventsAttached) return;
  partyEventsAttached = true;
  const mappings: Record<string, (payload: any) => void> = {
    partyGuestsUpdate: (payload) => emit("partyGuestsUpdate", payload.guests || []),
    partyPendingUpdate: (payload) => emit("partyPendingUpdate", payload.pending || []),
    partyBlockedUpdate: (payload) => emit("partyBlockedUpdate", payload.blocked || []),
    partyGuestLeft: (payload) => emit("partyGuestLeft", payload),
    partyGuestBlocked: (payload) => emit("partyGuestBlocked", payload),
    partyGuestTrackRequested: async (payload) => {
      const uploadedTrack = payload.uploadedTrack;
      if (uploadedTrack && uploadedTrack.mobileBase64) {
        const mimeType = uploadedTrack.fileName?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() || "mpeg";
        const audioType = mimeType === "mp3" ? "audio/mpeg" : `audio/${mimeType}`;
        const blob = decodeBase64Blob(uploadedTrack.mobileBase64, audioType);
        const fileLocation = uploadedTrack.fileLocation;
        delete uploadedTrack.mobileBase64;
        try {
          uploadedTrack.duration = await durationOf(blob);
          uploadedTrack.formattedLength = formatDuration(uploadedTrack.duration);
          const db = await database();
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction("audio", "readwrite");
            tx.objectStore("audio").put({ id: fileLocation, blob, name: uploadedTrack.fileName, type: blob.type });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          });
          mediaUrls[fileLocation] = URL.createObjectURL(blob);
        } catch (error) {
          console.error("Could not store a party upload", error);
        }
      }
      emit("partyGuestTrackRequested", payload);
    },
  };
  Object.keys(mappings).forEach((eventName) => {
    PartyHost.addListener(eventName, (payload) => { void mappings[eventName](payload || {}); })
      .catch((error) => console.warn(`Could not attach ${eventName} listener`, error));
  });
}

async function send(channel: string, payload?: any) {
  switch (channel) {
    case "initializeSettings":
      {
        const folders: MobileFolder[] = await readRecord("mobileFolders", []);
        const settings = { ...defaultSettings, ...(await readRecord("settings", defaultSettings)) };
        settings.foldersToScan = folders.map((folder) => folder.name);
        emit("userSettings", settings);
      }
      break;
    case "initializeApp":
      await initializeApp();
      break;
    case "getFirstTracks":
    case "addScanFolder":
      chooseAndImportFolder().catch((error) => {
        if (error && error.code !== "CANCELLED") console.error(error);
      });
      break;
    case "refresh":
      chooseAndImportFolder().catch((error) => {
        if (error && error.code !== "CANCELLED") console.error(error);
      });
      break;
    case "processDroppedFiles":
      if (Array.isArray(payload) && payload.length && payload[0] instanceof File) {
        importFiles(payload).catch(console.error);
      }
      break;
    case "updatePlaylists":
      await writeRecord("playlists", payload);
      break;
    case "updateSettings":
      await writeRecord("settings", { ...defaultSettings, ...payload });
      break;
    case "playingTrack": {
      const recent: TrackType[] = await readRecord("recentlyPlayed", []);
      const filtered = recent.filter((track) => track.fileLocation !== payload.fileLocation);
      filtered.unshift(payload);
      await writeRecord("recentlyPlayed", filtered.slice(0, 50));
      const stats: any[] = await readRecord("playStats", []);
      const current = stats.find((item) => item.trackLocation === payload.fileLocation);
      if (current) current.numberOfPlays += 1;
      else stats.push({ trackLocation: payload.fileLocation, numberOfPlays: 1 });
      await writeRecord("playStats", stats);
      emit("playStats", stats);
      break;
    }
    case "updateTags":
      await updateTags(payload);
      break;
    case "deleteFiles":
      await deleteTracks(payload || []);
      break;
    case "importCoverArt":
      await importCoverArt();
      break;
    case "imageSearcherChoice":
      emit("urlImage", payload);
      break;
    case "requestVersion":
      emit("appVersion", "1.2.1 · Android");
      break;
    case "sendUsageStats":
      emit("userID", localStorage.getItem("userID") || id());
      break;
    case "resetApp": {
      const db = await database();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(["tracks", "audio", "records", "covers"], "readwrite");
        tx.objectStore("tracks").clear();
        tx.objectStore("audio").clear();
        tx.objectStore("records").clear();
        tx.objectStore("covers").clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
      coverLookupMemory.clear();
      coverLookupRequests.clear();
      artworkMemory.clear();
      artworkCacheKeys = null;
      Object.keys(mediaUrls).forEach((key) => {
        URL.revokeObjectURL(mediaUrls[key]);
        delete mediaUrls[key];
      });
      localStorage.removeItem("lastPlayedTrack");
      emit("processedFiles", []);
      emit("userSettings", defaultSettings);
      emit("userPlaylists", [{ name: "Favorites", tracks: [] }]);
      emit("recentlyPlayed", []);
      emit("playStats", []);
      await writeRecord("mobileFolders", []);
      break;
    }
    case "partyQueueUpdate":
      await PartyHost.updateQueue({ snapshot: payload || {} });
      break;
    case "partyStop":
      await PartyHost.stopParty();
      break;
    case "partySetEntryMode":
      await PartyHost.setEntryMode({ mode: payload || "free" });
      break;
    case "partyPendingResolve":
      await PartyHost.resolvePending({ pendingId: payload?.pendingId || "", accept: !!payload?.accept });
      break;
    case "partyGuestTrackRequested":
    case "sendNotification":
    case "closeWindow":
    case "minimize":
    case "maximize":
    case "toggleMiniMode":
    case "checkForUpdate":
    case "downloadArtistPicture":
      break;
    case "repairCovers":
      await repairMobileCovers();
      break;
    case "removeFromScannedFolders": {
      const folders: MobileFolder[] = await readRecord("mobileFolders", []);
      const targetPath = typeof payload === "string" ? payload : payload?.path;
      const folder = folders.find((item) => item.name === targetPath);
      if (!folder) break;
      const remaining = folders.filter((item) => item.uri !== folder.uri);
      await writeRecord("mobileFolders", remaining);
      const settings = { ...defaultSettings, ...(await readRecord("settings", defaultSettings)) };
      settings.foldersToScan = remaining.map((item) => item.name);
      await writeRecord("settings", settings);
      emit("userSettings", settings);
      emit("foldersToScan", settings.foldersToScan);
      const tracks = (await allTracks()).filter((track) => track.folderInfo.path === folder.name);
      await deleteTracks(tracks);
      break;
    }
    default:
      break;
  }
}

async function invoke(channel: string, payload?: any): Promise<any> {
  switch (channel) {
    case "checkOnline": return navigator.onLine;
    case "getPlaybackStats": return readRecord("playStats", []);
    case "loadLyricsFiles": return loadLyrics();
    case "saveLyricsFile": return saveLyrics(payload);
    case "saveLyricsBatch":
      for (const item of payload || []) await saveLyrics(item);
      return true;
    case "partyDiscover": return null;
    case "partyStart": return PartyHost.startParty(payload);
    case "partyKickGuest": return PartyHost.kickGuest({ guestId: String(payload || "") });
    case "partyBlockGuest": return PartyHost.blockGuest({ guestId: String(payload || "") });
    case "partyUnblockGuest": return PartyHost.unblockGuest({ deviceToken: String(payload || "") });
    default: return undefined;
  }
}

export const mobileIpcRenderer = {
  on(channel: string, listener: Listener) {
    attachPartyEvents();
    if (!handlers.has(channel)) handlers.set(channel, new Set());
    handlers.get(channel)!.add(listener);
    return this;
  },
  once(channel: string, listener: Listener) {
    const wrapped: Listener = (event, payload) => {
      this.removeListener(channel, wrapped);
      listener(event, payload);
    };
    return this.on(channel, wrapped);
  },
  removeListener(channel: string, listener: Listener) {
    handlers.get(channel)?.delete(listener);
    return this;
  },
  removeAllListeners(channel: string) {
    if (channel) handlers.delete(channel);
    else handlers.clear();
    return this;
  },
  send(channel: string, payload?: any) {
    // Keep file-picker calls in the original tap gesture. Android blocks
    // input.click() when it is deferred with setTimeout.
    void send(channel, payload).catch(console.error);
  },
  invoke,
};

export function mobileMediaUrl(fileLocation: string): string {
  return mediaUrls[fileLocation] || fileLocation;
}

export async function mobileTrackBlob(fileLocation: string): Promise<Blob | null> {
  const track = (await allTracks()).find((item) => item.fileLocation === fileLocation);
  const db = await database();
  return new Promise((resolve) => {
    const request = db.transaction("audio").objectStore("audio").get(track ? track.mobileBlobId : fileLocation);
    request.onsuccess = () => resolve(request.result ? request.result.blob : null);
    request.onerror = () => resolve(null);
  });
}


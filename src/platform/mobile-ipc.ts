import { TrackType } from "@/types";

type Listener = (event: any, payload?: any) => void;
type StoredTrack = TrackType & { mobileBlobId: string; mobileSourceKey?: string };

const DB_NAME = "flb-music-mobile";
const DB_VERSION = 1;
const MEDIA_PREFIX = "flb-media://";
const ACCEPTED_AUDIO = /\.(mp3|flac|wav|m4a|aac|ogg|opus|wma|aiff|ape)$/i;
const handlers = new Map<string, Set<Listener>>();
const mediaUrls: Record<string, string> = {};
let dbPromise: Promise<IDBDatabase> | null = null;

(window as any).__FLB_MEDIA_URLS__ = mediaUrls;

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
  listeners.forEach((listener) => listener({}, payload));
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
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      URL.revokeObjectURL(url);
      resolve(duration);
    };
    audio.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
    audio.src = url;
  });
}

function formatDuration(seconds: number): string {
  if (!seconds) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

async function importFiles(files: File[]) {
  const db = await database();
  const valid = files.filter((file) => ACCEPTED_AUDIO.test(file.name));
  const existingTracks = await allTracks();
  const imported: StoredTrack[] = [];
  for (const [index, file] of valid.entries()) {
    const sourceKey = `${file.name}:${file.size}:${file.lastModified}`;
    if (existingTracks.some((track) => track.mobileSourceKey === sourceKey)) continue;
    const blobId = id();
    const fileLocation = `${MEDIA_PREFIX}${blobId}`;
    const parts = fileNameParts(file.name);
    let tags: ReturnType<typeof readMp3Tags> = {};
    if (/\.mp3$/i.test(file.name)) {
      try { tags = readMp3Tags(await file.arrayBuffer()); } catch (_) { /* Use the filename when tags are damaged. */ }
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
      folderInfo: { name: "On this device", path: "On this device" },
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
    emit("parsingProgress", [Math.round(((index + 1) / valid.length) * 100), valid.length]);
  }
  emit("addMultipleTracks", imported);
  const all = await allTracks();
  await hydrateMediaUrls(all);
  emit("processedFiles", all.map(({ mobileBlobId, ...track }) => track as TrackType));
  emit("parsingDone");
  return imported;
}

function chooseAudioFiles(onFiles: (files: File[]) => void) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "audio/*,.mp3,.flac,.wav,.m4a,.aac,.ogg,.opus,.wma,.aiff,.ape";
  input.multiple = true;
  input.style.display = "none";
  input.addEventListener("change", () => {
    const files = Array.from(input.files || []);
    input.remove();
    onFiles(files);
  }, { once: true });
  document.body.appendChild(input);
  input.click();
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
};

async function initializeApp() {
  const tracks = await allTracks();
  const storage = navigator.storage as any;
  if (storage && typeof storage.persist === "function") storage.persist().catch(() => undefined);
  await hydrateMediaUrls(tracks);
  const cleanTracks = tracks.map(({ mobileBlobId, ...track }) => track as TrackType);
  emit("userSettings", await readRecord("settings", defaultSettings));
  emit("userPlaylists", await readRecord("playlists", [{ name: "Favorites", tracks: [] }]));
  emit("recentlyPlayed", await readRecord("recentlyPlayed", []));
  emit("playStats", await readRecord("playStats", []));
  emit("foldersToScan", []);
  if (cleanTracks.length) emit("processedFiles", cleanTracks);
  emit("isOnline", navigator.onLine);
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

async function send(channel: string, payload?: any) {
  switch (channel) {
    case "initializeSettings":
      emit("userSettings", await readRecord("settings", defaultSettings));
      break;
    case "initializeApp":
      await initializeApp();
      break;
    case "getFirstTracks":
    case "addScanFolder":
    case "refresh":
      chooseAudioFiles((files) => { importFiles(files).catch(console.error); });
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
        const tx = db.transaction(["tracks", "audio", "records"], "readwrite");
        tx.objectStore("tracks").clear();
        tx.objectStore("audio").clear();
        tx.objectStore("records").clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
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
      break;
    }
    case "partyQueueUpdate":
    case "partyStop":
    case "partySetEntryMode":
    case "partyPendingResolve":
    case "partyGuestTrackRequested":
    case "sendNotification":
    case "closeWindow":
    case "minimize":
    case "maximize":
    case "toggleMiniMode":
    case "checkForUpdate":
    case "removeFromScannedFolders":
    case "downloadArtistPicture":
    case "repairCovers":
      break;
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
    case "partyStart": throw new Error("Abra uma festa no computador e conecte o celular como convidado.");
    default: return undefined;
  }
}

export const mobileIpcRenderer = {
  on(channel: string, listener: Listener) {
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
  if (!track) return null;
  const db = await database();
  return new Promise((resolve) => {
    const request = db.transaction("audio").objectStore("audio").get(track.mobileBlobId);
    request.onsuccess = () => resolve(request.result ? request.result.blob : null);
    request.onerror = () => resolve(null);
  });
}


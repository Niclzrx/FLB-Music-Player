import { CapacitorHttp } from "@capacitor/core";
import { ipcRenderer, isMobileApp } from "@/platform/ipc";
import type { LanguageType } from "@/renderer/i18n";

/**
 * Small client for the public YouTube Music web client.
 *
 * The renderer cannot talk to music.youtube.com from Android because of CORS,
 * and desktop fetch() is not allowed to set a Cookie header. Mobile requests
 * go through CapacitorHttp and desktop requests through the small proxy in the
 * main process. Guest requests work out of the box; an optional pasted cookie
 * unlocks the private library.
 */

const INNERTUBE_API_KEY = "AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30";
const INNERTUBE_CLIENT_VERSION = "1.20240710.01.00";
const INNERTUBE_CLIENT_NAME = "WEB_REMIX";
const INNERTUBE_CLIENT_NUMBER = "67";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const MELD_COOKIE_KEY = "flb-meld-cookie";

export type MeldItemKind =
  | "song"
  | "album"
  | "playlist"
  | "artist"
  | "mood";

export interface MeldTrack {
  kind: "song";
  id: string;
  videoId: string;
  title: string;
  subtitle: string;
  artists: string;
  album: string;
  duration: string;
  thumbnail: string;
  playlistId: string;
}

export interface MeldCollection {
  kind: Exclude<MeldItemKind, "song">;
  id: string;
  title: string;
  subtitle: string;
  thumbnail: string;
  browseId: string;
  params: string;
}

export type MeldItem = MeldTrack | MeldCollection;

export interface MeldShelf {
  title: string;
  subtitle: string;
  items: MeldItem[];
  browseId: string;
  params: string;
}

export interface MeldHomeResult {
  shelves: MeldShelf[];
}

export interface MeldSearchResult {
  top: MeldItem | null;
  tracks: MeldTrack[];
  collections: MeldCollection[];
}

export interface MeldBrowseResult {
  browseId: string;
  title: string;
  subtitle: string;
  thumbnail: string;
  tracks: MeldTrack[];
  shelves: MeldShelf[];
}

export interface MeldLibraryResult {
  shelves: MeldShelf[];
  requiresLogin: boolean;
}

interface RequestPayload {
  url: string;
  headers: Record<string, string>;
  body: any;
}

interface RequestResult {
  ok: boolean;
  status: number;
  data: any;
}

let visitorData = "";

/* -------------------------------------------------------------------------- */
/* Session helpers                                                            */
/* -------------------------------------------------------------------------- */

export function cleanCookieInput(input: string): string {
  if (!input) return "";
  return input
    .replace(/^\s*cookie\s*:\s*/i, "")
    .replace(/[\r\n]+/g, "; ")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.includes("="))
    .join("; ");
}

export function hasMeldSessionCookie(cookie: string): boolean {
  return /(?:^|;\s*)(?:SAPISID|__Secure-3PAPISID)=/.test(cookie || "");
}

export function getStoredMeldCookie(): string {
  try {
    return cleanCookieInput(localStorage.getItem(MELD_COOKIE_KEY) || "");
  } catch (error) {
    return "";
  }
}

export function storeMeldCookie(cookie: string): void {
  try {
    const cleaned = cleanCookieInput(cookie);
    if (cleaned) localStorage.setItem(MELD_COOKIE_KEY, cleaned);
    else localStorage.removeItem(MELD_COOKIE_KEY);
  } catch (error) {
    console.error("Could not save the Meld session", error);
  }
}

export function clearMeldCookie(): void {
  try {
    localStorage.removeItem(MELD_COOKIE_KEY);
  } catch (error) {
    console.error("Could not clear the Meld session", error);
  }
}

/* -------------------------------------------------------------------------- */
/* Request helpers                                                            */
/* -------------------------------------------------------------------------- */

function languageContext(language?: LanguageType): {
  hl: string;
  gl: string;
} {
  if (language === "pt-BR") return { hl: "pt-BR", gl: "BR" };
  return { hl: "en", gl: "US" };
}

function buildContext(language?: LanguageType): any {
  const locale = languageContext(language);
  const client: any = {
    clientName: INNERTUBE_CLIENT_NAME,
    clientVersion: INNERTUBE_CLIENT_VERSION,
    hl: locale.hl,
    gl: locale.gl,
    userAgent: USER_AGENT,
    platform: "DESKTOP",
    originalUrl: "https://music.youtube.com/",
  };
  if (visitorData) client.visitorData = visitorData;
  return { client, user: {} };
}

/**
 * SHA-1 is only used to build the SAPISIDHASH header, it never leaves the
 * device. A tiny implementation avoids adding a crypto dependency to the
 * mobile bundle.
 */
function sha1(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLength = bytes.length * 8;
  const totalLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(totalLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(totalLength - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(totalLength - 4, bitLength >>> 0);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const words = new Uint32Array(80);

  const rotate = (value: number, count: number) =>
    (value << count) | (value >>> (32 - count));

  for (let offset = 0; offset < totalLength; offset += 64) {
    for (let index = 0; index < 16; index++) {
      words[index] = view.getUint32(offset + index * 4);
    }
    for (let index = 16; index < 80; index++) {
      words[index] = rotate(
        words[index - 3] ^
          words[index - 8] ^
          words[index - 14] ^
          words[index - 16],
        1
      );
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let index = 0; index < 80; index++) {
      let f = 0;
      let k = 0;
      if (index < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (index < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (index < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (rotate(a, 5) + f + e + k + words[index]) >>> 0;
      e = d;
      d = c;
      c = rotate(b, 30) >>> 0;
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const hex = (value: number) => value.toString(16).padStart(8, "0");
  return hex(h0) + hex(h1) + hex(h2) + hex(h3) + hex(h4);
}

function authorizationHeaders(cookie: string): Record<string, string> {
  if (!cookie) return {};
  const match = cookie.match(
    /(?:^|;\s*)(?:SAPISID|__Secure-3PAPISID)=([^;]+)/
  );
  const headers: Record<string, string> = {
    Cookie: cookie,
    "X-Goog-AuthUser": "0",
    "X-Origin": "https://music.youtube.com",
  };
  if (match) {
    const timestamp = Math.floor(Date.now() / 1000);
    const digest = sha1(
      `${timestamp} ${match[1]} https://music.youtube.com`
    );
    headers.Authorization = `SAPISIDHASH ${timestamp}_${digest}`;
  }
  return headers;
}

function parseMobileResponse(response: any): any {
  if (response.status >= 400) {
    const message =
      response.data?.error?.message ||
      (typeof response.data === "string" ? response.data : "") ||
      `HTTP ${response.status}`;
    throw new Error(String(message).slice(0, 280));
  }
  if (typeof response.data === "string") {
    try {
      return JSON.parse(response.data);
    } catch (error) {
      throw new Error("YouTube Music returned an invalid response");
    }
  }
  return response.data;
}

async function request(
  endpoint: string,
  body: any,
  cookie: string,
  language?: LanguageType
): Promise<any> {
  const url = `https://music.youtube.com/youtubei/v1/${endpoint}?key=${INNERTUBE_API_KEY}&prettyPrint=false`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-YouTube-Client-Name": INNERTUBE_CLIENT_NUMBER,
    "X-YouTube-Client-Version": INNERTUBE_CLIENT_VERSION,
    "X-Goog-Api-Format-Version": "2",
    ...authorizationHeaders(cookie),
  };
  const payload = { context: buildContext(language), ...body };

  if (isMobileApp) {
    const response = await CapacitorHttp.post({
      url,
      headers,
      data: payload,
      responseType: "json",
      connectTimeout: 20000,
      readTimeout: 30000,
    });
    const data = parseMobileResponse(response);
    if (data?.responseContext?.visitorData) {
      visitorData = data.responseContext.visitorData;
    }
    return data;
  }

  const payloadForNode: RequestPayload = { url, headers, body: payload };
  const result: RequestResult = await ipcRenderer.invoke(
    "meldFetch",
    payloadForNode
  );
  if (!result || !result.ok) {
    const message =
      result?.data?.error?.message ||
      (typeof result?.data === "string" ? result.data : "") ||
      `HTTP ${result?.status || 0}`;
    throw new Error(String(message).slice(0, 280));
  }
  if (result.data?.responseContext?.visitorData) {
    visitorData = result.data.responseContext.visitorData;
  }
  return result.data;
}

/* -------------------------------------------------------------------------- */
/* InnerTube parsers                                                          */
/* -------------------------------------------------------------------------- */

function textOf(value: any): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return value.map((entry) => textOf(entry)).filter(Boolean).join("");
  }
  if (typeof value === "object") {
    if (Array.isArray(value.runs)) {
      return value.runs.map((run: any) => textOf(run.text)).join("");
    }
    if (typeof value.simpleText === "string") return value.simpleText;
    if (typeof value.text === "string") return value.text;
    if (value.text && typeof value.text === "object") return textOf(value.text);
  }
  return "";
}

function cleanSubtitle(value: string): string {
  return value
    .replace(/\s*•\s*/g, " • ")
    .replace(/\s+/g, " ")
    .replace(/^•\s*|\s*•$/g, "")
    .trim();
}

function fixedTextOf(value: string): string {
  return value.replace(/\s*•\s*/g, " • ").trim();
}

function bestThumbnail(node: any): string {
  if (!node) return "";
  const lists: any[] = [
    node.thumbnail?.thumbnails,
    node.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails,
    node.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails,
    node.thumbnailRenderer?.croppedSquareThumbnailRenderer?.thumbnail
      ?.thumbnails,
    node.foregroundThumbnail?.thumbnails,
    node.backgroundImage?.thumbnails,
    node.thumbnail?.thumbnail?.thumbnails,
  ];
  let best: any = null;
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const candidate of list) {
      if (!candidate || !candidate.url) continue;
      if (!best) {
        best = candidate;
        continue;
      }
      const bestSize = (best.width || 0) * (best.height || 0);
      const size = (candidate.width || 0) * (candidate.height || 0);
      if (size > bestSize) best = candidate;
    }
  }
  return best?.url || "";
}

function findFirst(node: any, key: string): any {
  if (!node || typeof node !== "object") return null;
  if (node[key] && typeof node[key] === "object") return node[key];
  const values = Array.isArray(node) ? node : Object.values(node);
  for (const value of values) {
    const found = findFirst(value, key);
    if (found) return found;
  }
  return null;
}

function watchEndpointOf(node: any): any {
  const candidates = [
    node?.navigationEndpoint?.watchEndpoint,
    node?.onTap?.watchEndpoint,
    node?.playNavigationEndpoint?.watchEndpoint,
    node?.overlay?.musicItemThumbnailOverlayRenderer?.content
      ?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint,
    node?.overlay?.musicItemThumbnailOverlayRenderer?.content
      ?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint,
    node?.playlistItemData?.watchEndpoint,
  ];
  for (const candidate of candidates) {
    if (candidate && candidate.videoId) return candidate;
  }
  return null;
}

function browseEndpointOf(node: any): any {
  const candidates = [
    node?.navigationEndpoint?.browseEndpoint,
    node?.onTap?.browseEndpoint,
    node?.clickCommand?.browseEndpoint,
    node?.title?.runs?.find((run: any) => run?.navigationEndpoint?.browseEndpoint)
      ?.navigationEndpoint?.browseEndpoint,
    node?.buttonText?.runs?.find(
      (run: any) => run?.navigationEndpoint?.browseEndpoint
    )?.navigationEndpoint?.browseEndpoint,
  ];
  for (const candidate of candidates) {
    if (candidate && candidate.browseId) return candidate;
  }
  return null;
}

function kindFromBrowseId(browseId: string): Exclude<MeldItemKind, "song"> {
  if (!browseId) return "playlist";
  if (browseId.startsWith("MPRE")) return "album";
  if (browseId.startsWith("UC")) return "artist";
  if (browseId.startsWith("FEmusic_")) return "mood";
  return "playlist";
}

function videoIdFromBrowseId(browseId: string): string {
  // MPED ids are the 11 character video id prefixed by the page type.
  if (/^MPED.{11}$/.test(browseId)) return browseId.slice(4);
  return "";
}

function makeTrack(input: {
  videoId: string;
  title: string;
  subtitle: string;
  duration: string;
  thumbnail: string;
  playlistId?: string;
}): MeldTrack {
  const subtitle = cleanSubtitle(input.subtitle);
  const parts = subtitle
    .split("•")
    .map((part) => part.trim())
    .filter(
      (part) =>
        part &&
        !/^(Song|Video|Album|Single|EP|Playlist|Artist|Podcast|Episode)$/i.test(
          part
        ) &&
        !/^\d+:\d+$/.test(part) &&
        !/^\d{4}$/.test(part) &&
        !/^\d+(?:[.,]\d+)?[KMB]?\s+(?:views?|plays?|monthly audience|subscribers?|likes?)$/i.test(
          part
        )
    );
  const displaySubtitle = parts.join(" • ");
  return {
    kind: "song",
    id: input.videoId,
    videoId: input.videoId,
    title: input.title || "Unknown track",
    subtitle: displaySubtitle,
    artists: displaySubtitle,
    album: "",
    duration: input.duration || "",
    thumbnail: input.thumbnail || "",
    playlistId: input.playlistId || "",
  };
}

function makeCollection(input: {
  browseId: string;
  title: string;
  subtitle: string;
  thumbnail: string;
  params?: string;
}): MeldCollection {
  const kind = kindFromBrowseId(input.browseId);
  return {
    kind,
    id: input.browseId,
    title: input.title || "YouTube Music",
    subtitle: cleanSubtitle(input.subtitle),
    thumbnail: input.thumbnail || "",
    browseId: input.browseId,
    params: input.params || "",
  };
}

function parseResponsiveItem(renderer: any): MeldItem | null {
  if (!renderer) return null;
  const flexColumns: any[] = Array.isArray(renderer.flexColumns)
    ? renderer.flexColumns
    : [];
  const flexTexts = flexColumns
    .map((column: any) =>
      textOf(column?.musicResponsiveListItemFlexColumnRenderer?.text)
    )
    .filter(Boolean);
  const title = flexTexts[0] || textOf(renderer.title);
  const subtitle = flexTexts.slice(1).join(" • ");
  const fixedColumns: any[] = Array.isArray(renderer.fixedColumns)
    ? renderer.fixedColumns
    : [];
  const durationFromFlex = flexTexts
    .map((text: string) => text.match(/(?:^|\s•\s)(\d{1,2}:\d{2})(?:\s•|$)/))
    .find(Boolean);
  const duration =
    fixedColumns
      .map((column: any) =>
        textOf(column?.musicResponsiveListItemFixedColumnRenderer?.text)
      )
      .find((text: string) => /^\d+:\d+$/.test(text)) ||
    (durationFromFlex ? durationFromFlex[1] : "") ||
    "";
  const watch = watchEndpointOf(renderer);
  const browse = browseEndpointOf(renderer);
  const browseId = browse?.browseId || "";
  const videoId =
    watch?.videoId ||
    renderer?.playlistItemData?.videoId ||
    videoIdFromBrowseId(browseId);
  const thumbnail = bestThumbnail(renderer);

  if (videoId) {
    return makeTrack({
      videoId,
      title,
      subtitle,
      duration,
      thumbnail,
      playlistId: watch?.playlistId || "",
    });
  }
  if (browseId) {
    return makeCollection({
      browseId,
      title,
      subtitle,
      thumbnail,
      params: browse?.params || "",
    });
  }
  return null;
}

function parseTwoRowItem(renderer: any): MeldItem | null {
  if (!renderer) return null;
  const title = textOf(renderer.title);
  const subtitle = textOf(renderer.subtitle);
  const thumbnail = bestThumbnail(renderer);
  const watch = watchEndpointOf(renderer);
  const browse = browseEndpointOf(renderer);
  const browseId = browse?.browseId || "";
  const videoId = watch?.videoId || videoIdFromBrowseId(browseId);

  if (videoId) {
    return makeTrack({
      videoId,
      title,
      subtitle,
      duration: "",
      thumbnail,
      playlistId: watch?.playlistId || "",
    });
  }
  if (browseId) {
    return makeCollection({
      browseId,
      title,
      subtitle,
      thumbnail,
      params: browse?.params || "",
    });
  }
  return null;
}

function parseMultiRowItem(renderer: any): MeldItem | null {
  if (!renderer) return null;
  const title = textOf(renderer.title);
  const subtitle = textOf(renderer.subtitle) || textOf(renderer.secondTitle);
  const thumbnail = bestThumbnail(renderer);
  const watch = watchEndpointOf(renderer);
  const browse = browseEndpointOf(renderer);
  const browseId = browse?.browseId || "";
  const videoId = watch?.videoId || videoIdFromBrowseId(browseId);
  if (videoId) {
    return makeTrack({
      videoId,
      title,
      subtitle,
      duration: "",
      thumbnail,
      playlistId: watch?.playlistId || "",
    });
  }
  if (browseId) {
    return makeCollection({
      browseId,
      title,
      subtitle,
      thumbnail,
      params: browse?.params || "",
    });
  }
  return null;
}

function parseNavigationButton(renderer: any): MeldItem | null {
  if (!renderer) return null;
  const title = textOf(renderer.buttonText);
  const browse = browseEndpointOf(renderer);
  if (!browse?.browseId) return null;
  return makeCollection({
    browseId: browse.browseId,
    title,
    subtitle: "",
    thumbnail: "",
    params: browse.params || "",
  });
}

function parseAnyItem(node: any): MeldItem | null {
  if (!node || typeof node !== "object") return null;
  if (node.musicResponsiveListItemRenderer) {
    return parseResponsiveItem(node.musicResponsiveListItemRenderer);
  }
  if (node.musicTwoRowItemRenderer) {
    return parseTwoRowItem(node.musicTwoRowItemRenderer);
  }
  if (node.musicMultiRowListItemRenderer) {
    return parseMultiRowItem(node.musicMultiRowListItemRenderer);
  }
  if (node.musicNavigationButtonRenderer) {
    return parseNavigationButton(node.musicNavigationButtonRenderer);
  }
  return null;
}

function uniqueItems(items: MeldItem[]): MeldItem[] {
  const seen = new Set<string>();
  const result: MeldItem[] = [];
  for (const item of items) {
    const key = `${item.kind}:${item.id}`;
    if (!item.id || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function parseShelves(root: any): MeldShelf[] {
  const shelves: MeldShelf[] = [];
  const seen = new Set<any>();

  const addShelf = (
    title: string,
    subtitle: string,
    items: MeldItem[],
    header: any
  ) => {
    const unique = uniqueItems(items.filter(Boolean));
    if (!unique.length) return;
    const browse = browseEndpointOf(header);
    shelves.push({
      title: cleanSubtitle(title),
      subtitle: cleanSubtitle(subtitle),
      items: unique,
      browseId: browse?.browseId || "",
      params: browse?.params || "",
    });
  };

  const walk = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);

    if (node.musicCarouselShelfRenderer) {
      const shelf = node.musicCarouselShelfRenderer;
      const header =
        shelf.header?.musicCarouselShelfBasicHeaderRenderer ||
        shelf.header ||
        {};
      addShelf(
        textOf(header.title),
        textOf(header.strapline),
        (shelf.contents || []).map(parseAnyItem).filter(Boolean) as MeldItem[],
        header
      );
      return;
    }

    if (node.musicShelfRenderer) {
      const shelf = node.musicShelfRenderer;
      addShelf(
        textOf(shelf.title),
        textOf(shelf.subtitle),
        (shelf.contents || []).map(parseAnyItem).filter(Boolean) as MeldItem[],
        shelf
      );
      return;
    }

    if (node.gridRenderer) {
      const grid = node.gridRenderer;
      const header = grid.header?.gridHeaderRenderer || grid.header || {};
      addShelf(
        textOf(header.title),
        textOf(header.subtitle),
        (grid.items || []).map(parseAnyItem).filter(Boolean) as MeldItem[],
        header
      );
      return;
    }

    if (node.musicCardShelfRenderer) {
      // The card is rendered separately by the search view.
      return;
    }

    const values = Array.isArray(node) ? node : Object.values(node);
    for (const value of values) walk(value);
  };

  walk(root);
  return shelves.filter((shelf) => shelf.items.length > 0);
}

function mergeShelves(...groups: MeldShelf[][]): MeldShelf[] {
  const result: MeldShelf[] = [];
  const byTitle = new Map<string, MeldShelf>();
  for (const shelves of groups) {
    for (const shelf of shelves) {
      const key = shelf.title.toLowerCase();
      const existing = byTitle.get(key);
      if (!existing) {
        const copy = { ...shelf, items: [...shelf.items] };
        byTitle.set(key, copy);
        result.push(copy);
        continue;
      }
      existing.items = uniqueItems([...existing.items, ...shelf.items]);
      if (!existing.browseId && shelf.browseId) {
        existing.browseId = shelf.browseId;
        existing.params = shelf.params;
      }
    }
  }
  return result;
}

function parseTopCard(card: any): MeldItem | null {
  if (!card) return null;
  const title = textOf(card.title);
  const subtitle = textOf(card.subtitle);
  const browse = browseEndpointOf(card);
  const watch = watchEndpointOf(card);
  const browseId = browse?.browseId || "";
  const videoId = watch?.videoId || videoIdFromBrowseId(browseId);
  const thumbnail = bestThumbnail(card);
  if (videoId) {
    return makeTrack({
      videoId,
      title,
      subtitle,
      duration: "",
      thumbnail,
      playlistId: watch?.playlistId || "",
    });
  }
  if (browseId) {
    return makeCollection({
      browseId,
      title,
      subtitle,
      thumbnail,
      params: browse?.params || "",
    });
  }
  return null;
}

function parseTracksFromContainer(container: any): MeldTrack[] {
  if (!container) return [];
  const contents = container.contents || container.items || [];
  return uniqueItems(
    (Array.isArray(contents) ? contents : [])
      .map(parseAnyItem)
      .filter((item): item is MeldTrack => !!item && item.kind === "song")
  ) as MeldTrack[];
}

function primaryTracks(root: any): MeldTrack[] {
  const playlistShelf =
    findFirst(root, "musicPlaylistShelfRenderer") ||
    findFirst(root, "musicShelfRenderer");
  if (playlistShelf) {
    const direct = parseTracksFromContainer(playlistShelf);
    if (direct.length) return direct;
  }

  // Artist/album pages can return a carousel of top songs instead of a shelf.
  const shelves = parseShelves(root);
  const songShelf = shelves
    .map((shelf) => ({
      shelf,
      tracks: shelf.items.filter(
        (item): item is MeldTrack => item.kind === "song"
      ),
    }))
    .sort((a, b) => b.tracks.length - a.tracks.length)[0];
  return songShelf ? (songShelf.tracks as MeldTrack[]) : [];
}

function parseHeader(root: any): {
  title: string;
  subtitle: string;
  thumbnail: string;
} {
  const headerKeys = [
    "musicDetailHeaderRenderer",
    "musicEditablePlaylistDetailHeaderRenderer",
    "musicVisualHeaderRenderer",
    "musicImmersiveHeaderRenderer",
    "musicResponsiveHeaderRenderer",
  ];
  let header: any = null;
  for (const key of headerKeys) {
    header = findFirst(root, key);
    if (header) break;
  }
  if (!header) {
    return { title: "", subtitle: "", thumbnail: "" };
  }
  return {
    title: textOf(header.title),
    subtitle:
      textOf(header.subtitle) ||
      textOf(header.straplineTextOne) ||
      textOf(header.straplineTextTwo) ||
      textOf(header.description),
    thumbnail: bestThumbnail(header),
  };
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

export async function getMeldHome(
  cookie = "",
  language?: LanguageType
): Promise<MeldHomeResult> {
  const home = await request(
    "browse",
    { browseId: "FEmusic_home" },
    cookie,
    language
  );
  let shelves = parseShelves(home);

  // A signed-out home page only contains the taste builder. Explore still
  // provides real recommendation shelves and works without an account.
  if (!cookie || shelves.length < 4) {
    try {
      const explore = await request(
        "browse",
        { browseId: "FEmusic_explore" },
        cookie,
        language
      );
      shelves = mergeShelves(shelves, parseShelves(explore));
    } catch (error) {
      if (!shelves.length) throw error;
    }
  }

  return { shelves };
}

export async function searchMeld(
  query: string,
  cookie = "",
  language?: LanguageType
): Promise<MeldSearchResult> {
  const root = await request("search", { query }, cookie, language);
  const card = findFirst(root, "musicCardShelfRenderer");
  const top = parseTopCard(card);
  const tracks: MeldTrack[] = [];
  const collections: MeldCollection[] = [];
  const seen = new Set<any>();

  const addItem = (item: MeldItem | null) => {
    if (!item) return;
    if (item.kind === "song") tracks.push(item);
    else collections.push(item);
  };

  const walk = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);
    if (node.musicCardShelfRenderer) {
      const cardContents = node.musicCardShelfRenderer.contents || [];
      for (const content of cardContents) addItem(parseAnyItem(content));
      return;
    }
    if (node.musicResponsiveListItemRenderer) {
      addItem(parseResponsiveItem(node.musicResponsiveListItemRenderer));
      return;
    }
    if (node.musicTwoRowItemRenderer) {
      addItem(parseTwoRowItem(node.musicTwoRowItemRenderer));
      return;
    }
    if (node.musicMultiRowListItemRenderer) {
      addItem(parseMultiRowItem(node.musicMultiRowListItemRenderer));
      return;
    }
    const values = Array.isArray(node) ? node : Object.values(node);
    for (const value of values) walk(value);
  };

  walk(root);

  return {
    top,
    tracks: uniqueItems(tracks) as MeldTrack[],
    collections: uniqueItems(collections) as MeldCollection[],
  };
}

export async function browseMeld(
  browseId: string,
  params = "",
  cookie = "",
  language?: LanguageType
): Promise<MeldBrowseResult> {
  const normalizedId =
    browseId.startsWith("VL") ||
    browseId.startsWith("MPRE") ||
    browseId.startsWith("MPED") ||
    browseId.startsWith("UC") ||
    browseId.startsWith("FEmusic_")
      ? browseId
      : `VL${browseId}`;
  const body: any = { browseId: normalizedId };
  if (params) body.params = params;
  const root = await request("browse", body, cookie, language);
  const header = parseHeader(root);
  const tracks = primaryTracks(root);
  const trackIds = new Set(tracks.map((track) => track.videoId));
  const shelves = parseShelves(root).filter((shelf) => {
    if (!shelf.items.length) return false;
    // Album/artist pages expose their main track list as a song shelf too.
    // The list is rendered by the track view, so keeping the shelf would show
    // every row twice.
    const songItems = shelf.items.filter(
      (item): item is MeldTrack => item.kind === "song"
    );
    if (
      trackIds.size &&
      songItems.length === shelf.items.length &&
      songItems.every((item) => trackIds.has(item.videoId))
    ) {
      return false;
    }
    return true;
  });

  return {
    browseId: normalizedId,
    title: header.title,
    subtitle: header.subtitle,
    thumbnail: header.thumbnail,
    tracks,
    shelves,
  };
}

export async function getMeldLibrary(
  cookie = "",
  language?: LanguageType
): Promise<MeldLibraryResult> {
  if (!cookie) return { shelves: [], requiresLogin: true };
  try {
    const landing = await request(
      "browse",
      { browseId: "FEmusic_library_landing" },
      cookie,
      language
    );
    let shelves = parseShelves(landing);
    if (!shelves.length) {
      const playlists = await request(
        "browse",
        { browseId: "FEmusic_liked_playlists" },
        cookie,
        language
      );
      shelves = parseShelves(playlists);
    }
    return { shelves, requiresLogin: false };
  } catch (error) {
    // An expired cookie should ask for a new session instead of leaving the
    // library in a broken state.
    return { shelves: [], requiresLogin: true };
  }
}

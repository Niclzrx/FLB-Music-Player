import { connectExtraAudioElement } from "@/renderer/components/root/equalizer/equalizer";

/**
 * The player changes the source of its audio element right away. To make the
 * change smooth, a copy of the track being left keeps playing where it was,
 * while the new track starts silent and rises to full volume. Both volumes
 * cross during the same second: a real crossfade, not a fade-out followed by
 * an abrupt start.
 *
 * Only one outgoing copy exists at a time. When the user skips again before
 * the fade ends, the old copy is stopped and the current track becomes the
 * new outgoing stream. That keeps memory and battery use bounded even for
 * long sessions and rapid skipping.
 */

const CROSSFADE_DURATION_MS = 1000;
// The copy is removed even when frames stop being drawn, like when the app
// goes to the background right after a track change.
const HARD_DEADLINE_MARGIN_MS = 700;
// A copy whose file never answers must not stay behind the player forever.
const COPY_START_TIMEOUT_MS = 2600;
// A second skip while the new track is still loading keeps the previous copy
// playing instead of creating a short silent gap.
const RAPID_CHANGE_WINDOW_MS = 500;

let outgoingCopy: HTMLAudioElement | null = null;
let detachOutgoingCopy: (() => void) | null = null;
let fadeAnimation = 0;
let fadeDeadline: ReturnType<typeof setTimeout> | null = null;
let startTimeout: ReturnType<typeof setTimeout> | null = null;
let incomingAudio: HTMLAudioElement | null = null;
let lastChangeAt = 0;

function clearTimers(): void {
  if (fadeAnimation) {
    cancelAnimationFrame(fadeAnimation);
    fadeAnimation = 0;
  }
  if (fadeDeadline) {
    clearTimeout(fadeDeadline);
    fadeDeadline = null;
  }
  if (startTimeout) {
    clearTimeout(startTimeout);
    startTimeout = null;
  }
}

function stopOutgoingCopy(): void {
  clearTimers();
  if (outgoingCopy) {
    outgoingCopy.pause();
    outgoingCopy.removeAttribute("src");
    outgoingCopy.load();
    outgoingCopy.remove();
    outgoingCopy = null;
  }
  if (detachOutgoingCopy) {
    detachOutgoingCopy();
    detachOutgoingCopy = null;
  }
}

function restoreIncomingVolume(): void {
  if (incomingAudio) incomingAudio.volume = 1;
}

function armDeadline(): void {
  if (fadeDeadline) clearTimeout(fadeDeadline);
  fadeDeadline = setTimeout(() => {
    stopOutgoingCopy();
    restoreIncomingVolume();
  }, CROSSFADE_DURATION_MS + HARD_DEADLINE_MARGIN_MS);
}

/**
 * Fades in the new track while the outgoing copy fades out. Call it after the
 * new source has actually started playing.
 */
export function finishCrossfade(playingAudio: HTMLAudioElement | null): void {
  if (!playingAudio) return;
  if (incomingAudio && incomingAudio !== playingAudio) return;

  if (!outgoingCopy) {
    playingAudio.volume = 1;
    incomingAudio = null;
    clearTimers();
    return;
  }

  if (fadeAnimation) cancelAnimationFrame(fadeAnimation);
  const copy = outgoingCopy;
  const outStart = Math.max(0, Math.min(1, copy.volume));
  const inStart = Math.max(0, Math.min(1, playingAudio.volume));
  const startedAt = performance.now();

  const step = () => {
    if (outgoingCopy !== copy || (incomingAudio && incomingAudio !== playingAudio)) return;
    const progress = Math.min((performance.now() - startedAt) / CROSSFADE_DURATION_MS, 1);
    // Equal-power curves keep the perceived loudness stable in the middle.
    const outgoingGain = Math.cos(progress * Math.PI * 0.5);
    const incomingGain = Math.sin(progress * Math.PI * 0.5);
    copy.volume = Math.max(0, Math.min(1, outStart * outgoingGain));
    playingAudio.volume = Math.max(0, Math.min(1, inStart + (1 - inStart) * incomingGain));
    if (progress < 1) {
      fadeAnimation = requestAnimationFrame(step);
      return;
    }
    playingAudio.volume = 1;
    incomingAudio = null;
    stopOutgoingCopy();
  };
  step();
}

/**
 * Stops a running crossfade immediately. Used when the user pauses or when
 * the player is unmounted, so no orphaned copy keeps ringing.
 */
export function cancelCrossfade(playingAudio?: HTMLAudioElement | null): void {
  stopOutgoingCopy();
  if (playingAudio) playingAudio.volume = 1;
  incomingAudio = null;
}

/**
 * Prepares the transition. It still receives the old track in the player
 * element when it is called, so it can leave a copy playing and mute the
 * element before Vue replaces its source.
 */
export function beginCrossfade(playingAudio: HTMLAudioElement | null): void {
  if (!playingAudio) return;
  const now = Date.now();
  const rapidChange = now - lastChangeAt < RAPID_CHANGE_WINDOW_MS;
  lastChangeAt = now;

  const canBeHeard =
    !playingAudio.paused &&
    !playingAudio.ended &&
    !!playingAudio.src &&
    playingAudio.currentTime > 0;

  if (!canBeHeard) {
    // When the previous track is still loading, keep the copy that is already
    // sounding. The next play() will fade it out against the new track.
    if (rapidChange && outgoingCopy && !outgoingCopy.paused) {
      incomingAudio = playingAudio;
      playingAudio.volume = 0;
      armDeadline();
      return;
    }
    stopOutgoingCopy();
    playingAudio.volume = 1;
    incomingAudio = null;
    return;
  }

  stopOutgoingCopy();
  incomingAudio = playingAudio;

  const positionLeftBehind = playingAudio.currentTime;
  const copy = document.createElement("audio");
  copy.preload = "auto";
  copy.src = playingAudio.src;
  copy.volume = Math.max(0, Math.min(1, playingAudio.volume));
  document.body.appendChild(copy);

  outgoingCopy = copy;
  detachOutgoingCopy = connectExtraAudioElement(copy);
  // Mute the real element immediately: the copy takes over the tail of the
  // old track, and the new source starts silent when Vue swaps it.
  playingAudio.volume = 0;

  copy.addEventListener("ended", () => {
    if (outgoingCopy === copy) {
      // The track ended before the fade did. There is no outgoing sound left,
      // so the incoming track must not stay at a partial volume.
      stopOutgoingCopy();
      restoreIncomingVolume();
    }
  });

  const keepPlayingWhereItStopped = () => {
    if (outgoingCopy !== copy) return;
    try {
      copy.currentTime = positionLeftBehind;
    } catch (error) {
      // The file is not ready to be seeked yet; the fade still works.
    }
    const playing = copy.play();
    if (playing && typeof playing.catch === "function") {
      playing.catch(() => {
        if (outgoingCopy === copy) {
          stopOutgoingCopy();
          restoreIncomingVolume();
        }
      });
    }
  };

  if (copy.readyState > 0) {
    keepPlayingWhereItStopped();
  } else {
    copy.addEventListener("loadedmetadata", keepPlayingWhereItStopped, { once: true });
    startTimeout = setTimeout(() => {
      if (outgoingCopy === copy && copy.readyState === 0) {
        stopOutgoingCopy();
        restoreIncomingVolume();
      }
    }, COPY_START_TIMEOUT_MS);
  }

  armDeadline();
}

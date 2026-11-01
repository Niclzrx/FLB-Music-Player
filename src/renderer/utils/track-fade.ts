import { connectExtraAudioElement } from "@/renderer/components/root/equalizer/equalizer";

/**
 * The player loads the new track right away, but the track that is left
 * behind keeps ringing for a moment: a copy of it plays the tail it had
 * left, with the volume going down to zero, so the change is not abrupt.
 *
 * The copy is thrown away as soon as the fade is over. And when the user
 * keeps skipping before the fade is over the fade is ignored: the copy
 * stops ringing right away and every new change becomes an instant one, so
 * the tails of the skipped tracks never pile up behind the music.
 */

const FADE_DURATION_MS = 1000;
// the copy is taken away even when no frame is drawn anymore, like when
// the app goes to the background right when the user skips
const HARD_DEADLINE_MARGIN_MS = 500;
// a copy whose file never answers would stay behind the player forever
const COPY_START_TIMEOUT_MS = 2500;

let fadingCopy: HTMLAudioElement | null = null;
let detachFadingCopy: (() => void) | null = null;
let fadeAnimation = 0;
let fadeDeadline: ReturnType<typeof setTimeout> | null = null;
let lastChangeAt = 0;

/**
 * Takes away the copy of the track that is fading out, if there is one, so
 * it does not keep ringing behind the track that is playing now.
 */
function stopFadingCopy(): void {
  if (fadeAnimation) {
    cancelAnimationFrame(fadeAnimation);
    fadeAnimation = 0;
  }
  if (fadeDeadline) {
    clearTimeout(fadeDeadline);
    fadeDeadline = null;
  }
  if (fadingCopy) {
    fadingCopy.pause();
    fadingCopy.removeAttribute("src");
    fadingCopy.remove();
    fadingCopy = null;
  }
  if (detachFadingCopy) {
    detachFadingCopy();
    detachFadingCopy = null;
  }
}

/**
 * Fades out the track the player is leaving: it keeps playing where it was
 * left, with the volume going down to zero in one second, while the track
 * that takes over plays at full volume from the very first moment.
 *
 * A change that comes faster than the fade ignores it: the copy of the
 * previous change stops ringing and no new copy is made.
 *
 * @param playingAudio the player element, it still holds the track that is
 * being left when this is called
 */
export function fadeOutTrack(playingAudio: HTMLAudioElement): void {
  const now = Date.now();
  const skippingTooFast = now - lastChangeAt < FADE_DURATION_MS;
  lastChangeAt = now;

  // the copy of a previous change stops ringing either way: instantly when
  // the user is skipping fast, or because this fade takes its place
  stopFadingCopy();
  if (skippingTooFast) return;

  // a track that ends by itself, or that cannot be played, is not sounding
  // anymore when the next one is chosen, there is nothing left to fade
  if (!playingAudio || playingAudio.paused || playingAudio.ended) return;
  if (!playingAudio.src || playingAudio.currentTime <= 0) return;

  const positionLeftBehind = playingAudio.currentTime;
  const copy = document.createElement("audio");
  copy.preload = "auto";
  copy.src = playingAudio.src;
  document.body.appendChild(copy);

  fadingCopy = copy;
  detachFadingCopy = connectExtraAudioElement(copy);

  // the fade does not depend on frames only: the app can go to the
  // background right when the user skips, and the frames stop coming
  // while the copy keeps ringing. The end of the copy and a deadline take
  // it away even when no frame is drawn anymore
  copy.addEventListener("ended", () => {
    if (fadingCopy === copy) stopFadingCopy();
  });
  fadeDeadline = setTimeout(() => {
    if (fadingCopy === copy) stopFadingCopy();
  }, FADE_DURATION_MS + HARD_DEADLINE_MARGIN_MS);

  const lowerTheVolumeUntilItGoesAway = () => {
    const fadeStartedAt = performance.now();
    const step = () => {
      // a later change took the place of this copy, its fade is the one
      // that goes on
      if (fadingCopy !== copy) return;
      const progress = Math.min(
        (performance.now() - fadeStartedAt) / FADE_DURATION_MS,
        1
      );
      copy.volume = Math.max(0, 1 - progress);
      if (progress < 1) {
        fadeAnimation = requestAnimationFrame(step);
        return;
      }
      stopFadingCopy();
    };
    step();
  };

  // the copy keeps playing where the track was left. The file was sounding
  // a moment ago, so it comes from the cache most of the times and the copy
  // starts on the spot
  const keepPlayingWhereItStopped = () => {
    if (fadingCopy !== copy) return;
    try {
      copy.currentTime = positionLeftBehind;
    } catch (error) {
      // the file is not ready to be seeked yet, the fade goes on anyway
    }
    const playing = copy.play();
    if (playing && typeof playing.catch === "function") {
      playing.catch(() => {
        // only this copy goes away, the copy of a later change must stay
        if (fadingCopy === copy) stopFadingCopy();
      });
    }
    lowerTheVolumeUntilItGoesAway();
  };

  if (copy.readyState > 0) {
    keepPlayingWhereItStopped();
    return;
  }
  copy.addEventListener("loadedmetadata", keepPlayingWhereItStopped, {
    once: true,
  });
  setTimeout(() => {
    if (fadingCopy === copy && !fadeAnimation) stopFadingCopy();
  }, COPY_START_TIMEOUT_MS);
}

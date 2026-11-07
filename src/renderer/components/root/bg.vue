<template>
  <div :class="['bg', { 'bgFixed': isFixedWallpaper }]">
    <div
      v-if="isFixedWallpaper"
      class="bgFixedImage"
      :style="{ backgroundImage: `url(${wallpaperImage})` }"
    />
    <img
      v-else
      id="bg_fancy"
      :src="albumArt"
    >
  </div>
</template>

<script>
/* eslint-disable */
import { toFileUrl } from '@/renderer/utils';
const defaultCover = require('@img/flbdefault-cover.png');
/* eslint-disable */
export default {
  name: 'Bg',

  computed: {
    playingTrack() {
      return this.$store.state.PlaybackManger.playingTrackInfo.track;
    },
    settings() {
      return this.$store.state.SettingsManager.settings;
    },
    theme() {
      return this.settings.theme;
    },
    wallpaperImage() {
      return this.settings.wallpaperImage || '';
    },
    isFixedWallpaper() {
      return this.settings.wallpaperMode === 'fixed' && !!this.wallpaperImage;
    },
    albumArt() {
      if (this.playingTrack?.albumArt) {
        return toFileUrl(this.playingTrack.albumArt);
      }
      return defaultCover;
    }
  }
};
</script>

<style lang="scss">
.bg {
  pointer-events: none;
  position: fixed;
  top: 0%;
  left: 0;
  width: 120%;
  height: 100vh;
  height: 100dvh;
  .hideImage {
    border-radius: 50% !important;
    height: 0% !important;
    width: 0% !important;
  }
  #bg_fancy {
    border-radius: 0%;
    position: fixed;
    top: 0%;
    width: 100%;
    height: 100%;
    filter: blur(50px);
    opacity: 0.3;
  }
  &.bgFixed {
    width: 100vw;
    height: 100dvh;
  }
  .bgFixedImage {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100dvh;
    background-position: center;
    background-repeat: no-repeat;
    background-size: cover;
    opacity: 0.58;
    filter: brightness(0.78) saturate(1.06);
    transform: scale(1.01);
  }
  &.bgFixed::after {
    content: "";
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.22);
    background: color-mix(in srgb, var(--appBackground) 24%, transparent);
  }
}
</style>

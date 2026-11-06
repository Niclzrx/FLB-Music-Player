<template>
  <div
    class="playingPane bg2"
    :class="{ 'mobilePlayerDragging': mobileDragActive, 'mobilePlayerExpandPreviewing': isMobile && !mobileFullPlayer && mobileExpandProgress > 0 }"
    :style="mobilePlayerDragStyle"
    @click="closeMobileMenu"
  >
    <div
      v-if="isMobile && (mobileExpandProgress > 0 || mobilePreviewHold)"
      class="mobilePlayerExpandPreview"
      :style="{ '--mobile-preview-progress': mobileExpandProgress }"
      aria-hidden="true"
    >
      <img class="mobilePlayerPreviewBackdrop" :src="albumArt" alt="" />
      <div class="mobilePlayerPreviewCover">
        <img :src="albumArt" alt="" />
      </div>
      <div class="mobilePlayerPreviewInfo">
        <p>{{ playingTrack.defaultTitle }}</p>
        <span>{{ playingTrack.defaultArtist }}</span>
      </div>
    </div>
    <button
      v-if="isMobile && !mobileFullPlayer"
      class="mobilePlayerHandle"
      :class="{ 'is-dragging': mobileDragActive }"
      type="button"
      :aria-label="t('player.expand')"
      :title="t('player.expand')"
      @pointerdown="startMobilePlayerDrag"
      @pointermove="moveMobilePlayerDrag"
      @pointerup="endMobilePlayerDrag"
      @pointercancel="cancelMobilePlayerDrag"
      @click.stop="handleMobileHandleClick"
    >
      <span />
    </button>
    <template v-if="isMobile && mobileFullPlayer && !playingPaneExpanded">
      <button
        id="mobilePlayerOptions"
        class="mobilePlayerTopButton"
        type="button"
        :aria-label="t('player.options')"
        :title="t('player.options')"
        @click.stop="toggleMobileMenu"
      >
        <base-icon icon="dots-three" :size="24" />
      </button>
      <button
        id="mobilePlayerCollapse"
        class="mobilePlayerTopButton"
        type="button"
        :aria-label="t('player.collapse')"
        :title="t('player.collapse')"
        @click.stop="togglePlayerMode"
      >
        <base-icon icon="caret-down" :size="24" />
      </button>
      <transition
        enter-active-class="animated fadeIn faster"
        leave-active-class="animated fadeOut faster"
      >
        <div v-if="mobileMenuOpen" class="mobilePlayerMenu" @click.stop>
          <button type="button" @click.stop="runMobilePlayerAction('favorite')">
            <base-icon icon="heart" :size="19" :weight="isInFavorites ? 'fill' : 'regular'" />
            <span>{{ isInFavorites ? t('player.unfavorite') : t('player.favorite') }}</span>
          </button>
          <button type="button" @click.stop="runMobilePlayerAction('playlist')">
            <base-icon icon="playlist" :size="19" />
            <span>{{ t('player.playlist') }}</span>
          </button>
          <button type="button" @click.stop="runMobilePlayerAction('equalizer')">
            <base-icon icon="faders" :size="19" />
            <span>{{ t('player.equalizer') }}</span>
          </button>
          <button v-if="playingTrackLyrics" type="button" @click.stop="runMobilePlayerAction('lyrics')">
            <base-icon icon="microphone" :size="19" />
            <span>{{ t('player.lyrics') }}</span>
          </button>
          <button type="button" @click.stop="runMobilePlayerAction('queue')">
            <base-icon icon="queue" :size="19" />
            <span>{{ t('player.queue') }}</span>
          </button>
          <button type="button" @click.stop="runMobilePlayerAction('artist')">
            <base-icon icon="user" :size="19" />
            <span>{{ t('player.goToArtist') }}</span>
          </button>
        </div>
      </transition>
    </template>

    <div class="flex split">
      <div class="left_pane_section">
        <album-art-wrapper
          :album-art="albumArt"
          @togglePlayerMode="togglePlayerMode"
        />
        <img class="album_art_blurred" :src="albumArt" />

        <div class="track_info" @click="handleTrackInfoTap">
          <p class="track_title">
            {{ playingTrack.defaultTitle }}
          </p>
          <p
            :title="t('player.goToArtist')"
            class="track_artist"
            @click.stop="handleArtistTap"
          >
            {{ playingTrack.defaultArtist }}
          </p>
          <span v-if="isMobile" class="mobilePlayerTimer">
            {{ mobileCurrentTime }}
          </span>
        </div>
      </div>
      <div class="center_pane_section">
        <div class="flex center-v gap20 t_actions">
          <base-button
            id="shuffle_bt"
            icon="shuffle"
            :active="audioState.shuffle"
            :small="true"
            @click.native="shuffler"
          />
          <base-button
            id="prev_bt"
            icon="skip-back"
            :small="true"
            @click.native="determineNextTrack('prev')"
          />
          <div id="toggle_play" @click="toggleIsPlaying">
            <base-button
              v-if="!audioState.playing"
              id="play_bt"
              icon="play"
              :icon-size="23"
              @click="toggleIsPlaying"
            />
            <base-button
              v-if="audioState.playing"
              id="pause_bt"
              icon="pause"
              :icon-size="23"
              @click="toggleIsPlaying"
            />
          </div>

          <base-button
            id="next_bt"
            icon="skip-forward"
            extra-class="scale_icon"
            :small="true"
            @click.native="determineNextTrack('next')"
          />

          <base-button
            id="repeat_bt"
            icon="repeat"
            :active="audioState.repeat"
            :small="true"
            @click.native="changeRepeat"
          />
        </div>
        <track-bar />
      </div>
    </div>

    <div class="right_pane_section gap10">
      <div class="flex center-v gap20">
        <base-button
          icon="heart"
          :active="isInFavorites"
          :small="true"
          @click.native="toggleFromFavorites"
        />
        <base-button
          :small="true"
          icon="playlist"
          :active="showPlaylistWidget"
          :title="t('player.playlist')"
          @click.native="showPlaylistAdder"
        />
        <base-button
          :small="true"
          icon="faders"
          :active="showEqualizerWidget"
          :title="t('player.equalizer')"
          @click.native="UIcontrollerToggleProperty('showEqualizerWidget')"
        />
        <base-button
          id="miniMode_bt"
          :small="true"
          icon="crop"
          :active="miniMode"
          :title="t('player.miniMode')"
          @click.native="toggleMiniMode"
        />
      </div>
      <volume-rocker />
    </div>

    <transition
      enter-active-class="animated fadeInUp extrafaster"
      leave-active-class="animated fadeOutDown extrafaster"
    >
      <equalizer v-show="showEqualizerWidget" />
    </transition>
    <base-button
      v-if="playingTrackLyrics"
      id="lyrics_bt"
      icon="microphone"
      :active="showLyrics"
      :title="t('player.lyrics')"
      @click.native="showLyrics = !showLyrics"
    />
    <transition enter-active-class="animated fadeInUp faster">
      <div
        v-if="playingPaneExpanded && !showLyrics"
        class="que_wrappers round15"
      >
        <button
          v-if="isMobile"
          class="mobilePanelClose"
          type="button"
          :aria-label="t('player.close')"
          :title="t('player.close')"
          @click.stop="closeMobilePanel"
        >
          <base-icon icon="x" :size="20" />
        </button>
        <h1>{{ t('player.queue') }}</h1>
        <div class="toggle_queue" />
        <queued-tracks />
      </div>
      <div v-if="playingPaneExpanded && showLyrics" class="lyrics_wrappers">
        <button
          v-if="isMobile"
          class="mobilePanelClose"
          type="button"
          :aria-label="t('player.close')"
          :title="t('player.close')"
          @click.stop="closeMobilePanel"
        >
          <base-icon icon="x" :size="20" />
        </button>
        <h1>{{ t('player.lyrics') }}</h1>
        <lyrics />
      </div>
    </transition>
  </div>
</template>

<script>
import { mapActions, mapMutations } from "vuex";
import { isMobileApp } from "@/platform/ipc";
import { setMobileMediaActionHandler } from "@/platform/mobile-ipc";
import { sendMessageToNode, toFileUrl } from "@/renderer/utils";
import { initializeAudio } from "../equalizer/equalizer";
/* eslint-disable */
const defaultCover = require("@img/flbdefault-cover.png");
/* eslint-disable */
export default {
  name: "PlayingPane",

  data() {
    return {
      elements: ["songName", "artistName", "albumName"],
      repeat: false,
      shuffle: false,
      possibleThumbnails: [],
      selectedCover: "",
      volume: 1,
      isOnline: false,
      playingPaneExpanded: false,
      showLyrics: false,
      mobileFullPlayer: false,
      mobileMenuOpen: false,
      mobileCurrentTime: "0:00",
      mobileClockAudio: null,
      mobileClockHandler: null,
      mobileDragStartY: null,
      mobileDragDistance: 0,
      mobileDragActive: false,
      mobileExpandProgress: 0,
      mobilePreviewHold: false,
      mobileMenuBlockedUntil: 0,
      suppressMobileHandleClick: false,
      mobileMediaActionUnsubscribe: null,
    };
  },
  computed: {
    mobilePlayerDragStyle() {
      const progress = this.mobileFullPlayer ? 0 : this.mobileExpandProgress;
      return {
        "--mobile-expand-progress": progress,
        "--mobile-player-drag-y": this.mobileDragActive ? `${this.mobileDragDistance}px` : "0px",
        "--mobile-compact-opacity": String(1 - Math.min(progress * 1.35, 1)),
      };
    },
    playingTrack() {
      return this.$store.state.PlaybackManger.playingTrackInfo.track;
    },
    audioState() {
      return this.$store.state.PlaybackManger.audioState;
    },
    showPlaylistWidget() {
      return this.$store.state.UIController.UIProperties.showPlaylistWidget;
    },
    showEqualizerWidget() {
      return this.$store.state.UIController.UIProperties.showEqualizerWidget;
    },
    isInFavorites() {
      return this.$store.state.TabsManager.tabsData.playlists[0].tracks.some(
        (track) => track.fileLocation === this.playingTrack.fileLocation
      );
    },
    miniMode() {
      return this.$store.state.UIController.UIProperties.miniMode;
    },
    isMobile() {
      return isMobileApp;
    },
    playingTrackLyrics() {
      return (
        this.$store.state.PlaybackManger.allLyrics.filter(
          (trackLyricInfo) =>
            trackLyricInfo.trackName === this.playingTrack.defaultTitle
        )[0]?.lyrics || false
      );
    },
    albumArt() {
      const playingTrackAlbumArt =
        this.$store.state.PlaybackManger.playingTrackInfo.track.albumArt;
      if (playingTrackAlbumArt) {
        return toFileUrl(playingTrackAlbumArt);
      }
      return defaultCover;
    },
  },
  watch: {
    playingTrack() {
      this.showLyrics = false;
      // the lyrics of the new track are searched online, like the covers
      this.getLyrics();
    },
    mobileFullPlayer(fullPlayer) {
      if (fullPlayer) {
        // Never carry the options menu into the expanded player.
        this.mobileMenuOpen = false;
        this.mobileMenuBlockedUntil = Date.now() + 350;
      }
    },
  },
  methods: {
    ...mapMutations([
      "pushNotification",
      "addToSelectedTracks",
      "addSelectedTracksToPlaylist",
      "deleteSelectedTrackFromPlaylist",
      "UIcontrollerToggleProperty",
      "UIcontrollerSetPropertyValue",
      "setSettingValue",
      "clearSelectedTracks",
    ]),
    ...mapActions([
      "toggleRepeat",
      "toggleShuffler",
      "toggleIsPlaying",
      "determineNextTrack",
      "findAndGoToArtist",
      "getLyrics",
    ]),
    resetMobilePlayerDrag() {
      this.mobileDragStartY = null;
      this.mobileDragDistance = 0;
      this.mobileDragActive = false;
    },
    startMobilePlayerDrag(event) {
      if (!this.isMobile || this.mobileFullPlayer) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      this.mobileDragStartY = event.clientY;
      this.mobileDragDistance = 0;
      this.mobileDragActive = false;
      this.mobileExpandProgress = 0;
      this.mobilePreviewHold = false;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch (error) {
        // Older WebViews may not support pointer capture.
      }
    },
    moveMobilePlayerDrag(event) {
      if (this.mobileDragStartY === null) return;
      const distance = event.clientY - this.mobileDragStartY;
      if (distance < -6) {
        this.mobileDragActive = true;
        this.mobileDragDistance = Math.max(distance, -190);
        // The full player grows progressively with the gesture instead of
        // appearing only when the finger is released.
        this.mobileExpandProgress = Math.min(Math.abs(this.mobileDragDistance) / 150, 1);
        if (event.cancelable) event.preventDefault();
      }
    },
    endMobilePlayerDrag() {
      if (this.mobileDragStartY === null) return;
      const wasDragging = this.mobileDragActive;
      const shouldExpand = wasDragging && this.mobileDragDistance <= -54;
      this.resetMobilePlayerDrag();
      if (wasDragging) {
        // The browser can fire a click after the pointer gesture; ignore it.
        this.suppressMobileHandleClick = true;
        this.mobileMenuBlockedUntil = Date.now() + 500;
        setTimeout(() => {
          this.suppressMobileHandleClick = false;
        }, 350);
      }
      if (shouldExpand) {
        this.mobilePreviewHold = true;
        this.togglePlayerMode();
        // The real full player is already mounted underneath. Fade the preview
        // instead of removing it, so the cover and title hand off seamlessly.
        requestAnimationFrame(() => {
          this.mobileExpandProgress = 0;
          setTimeout(() => {
            this.mobilePreviewHold = false;
          }, 240);
        });
      } else {
        this.mobileExpandProgress = 0;
      }
    },
    cancelMobilePlayerDrag() {
      this.resetMobilePlayerDrag();
      this.mobileExpandProgress = 0;
      this.mobilePreviewHold = false;
    },
    handleMobileHandleClick() {
      if (this.suppressMobileHandleClick || Date.now() < this.mobileMenuBlockedUntil) return;
      this.togglePlayerMode();
    },
    toggleMobileMenu() {
      if (Date.now() < this.mobileMenuBlockedUntil) return;
      this.mobileMenuOpen = !this.mobileMenuOpen;
    },
    handleMobileMediaAction(action) {
      if (action === "toggle") this.toggleIsPlaying();
      else if (action === "play") {
        if (!this.audioState.playing) this.toggleIsPlaying();
      } else if (action === "pause") {
        if (this.audioState.playing) this.toggleIsPlaying();
      } else if (action === "next") this.determineNextTrack("next");
      else if (action === "previous") this.determineNextTrack("prev");
    },
    togglePlayerMode() {
      this.resetMobilePlayerDrag();
      document.body.classList.toggle("fullScreenPlayingPane");
      const fullPlayer = document.body.classList.contains("fullScreenPlayingPane");
      this.mobileMenuOpen = false;
      if (this.isMobile) {
        // Expanding the mobile player shows only the player. The queue and
        // lyrics are opened explicitly from the options menu.
        this.mobileFullPlayer = fullPlayer;
        if (!fullPlayer) {
          this.mobileExpandProgress = 0;
          this.mobilePreviewHold = false;
        }
        this.playingPaneExpanded = false;
        this.showLyrics = false;
        return;
      }
      this.playingPaneExpanded = !this.playingPaneExpanded;
      this.UIcontrollerSetPropertyValue({
        property: "currentSidePaneTab",
        newValue: "Info",
      });
    },
    toggleMiniMode() {
      sendMessageToNode("toggleMiniMode", !this.miniMode);
      this.UIcontrollerToggleProperty("miniMode");
      document.body.classList.remove("fullScreenPlayingPane");
      this.resetMobilePlayerDrag();
      this.mobileFullPlayer = false;
      this.playingPaneExpanded = false;
    },
    handleTrackInfoTap() {
      if (!this.isMobile) return;
      if (this.mobileMenuOpen) {
        this.mobileMenuOpen = false;
        return;
      }
      this.togglePlayerMode();
    },
    handleArtistTap() {
      if (this.isMobile && this.mobileFullPlayer) this.collapseMobilePlayer();
      this.goToArtist(this.playingTrack.defaultArtist);
    },
    closeMobileMenu() {
      if (this.mobileMenuOpen) this.mobileMenuOpen = false;
    },
    /**
     * Android back priority inside the player: options/queue/lyrics first,
     * then the expanded player. Returns true when the event was consumed.
     */
    handleAndroidBack() {
      if (!this.isMobile) return false;
      if (this.mobileMenuOpen) {
        this.mobileMenuOpen = false;
        return true;
      }
      if (this.playingPaneExpanded || this.showLyrics) {
        this.closeMobilePanel();
        return true;
      }
      if (this.mobileFullPlayer || document.body.classList.contains("fullScreenPlayingPane")) {
        this.collapseMobilePlayer();
        return true;
      }
      return false;
    },
    collapseMobilePlayer() {
      document.body.classList.remove("fullScreenPlayingPane");
      this.resetMobilePlayerDrag();
      this.mobileFullPlayer = false;
      this.mobileMenuOpen = false;
      this.mobileExpandProgress = 0;
      this.mobilePreviewHold = false;
      this.playingPaneExpanded = false;
      this.showLyrics = false;
    },
    closeMobilePanel() {
      this.playingPaneExpanded = false;
      this.showLyrics = false;
    },
    runMobilePlayerAction(action) {
      this.mobileMenuOpen = false;
      if (action === "favorite") this.toggleFromFavorites();
      else if (action === "playlist") {
        // The playlist picker belongs to the library view and cannot be on top
        // of the full player, so return to the compact player first.
        this.collapseMobilePlayer();
        this.showPlaylistAdder();
      } else if (action === "equalizer") this.UIcontrollerToggleProperty("showEqualizerWidget");
      else if (action === "lyrics") {
        this.playingPaneExpanded = true;
        this.showLyrics = true;
      } else if (action === "queue") {
        this.playingPaneExpanded = true;
        this.showLyrics = false;
      } else if (action === "artist") {
        this.collapseMobilePlayer();
        this.goToArtist();
      }
    },
    formatMobileTime(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
      const minutes = Math.floor(seconds / 60);
      const rest = Math.floor(seconds % 60);
      return `${minutes}:${rest < 10 ? "0" : ""}${rest}`;
    },
    bindMobileClock() {
      const audio = document.querySelector("#audioTag");
      if (!audio) return;
      this.mobileClockAudio = audio;
      this.mobileClockHandler = () => {
        this.mobileCurrentTime = this.formatMobileTime(audio.currentTime || 0);
      };
      audio.addEventListener("timeupdate", this.mobileClockHandler);
      audio.addEventListener("loadedmetadata", this.mobileClockHandler);
      this.mobileClockHandler();
    },
    goToArtist() {
      document.querySelector("#Artists").click();
      this.findAndGoToArtist(this.playingTrack.defaultArtist);
    },
    shuffler() {
      this.toggleShuffler();
      const state = this.audioState.shuffle ? "On" : "Off";
      this.pushNotification({
        title: this.t(state === 'On' ? 'player.shuffleOn' : 'player.shuffleOff'),
        subTitle: null,
        type: "normal",
      });
    },
    showPlaylistAdder() {
      this.addToSelectedTracks(this.playingTrack);
      if (!this.showPlaylistWidget) {
        this.UIcontrollerToggleProperty("showPlaylistWidget");
      }
    },
    toggleFromFavorites() {
      this.addToSelectedTracks(this.playingTrack);
      if (this.isInFavorites) {
        this.deleteSelectedTrackFromPlaylist(this.playingTrack);
        this.pushNotification({
          title: this.t('player.removedFromFavorites'),
          subTitle: `${this.playingTrack.defaultTitle}`,
          type: "danger",
        });
      } else {
        this.addSelectedTracksToPlaylist("Favorites");
        this.pushNotification({
          title: this.t('player.addedToFavorites'),
          subTitle: `${this.playingTrack.defaultTitle}`,
          type: "normal",
        });
      }
    },
    changeRepeat() {
      this.toggleRepeat();
      const state = this.audioState.repeat ? "On" : "Off";
      this.pushNotification({
        title: this.t(state === 'On' ? 'player.repeatOn' : 'player.repeatOff'),
        subTitle: null,
        type: "normal",
      });
    },
  },
  mounted() {
    initializeAudio()
    this.bindMobileClock();
    this.mobileFullPlayer = document.body.classList.contains("fullScreenPlayingPane");
    // the lyrics of the track that was restored with the app
    this.getLyrics();
    window.addEventListener("keydown", (e) => {
      if (!document.activeElement.classList.contains("inputElem")) {
        if (e.code === "Space") {
          e.preventDefault();
          document.querySelector("#toggle_play").click();
          return;
        }
        if (e.code === "ArrowLeft") {
          this.determineNextTrack("prev");
          return;
        }
        if (e.code === "ArrowRight") {
          this.determineNextTrack("next");
          return;
        }
        if (e.code === "Tab") {
          e.preventDefault();
          document.querySelector("#search").focus();
        }
      }
    });
    document.querySelector("body").classList.add("playingPaneLoaded");
    if (this.isMobile) {
      this.mobileMediaActionUnsubscribe = setMobileMediaActionHandler((action) =>
        this.handleMobileMediaAction(action)
      );
    }

    const actionHandlers = [
      [
        "play",
        () => {
          if (!this.audioState.playing) this.toggleIsPlaying();
        },
      ],
      [
        "pause",
        () => {
          if (this.audioState.playing) this.toggleIsPlaying();
        },
      ],
      [
        "previoustrack",
        () => {
          this.determineNextTrack("prev");
        },
      ],
      [
        "nexttrack",
        () => {
          this.determineNextTrack("next");
        },
      ],
    ];
    for (const [action, handler] of actionHandlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch (error) {
        console.log(
          `The media session action "${action}" is not supported yet.`
        );
      }
    }
  },
  beforeDestroy() {
    if (this.mobileClockAudio && this.mobileClockHandler) {
      this.mobileClockAudio.removeEventListener("timeupdate", this.mobileClockHandler);
      this.mobileClockAudio.removeEventListener("loadedmetadata", this.mobileClockHandler);
    }
    if (this.mobileMediaActionUnsubscribe) {
      this.mobileMediaActionUnsubscribe();
      this.mobileMediaActionUnsubscribe = null;
    }
    // Never leave the shell stuck in full-player mode without a player.
    if (this.isMobile) {
      this.resetMobilePlayerDrag();
      document.body.classList.remove("fullScreenPlayingPane");
    }
  },
};
</script>

<style lang="scss">
.playingPane {
  width: 100%;
  z-index: 20;
  border-radius: 20px;
  display: flex;
  justify-content: space-between;
  height: 100px;
  transition: none;
  .split {
    width: 80%;
  }
}
.album_art_blurred {
  position: absolute;
  left: 10px;
  z-index: -1;
  height: 94vh;
  width: 98.5vw;
  top: 40px;
  opacity: 1;
  filter: blur(60px);
  display: none;
}
.left_pane_section {
  padding: 10px;
  display: flex;
  gap: 10px;
  align-items: center;
  width: 25%;
  transition: none;
}
.track_info {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  transition: none;

  .track_title,
  .track_artist {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 0.95rem;
    font-family: inherit;
    max-width: 13vw;
    transition: none;
  }
  .track_title {
    font-size: 0.9rem;
    font-family: inherit;
  }
  .track_artist {
    font-size: 0.8rem;
    font-family: inherit;
    cursor: pointer;
    &:hover {
      text-decoration: underline;
    }
  }
}

.center_pane_section {
  width: 60%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 10px;
  transition: none;
  #toggle_play {
    button {
      width: 45px;
      height: 45px;
    }
  }
}
.right_pane_section {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 20%;
  transition: none;
}
.scale_icon {
  img {
    transition: none;

    transform: scale(1.5);
  }
}
.t_actions {
  transition: none;
}

#lyrics_bt {
  position: absolute;
  top: 20px;
  left: 61%;
  backdrop-filter: blur(30px);
  display: none;
}

.fullScreenPlayingPane {
  .playingPane {
    position: fixed;
    z-index: 30;
    height: 93.5vh;
    width: 98.5vw;
    bottom: 10px;
    background: black;
    overflow: hidden;
  }
  .album_art_blurred {
    display: block;
    opacity: 0.4;
  }
  .left_pane_section {
    left: 20px;
    top: 20px;
    position: absolute;
    width: 100%;
    height: 80%;
    flex-direction: column;
    justify-content: space-between;
    align-items: flex-start;
    .album_art_wrapper {
      position: fixed;
      bottom: 300px;
      left: 50%;
      transform: translateX(-50%);
      width: 27vw;
      height: 27vw;
    }
    .track_info {
      position: fixed;
      bottom: 115px;
      left: 50%;
      transform: translateX(-50%);
      height: 150px;
      .track_title {
        font-size: 4rem;
        max-width: 40vw;
        text-align: center;
      }
      .track_artist {
        font-size: 3rem;
        max-width: 40vw;
        pointer-events: none;
        text-align: center;
      }
    }
  }
  .center_pane_section {
    margin-left: 20px;
    width: 98%;
    justify-content: flex-end;
    .TrackBar {
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      width: 80%;
    }
    .t_actions {
      position: absolute;
      bottom: 40px;
      left: 50%;
      transform: translateX(-50%);
      button {
        width: 40px;
        height: 40px;
      }
      #toggle_play {
        button {
          width: 50px;
          height: 50px;
        }
      }
    }
  }
  .right_pane_section {
    position: absolute;
    left: -50px;
    top: 40%;
    justify-content: flex-end;
    transform: rotate(-90deg);
    z-index: 20;
    .VolumeRocker {
      //transform: rotateX(180deg) translateY(72px) translateX(0px);
      position: absolute;
      left: 20px;
      bottom: 45px;
      svg {
        transform: rotate(90deg);
      }
    }
    button {
      transform: rotate(90deg);
      backdrop-filter: blur(20px);
    }
  }
  #lyrics_bt {
    display: block;
  }
}
.que_wrappers {
  position: absolute;
  top: 10px;
  right: 10px;
  height: 85%;
  width: 280px;
  padding: 10px;
  padding-top: 5px;
  // overflow: hidden;
  .toggle_queue {
    position: absolute;
    top: 50%;
    left: 0%;
  }
  h1 {
    text-align: center;
    margin-bottom: 5px;
  }
  .QueuedTracks {
    width: 97%;
    .centerContents {
      display: none;
    }
    .QueuedTracksWrapper {
      padding-top: 0px;
    }
    .queue-actions {
      padding: 15px;
      bottom: -5px;
    }
  }
}

.playingPane {
  .lyrics_wrappers {
    h1 {
      text-align: center;
    }
    position: absolute;
    right: 10px;
    top: 10px;
    height: 85%;
    width: 22%;
  }
}

.miniMode {
  .playingPane {
    position: fixed;
    top: 0px;
    left: 0px;
    height: 100vh;
    width: 100vw;
    border-radius: 0px;
    background: none;
  }
  .album_art_wrapper {
    position: absolute;
    width: 90%;
    height: 200px;
    left: 50.5%;
    top: 15px;
    transform: translateX(-50%);
  }
  .album_art_blurred {
    display: block;
  }
  .track_info {
    position: fixed;
    left: 15px;
    bottom: 10px;
    height: 15%;
    .track_title,
    .track_artist {
      max-width: 70vw;
    }
  }
  .TrackBar {
    position: absolute;
    left: 46%;
    transform: translateX(-50%);
    width: 82%;
    bottom: 30px;
  }
  .center_pane_section {
    backdrop-filter: blur(10px);
    background: rgba(0, 0, 0, 0.226);
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    transition: 0.2s ease-in-out;
  }
  &:hover {
    .center_pane_section,
    .VolumeRocker,
    #miniMode_bt {
      opacity: 1;
    }
  }
  .right_pane_section button {
    display: none;
  }
  .VolumeRocker {
    position: fixed;
    top: 20px;
    left: 20px;
    padding: 10px;
    width: 15px;
    height: 15px;
    backdrop-filter: blur(40px);
    opacity: 0;
    &:hover {
      width: 140px;
      .base_slider_progress {
        height: 80%;
      }
      // height: 8px;
    }
  }
  button {
    backdrop-filter: blur(20px);
  }
  #toggle_play button {
    position: fixed;
    left: 48%;
    top: 50%;
    transform: translateX(-50%) translateY(-50%);
    transition: 0.1s ease-in-out;
  }
  #next_bt {
    position: fixed;
    right: 12px;
    top: 50%;
    transform: translateX(-50%) translateY(-50%);
  }
  #prev_bt {
    position: fixed;
    left: 38px;
    top: 50.5%;
    transform: translateX(-50%) translateY(-50%);
  }
  #shuffle_bt {
    position: fixed;
    top: 20px;
    left: 80px;
  }
  #repeat_bt {
    position: fixed;
    top: 20px;
    right: 90px;
  }

  #miniMode_bt {
    display: block;
    position: fixed;
    top: 20px;
    right: 10px;
    // transform: scale(0.75);
    opacity: 0;
  }
}
</style>

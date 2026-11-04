<template>
  <div
    id="app"
    :class="[
      accentColor,
      theme + '_theme',
      miniMode ? 'miniMode' : '',
      isMobile ? 'mobileMode' : '',
    ]"
    @click="cleanUp"
  >
    <custom-title-bar v-if="!isMobile" class="mb5" />
    <ipc-listener />
    <transition
      enter-active-class="animated slideInUp extrafaster"
      leave-active-class="animated slideOutDown extrafaster"
    >
      <settings v-if="showSettings" />
    </transition>
    <on-board v-if="showOnboard" @closeOnBoard="showOnboard = false" />
    <notifications />
    <section id="main-view" class="flex flex-col h-100">
      <div v-if="!miniMode && !partyPage" id="sub-view-1" class="flex h-100">
        <side-nav />
        <router-view />
      </div>
      <!-- The party takes over the whole page, with the rules of the mode -->
      <party-view v-if="!miniMode && partyPage" class="h-100" />
    </section>
    <nav v-if="isMobile" class="mobileBottomNav" aria-label="Primary navigation">
      <button :class="{ active: currentPage === 'My Music' }" @click="goToPage('My Music')">
        <img src="@icon/music.svg" alt="" />
        <span>{{ t('mobile.home') }}</span>
      </button>
      <button :class="{ active: currentPage === 'FLBing' }" @click="goToPage('FLBing')">
        <img src="@icon/meld.svg" alt="" />
        <span>{{ t('mobile.discover') }}</span>
      </button>
      <button :class="{ active: currentPage === 'Party' }" @click="goToPage('Party')">
        <img src="@icon/party.svg" alt="" />
        <span>{{ t('mobile.party') }}</span>
      </button>
      <button :class="{ active: showSettings }" @click="UIcontrollerToggleProperty('showSettings')">
        <img src="@icon/settings.svg" alt="" />
        <span>{{ t('mobile.settings') }}</span>
      </button>
    </nav>
    <playing-pane
      class="mb5 mt5"
      v-if="playingTrack && !guestInParty"
      @fullPlayer="reactToFullPlayer"
    />
    <bg v-if="theme === 'fancy'" />
  </div>
</template>
<script>
import { isMobileApp } from '@/platform/ipc';
export default {
  name: "App",
  data() {
    return {
      showOnboard: !(isMobileApp && localStorage.getItem('flb-mobile-onboard-complete') === 'true'),
      fullPlayer: false,
    };
  },
  computed: {
    theme() {
      return this.$store.state.SettingsManager.settings.theme;
    },
    playingTrack() {
      return this.$store.state.PlaybackManger.playingTrackInfo.track;
    },
    showSettings() {
      return this.$store.state.UIController.UIProperties.showSettings;
    },
    partyPage() {
      return this.$store.state.UIController.UIProperties.currentPage === 'Party';
    },
    /** Guests of a party only watch, the local player is out of the way. */
    guestInParty() {
      return this.$store.state.PartyManager.mode === 'guest';
    },
    accentColor() {
      return this.$store.state.SettingsManager.settings.accentColor;
    },
    addedTracks() {
      return this.$store.state.TabsManager.tabsData.addedTracks;
    },
    miniMode() {
      return this.$store.state.UIController.UIProperties.miniMode;
    },
    isMobile() {
      return isMobileApp;
    },
    currentPage() {
      return this.$store.state.UIController.UIProperties.currentPage;
    },
  },
  methods: {
    UIcontrollerToggleProperty(property) {
      this.$store.commit('UIcontrollerToggleProperty', property);
    },
    goToPage(page) {
      this.$store.commit('UIcontrollerSetPropertyValue', {
        property: 'currentPage',
        newValue: page,
      });
      if (page === 'My Music') {
        // The bottom Home button must also select Home in the tab carousel,
        // otherwise the old tab stays active and Home can be left off-screen.
        this.$store.commit('UIcontrollerSetPropertyValue', {
          property: 'currentMainTab',
          newValue: 'Home',
        });
        if (this.$route.path !== '/') this.$router.push('/');
        return;
      }
      if (page === 'FLBing') this.$router.push('/meld');
      else if (this.$route.path !== '/') this.$router.push('/');
    },
    cleanUp() {
      if (document.querySelector(".trackOptions")) {
        document.querySelector(".trackOptions").style.height = `0px`;
      }
    },
    reactToFullPlayer(fullPlayer) {
      this.fullPlayer = fullPlayer;
      console.log(this.fullPlayer);
    },
  },
};
</script>
<style lang="scss">
@import "@scss/animate.scss";
@import "@scss/global.scss";
@import "@scss/themer.scss";
@import "@scss/grouped-content.scss";
@import "@scss/utility-classes.scss";
@import "@scss/mixins.scss";
@import "@scss/fun.scss";
// @font-face {
//   font-family: 'Quicksand';
//   src: local('@styles/Quicksand.tff') format('tff');
// }
* {
  scroll-behavior: smooth;
}
body {
  height: 100vh;
  overflow: hidden;
}
#app {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--appBackground, rgb(0, 0, 0));
}
::-webkit-scrollbar {
  background: rgba(0, 0, 0, 0);
  width: 8px;
  height: 6px;
}
::-webkit-scrollbar-track-piece {
  background: rgba(255, 255, 255, 0);
  border-radius: 10px;
}
::-webkit-scrollbar-thumb {
  background: var(--accentColor);
  border-radius: 10px;
}
#main-view {
  position: relative;
  z-index: 2;
}
#sub-view-1 {
  min-height: 100%;
  max-height: 0vh;
}
.featuresSwitcherArea {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  height: 100vh;
  padding-left: 0px;
  margin-right: 10px;
}

.playingPaneArea {
  position: relative;
}
.discoverTab {
  padding-top: 0px;
  height: 100vh;
}
/* The mobile app must keep the compact layout in landscape and on wide
   phones too, so the width query is not the only trigger. */
@media (max-width: 700px), (hover: none) and (pointer: coarse) {
  html,
  body {
    height: 100%;
    min-height: 100dvh;
    overflow: hidden;
    overscroll-behavior: none;
  }
  #app {
    height: 100dvh;
    min-height: 100dvh;
    box-sizing: border-box;
    padding: env(safe-area-inset-top) 0 0 !important;
    overflow: hidden;
  }
  .customTitleBar,
  .sideNav {
    display: none !important;
  }
  #main-view,
  #sub-view-1 {
    min-height: 0;
    max-height: none;
    height: auto;
    flex: 1;
  }
  #main-view {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  #sub-view-1 {
    width: 100%;
    overflow: hidden;
  }
  #sub-view-1 > .LocalMusic {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
  #sub-view-1 > .router-view,
  #sub-view-1 > div:not(.sideNav) {
    min-width: 0;
  }
  .LocalMusic,
  .LocalMusic main {
    min-height: 0;
    height: 100%;
    width: 100%;
  }
  .LocalMusic main {
    min-height: 0;
    overflow: hidden;
  }
  .LocalMusic main #tabsArea {
    width: 100% !important;
    max-width: 100% !important;
    height: 100%;
    max-height: none;
    margin: 0;
    min-height: 0;
    box-sizing: border-box;
    padding: 8px 8px calc(150px + env(safe-area-inset-bottom));
    border-radius: 0;
    overflow-x: hidden !important;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  /* The component styles are loaded after this file, so the mobile rules need
     the extra specificity of #app.mobileMode to actually win. */
  #app.mobileMode .Tabswitcher {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: flex-start !important;
    gap: 6px;
    width: 100%;
    min-height: 36px;
    box-sizing: border-box;
    margin: 0 0 10px;
    padding: 2px 2px 4px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }
  #app.mobileMode .Tabswitcher::-webkit-scrollbar {
    display: none;
  }
  #app.mobileMode .Tabswitcher .tabBtn {
    flex: 0 0 auto;
    height: 36px;
    min-height: 36px;
    box-sizing: border-box;
    padding: 0 11px;
    border: 1px solid var(--borderColor);
    border-radius: 999px;
  }
  #app.mobileMode .Tabswitcher .tabBtn p {
    font-size: 12px;
    line-height: 1;
    white-space: nowrap;
  }
  .LocalMusic .sidePane,
  .LocalMusic main > .side-pane {
    display: none !important;
  }
  .mobileBottomNav {
    position: fixed;
    z-index: 40;
    left: 5px;
    right: 5px;
    bottom: 5px;
    height: calc(64px + env(safe-area-inset-bottom));
    min-height: calc(64px + env(safe-area-inset-bottom));
    padding: 5px 8px calc(5px + env(safe-area-inset-bottom));
    box-sizing: border-box;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    align-items: center;
    background: color-mix(in srgb, var(--secondaryColor) 94%, transparent);
    border-top: 1px solid var(--borderColor);
    border-radius: 16px;
    backdrop-filter: blur(24px);
  }
  .mobileBottomNav button {
    min-width: 0;
    min-height: 48px;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: var(--textColor);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    opacity: .72;
  }
  .mobileBottomNav button.active {
    color: var(--accentColor);
    opacity: 1;
    background: var(--primaryColor);
  }
  .mobileBottomNav img {
    width: 18px;
    height: 18px;
    object-fit: contain;
  }
  .mobileBottomNav span {
    font-size: 10px;
    line-height: 1;
    color: inherit;
  }
  /* Compact player. The body selector also keeps these rules away from the
     full screen player. */
  body:not(.fullScreenPlayingPane) #app.mobileMode .playingPane {
    position: fixed;
    z-index: 38;
    left: 8px;
    right: 8px;
    bottom: calc(76px + env(safe-area-inset-bottom));
    width: auto;
    height: 72px;
    min-height: 72px;
    max-height: 72px;
    margin: 0 !important;
    box-sizing: border-box;
    border: 1px solid var(--borderColor);
    border-radius: 16px;
    background: color-mix(in srgb, var(--secondaryColor) 92%, transparent);
    backdrop-filter: blur(20px);
    overflow: visible;
  }
  body:not(.fullScreenPlayingPane) #app.mobileMode .playingPane > .split {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 4px;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    padding: 7px 10px;
    align-items: center;
  }
  body:not(.fullScreenPlayingPane) #app.mobileMode .playingPane .left_pane_section {
    width: auto;
    min-width: 0;
    height: 100%;
    padding: 0;
    gap: 8px;
    overflow: hidden;
  }
  body:not(.fullScreenPlayingPane) #app.mobileMode .playingPane .album_art_wrapper {
    width: 42px;
    height: 42px;
    flex: 0 0 42px;
    border-radius: 10px;
  }
  body:not(.fullScreenPlayingPane) #app.mobileMode .playingPane .track_info {
    min-width: 0;
    max-width: min(48vw, 190px);
    height: auto;
    gap: 1px;
    overflow: hidden;
  }
  body:not(.fullScreenPlayingPane) #app.mobileMode .playingPane .track_info .track_title {
    max-width: 100%;
    font-size: 13px;
    line-height: 1.2;
  }
  body:not(.fullScreenPlayingPane) #app.mobileMode .playingPane .track_info .track_artist {
    max-width: 100%;
    font-size: 11px;
    line-height: 1.2;
    opacity: .72;
  }
  body:not(.fullScreenPlayingPane) #app.mobileMode .playingPane .center_pane_section {
    width: auto;
    min-width: 0;
    height: 100%;
    padding: 0;
    align-items: center;
    justify-content: center;
  }
  body:not(.fullScreenPlayingPane) #app.mobileMode .playingPane .center_pane_section .t_actions {
    gap: 2px;
    align-items: center;
    justify-content: flex-end;
  }
  body:not(.fullScreenPlayingPane) #app.mobileMode .playingPane #prev_bt {
    display: flex !important;
  }
  body:not(.fullScreenPlayingPane) #app.mobileMode .playingPane #prev_bt,
  body:not(.fullScreenPlayingPane) #app.mobileMode .playingPane #next_bt {
    width: 30px !important;
    height: 30px !important;
    min-width: 30px;
    min-height: 30px;
    padding: 0;
  }
  body:not(.fullScreenPlayingPane) #app.mobileMode .playingPane #toggle_play button {
    width: 36px !important;
    height: 36px !important;
    min-width: 36px;
    min-height: 36px;
  }
  body:not(.fullScreenPlayingPane) #app.mobileMode .playingPane .scale_icon img {
    transform: none;
  }
  body:not(.fullScreenPlayingPane) #app.mobileMode .playingPane #shuffle_bt,
  body:not(.fullScreenPlayingPane) #app.mobileMode .playingPane #repeat_bt,
  body:not(.fullScreenPlayingPane) #app.mobileMode .playingPane .right_pane_section,
  body:not(.fullScreenPlayingPane) #app.mobileMode .playingPane .album_art_blurred,
  body:not(.fullScreenPlayingPane) #app.mobileMode .playingPane #lyrics_bt {
    display: none !important;
  }
  body:not(.fullScreenPlayingPane) #app.mobileMode .playingPane .TrackBar {
    display: none !important;
  }
  body:not(.fullScreenPlayingPane) #app.mobileMode .playingPane .mobilePlayerTimer {
    display: block;
    max-width: 100%;
    margin-top: 1px;
    font-size: 10px;
    line-height: 1;
    letter-spacing: .02em;
    opacity: .55;
    font-variant-numeric: tabular-nums;
  }
  /* Compact controls float over the player without heavy button backgrounds. */
  body:not(.fullScreenPlayingPane) #app.mobileMode .playingPane .t_actions button {
    background: transparent !important;
    box-shadow: none !important;
  }
  body:not(.fullScreenPlayingPane) #app.mobileMode .playingPane .t_actions button:hover {
    background: transparent !important;
  }
  /* Small grab handle: drag it up to open the full player, tap to toggle. */
  body:not(.fullScreenPlayingPane) #app.mobileMode .playingPane .mobilePlayerHandle {
    position: absolute;
    top: 2px;
    left: 50%;
    z-index: 6;
    width: 70px;
    height: 16px;
    min-width: 0;
    min-height: 0;
    padding: 3px 0 0;
    border: 0;
    border-radius: 999px;
    background: transparent;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    transform: translateX(-50%);
    touch-action: none;
    cursor: grab;
  }
  body:not(.fullScreenPlayingPane) #app.mobileMode .playingPane .mobilePlayerHandle span {
    display: block;
    width: 34px;
    height: 4px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--textColor) 46%, transparent);
    box-shadow: 0 1px 5px #0004;
  }
  body:not(.fullScreenPlayingPane) #app.mobileMode .playingPane .mobilePlayerHandle:active,
  body:not(.fullScreenPlayingPane) #app.mobileMode .playingPane .mobilePlayerHandle.is-dragging {
    cursor: grabbing;
  }
  body:not(.fullScreenPlayingPane) #app.mobileMode .playingPane .mobilePlayerHandle:active span,
  body:not(.fullScreenPlayingPane) #app.mobileMode .playingPane .mobilePlayerHandle.is-dragging span {
    width: 42px;
    background: var(--accentColor);
  }
  .LocalMusic .SidePane {
    display: none !important;
  }
  .playingPane .que_wrappers,
  .playingPane .lyrics_wrappers {
    position: fixed;
    z-index: 45;
    inset: 8px 8px calc(152px + env(safe-area-inset-bottom));
    width: auto;
    height: auto;
    background: var(--appBackground);
    border: 1px solid var(--borderColor);
    border-radius: 20px;
    overflow: auto;
  }
  .partyView {
    height: 100%;
    min-height: 0;
    box-sizing: border-box;
    width: 100%;
    padding: 10px 5px calc(90px + env(safe-area-inset-bottom));
    overflow-y: auto;
    border-radius: 0;
  }
  .Settings {
    position: fixed !important;
    inset: calc(env(safe-area-inset-top) + 5px) 5px 5px !important;
    z-index: 80 !important;
    box-sizing: border-box !important;
    width: auto !important;
    height: auto !important;
    border-radius: 0 !important;
    padding: 8px !important;
    overflow-y: auto !important;
    overscroll-behavior: contain;
  }
  .Settings main {
    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
    height: auto !important;
    width: 100% !important;
    min-width: 0 !important;
    grid-template-columns: minmax(0, 1fr) !important;
    overflow: visible !important;
  }
  .Settings main > section {
    box-sizing: border-box !important;
    flex: none !important;
    display: flex !important;
    flex-direction: column !important;
    width: 100% !important;
    max-width: none !important;
    min-width: 0 !important;
    margin: 0 0 12px !important;
  }
  .mobileMode .Settings.mobileSettings > main,
  .mobileMode .Settings > main {
    display: flex !important;
    flex-direction: column !important;
    grid-template-columns: minmax(0, 1fr) !important;
  }
  .mobileMode .Settings.mobileSettings > main > section,
  .mobileMode .Settings > main > section {
    width: 100% !important;
    min-width: 0 !important;
    flex: none !important;
  }
  .Settings article {
    border-radius: 16px;
    padding: 13px;
    margin-bottom: 10px;
  }
  .party_header {
    position: sticky;
    top: 0;
    z-index: 5;
  }
  .onboard .slide {
    width: 100%;
    height: min(72dvh, 620px);
    min-height: 360px;
    border-right-width: 4px;
    border-left-width: 4px;
    border-radius: 28px;
    padding: 24px 18px;
  }
  .onboard .slide article {
    width: 100%;
    margin: 0;
    padding: 14px 8px;
  }
  .onboard .slide article h2 {
    text-align: center;
    font-size: 22px;
  }
  .onboard .slide #jamBt {
    display: none;
  }
  .onboard .mobileOnboardSkip {
    position: absolute;
    right: 18px;
    bottom: 18px;
    min-height: 44px;
    padding: 0 14px;
    border: 1px solid var(--borderColor);
    border-radius: 999px;
    background: var(--primaryColor);
    color: var(--textColor);
  }
  .onboard .mobileOnboardHint {
    max-width: 290px;
    margin: 0 auto 14px;
    text-align: center;
    line-height: 1.5;
    opacity: .78;
  }
  .onboard .mobileOnboardAction {
    width: 100%;
    max-width: 320px;
    margin-top: 12px;
  }
  .home .statsWrapper {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }
  .home .mixesWrapper {
    display: flex;
    overflow-x: auto;
    gap: 10px;
    padding-bottom: 8px;
  }
  #app.mobileMode .Titlebar {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) 36px 36px;
    align-items: center;
    gap: 6px;
    padding: 0 0 8px;
  }
  #app.mobileMode .Titlebar .pos-rel {
    grid-column: 1;
    grid-row: 1;
    min-width: 0;
    min-height: 36px;
  }
  #app.mobileMode .Titlebar > .multiSelect {
    grid-column: 2;
    grid-row: 1;
  }
  #app.mobileMode .Titlebar .sortWidget {
    grid-column: 3;
    grid-row: 1;
  }
  #app.mobileMode .Titlebar .multiSelect,
  #app.mobileMode .Titlebar .sortToggleButton {
    width: 36px;
    min-width: 36px;
    height: 36px;
    min-height: 36px;
    padding: 0;
    border-radius: 11px;
  }
  #app.mobileMode .Titlebar .multiSelect .btnText,
  #app.mobileMode .Titlebar .sortToggleButton .btnText {
    display: none;
  }
  #app.mobileMode .Titlebar #search {
    min-width: 0;
    width: 100%;
    height: 36px;
    min-height: 36px;
    padding: 1px 12px;
    box-sizing: border-box;
    font-size: 14px;
    border-radius: 12px;
    background: var(--primaryColor);
    border: 1px solid var(--borderColor);
  }
  .onboard {
    inset: calc(env(safe-area-inset-top) + 8px) 10px calc(8px + env(safe-area-inset-bottom));
    width: auto;
    height: auto;
    min-height: 0;
    padding: 14px;
    border: 1px solid var(--borderColor);
    border-radius: 26px;
    background: color-mix(in srgb, var(--appBackground) 86%, transparent);
    backdrop-filter: blur(26px);
  }
  body.fullScreenPlayingPane #app.mobileMode .mobileBottomNav {
    display: none !important;
  }
  body.fullScreenPlayingPane #app.mobileMode .playingPane {
    position: fixed;
    inset: 0;
    z-index: 70;
    width: 100vw;
    height: 100dvh;
    max-height: none;
    margin: 0 !important;
    box-sizing: border-box;
    border: 0;
    border-radius: 0;
    overflow: hidden;
    background:
      radial-gradient(circle at 50% 14%, color-mix(in srgb, var(--accentColor) 16%, transparent), transparent 42%),
      color-mix(in srgb, var(--appBackground) 78%, transparent) !important;
    -webkit-backdrop-filter: blur(40px) saturate(125%);
    backdrop-filter: blur(40px) saturate(125%);
  }
  body.fullScreenPlayingPane #app.mobileMode .playingPane > .split {
    display: block;
    width: 100%;
    height: 100%;
  }
  body.fullScreenPlayingPane #app.mobileMode .playingPane .album_art_blurred {
    display: block !important;
    z-index: 0;
    left: -8vw;
    top: -16vh;
    width: 116vw;
    height: 88vh;
    opacity: .34;
    filter: blur(82px) saturate(125%);
    transform: scale(1.08);
    pointer-events: none;
  }
  body.fullScreenPlayingPane #app.mobileMode .playingPane .left_pane_section {
    position: absolute;
    inset: 7vh 0 auto;
    z-index: 2;
    width: 100%;
    height: 66vh;
    box-sizing: border-box;
    align-items: center;
    justify-content: flex-start;
    padding: 0 20px;
  }
  body.fullScreenPlayingPane #app.mobileMode .playingPane .album_art_wrapper {
    position: absolute;
    left: 50%;
    top: 0;
    width: min(68vw, 300px);
    height: min(68vw, 300px);
    transform: translateX(-50%);
    border-radius: 22px;
    box-shadow: 0 26px 76px #0009;
  }
  body.fullScreenPlayingPane #app.mobileMode .playingPane .track_info {
    position: absolute;
    left: 20px;
    right: 20px;
    top: calc(min(68vw, 300px) + 20px);
    bottom: auto;
    width: auto;
    max-width: calc(100% - 40px);
    height: auto;
    box-sizing: border-box;
    gap: 3px;
    transform: none;
    align-items: center;
  }
  body.fullScreenPlayingPane #app.mobileMode .playingPane .track_info .track_title {
    max-width: 100%;
    text-align: center;
    font-size: 22px;
    line-height: 1.2;
  }
  body.fullScreenPlayingPane #app.mobileMode .playingPane .track_info .track_artist {
    max-width: 100%;
    text-align: center;
    font-size: 15px;
    line-height: 1.25;
    opacity: .76;
  }
  body.fullScreenPlayingPane #app.mobileMode .playingPane .mobilePlayerTimer {
    display: none !important;
  }
  body.fullScreenPlayingPane #app.mobileMode .playingPane .mobilePlayerTopButton {
    position: absolute;
    top: calc(env(safe-area-inset-top) + 12px);
    z-index: 90;
    width: 44px;
    height: 44px;
    min-width: 44px;
    min-height: 44px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--textColor);
    display: grid;
    place-items: center;
  }
  body.fullScreenPlayingPane #app.mobileMode .playingPane #mobilePlayerOptions {
    left: 12px;
  }
  body.fullScreenPlayingPane #app.mobileMode .playingPane #mobilePlayerCollapse {
    right: 12px;
  }
  body.fullScreenPlayingPane #app.mobileMode .playingPane .mobilePlayerMenu {
    position: absolute;
    top: calc(env(safe-area-inset-top) + 64px);
    left: 12px;
    z-index: 95;
    width: min(240px, calc(100vw - 72px));
    box-sizing: border-box;
    padding: 7px;
    border: 1px solid var(--borderColor);
    border-radius: 18px;
    background: color-mix(in srgb, var(--secondaryColor) 96%, transparent);
    box-shadow: 0 18px 50px #0007;
    backdrop-filter: blur(26px);
  }
  body.fullScreenPlayingPane #app.mobileMode .playingPane .mobilePlayerMenu button {
    width: 100%;
    min-height: 42px;
    padding: 0 11px;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: var(--textColor);
    display: flex;
    align-items: center;
    gap: 11px;
    text-align: left;
    font: inherit;
    font-size: 13px;
  }
  body.fullScreenPlayingPane #app.mobileMode .playingPane .mobilePlayerMenu button:active {
    background: var(--primaryColor);
  }
  body.fullScreenPlayingPane #app.mobileMode .playingPane .center_pane_section {
    position: absolute;
    inset: auto 0 5vh;
    z-index: 2;
    width: 100%;
    height: 24vh;
    margin-left: 0 !important;
    box-sizing: border-box;
    padding: 0 22px;
    justify-content: flex-end;
  }
  body.fullScreenPlayingPane #app.mobileMode .playingPane .center_pane_section .TrackBar {
    order: 1;
  }
  body.fullScreenPlayingPane #app.mobileMode .playingPane .center_pane_section .t_actions {
    order: 2;
  }
  body.fullScreenPlayingPane #app.mobileMode .playingPane .TrackBar {
    position: static;
    width: 100%;
    height: 44px;
    box-sizing: border-box;
    gap: 8px;
    transform: none;
    margin-bottom: 16px;
  }
  body.fullScreenPlayingPane #app.mobileMode .playingPane .TrackBar .progressInfoCard {
    margin-bottom: 2px;
    opacity: .7;
  }
  body.fullScreenPlayingPane #app.mobileMode .playingPane .TrackBar .progressInfoCard p {
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  body.fullScreenPlayingPane #app.mobileMode .playingPane .TrackBar .seekBar {
    height: 4px;
    background: color-mix(in srgb, var(--textColor) 16%, transparent);
  }
  body.fullScreenPlayingPane #app.mobileMode .playingPane .TrackBar .seekBar .seekProgress {
    height: 100%;
    bottom: 0;
    background: var(--accentColor);
  }
  body.fullScreenPlayingPane #app.mobileMode .playingPane .center_pane_section .t_actions {
    position: static;
    transform: none;
    width: 100%;
    box-sizing: border-box;
    gap: 4px;
    justify-content: space-between;
    padding: 0 6px;
  }
  body.fullScreenPlayingPane #app.mobileMode .playingPane .center_pane_section #shuffle_bt,
  body.fullScreenPlayingPane #app.mobileMode .playingPane .center_pane_section #repeat_bt,
  body.fullScreenPlayingPane #app.mobileMode .playingPane .center_pane_section #prev_bt,
  body.fullScreenPlayingPane #app.mobileMode .playingPane .TrackBar {
    display: flex !important;
  }
  body.fullScreenPlayingPane #app.mobileMode .playingPane #repeat_bt { order: 1; }
  body.fullScreenPlayingPane #app.mobileMode .playingPane #prev_bt { order: 2; }
  body.fullScreenPlayingPane #app.mobileMode .playingPane #toggle_play { order: 3; }
  body.fullScreenPlayingPane #app.mobileMode .playingPane #next_bt { order: 4; }
  body.fullScreenPlayingPane #app.mobileMode .playingPane #shuffle_bt { order: 5; }
  body.fullScreenPlayingPane #app.mobileMode .playingPane #prev_bt,
  body.fullScreenPlayingPane #app.mobileMode .playingPane #next_bt,
  body.fullScreenPlayingPane #app.mobileMode .playingPane #shuffle_bt,
  body.fullScreenPlayingPane #app.mobileMode .playingPane #repeat_bt {
    width: 42px !important;
    height: 42px !important;
    min-width: 42px;
    min-height: 42px;
    padding: 0;
  }
  body.fullScreenPlayingPane #app.mobileMode .playingPane .t_actions button {
    position: relative;
    background: transparent !important;
    box-shadow: none !important;
  }
  body.fullScreenPlayingPane #app.mobileMode .playingPane .t_actions button.activeBtn::after {
    content: "";
    position: absolute;
    left: 50%;
    bottom: 1px;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--accentColor);
    transform: translateX(-50%);
  }
  body.fullScreenPlayingPane #app.mobileMode .playingPane .scale_icon img {
    transform: none;
  }
  body.fullScreenPlayingPane #app.mobileMode .playingPane .center_pane_section #toggle_play button {
    width: 56px;
    height: 56px;
  }
  body.fullScreenPlayingPane #app.mobileMode .playingPane .right_pane_section,
  body.fullScreenPlayingPane #app.mobileMode .playingPane #lyrics_bt {
    display: none !important;
  }
  body.fullScreenPlayingPane #app.mobileMode .playingPane .que_wrappers,
  body.fullScreenPlayingPane #app.mobileMode .playingPane .lyrics_wrappers {
    z-index: 85;
    inset: calc(env(safe-area-inset-top) + 8px) 8px calc(env(safe-area-inset-bottom) + 8px);
  }
  .mobilePanelClose {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 4;
    width: 40px;
    height: 40px;
    min-width: 40px;
    min-height: 40px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--textColor);
    display: grid;
    place-items: center;
  }
  /* Floating library widgets must clear the compact player and bottom nav. */
  #app.mobileMode .PlaylistWidget.widget,
  #app.mobileMode .Equalizer.widget {
    bottom: calc(160px + env(safe-area-inset-bottom));
    max-height: calc(100dvh - 180px - env(safe-area-inset-bottom));
    overflow: auto;
  }
  /* Landscape phones keep the cover on the left and the time/controls on the
     right so nothing overlaps or leaves the viewport. */
  @media (orientation: landscape) and (max-height: 600px) {
    body.fullScreenPlayingPane #app.mobileMode .playingPane .left_pane_section {
      inset: 0 auto 0 4vw;
      width: 46vw;
      height: 100dvh;
      padding: 0;
    }
    body.fullScreenPlayingPane #app.mobileMode .playingPane .album_art_wrapper {
      left: 50%;
      top: 50%;
      width: min(58vh, 30vw);
      height: min(58vh, 30vw);
      transform: translate(-50%, -50%);
      border-radius: 18px;
    }
    body.fullScreenPlayingPane #app.mobileMode .playingPane .track_info {
      left: 4%;
      right: 4%;
      top: calc(50% + min(29vh, 15vw) + 10px);
      max-width: none;
    }
    body.fullScreenPlayingPane #app.mobileMode .playingPane .track_info .track_title {
      font-size: 18px;
    }
    body.fullScreenPlayingPane #app.mobileMode .playingPane .track_info .track_artist {
      font-size: 12px;
    }
    body.fullScreenPlayingPane #app.mobileMode .playingPane .center_pane_section {
      inset: 0 3vw 0 auto;
      width: 44vw;
      height: 100dvh;
      padding: 0;
      justify-content: center;
    }
    body.fullScreenPlayingPane #app.mobileMode .playingPane .TrackBar {
      height: 38px;
      margin-bottom: 12px;
    }
    body.fullScreenPlayingPane #app.mobileMode .playingPane .center_pane_section .t_actions {
      gap: 4px;
      padding: 0;
      justify-content: space-between;
    }
    body.fullScreenPlayingPane #app.mobileMode .playingPane #prev_bt,
    body.fullScreenPlayingPane #app.mobileMode .playingPane #next_bt,
    body.fullScreenPlayingPane #app.mobileMode .playingPane #shuffle_bt,
    body.fullScreenPlayingPane #app.mobileMode .playingPane #repeat_bt {
      width: 38px !important;
      height: 38px !important;
      min-width: 38px;
      min-height: 38px;
    }
    body.fullScreenPlayingPane #app.mobileMode .playingPane .center_pane_section #toggle_play button {
      width: 48px;
      height: 48px;
    }
    body.fullScreenPlayingPane #app.mobileMode .playingPane .mobilePlayerTopButton {
      width: 38px;
      height: 38px;
      min-width: 38px;
      min-height: 38px;
    }
    body.fullScreenPlayingPane #app.mobileMode .playingPane .mobilePlayerMenu {
      top: calc(env(safe-area-inset-top) + 56px);
    }
  }
  #app.mobileMode .home.tab {
    height: 100%;
    overflow-y: auto !important;
    padding: 2px 2px 12px;
  }
  #app.mobileMode .home .mobileHomeWelcome {
    margin-bottom: 10px;
    padding: 10px 12px;
    border-radius: 14px;
  }
  #app.mobileMode .home .mobileHomeWelcome h1 {
    margin: 1px 0 3px;
    font-size: 18px;
  }
  #app.mobileMode .home .mobileHomeWelcome p {
    font-size: 11px;
  }
  #app.mobileMode .home .mobileHomeWelcome .mobileHomeEyebrow {
    font-size: 9px;
  }
  #app.mobileMode .home .stats {
    overflow: visible !important;
    margin: 4px 0 14px;
    padding: 0;
  }
  #app.mobileMode .home .stats_title {
    margin: 0 2px 8px !important;
  }
  #app.mobileMode .home .stats_title h1 {
    font-size: 18px !important;
    letter-spacing: .01em;
  }
  #app.mobileMode .home .mixesWrapper {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 0 2px 10px;
    overflow: visible;
  }
  #app.mobileMode .home .MixCard {
    margin: 0;
    padding: 11px;
    border: 1px solid var(--borderColor);
    border-radius: 14px;
    background: color-mix(in srgb, var(--secondaryColor) 88%, transparent);
  }
  #app.mobileMode .home .MixCard .cardTitle > .flex {
    align-items: flex-start;
    gap: 8px;
  }
  #app.mobileMode .home .MixCard .cardTitle h2 {
    font-size: 15px;
  }
  #app.mobileMode .home .MixCard .cover {
    width: 56px;
    height: 56px;
    object-fit: cover;
  }
  #app.mobileMode .home .mobileMixesEmpty {
    margin: 0;
    padding: 14px;
    border: 1px dashed var(--borderColor);
    border-radius: 14px;
    font-size: 13px;
    line-height: 1.5;
    opacity: .78;
  }
  #app.mobileMode .home .overLayedTracks.horizontal_overlay {
    box-sizing: border-box;
    max-width: 100%;
    padding: 8px 10px 12px;
    overflow-x: auto;
    overflow-y: visible;
    scroll-padding-inline: 10px;
    -webkit-overflow-scrolling: touch;
  }
  #app.mobileMode .home .overLayedTracks.horizontal_overlay .card {
    flex: 0 0 132px;
    margin-left: 0;
  }
  #app.mobileMode .home .overLayedTracks.horizontal_overlay .card:not(:first-child) {
    margin-left: 0;
  }
  #app.mobileMode .home .overLayedTracks.horizontal_overlay .card:hover,
  #app.mobileMode .home .overLayedTracks.horizontal_overlay .card:hover ~ .card {
    transform: none;
  }
}
</style>

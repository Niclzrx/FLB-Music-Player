<template>
  <div
    id="app"
    :class="[
      accentColor,
      theme + '_theme',
      miniMode ? 'miniMode' : '',
      isMobile ? 'mobileMode' : '',
      'pb5 pl5 pr5',
    ]"
    @click="cleanUp"
  >
    <custom-title-bar v-if="!isMobile" class="mb5" />
    <header v-if="isMobile" class="mobileBrandBar">
      <img src="@img/logo.png" alt="FLB Music" />
      <span>FLB Music</span>
    </header>
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
        <span>{{ t('mobile.music') }}</span>
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
      showOnboard: true,
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
@media (max-width: 700px) {
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
    padding: env(safe-area-inset-top) 0 0 !important;
    overflow: hidden;
  }
  .customTitleBar,
  .sideNav {
    display: none !important;
  }
  .mobileBrandBar {
    height: 56px;
    min-height: 56px;
    padding: 0 18px;
    display: flex;
    align-items: center;
    gap: 9px;
    border-bottom: 1px solid var(--borderColor);
    background: color-mix(in srgb, var(--primaryColor) 92%, transparent);
    backdrop-filter: blur(24px);
    z-index: 10;
  }
  .mobileBrandBar img {
    width: 28px;
    height: 28px;
    object-fit: contain;
  }
  .mobileBrandBar span {
    font-weight: 720;
    letter-spacing: .02em;
    color: var(--textColor);
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
    padding: 14px 14px calc(150px + env(safe-area-inset-bottom));
    border-radius: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .Tabswitcher {
    justify-content: flex-start;
    gap: 8px;
    margin: 6px -2px 14px;
    padding: 2px 2px 8px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }
  .Tabswitcher::-webkit-scrollbar {
    display: none;
  }
  .Tabswitcher .tabBtn {
    flex: 0 0 auto;
    min-height: 40px;
    padding: 8px 13px;
    border: 1px solid var(--borderColor);
    border-radius: 999px;
  }
  .Tabswitcher .tabBtn p {
    font-size: 12px;
    white-space: nowrap;
  }
  .LocalMusic .sidePane,
  .LocalMusic main > .side-pane {
    display: none !important;
  }
  .mobileBottomNav {
    position: fixed;
    z-index: 40;
    left: 0;
    right: 0;
    bottom: 0;
    min-height: calc(70px + env(safe-area-inset-bottom));
    padding: 7px 10px calc(7px + env(safe-area-inset-bottom));
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    align-items: center;
    background: color-mix(in srgb, var(--secondaryColor) 94%, transparent);
    border-top: 1px solid var(--borderColor);
    backdrop-filter: blur(24px);
  }
  .mobileBottomNav button {
    min-width: 52px;
    min-height: 52px;
    border: 0;
    border-radius: 16px;
    background: transparent;
    color: var(--textColor);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 5px;
    opacity: .72;
  }
  .mobileBottomNav button.active {
    color: var(--accentColor);
    opacity: 1;
    background: var(--primaryColor);
  }
  .mobileBottomNav img {
    width: 20px;
    height: 20px;
    object-fit: contain;
  }
  .mobileBottomNav span {
    font-size: 11px;
    color: inherit;
  }
  .playingPane {
    position: fixed;
    z-index: 38;
    left: 8px;
    right: 8px;
    bottom: calc(76px + env(safe-area-inset-bottom));
    width: auto;
    height: 70px;
    border: 1px solid var(--borderColor);
    border-radius: 18px;
    background: color-mix(in srgb, var(--secondaryColor) 92%, transparent);
    backdrop-filter: blur(20px);
    overflow: visible;
  }
  .playingPane > .split {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    width: 100%;
    height: 100%;
    padding: 6px 10px;
    align-items: center;
  }
  .playingPane .left_pane_section {
    width: auto;
    min-width: 0;
    padding: 0;
    gap: 9px;
  }
  .playingPane .left_pane_section .album_art_wrapper {
    width: 46px;
    height: 46px;
    flex: none;
    border-radius: 11px;
  }
  .playingPane .track_info {
    min-width: 0;
    max-width: min(34vw, 150px);
    overflow: hidden;
  }
  .playingPane .track_info .track_title,
  .playingPane .track_info .track_artist {
    max-width: 100%;
  }
  .playingPane .center_pane_section {
    width: auto;
    min-width: 104px;
    padding: 0;
    align-items: flex-end;
  }
  .playingPane .center_pane_section .t_actions {
    gap: 9px;
    justify-content: flex-end;
  }
  .playingPane .center_pane_section #shuffle_bt,
  .playingPane .center_pane_section #repeat_bt,
  .playingPane .center_pane_section #prev_bt,
  .playingPane .TrackBar,
  .playingPane .right_pane_section,
  .playingPane .album_art_blurred,
  .playingPane #lyrics_bt {
    display: none !important;
  }
  .playingPane .center_pane_section #toggle_play button,
  .playingPane .center_pane_section #next_bt button {
    min-width: 42px;
    min-height: 42px;
  }
  .LocalMusic .SidePane {
    display: none !important;
  }
  .playingPane .que_wrappers,
  .playingPane .lyrics_wrappers {
    position: fixed;
    z-index: 45;
    inset: 8px 8px calc(138px + env(safe-area-inset-bottom));
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
    padding: 18px 16px calc(100px + env(safe-area-inset-bottom));
    overflow-y: auto;
    border-radius: 0;
  }
  .Settings {
    position: fixed !important;
    inset: 0 !important;
    z-index: 80 !important;
    width: 100vw !important;
    height: 100dvh !important;
    border-radius: 0 !important;
    padding: calc(12px + env(safe-area-inset-top)) 14px calc(18px + env(safe-area-inset-bottom)) !important;
    overflow-y: auto !important;
    overscroll-behavior: contain;
  }
  .Settings main {
    display: block !important;
    height: auto !important;
    overflow: visible !important;
  }
  .Settings main > section {
    width: 100% !important;
    max-width: none !important;
    margin: 0 0 12px !important;
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
  .Titlebar {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 8px;
    padding-bottom: 12px;
  }
  .Titlebar #search {
    min-width: 0;
    width: 100%;
    min-height: 44px;
    background: var(--primaryColor);
    border: 1px solid var(--borderColor);
  }
  .Titlebar .multiSelect {
    min-width: 40px;
    min-height: 40px;
  }
  .Titlebar .pos-rel {
    min-width: 0;
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
  .fullScreenPlayingPane .mobileBrandBar,
  .fullScreenPlayingPane .mobileBottomNav {
    display: none !important;
  }
  .fullScreenPlayingPane .playingPane {
    position: fixed;
    inset: 0;
    z-index: 70;
    width: 100vw;
    height: 100dvh;
    border: 0;
    border-radius: 0;
    background: var(--appBackground);
  }
  .fullScreenPlayingPane .playingPane > .split {
    width: 100%;
    height: 100%;
  }
  .fullScreenPlayingPane .playingPane .left_pane_section {
    position: absolute;
    inset: 9vh 0 auto;
    width: 100%;
    height: 62vh;
    align-items: center;
    justify-content: flex-start;
    padding: 0 24px;
  }
  .fullScreenPlayingPane .playingPane .left_pane_section .album_art_wrapper {
    position: absolute;
    left: 50%;
    top: 2vh;
    width: min(72vw, 360px);
    height: min(72vw, 360px);
    transform: translateX(-50%);
    border-radius: 22px;
    box-shadow: 0 24px 72px #0008;
  }
  .fullScreenPlayingPane .playingPane .track_info {
    position: absolute;
    left: 24px;
    right: 24px;
    bottom: 0;
    height: auto;
    transform: none;
    align-items: center;
  }
  .fullScreenPlayingPane .playingPane .track_info .track_title {
    max-width: 100%;
    text-align: center;
    font-size: 21px;
  }
  .fullScreenPlayingPane .playingPane .track_info .track_artist {
    max-width: 100%;
    text-align: center;
    font-size: 15px;
  }
  .fullScreenPlayingPane .playingPane .center_pane_section {
    position: absolute;
    inset: auto 0 8vh;
    width: 100%;
    height: 22vh;
    padding: 0 24px;
    justify-content: flex-end;
  }
  .fullScreenPlayingPane .playingPane .TrackBar {
    position: static;
    width: 100%;
    transform: none;
    margin-bottom: 14px;
  }
  .fullScreenPlayingPane .playingPane .center_pane_section .t_actions {
    position: static;
    transform: none;
    width: 100%;
    justify-content: space-around;
    padding: 0 12px;
  }
  .fullScreenPlayingPane .playingPane .center_pane_section #shuffle_bt,
  .fullScreenPlayingPane .playingPane .center_pane_section #repeat_bt,
  .fullScreenPlayingPane .playingPane .center_pane_section #prev_bt,
  .fullScreenPlayingPane .playingPane .TrackBar,
  .fullScreenPlayingPane .playingPane .right_pane_section {
    display: flex !important;
  }
  .fullScreenPlayingPane .playingPane .center_pane_section #toggle_play button {
    width: 54px;
    height: 54px;
  }
  .home.tab {
    height: 100%;
    overflow-y: auto !important;
    padding: 4px 2px 16px;
  }
  .home .stats {
    overflow: visible !important;
    margin: 6px 0 18px;
    padding: 0;
  }
  .home .stats_title {
    margin: 0 2px 12px !important;
  }
  .home .stats_title h1 {
    font-size: 20px !important;
    letter-spacing: .01em;
  }
  .home .mixesWrapper {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 0 2px 12px;
    overflow: visible;
  }
  .home .MixCard {
    margin: 0;
    padding: 14px;
    border: 1px solid var(--borderColor);
    border-radius: 18px;
    background: color-mix(in srgb, var(--secondaryColor) 88%, transparent);
  }
  .home .MixCard .cardTitle > .flex {
    align-items: flex-start;
    gap: 10px;
  }
  .home .MixCard .cardTitle h2 {
    font-size: 16px;
  }
  .home .MixCard .cover {
    width: 70px;
    height: 70px;
    object-fit: cover;
  }
  .home .mobileMixesEmpty {
    margin: 0;
    padding: 18px;
    border: 1px dashed var(--borderColor);
    border-radius: 16px;
    line-height: 1.5;
    opacity: .78;
  }
}
</style>

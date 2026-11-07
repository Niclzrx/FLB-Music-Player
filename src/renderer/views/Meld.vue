<template>
  <div class="MeldView" :class="{ meldMobile: isMobile }">
    <header class="meldTopbar">
      <div class="meldBrand">
        <button
          v-if="navHistory.length"
          class="meldBack"
          :aria-label="t('meld.back')"
          @click="goBack"
        >
          <base-icon icon="arrow-left" :size="18" />
        </button>
        <div class="meldLogo">
          <img src="@icon/meld.svg" alt="" />
        </div>
        <div class="meldBrandText">
          <h1>Meld</h1>
          <span>YouTube Music</span>
        </div>
      </div>

      <form class="meldSearch" @submit.prevent="runSearch">
        <base-icon class="meldSearchIcon" icon="magnifying-glass" :size="18" />
        <input
          ref="searchInput"
          v-model="query"
          type="search"
          autocomplete="off"
          :placeholder="t('meld.searchPlaceholder')"
          @focus="searchFocused = true"
          @blur="searchFocused = false"
        />
        <button
          v-if="query"
          class="meldSearchClear"
          type="button"
          :aria-label="t('meld.clearSearch')"
          @click="clearSearch"
        >
          <base-icon icon="x" :size="14" />
        </button>
        <button
          class="meldSearchSubmit"
          type="submit"
          :aria-label="t('meld.search')"
        >
          <base-icon icon="magnifying-glass" :size="16" />
        </button>
      </form>

      <button
        class="meldAccountButton"
        :class="{ connected: signedIn }"
        :aria-label="t('meld.account')"
        @click="toggleAccountPanel"
      >
        <base-icon :icon="signedIn ? 'check' : 'user'" :size="18" />
      </button>
    </header>

    <nav class="meldTabs" aria-label="Meld sections">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :class="{ active: activeTab === tab.id }"
        @click="switchTab(tab.id)"
      >
        <base-icon :icon="tab.icon" :size="16" />
        <span>{{ t(tab.label) }}</span>
      </button>
      <div class="meldTabsSpacer" />
      <button class="meldRefresh" :aria-label="t('meld.refresh')" @click="retry">
        <base-icon icon="arrow-clockwise" :size="15" />
      </button>
    </nav>

    <div v-if="loading" class="meldLoadingBar"><span /></div>

    <main ref="content" class="meldContent">
      <section v-if="showAccount" class="meldAccountPanel">
        <div class="meldAccountHeader">
          <div>
            <h2>{{ t('meld.account') }}</h2>
            <p v-if="signedIn">{{ t('meld.signedInHint') }}</p>
            <p v-else>{{ t('meld.accountHint') }}</p>
          </div>
          <button
            class="meldIconButton"
            :aria-label="t('meld.close')"
            @click="showAccount = false"
          >
            <base-icon icon="x" :size="16" />
          </button>
        </div>

        <div v-if="signedIn" class="meldAccountConnected">
          <span class="meldStatusDot" />
          <strong>{{ t('meld.signedIn') }}</strong>
          <button class="meldTextButton" @click="signOut">
            {{ t('meld.signOut') }}
          </button>
        </div>

        <template v-else>
          <div class="meldLoginActions">
            <button
              v-if="!isMobile"
              class="meldPrimaryButton"
              :disabled="loginBusy"
              @click="signInWithBrowser"
            >
              <base-icon icon="sign-in" :size="17" />
              <span>{{ loginBusy ? t('meld.connecting') : t('meld.signInBrowser') }}</span>
            </button>
            <a
              class="meldSecondaryButton"
              href="https://music.youtube.com/"
              target="_blank"
              rel="noopener"
            >
              {{ t('meld.openYoutubeMusic') }}
            </a>
          </div>
          <label class="meldCookieLabel" for="meldCookieInput">
            {{ t('meld.cookieLabel') }}
          </label>
          <textarea
            id="meldCookieInput"
            v-model="cookieDraft"
            class="meldCookieInput"
            spellcheck="false"
            :placeholder="t('meld.cookiePlaceholder')"
          />
          <p class="meldCookieHint">{{ t('meld.cookieHint') }}</p>
          <button
            class="meldPrimaryButton meldSaveCookie"
            :disabled="!cookieDraft.trim()"
            @click="saveCookie"
          >
            {{ t('meld.saveSession') }}
          </button>
        </template>
      </section>

      <div v-if="error && !hasContent" class="meldState">
        <div class="meldStateIcon"><base-icon icon="music-notes-simple" :size="28" /></div>
        <h2>{{ t('meld.error') }}</h2>
        <p>{{ error }}</p>
        <button class="meldPrimaryButton" @click="retry">{{ t('meld.retry') }}</button>
        <button
          v-if="!signedIn"
          class="meldSecondaryButton"
          @click="showAccount = true"
        >
          {{ t('meld.signIn') }}
        </button>
      </div>

      <div v-else-if="loading && !hasContent" class="meldState">
        <div class="meldLoadingDisc"><span /></div>
        <h2>{{ t('meld.loading') }}</h2>
      </div>

      <template v-else>
        <div v-if="error" class="meldInlineError" role="alert">
          <span>{{ error }}</span>
          <button class="meldTextButton" @click="retry">{{ t('meld.retry') }}</button>
          <button
            class="meldIconButton"
            :aria-label="t('meld.close')"
            @click="error = ''"
          >
            <base-icon icon="x" :size="14" />
          </button>
        </div>

        <section v-if="view === 'library' && libraryRequiresLogin" class="meldState meldSignInState">
          <div class="meldStateIcon"><base-icon icon="user" :size="28" /></div>
          <h2>{{ t('meld.loginRequired') }}</h2>
          <p>{{ t('meld.loginRequiredHint') }}</p>
          <button class="meldPrimaryButton" @click="showAccount = true">
            {{ t('meld.signIn') }}
          </button>
        </section>

        <section v-if="view === 'home'" class="meldHero">
          <div>
            <span class="meldEyebrow">YouTube Music</span>
            <h2>{{ t('meld.greeting') }}</h2>
            <p>{{ signedIn ? t('meld.greetingSignedIn') : t('meld.greetingGuest') }}</p>
          </div>
          <div class="meldHeroActions">
            <button v-if="signedIn" class="meldSecondaryButton" @click="switchTab('library')">
              {{ t('meld.openLibrary') }}
            </button>
            <button v-else class="meldPrimaryButton" @click="showAccount = true">
              {{ t('meld.signIn') }}
            </button>
          </div>
        </section>

        <section v-if="view === 'browse' && browse" class="meldBrowseHeader">
          <div class="meldBrowseArt">
            <img v-if="browse.thumbnail" :src="browse.thumbnail" :alt="browse.title" />
            <base-icon v-else icon="music-notes-simple" :size="38" />
          </div>
          <div class="meldBrowseInfo">
            <span class="meldEyebrow">{{ t('meld.collection') }}</span>
            <h2>{{ browse.title || t('meld.collection') }}</h2>
            <p v-if="browse.subtitle">{{ browse.subtitle }}</p>
            <div class="meldBrowseActions">
              <button
                v-if="browse.tracks.length"
                class="meldPrimaryButton"
                @click="playAll(browse.tracks)"
              >
                <base-icon icon="play" :size="15" />
                <span>{{ t('meld.playAll') }}</span>
              </button>
              <span v-if="browse.tracks.length" class="meldCount">
                {{ trackCountLabel(browse.tracks.length) }}
              </span>
            </div>
          </div>
        </section>

        <section v-if="view === 'search' && searchResult && searchResult.top" class="meldTopResult">
          <button @click="openItem(searchResult.top, currentTracks)">
            <div class="meldTopArt">
              <img
                v-if="searchResult.top.thumbnail"
                :src="searchResult.top.thumbnail"
                :alt="searchResult.top.title"
              />
              <base-icon v-else icon="music-notes-simple" :size="30" />
            </div>
            <div>
              <span class="meldEyebrow">{{ t('meld.topResult') }}</span>
              <h2>{{ searchResult.top.title }}</h2>
              <p>{{ searchResult.top.subtitle || kindLabel(searchResult.top) }}</p>
            </div>
            <span class="meldTopResultIcon">
              <base-icon
                :icon="searchResult.top.kind === 'song' ? 'play' : 'caret-right'"
                :size="20"
              />
            </span>
          </button>
        </section>

        <section
          v-if="view === 'search' && searchCollections.length"
          class="meldShelf meldSearchCollections"
        >
          <header>
            <h2>{{ t('meld.albumsAndPlaylists') }}</h2>
          </header>
          <div class="meldCardRow">
            <button
              v-for="item in searchCollections"
              :key="item.kind + item.id"
              class="meldCard"
              @click="openItem(item)"
            >
              <div class="meldArt">
                <img v-if="item.thumbnail" :src="item.thumbnail" :alt="item.title" loading="lazy" />
                <base-icon v-else icon="music-notes-simple" :size="26" />
                <span class="meldKindBadge">{{ kindLabel(item) }}</span>
              </div>
              <strong>{{ item.title }}</strong>
              <small>{{ item.subtitle || kindLabel(item) }}</small>
            </button>
          </div>
        </section>

        <section
          v-if="currentTracks.length"
          class="meldTrackList"
        >
          <header>
            <div>
              <h2>{{ trackListTitle }}</h2>
              <p v-if="view === 'search'">{{ t('meld.searchResultCount', { count: currentTracks.length }) }}</p>
            </div>
            <button class="meldPlayAll" @click="playAll(currentTracks)">
              <base-icon icon="play" :size="15" />
              <span>{{ t('meld.playAll') }}</span>
            </button>
          </header>

          <button
            v-for="(track, index) in currentTracks"
            :key="track.id + index"
            class="meldTrackRow"
            :class="{ current: nowPlaying && nowPlaying.id === track.id }"
            @click="playTrack(track, currentTracks, index)"
          >
            <span class="meldTrackIndex">
              <base-icon
                v-if="nowPlaying && nowPlaying.id === track.id && playing"
                icon="music-notes-simple"
                :size="15"
              />
              <span v-else>{{ index + 1 }}</span>
            </span>
            <span class="meldTrackArt">
              <img v-if="track.thumbnail" :src="track.thumbnail" :alt="track.title" loading="lazy" />
              <base-icon v-else icon="music-notes-simple" :size="20" />
            </span>
            <span class="meldTrackText">
              <strong>{{ track.title }}</strong>
              <small>{{ track.subtitle || track.artists || t('meld.song') }}</small>
            </span>
            <span class="meldTrackDuration">{{ track.duration }}</span>
            <span class="meldTrackPlay"><base-icon icon="play" :size="15" /></span>
          </button>
        </section>

        <section
          v-for="(shelf, shelfIndex) in visibleShelves"
          :key="shelf.title + shelfIndex"
          class="meldShelf"
        >
          <header>
            <div>
              <h2>{{ shelf.title || t('meld.madeForYou') }}</h2>
              <p v-if="shelf.subtitle">{{ shelf.subtitle }}</p>
            </div>
            <button
              v-if="shelf.browseId"
              class="meldSeeAll"
              @click="openShelf(shelf)"
            >
              {{ t('meld.seeAll') }}
              <base-icon icon="caret-right" :size="13" />
            </button>
          </header>
          <div class="meldCardRow">
            <button
              v-for="item in shelf.items"
              :key="item.kind + item.id"
              class="meldCard"
              @click="openItem(item, shelf.items)"
            >
              <div class="meldArt">
                <img v-if="item.thumbnail" :src="item.thumbnail" :alt="item.title" loading="lazy" />
                <base-icon v-else icon="music-notes-simple" :size="26" />
                <span class="meldCardPlay"><base-icon icon="play" :size="20" /></span>
                <span class="meldKindBadge">{{ kindLabel(item) }}</span>
              </div>
              <strong>{{ item.title }}</strong>
              <small>{{ item.subtitle || kindLabel(item) }}</small>
            </button>
          </div>
        </section>

        <section
          v-if="!hasContent && !loading && !error && view === 'search' && !query"
          class="meldState"
        >
          <div class="meldStateIcon"><base-icon icon="magnifying-glass" :size="30" /></div>
          <h2>{{ t('meld.searchEmpty') }}</h2>
          <p>{{ t('meld.searchEmptyHint') }}</p>
        </section>

        <section
          v-if="!hasContent && !loading && !error && view !== 'library' && view !== 'search'"
          class="meldState"
        >
          <div class="meldStateIcon"><base-icon icon="music-notes-simple" :size="28" /></div>
          <h2>{{ t('meld.empty') }}</h2>
          <p>{{ t('meld.emptyHint') }}</p>
        </section>
      </template>
    </main>

    <div class="meldYouTubeHostWrap" aria-hidden="true">
      <div ref="ytPlayerHost" class="meldYouTubeHost" />
    </div>

    <transition name="meldQueueFade">
      <section v-if="showQueue && nowPlaying" class="meldQueuePanel">
        <header>
          <div>
            <h3>{{ t('meld.queue') }}</h3>
            <p>{{ t('meld.queueCount', { count: queue.length }) }}</p>
          </div>
          <button class="meldIconButton" :aria-label="t('meld.close')" @click="showQueue = false">
            <base-icon icon="x" :size="16" />
          </button>
        </header>
        <div class="meldQueueList">
          <button
            v-for="(track, index) in queue"
            :key="track.id + index"
            :class="{ current: index === queueIndex }"
            @click="playTrack(track, queue, index)"
          >
            <span>{{ index + 1 }}</span>
            <div>
              <strong>{{ track.title }}</strong>
              <small>{{ track.subtitle || track.artists }}</small>
            </div>
            <base-icon v-if="index === queueIndex" icon="music-notes-simple" :size="15" />
          </button>
        </div>
      </section>
    </transition>

    <transition name="meldPlayerUp">
      <section v-if="nowPlaying" class="meldPlayerBar" :class="{ meldPlayerBarError: !!playerError }">
        <div class="meldPlayerArt">
          <img v-if="nowPlaying.thumbnail" :src="nowPlaying.thumbnail" :alt="nowPlaying.title" />
          <base-icon v-else icon="music-notes-simple" :size="22" />
        </div>
        <div class="meldPlayerInfo">
          <strong>{{ nowPlaying.title }}</strong>
          <small>{{ nowPlaying.subtitle || nowPlaying.artists }}</small>
          <div v-if="playerError" class="meldPlayerError">
            <span>{{ t('meld.playerUnavailable') }}</span>
            <a :href="currentYoutubeUrl" target="_blank" rel="noopener">
              {{ t('meld.openInYoutube') }}
            </a>
          </div>
          <div v-else class="meldProgressRow">
            <span>{{ formatTime(position) }}</span>
            <input
              class="meldSeek"
              type="range"
              min="0"
              :max="Math.max(duration, 1)"
              step="1"
              :value="position"
              :aria-label="t('meld.seek')"
              @input="seekTo"
            />
            <span>{{ formatTime(duration) }}</span>
          </div>
        </div>
        <div class="meldPlayerActions">
          <button class="meldQueueButton" :class="{ active: showQueue }" :aria-label="t('meld.queue')" @click="showQueue = !showQueue">
            <base-icon icon="queue" :size="18" />
          </button>
          <button :aria-label="t('meld.previous')" @click="previousTrack">
            <base-icon icon="skip-back" :size="19" />
          </button>
          <button class="meldPlayButton" :aria-label="playing ? t('meld.pause') : t('meld.play')" @click="togglePlayback">
            <base-icon :icon="playing ? 'pause' : 'play'" :size="21" />
          </button>
          <button :aria-label="t('meld.next')" @click="nextTrack">
            <base-icon icon="skip-forward" :size="19" />
          </button>
          <button :aria-label="t('meld.closePlayer')" @click="closePlayer">
            <base-icon icon="x" :size="17" />
          </button>
        </div>
      </section>
    </transition>
  </div>
</template>

<script>
import {
  browseMeld,
  cleanCookieInput,
  clearMeldCookie,
  getMeldHome,
  getMeldLibrary,
  getStoredMeldCookie,
  hasMeldSessionCookie,
  searchMeld,
  storeMeldCookie,
} from "@/renderer/services/youtube-music";
import { ipcRenderer, isMobileApp } from "@/platform/ipc";
import { currentLanguage } from "@/renderer/store/modules/local-music/settings-manager";

let youtubeApiPromise = null;

function loadYouTubeApi() {
  const win = window;
  if (win.YT && win.YT.Player) return Promise.resolve(win.YT);
  if (youtubeApiPromise) return youtubeApiPromise;
  youtubeApiPromise = new Promise((resolve, reject) => {
    const previousHandler = win.onYouTubeIframeAPIReady;
    win.onYouTubeIframeAPIReady = () => {
      if (typeof previousHandler === "function") previousHandler();
      resolve(win.YT);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      youtubeApiPromise = null;
      reject(new Error("YouTube player could not be loaded"));
    };
    document.head.appendChild(script);
  });
  return youtubeApiPromise;
}

function secondsFromDuration(value) {
  if (!value) return 0;
  const parts = String(value)
    .split(":")
    .map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

export default {
  name: "MeldView",
  computed: {
    tabs() {
      return [
        { id: "home", icon: "house", label: "meld.home" },
        { id: "search", icon: "magnifying-glass", label: "meld.search" },
        { id: "library", icon: "playlist", label: "meld.library" },
      ];
    },
    searchCollections() {
      return this.searchResult ? this.searchResult.collections : [];
    },
    currentTracks() {
      if (this.view === "browse" && this.browse) return this.browse.tracks;
      if (this.view === "search" && this.searchResult) return this.searchResult.tracks;
      return [];
    },
    visibleShelves() {
      if (this.view === "browse" && this.browse) return this.browse.shelves;
      if (this.view === "search") return [];
      return this.shelves;
    },
    trackListTitle() {
      if (this.view === "browse" && this.browse) return this.t("meld.tracks");
      return this.t("meld.songs");
    },
    hasContent() {
      if (this.view === "search") {
        return !!(
          this.searchResult &&
          (this.searchResult.top ||
            this.searchResult.tracks.length ||
            this.searchResult.collections.length)
        );
      }
      if (this.view === "browse") return !!this.browse;
      return this.shelves.length > 0;
    },
    currentYoutubeUrl() {
      if (!this.nowPlaying) return "https://music.youtube.com/";
      return `https://music.youtube.com/watch?v=${this.nowPlaying.videoId}`;
    },
  },
  data() {
    return {
      isMobile: isMobileApp,
      alive: true,
      view: "home",
      activeTab: "home",
      shelves: [],
      searchResult: null,
      browse: null,
      libraryRequiresLogin: false,
      query: "",
      searchFocused: false,
      loading: false,
      error: "",
      requestId: 0,
      navHistory: [],
      showAccount: false,
      cookie: "",
      signedIn: false,
      cookieDraft: "",
      loginBusy: false,
      queue: [],
      queueIndex: -1,
      nowPlaying: null,
      playing: false,
      playerReady: false,
      playerError: "",
      ytPlayer: null,
      position: 0,
      duration: 0,
      progressTimer: null,
      showQueue: false,
    };
  },
  mounted() {
    this.cookie = getStoredMeldCookie();
    this.signedIn = hasMeldSessionCookie(this.cookie);
    this.$store.commit("UIcontrollerSetPropertyValue", {
      property: "currentPage",
      newValue: "FLBing",
    });
    window.__FLB_MELD_BACK__ = this.handleAndroidBack;
    window.addEventListener("flb-meld-search", this.handleExternalSearch);
    const pendingSearch = window.__FLB_MELD_PENDING_SEARCH__;
    if (pendingSearch) {
      delete window.__FLB_MELD_PENDING_SEARCH__;
      this.query = pendingSearch;
      this.view = "search";
      this.activeTab = "search";
      this.$nextTick(() => this.runSearch());
    } else {
      this.loadHome();
    }
  },
  beforeDestroy() {
    this.alive = false;
    if (window.__FLB_MELD_BACK__ === this.handleAndroidBack) {
      delete window.__FLB_MELD_BACK__;
    }
    window.removeEventListener("flb-meld-search", this.handleExternalSearch);
    this.stopPlayback();
  },
  methods: {
    notify(title, subTitle, type = "normal") {
      this.$store.commit("pushNotification", { title, subTitle, type });
    },
    handleExternalSearch(event) {
      const query = event && event.detail ? String(event.detail) : "";
      if (!query) return;
      this.query = query;
      this.switchTab("search", true);
      this.$nextTick(() => this.runSearch());
    },
    focusSearch() {
      this.$nextTick(() => {
        if (this.$refs.searchInput) this.$refs.searchInput.focus();
      });
    },
    scrollTop() {
      this.$nextTick(() => {
        if (this.$refs.content) this.$refs.content.scrollTop = 0;
      });
    },
    async loadHome() {
      const requestId = ++this.requestId;
      this.view = "home";
      this.activeTab = "home";
      this.navHistory = [];
      this.loading = true;
      this.error = "";
      try {
        const result = await getMeldHome(this.cookie, currentLanguage.value);
        if (!this.alive || requestId !== this.requestId) return;
        this.shelves = result.shelves;
        this.scrollTop();
      } catch (error) {
        if (!this.alive || requestId !== this.requestId) return;
        this.error = error.message || String(error);
      } finally {
        if (this.alive && requestId === this.requestId) this.loading = false;
      }
    },
    async loadLibrary() {
      const requestId = ++this.requestId;
      this.view = "library";
      this.activeTab = "library";
      this.navHistory = [];
      this.error = "";
      if (!this.cookie) {
        this.loading = false;
        this.shelves = [];
        this.libraryRequiresLogin = true;
        return;
      }
      this.loading = true;
      try {
        const result = await getMeldLibrary(this.cookie, currentLanguage.value);
        if (!this.alive || requestId !== this.requestId) return;
        this.shelves = result.shelves;
        this.libraryRequiresLogin = result.requiresLogin;
        if (result.requiresLogin) {
          this.signedIn = false;
          this.notify(
            this.t("meld.sessionExpired"),
            this.t("meld.sessionExpiredHint"),
            "danger"
          );
        }
        this.scrollTop();
      } catch (error) {
        if (!this.alive || requestId !== this.requestId) return;
        this.error = error.message || String(error);
      } finally {
        if (this.alive && requestId === this.requestId) this.loading = false;
      }
    },
    async runSearch() {
      const query = this.query.trim();
      if (!query) {
        this.requestId += 1;
        this.loading = false;
        this.view = "search";
        this.activeTab = "search";
        this.searchResult = null;
        this.error = "";
        return;
      }
      const requestId = ++this.requestId;
      this.view = "search";
      this.activeTab = "search";
      this.navHistory = [];
      this.loading = true;
      this.error = "";
      try {
        const result = await searchMeld(query, this.cookie, currentLanguage.value);
        if (!this.alive || requestId !== this.requestId) return;
        this.searchResult = result;
        this.scrollTop();
      } catch (error) {
        if (!this.alive || requestId !== this.requestId) return;
        this.error = error.message || String(error);
      } finally {
        if (this.alive && requestId === this.requestId) this.loading = false;
      }
    },
    clearSearch() {
      this.requestId += 1;
      this.loading = false;
      this.query = "";
      this.searchResult = null;
      this.error = "";
      this.view = "search";
      this.activeTab = "search";
      this.focusSearch();
    },
    switchTab(tab, keepQuery = false) {
      if (tab === "home") {
        this.loadHome();
        return;
      }
      if (tab === "search") {
        this.requestId += 1;
        this.loading = false;
        this.error = "";
        this.activeTab = "search";
        this.view = "search";
        this.navHistory = [];
        if (!keepQuery) this.focusSearch();
        return;
      }
      if (tab === "library") this.loadLibrary();
    },
    rememberCurrentView() {
      this.navHistory.push({
        view: this.view,
        activeTab: this.activeTab,
        shelves: this.shelves,
        searchResult: this.searchResult,
        browse: this.browse,
        query: this.query,
      });
    },
    goBack() {
      const previous = this.navHistory.pop();
      if (!previous) return;
      this.requestId += 1;
      this.loading = false;
      this.view = previous.view;
      this.activeTab = previous.activeTab;
      this.shelves = previous.shelves;
      this.searchResult = previous.searchResult;
      this.browse = previous.browse;
      this.query = previous.query;
      this.scrollTop();
    },
    openShelf(shelf) {
      if (!shelf || !shelf.browseId) {
        const tracks = shelf ? shelf.items.filter((item) => item.kind === "song") : [];
        if (tracks.length) this.playAll(tracks);
        return;
      }
      this.loadBrowse({
        browseId: shelf.browseId,
        params: shelf.params,
        title: shelf.title,
      });
    },
    openItem(item, queue = []) {
      if (!item) return;
      if (item.kind === "song") {
        const playable = queue.filter(
          (entry) => entry.kind === "song" && entry.videoId
        );
        this.playTrack(item, playable);
        return;
      }
      this.loadBrowse(item);
    },
    async loadBrowse(item) {
      if (!item || !item.browseId) return;
      const requestId = ++this.requestId;
      this.rememberCurrentView();
      this.loading = true;
      this.error = "";
      try {
        const page = await browseMeld(
          item.browseId,
          item.params || "",
          this.cookie,
          currentLanguage.value
        );
        if (!this.alive || requestId !== this.requestId) return;
        this.browse = {
          ...page,
          title: page.title || item.title || this.t("meld.collection"),
        };
        this.view = "browse";
        this.scrollTop();
      } catch (error) {
        if (!this.alive || requestId !== this.requestId) return;
        this.navHistory.pop();
        this.error = error.message || String(error);
      } finally {
        if (this.alive && requestId === this.requestId) this.loading = false;
      }
    },
    retry() {
      if (this.view === "search" && this.query.trim()) this.runSearch();
      else if (this.view === "library") this.loadLibrary();
      else if (this.view === "browse" && this.browse) {
        const current = {
          browseId: this.browse.browseId || "",
          title: this.browse.title,
        };
        if (current.browseId) this.loadBrowse(current);
        else this.loadHome();
      } else this.loadHome();
    },
    kindLabel(item) {
      if (!item) return "";
      if (item.kind === "song") return this.t("meld.song");
      if (item.kind === "album") return this.t("meld.album");
      if (item.kind === "artist") return this.t("meld.artist");
      if (item.kind === "mood") return this.t("meld.mood");
      return this.t("meld.playlist");
    },
    trackCountLabel(count) {
      return this.t("meld.trackCount", { count });
    },
    formatTime(value) {
      const seconds = Math.max(0, Math.floor(Number(value) || 0));
      const minutes = Math.floor(seconds / 60);
      return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
    },
    toggleAccountPanel() {
      this.showAccount = !this.showAccount;
      if (this.showAccount) this.cookieDraft = "";
    },
    saveCookie() {
      const cleaned = cleanCookieInput(this.cookieDraft);
      if (!hasMeldSessionCookie(cleaned)) {
        this.notify(
          this.t("meld.loginFailed"),
          this.t("meld.loginFailedHint"),
          "danger"
        );
        return;
      }
      storeMeldCookie(cleaned);
      this.cookie = cleaned;
      this.signedIn = true;
      this.cookieDraft = "";
      this.showAccount = false;
      this.notify(
        this.t("meld.sessionSaved"),
        this.t("meld.sessionSavedHint"),
        "success"
      );
      this.loadLibrary();
    },
    async signInWithBrowser() {
      if (this.isMobile || this.loginBusy) return;
      this.loginBusy = true;
      try {
        const cookie = await ipcRenderer.invoke("meldLogin");
        if (!hasMeldSessionCookie(cookie || "")) {
          this.notify(
            this.t("meld.loginCancelled"),
            this.t("meld.loginCancelledHint"),
            "normal"
          );
          return;
        }
        storeMeldCookie(cookie);
        this.cookie = cleanCookieInput(cookie);
        this.signedIn = true;
        this.cookieDraft = "";
        this.showAccount = false;
        this.notify(
          this.t("meld.sessionSaved"),
          this.t("meld.sessionSavedHint"),
          "success"
        );
        this.loadLibrary();
      } catch (error) {
        this.notify(
          this.t("meld.loginFailed"),
          error.message || String(error),
          "danger"
        );
      } finally {
        this.loginBusy = false;
      }
    },
    signOut() {
      clearMeldCookie();
      this.cookie = "";
      this.cookieDraft = "";
      this.signedIn = false;
      this.shelves = [];
      this.libraryRequiresLogin = true;
      this.showAccount = false;
      this.notify(
        this.t("meld.sessionRemoved"),
        this.t("meld.sessionRemovedHint"),
        "normal"
      );
    },
    pauseLocalPlayback() {
      document.querySelectorAll("audio").forEach((audio) => {
        try {
          audio.pause();
        } catch (error) {
          // The element can already be gone during a route change.
        }
      });
      this.$store.commit("setPlayingState", false);
    },
    playAll(tracks) {
      const playable = (tracks || []).filter(
        (track) => track.kind === "song" && track.videoId
      );
      if (playable.length) this.playTrack(playable[0], playable, 0);
    },
    playTrack(track, tracks = [], forcedIndex = -1) {
      if (!track || track.kind !== "song" || !track.videoId) return;
      const playable = (tracks || []).filter(
        (entry) => entry.kind === "song" && entry.videoId
      );
      if (!playable.length) playable.push(track);
      let index =
        forcedIndex >= 0
          ? forcedIndex
          : playable.findIndex((entry) => entry.videoId === track.videoId);
      if (index < 0) {
        playable.unshift(track);
        index = 0;
      }
      this.queue = playable;
      this.queueIndex = index;
      this.nowPlaying = track;
      this.playing = true;
      this.playerError = "";
      this.position = 0;
      this.duration = secondsFromDuration(track.duration);
      this.showQueue = false;
      this.$store.commit("UIcontrollerSetPropertyValue", {
        property: "meldPlaying",
        newValue: true,
      });
      this.pauseLocalPlayback();
      this.$nextTick(() => this.loadYouTubeVideo(track.videoId));
    },
    async loadYouTubeVideo(videoId) {
      if (!videoId) return;
      this.playerReady = false;
      try {
        const YT = await loadYouTubeApi();
        if (!this.alive || !this.nowPlaying) return;
        if (!this.ytPlayer) {
          const host = this.$refs.ytPlayerHost;
          if (!host) return;
          const element = document.createElement("div");
          host.appendChild(element);
          const origin = /^https?:/.test(window.location.origin)
            ? window.location.origin
            : undefined;
          this.ytPlayer = new YT.Player(element, {
            width: "320",
            height: "180",
            videoId,
            playerVars: {
              autoplay: 1,
              controls: 0,
              disablekb: 1,
              fs: 0,
              playsinline: 1,
              rel: 0,
              modestbranding: 1,
              iv_load_policy: 3,
              origin,
            },
            events: {
              onReady: this.handlePlayerReady,
              onStateChange: this.handlePlayerState,
              onError: this.handlePlayerError,
            },
          });
        } else if (typeof this.ytPlayer.loadVideoById === "function") {
          this.ytPlayer.loadVideoById(videoId);
          this.ytPlayer.playVideo();
        }
        this.startProgressTimer();
      } catch (error) {
        this.playerError = this.t("meld.playerUnavailable");
        this.playing = false;
      }
    },
    handlePlayerReady() {
      this.playerReady = true;
      if (!this.ytPlayer) return;
      try {
        this.ytPlayer.setVolume(85);
        this.ytPlayer.playVideo();
      } catch (error) {
        // The API is ready but the video can still be unavailable.
      }
    },
    handlePlayerState(event) {
      if (!event) return;
      if (event.data === 1) {
        this.playing = true;
        this.playerError = "";
      } else if (event.data === 2) {
        this.playing = false;
      } else if (event.data === 0) {
        this.nextTrack();
      }
    },
    handlePlayerError() {
      this.playing = false;
      this.playerError = this.t("meld.playerUnavailable");
    },
    startProgressTimer() {
      this.stopProgressTimer();
      this.progressTimer = window.setInterval(() => {
        const player = this.ytPlayer;
        if (!player || typeof player.getCurrentTime !== "function") return;
        try {
          const current = player.getCurrentTime();
          const total = player.getDuration();
          if (Number.isFinite(current)) this.position = current;
          if (Number.isFinite(total) && total > 0) this.duration = total;
        } catch (error) {
          // The player was destroyed while the timer was running.
        }
      }, 500);
    },
    stopProgressTimer() {
      if (this.progressTimer) {
        window.clearInterval(this.progressTimer);
        this.progressTimer = null;
      }
    },
    togglePlayback() {
      if (!this.ytPlayer) {
        if (this.nowPlaying) this.loadYouTubeVideo(this.nowPlaying.videoId);
        return;
      }
      if (this.playing) {
        this.ytPlayer.pauseVideo();
        this.playing = false;
      } else {
        this.ytPlayer.playVideo();
        this.playing = true;
      }
    },
    seekTo(event) {
      const value = Number(event.target.value) || 0;
      this.position = value;
      if (this.ytPlayer && typeof this.ytPlayer.seekTo === "function") {
        this.ytPlayer.seekTo(value, true);
      }
    },
    nextTrack() {
      if (!this.queue.length) return;
      const next = (this.queueIndex + 1) % this.queue.length;
      this.playTrack(this.queue[next], this.queue, next);
    },
    previousTrack() {
      if (!this.queue.length) return;
      if (this.position > 4 && this.ytPlayer) {
        this.ytPlayer.seekTo(0, true);
        this.position = 0;
        return;
      }
      const previous =
        (this.queueIndex - 1 + this.queue.length) % this.queue.length;
      this.playTrack(this.queue[previous], this.queue, previous);
    },
    stopPlayback() {
      this.stopProgressTimer();
      if (this.ytPlayer && typeof this.ytPlayer.destroy === "function") {
        try {
          this.ytPlayer.destroy();
        } catch (error) {
          // The iframe can already be detached by the route change.
        }
      }
      this.ytPlayer = null;
      this.playerReady = false;
      this.nowPlaying = null;
      this.playing = false;
      this.queue = [];
      this.queueIndex = -1;
      this.position = 0;
      this.duration = 0;
      this.playerError = "";
      this.showQueue = false;
      this.$store.commit("UIcontrollerSetPropertyValue", {
        property: "meldPlaying",
        newValue: false,
      });
    },
    closePlayer() {
      this.stopPlayback();
    },
    handleAndroidBack() {
      if (this.showQueue) {
        this.showQueue = false;
        return true;
      }
      if (this.showAccount) {
        this.showAccount = false;
        return true;
      }
      if (this.nowPlaying) {
        this.closePlayer();
        return true;
      }
      if (this.navHistory.length) {
        this.goBack();
        return true;
      }
      return false;
    },
  },
};
</script>

<style lang="scss">
.MeldView {
  box-sizing: border-box;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  color: var(--textColor);

  * {
    box-sizing: border-box;
  }

  button,
  input,
  textarea {
    font-family: inherit;
  }

  button {
    color: var(--textColor);
  }

  .meldTopbar {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 14px;
    padding: 12px 20px 8px;
  }

  .meldBrand {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .meldBack {
    display: grid;
    flex: 0 0 auto;
    width: 34px;
    height: 34px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: var(--primaryColor);
    place-items: center;

    &:hover {
      background: var(--diplomaColor);
    }
  }

  .meldLogo {
    display: grid;
    flex: 0 0 auto;
    width: 42px;
    height: 42px;
    overflow: hidden;
    border-radius: 14px;
    background: linear-gradient(135deg, var(--accentColor), #ff5e8a);
    place-items: center;

    img {
      width: 24px;
      height: 24px;
      object-fit: contain;
      filter: brightness(0) invert(1);
    }
  }

  .meldBrandText {
    display: flex;
    flex-direction: column;
    min-width: 0;

    h1 {
      margin: 0;
      font-size: 1.15rem;
      font-weight: 700;
      line-height: 1.1;
      letter-spacing: -0.02em;
    }

    span {
      margin-top: 2px;
      font-size: 0.67rem;
      font-weight: 500;
      letter-spacing: 0.08em;
      opacity: 0.58;
      text-transform: uppercase;
    }
  }

  .meldSearch {
    display: flex;
    flex: 1 1 420px;
    align-items: center;
    gap: 8px;
    min-width: 140px;
    max-width: 560px;
    height: 42px;
    padding: 0 5px 0 14px;
    border: 1px solid transparent;
    border-radius: 999px;
    background: var(--primaryColor);
    transition: border-color 0.2s ease, background 0.2s ease;

    &:focus-within {
      border-color: var(--accentColor);
      background: var(--secondaryColor);
    }

    input {
      flex: 1 1 auto;
      width: 100%;
      min-width: 0;
      border: 0;
      outline: 0;
      background: transparent;
      color: var(--textColor);
      font-size: 0.9rem;

      &::placeholder {
        color: var(--textColor);
        opacity: 0.48;
      }

      &::-webkit-search-cancel-button {
        display: none;
      }
    }
  }

  .meldSearchIcon {
    flex: 0 0 auto;
    opacity: 0.56;
  }

  .meldSearchClear,
  .meldSearchSubmit,
  .meldAccountButton,
  .meldIconButton,
  .meldQueueButton {
    display: grid;
    flex: 0 0 auto;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    place-items: center;

    &:hover {
      background: var(--diplomaColor);
    }
  }

  .meldSearchClear {
    width: 28px;
    height: 28px;
    opacity: 0.6;
  }

  .meldSearchSubmit {
    width: 34px;
    height: 34px;
    background: var(--accentColor);
    color: #fff;
  }

  .meldAccountButton {
    width: 42px;
    height: 42px;
    background: var(--primaryColor);

    &.connected {
      color: var(--accentColor);
    }
  }

  .meldTabs {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 4px;
    padding: 2px 20px 8px;

    > button {
      display: flex;
      align-items: center;
      gap: 7px;
      height: 34px;
      padding: 0 14px;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: var(--textColor);
      font-size: 0.78rem;
      font-weight: 600;
      opacity: 0.62;

      &:hover,
      &.active {
        background: var(--primaryColor);
        opacity: 1;
      }

      &.active {
        color: var(--accentColor);
      }
    }
  }

  .meldTabsSpacer {
    flex: 1 1 auto;
  }

  .meldRefresh {
    width: 32px;
    height: 32px;
    padding: 0 !important;
    display: grid !important;
    place-items: center;
    opacity: 0.7 !important;
  }

  .meldLoadingBar {
    position: relative;
    flex: 0 0 auto;
    height: 2px;
    overflow: hidden;
    background: var(--primaryColor);

    span {
      display: block;
      width: 38%;
      height: 100%;
      border-radius: 999px;
      background: var(--accentColor);
      animation: meldLoading 1.1s ease-in-out infinite;
    }
  }

  .meldContent {
    flex: 1 1 auto;
    min-height: 0;
    padding: 10px 20px 150px;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    scroll-behavior: smooth;
  }

  .meldHero,
  .meldBrowseHeader {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 26px;
    padding: 24px;
    border-radius: 24px;
    background:
      radial-gradient(circle at 80% 0%, var(--diplomaColor), transparent 45%),
      var(--primaryColor);

    h2 {
      margin: 4px 0 6px;
      font-size: clamp(1.35rem, 2.5vw, 2.15rem);
      line-height: 1.05;
      letter-spacing: -0.04em;
    }

    p {
      max-width: 620px;
      margin: 0;
      font-size: 0.85rem;
      line-height: 1.5;
      opacity: 0.68;
    }
  }

  .meldHeroActions,
  .meldBrowseActions {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .meldEyebrow {
    display: block;
    color: var(--accentColor);
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .meldPrimaryButton,
  .meldSecondaryButton {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 36px;
    padding: 0 16px;
    border: 0;
    border-radius: 999px;
    font-size: 0.78rem;
    font-weight: 700;
    text-decoration: none;
    transition: filter 0.15s ease, background 0.15s ease;
  }

  .meldPrimaryButton {
    background: var(--accentColor);
    color: #fff;

    &:hover {
      filter: brightness(1.1);
    }

    &:disabled {
      opacity: 0.45;
      pointer-events: none;
    }
  }

  .meldSecondaryButton {
    background: var(--primaryColor);
    color: var(--textColor);

    &:hover {
      background: var(--diplomaColor);
    }
  }

  .meldIconButton {
    width: 30px;
    height: 30px;
  }

  .meldTextButton {
    padding: 4px 10px;
    border: 0;
    border-radius: 999px;
    background: var(--primaryColor);
    color: var(--textColor);
    font-size: 0.72rem;

    &:hover {
      background: var(--diplomaColor);
    }
  }

  .meldShelf,
  .meldSearchCollections,
  .meldTrackList {
    margin-bottom: 28px;

    > header {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 12px;

      h2 {
        margin: 0;
        font-size: 1.02rem;
        font-weight: 700;
        letter-spacing: -0.02em;
      }

      p {
        margin: 3px 0 0;
        font-size: 0.72rem;
        opacity: 0.55;
      }
    }
  }

  .meldSeeAll {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 2px;
    padding: 5px 8px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--textColor);
    font-size: 0.68rem;
    font-weight: 700;
    opacity: 0.6;

    &:hover {
      background: var(--primaryColor);
      opacity: 1;
    }
  }

  .meldCardRow {
    display: flex;
    gap: 14px;
    padding: 2px 1px 8px;
    overflow-x: auto;
    scroll-snap-type: x proximity;
    scrollbar-width: thin;

    &::-webkit-scrollbar {
      height: 6px;
    }
  }

  .meldCard {
    display: flex;
    flex: 0 0 166px;
    flex-direction: column;
    width: 166px;
    padding: 8px;
    border: 0;
    border-radius: 16px;
    background: transparent;
    text-align: left;
    scroll-snap-align: start;

    &:hover {
      background: var(--primaryColor);

      .meldCardPlay {
        opacity: 1;
        transform: translateY(0);
      }
    }

    strong {
      display: block;
      width: 100%;
      margin-top: 9px;
      overflow: hidden;
      font-size: 0.8rem;
      font-weight: 700;
      line-height: 1.25;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    small {
      display: block;
      width: 100%;
      margin-top: 3px;
      overflow: hidden;
      font-size: 0.68rem;
      line-height: 1.3;
      opacity: 0.55;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .meldArt {
    position: relative;
    display: grid;
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: 12px;
    background: var(--secondaryColor);
    place-items: center;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    > .ph {
      opacity: 0.45;
    }
  }

  .meldCardPlay {
    position: absolute;
    right: 8px;
    bottom: 8px;
    display: grid;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: var(--accentColor);
    color: #fff;
    opacity: 0;
    transform: translateY(4px);
    transition: opacity 0.18s ease, transform 0.18s ease;
    place-items: center;
  }

  .meldKindBadge {
    position: absolute;
    top: 7px;
    left: 7px;
    max-width: calc(100% - 14px);
    padding: 2px 7px;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    font-size: 0.55rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
    backdrop-filter: blur(8px);
  }

  .meldTrackList {
    max-width: 1000px;

    .meldPlayAll {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      min-height: 30px;
      padding: 0 13px;
      border: 0;
      border-radius: 999px;
      background: var(--accentColor);
      color: #fff;
      font-size: 0.7rem;
      font-weight: 700;
    }
  }

  .meldTrackRow {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 56px;
    padding: 6px 8px;
    border: 0;
    border-radius: 11px;
    background: transparent;
    text-align: left;

    &:hover,
    &.current {
      background: var(--primaryColor);
    }

    &.current .meldTrackText strong {
      color: var(--accentColor);
    }
  }

  .meldTrackIndex {
    display: grid;
    flex: 0 0 24px;
    width: 24px;
    color: var(--textColor);
    font-size: 0.7rem;
    opacity: 0.45;
    place-items: center;
  }

  .meldTrackArt {
    display: grid;
    flex: 0 0 42px;
    width: 42px;
    height: 42px;
    overflow: hidden;
    border-radius: 8px;
    background: var(--secondaryColor);
    place-items: center;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  .meldTrackText {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;

    strong,
    small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    strong {
      font-size: 0.8rem;
      font-weight: 600;
    }

    small {
      margin-top: 2px;
      font-size: 0.66rem;
      opacity: 0.56;
    }
  }

  .meldTrackDuration {
    flex: 0 0 auto;
    padding-left: 6px;
    font-size: 0.66rem;
    font-variant-numeric: tabular-nums;
    opacity: 0.48;
  }

  .meldTrackPlay {
    display: none;
    flex: 0 0 auto;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--diplomaColor);
    place-items: center;
  }

  .meldTrackRow:hover .meldTrackPlay {
    display: grid;
  }

  .meldTopResult {
    max-width: 1000px;
    margin-bottom: 18px;

    > button {
      display: flex;
      align-items: center;
      gap: 16px;
      width: 100%;
      padding: 16px;
      border: 0;
      border-radius: 20px;
      background: var(--primaryColor);
      text-align: left;

      &:hover {
        background: var(--secondaryColor);
      }

      h2 {
        margin: 3px 0 4px;
        font-size: 1.35rem;
        line-height: 1.15;
      }

      p {
        margin: 0;
        font-size: 0.75rem;
        opacity: 0.6;
      }
    }
  }

  .meldTopArt {
    display: grid;
    flex: 0 0 74px;
    width: 74px;
    height: 74px;
    overflow: hidden;
    border-radius: 14px;
    background: var(--secondaryColor);
    place-items: center;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  .meldTopResultIcon {
    display: grid;
    flex: 0 0 auto;
    width: 40px;
    height: 40px;
    margin-left: auto;
    border-radius: 50%;
    background: var(--accentColor);
    color: #fff;
    place-items: center;
  }

  .meldBrowseHeader {
    align-items: center;
    justify-content: flex-start;
  }

  .meldBrowseArt {
    display: grid;
    flex: 0 0 148px;
    width: 148px;
    height: 148px;
    overflow: hidden;
    border-radius: 18px;
    background: var(--secondaryColor);
    box-shadow: 0 18px 45px rgba(0, 0, 0, 0.24);
    place-items: center;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  .meldBrowseInfo {
    min-width: 0;

    h2 {
      overflow-wrap: anywhere;
    }
  }

  .meldCount {
    font-size: 0.7rem;
    opacity: 0.52;
  }

  .meldAccountPanel {
    max-width: 760px;
    margin: 4px 0 24px;
    padding: 18px;
    border: 1px solid var(--borderColor);
    border-radius: 20px;
    background: var(--primaryColor);
  }

  .meldAccountHeader {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;

    h2 {
      margin: 0 0 4px;
      font-size: 1.05rem;
    }

    p {
      margin: 0;
      font-size: 0.75rem;
      line-height: 1.5;
      opacity: 0.62;
    }
  }

  .meldAccountConnected {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 16px;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--secondaryColor);

    .meldTextButton {
      margin-left: auto;
    }
  }

  .meldStatusDot {
    display: block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #35d07f;
    box-shadow: 0 0 0 4px rgba(53, 208, 127, 0.16);
  }

  .meldLoginActions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 16px 0;
  }

  .meldCookieLabel {
    display: block;
    margin: 4px 0 7px;
    font-size: 0.7rem;
    font-weight: 700;
    opacity: 0.66;
  }

  .meldCookieInput {
    display: block;
    width: 100%;
    min-height: 90px;
    padding: 10px 12px;
    resize: vertical;
    border: 1px solid var(--borderColor);
    border-radius: 12px;
    outline: 0;
    background: var(--secondaryColor);
    color: var(--textColor);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.7rem;
    line-height: 1.45;

    &:focus {
      border-color: var(--accentColor);
    }

    &::placeholder {
      color: var(--textColor);
      opacity: 0.4;
    }
  }

  .meldCookieHint {
    margin: 7px 0 12px;
    font-size: 0.66rem;
    line-height: 1.5;
    opacity: 0.52;
  }

  .meldSaveCookie {
    min-height: 34px;
  }

  .meldState {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 46vh;
    padding: 30px 18px;
    text-align: center;

    h2 {
      margin: 16px 0 6px;
      font-size: 1.2rem;
    }

    p {
      max-width: 460px;
      margin: 0 0 18px;
      font-size: 0.8rem;
      line-height: 1.55;
      opacity: 0.58;
    }

    .meldPrimaryButton,
    .meldSecondaryButton {
      margin: 3px;
    }
  }

  .meldInlineError {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 0 18px;
    padding: 10px 12px;
    border: 1px solid var(--borderColor);
    border-radius: 14px;
    background: var(--primaryColor);
    background: color-mix(in srgb, #ff4d6d 12%, var(--primaryColor));
    font-size: 0.74rem;

    span {
      flex: 1 1 auto;
      min-width: 0;
      line-height: 1.4;
      overflow-wrap: anywhere;
    }

    .meldTextButton,
    .meldIconButton {
      flex: 0 0 auto;
    }
  }

  .meldSignInState {
    min-height: 52vh;
  }

  .meldStateIcon,
  .meldLoadingDisc {
    display: grid;
    width: 68px;
    height: 68px;
    border-radius: 22px;
    background: var(--primaryColor);
    color: var(--accentColor);
    place-items: center;
  }

  .meldLoadingDisc {
    position: relative;
    border-radius: 50%;
    background: var(--primaryColor);

    span {
      display: block;
      width: 18px;
      height: 18px;
      border: 2px solid var(--accentColor);
      border-top-color: transparent;
      border-radius: 50%;
      animation: meldSpin 0.8s linear infinite;
    }
  }

  .meldYouTubeHostWrap {
    position: fixed;
    right: 0;
    bottom: 0;
    width: 1px;
    height: 1px;
    overflow: hidden;
    opacity: 0;
    pointer-events: none;
  }

  .meldPlayerBar {
    position: fixed;
    z-index: 55;
    right: 20px;
    bottom: 16px;
    left: 196px;
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 74px;
    padding: 9px 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 18px;
    background: var(--secondaryColor);
    box-shadow: 0 22px 70px rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(24px);
  }

  .meldPlayerArt {
    display: grid;
    flex: 0 0 54px;
    width: 54px;
    height: 54px;
    overflow: hidden;
    border-radius: 10px;
    background: var(--primaryColor);
    place-items: center;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  .meldPlayerInfo {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
    gap: 3px;

    > strong,
    > small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    > strong {
      font-size: 0.82rem;
      font-weight: 700;
    }

    > small {
      font-size: 0.67rem;
      opacity: 0.56;
    }
  }

  .meldProgressRow {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-top: 2px;

    span {
      flex: 0 0 auto;
      font-size: 0.58rem;
      font-variant-numeric: tabular-nums;
      opacity: 0.48;
    }
  }

  .meldSeek {
    width: 100%;
    height: 3px;
    margin: 0;
    accent-color: var(--accentColor);
    cursor: pointer;
  }

  .meldPlayerActions {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 4px;

    > button {
      display: grid;
      width: 36px;
      height: 36px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: var(--textColor);
      place-items: center;

      &:hover {
        background: var(--primaryColor);
      }
    }

    .meldQueueButton.active {
      color: var(--accentColor);
    }

    .meldPlayButton {
      width: 42px;
      height: 42px;
      background: var(--accentColor);
      color: #fff;

      &:hover {
        filter: brightness(1.1);
        background: var(--accentColor);
      }
    }
  }

  .meldPlayerError {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    margin-top: 2px;
    color: #ffc3c3;
    font-size: 0.64rem;

    a {
      color: #fff;
      font-weight: 700;
      text-decoration: underline;
    }
  }

  .meldQueuePanel {
    position: fixed;
    z-index: 54;
    right: 20px;
    bottom: 100px;
    left: 196px;
    max-height: 42vh;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 18px;
    background: var(--secondaryColor);
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(24px);

    > header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 16px 10px;

      h3 {
        margin: 0;
        font-size: 0.9rem;
      }

      p {
        margin: 3px 0 0;
        font-size: 0.66rem;
        opacity: 0.5;
      }
    }
  }

  .meldQueueList {
    max-height: calc(42vh - 64px);
    padding: 0 8px 8px;
    overflow-y: auto;

    > button {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      min-height: 44px;
      padding: 6px 8px;
      border: 0;
      border-radius: 9px;
      background: transparent;
      text-align: left;

      &:hover,
      &.current {
        background: var(--primaryColor);
      }

      > span {
        flex: 0 0 20px;
        font-size: 0.62rem;
        opacity: 0.42;
      }

      > div {
        display: flex;
        flex: 1 1 auto;
        flex-direction: column;
        min-width: 0;

        strong,
        small {
          overflow: hidden;
          font-size: 0.72rem;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        small {
          margin-top: 2px;
          font-size: 0.62rem;
          opacity: 0.5;
        }
      }
    }
  }
}

@keyframes meldLoading {
  0% {
    transform: translateX(-110%);
  }
  100% {
    transform: translateX(360%);
  }
}

@keyframes meldSpin {
  to {
    transform: rotate(360deg);
  }
}

.meldQueueFade-enter-active,
.meldQueueFade-leave-active,
.meldPlayerUp-enter-active,
.meldPlayerUp-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.meldQueueFade-enter,
.meldQueueFade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.meldPlayerUp-enter,
.meldPlayerUp-leave-to {
  opacity: 0;
  transform: translateY(14px);
}

@media (max-width: 900px) {
  .MeldView {
    .meldContent {
      padding-right: 14px;
      padding-left: 14px;
    }

    .meldTopbar,
    .meldTabs {
      padding-right: 14px;
      padding-left: 14px;
    }

    .meldPlayerBar,
    .meldQueuePanel {
      left: 74px;
    }
  }
}

@media (max-width: 700px), (hover: none) and (pointer: coarse) {
  .MeldView {
    .meldTopbar {
      gap: 8px;
      padding: calc(env(safe-area-inset-top) + 8px) 10px 6px;
    }

    .meldBrandText {
      display: none;
    }

    .meldLogo {
      width: 36px;
      height: 36px;
      border-radius: 12px;

      img {
        width: 20px;
        height: 20px;
      }
    }

    .meldBack {
      width: 32px;
      height: 32px;
    }

    .meldSearch {
      flex-basis: 0;
      height: 38px;
      padding-left: 11px;
    }

    .meldSearchSubmit {
      width: 30px;
      height: 30px;
    }

    .meldAccountButton {
      width: 38px;
      height: 38px;
    }

    .meldTabs {
      gap: 2px;
      padding: 0 10px 6px;

      > button {
        flex: 1 1 0;
        justify-content: center;
        height: 36px;
        padding: 0 6px;

        span {
          font-size: 0.68rem;
        }
      }
    }

    .meldRefresh {
      display: none !important;
    }

    .meldContent {
      padding: 6px 10px calc(170px + env(safe-area-inset-bottom));
    }

    .meldHero {
      margin-bottom: 18px;
      padding: 17px;
      border-radius: 18px;

      h2 {
        font-size: 1.35rem;
      }

      p {
        font-size: 0.76rem;
      }
    }

    .meldHeroActions {
      display: none;
    }

    .meldBrowseHeader {
      display: block;
      margin-bottom: 18px;
      padding: 15px;
      border-radius: 18px;
    }

    .meldBrowseArt {
      width: 104px;
      height: 104px;
      margin-bottom: 12px;
      border-radius: 14px;
    }

    .meldBrowseInfo h2 {
      font-size: 1.3rem;
    }

    .meldBrowseActions {
      margin-top: 10px;
    }

    .meldShelf,
    .meldSearchCollections,
    .meldTrackList {
      margin-bottom: 21px;

      > header h2 {
        font-size: 0.94rem;
      }
    }

    .meldCardRow {
      gap: 9px;
      margin-right: -10px;
      padding-right: 10px;
    }

    .meldCard {
      flex-basis: 132px;
      width: 132px;
      padding: 6px;
      border-radius: 13px;

      strong {
        margin-top: 7px;
        font-size: 0.73rem;
      }

      small {
        font-size: 0.62rem;
      }
    }

    .meldArt {
      border-radius: 10px;
    }

    .meldKindBadge {
      top: 5px;
      left: 5px;
      padding: 1px 6px;
      font-size: 0.48rem;
    }

    .meldCardPlay {
      display: none;
    }

    .meldTopResult > button {
      padding: 12px;
      border-radius: 16px;

      h2 {
        font-size: 1.05rem;
      }
    }

    .meldTopArt {
      flex-basis: 58px;
      width: 58px;
      height: 58px;
      border-radius: 11px;
    }

    .meldTrackRow {
      min-height: 54px;
      padding: 5px 4px;
    }

    .meldTrackArt {
      flex-basis: 38px;
      width: 38px;
      height: 38px;
    }

    .meldTrackIndex {
      flex-basis: 20px;
      width: 20px;
    }

    .meldTrackDuration {
      font-size: 0.6rem;
    }

    .meldAccountPanel {
      padding: 14px;
      border-radius: 16px;
    }

    .meldLoginActions {
      > * {
        flex: 1 1 100%;
      }
    }

    .meldPlayerBar {
      right: 6px;
      bottom: calc(75px + env(safe-area-inset-bottom));
      left: 6px;
      gap: 8px;
      min-height: 68px;
      padding: 8px;
      border-radius: 15px;
    }

    .meldPlayerArt {
      flex-basis: 46px;
      width: 46px;
      height: 46px;
    }

    .meldPlayerInfo > strong {
      font-size: 0.76rem;
    }

    .meldPlayerInfo > small {
      font-size: 0.62rem;
    }

    .meldPlayerActions {
      gap: 0;

      > button {
        width: 30px;
        height: 30px;
      }

      .meldPlayButton {
        width: 38px;
        height: 38px;
      }
    }

    .meldProgressRow {
      gap: 5px;
    }

    .meldSeek {
      min-width: 0;
    }

    .meldQueuePanel {
      right: 6px;
      bottom: calc(151px + env(safe-area-inset-bottom));
      left: 6px;
      max-height: 38vh;
    }

    .meldQueueList {
      max-height: calc(38vh - 60px);
    }
  }
}
</style>

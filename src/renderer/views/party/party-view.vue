<template>
  <div :class="['partyView', 'bg2', `party_mode_${mode}`, { party_mobile: isMobileApp }]">
    <!-- ==================== HEADER ==================== -->
    <header class="party_header">
      <img
        v-if="mode !== 'guest'"
        src="@icon/back-circle.svg"
        class="party_backIcon"
        :title="t('party.backToMusic')"
        @click="goBackToMusic"
      >
      <p v-else class="party_headerSpacer" />
      <h1 class="party_title">
        🎉 {{ roomName || t('party.title') }}
      </h1>
      <span class="party_connectionBadge" :class="`is-${connection}`">
        <i class="party_statusDot" />
        {{ connectionLabel }}
      </span>
      <base-button
        v-if="mode === 'none' || mode === 'host'"
        :text="t('party.end')"
        :small="true"
        :transparent="mode === 'none'"
        :class="{ party_hiddenAction: mode === 'none' }"
        @click.native="mode === 'host' ? endParty() : null"
      />
      <base-button
        v-else
        :text="t('party.leave')"
        :small="true"
        @click.native="leaveRoom"
      />
    </header>

    <!-- ==================== NOT IN A PARTY YET ==================== -->
    <section
      v-if="mode === 'none'"
      class="party_start"
    >
      <!-- The two doors: open a party or walk into one -->
      <template v-if="startChoice === 'menu'">
        <div class="party_formCard blurred_bg blur20">
          <h2>{{ t('party.title') }}</h2>
          <base-button
            class="party_formButton"
            :block="true"
            :text="t('party.create')"
            icon="plus"
            @click.native="startChoice = 'create'"
          />
          <base-button
            class="party_formButton"
            :block="true"
            :text="t('party.join')"
            icon="user-plus"
            @click.native="startChoice = 'join'"
          />
        </div>
      </template>

      <!-- Open a new party -->
      <template v-else-if="startChoice === 'create'">
        <div class="party_formCard blurred_bg blur20">
          <img
            src="@icon/back-circle.svg"
            class="party_backIcon party_backSmall"
            @click="startChoice = 'menu'"
          >
          <h2>{{ t('party.create') }}</h2>
          <input
            v-model="newPartyName"
            :placeholder="t('party.roomNamePlaceholder')"
            type="text"
            maxlength="32"
            class="inputElem party_formControl"
          >
          <div class="party_modeToggle party_formModes">
            <base-button
              :text="t('party.modeFree')"
              :small="true"
              :active="newEntryMode === 'free'"
              @click.native="newEntryMode = 'free'"
            />
            <base-button
              :text="t('party.modeApproval')"
              :small="true"
              :active="newEntryMode === 'approval'"
              @click.native="newEntryMode = 'approval'"
            />
          </div>
          <p class="party_hint weight300 mb10">
            {{ newEntryMode === 'approval' ? t('party.modeApprovalHint') : t('party.modeFreeHint') }}
          </p>
          <base-button
            class="party_formButton"
            :block="true"
            :text="t('party.create')"
            :loading="connection === 'connecting'"
            @click.native="createRoom"
          />
          <p class="party_hint weight300">
            {{ t('party.createHint') }}
          </p>
        </div>
      </template>

      <!-- Walk into a party that is already open -->
      <template v-else>
        <div class="party_formCard blurred_bg blur20">
          <img
            src="@icon/back-circle.svg"
            class="party_backIcon party_backSmall"
            @click="startChoice = 'menu'"
          >
          <h2>{{ t('party.join') }}</h2>
          <base-button
            v-if="isMobileApp"
            class="party_formButton"
            :text="t('party.scanQr')"
            :small="true"
            :block="true"
            @click.native="startScanner"
          />
        <p
          v-if="isMobileApp && scannedHost"
          class="party_hint weight300 party_qrRead"
        >
          ✅ {{ t('party.qrRead') }}
        </p>
        <div
          v-if="isMobileApp && showScanner"
          class="party_scanner blurred_bg blur20"
        >
          <video
            ref="qrVideo"
            class="party_scannerVideo"
            autoplay
            playsinline
            muted
          />
          <p class="party_hint weight300">
            {{ t('party.scanHint') }}
          </p>
          <base-button
            :text="t('party.scanClose')"
            :small="true"
            @click.native="stopScanner"
          />
        </div>
        <!-- On the PC the room address is required, because the desktop
             cannot read the QR code of a party hosted on a phone. -->
        <input
          v-if="showHostAddress"
          v-model="joinHostUrl"
          :placeholder="t('party.hostAddressPlaceholder')"
          type="url"
          class="inputElem party_formControl"
          @input="parseHostInput($event.target.value)"
        >
        <!-- After a QR reading with a code inside, the code is already
             here and the guest only has to tell its name -->
        <input
          v-if="showCodeInput"
          v-model="joinCode"
          @input="parseInviteInput($event.target.value)"
          :placeholder="t('party.codePlaceholder')"
          type="text"
          maxlength="240"
          class="inputElem party_formControl party_codeInput"
        >
        <p v-if="showHostAddress" class="party_hint weight300">
          {{ t('party.joinAddressHint') }}
        </p>
        <p v-else-if="isMobileApp && !scannedHost" class="party_hint weight300">
          {{ t('party.joinMobileHint') }}
        </p>
        <input
          v-model="joinName"
          :placeholder="t('party.namePlaceholder')"
          type="text"
          maxlength="24"
          class="inputElem party_formControl"
        >
        <base-button
          class="party_formButton"
          :block="true"
          :text="t('party.join')"
          :loading="connection === 'connecting'"
          @click.native="joinRoom"
        />
        <p
          v-if="connection === 'error'"
          class="party_error"
        >
          {{ t(connectionError) }}
        </p>
        </div>
      </template>
    </section>

    <!-- ==================== HOST: ROOM + MENUS ==================== -->
    <section
      v-else-if="mode === 'host' && hostInfo"
      class="party_body"
    >
      <aside class="party_roomCard blurred_bg blur20">
        <div class="party_roomCardHeader">
          <div>
            <p class="party_eyebrow">{{ t('party.liveRoom') }}</p>
            <h2>{{ roomName || t('party.title') }}</h2>
          </div>
          <span class="party_liveBadge"><i class="party_statusDot" />{{ t('party.online') }}</span>
        </div>
        <div class="party_codeRow">
          <p class="party_code">
            {{ hostInfo.code }}
          </p>
        </div>
        <p class="party_hint weight300">
          {{ t('party.codeHint') }}
        </p>
        <!-- Always here, a phone of a guest reads it to join -->
        <img
          v-if="hostInfo.qrDataUrl"
          :src="hostInfo.qrDataUrl"
          class="party_qr"
        >
        <p class="party_hint weight300">
          {{ hostInfo.lanUrl }}
        </p>
        <div class="party_inviteActions">
          <base-button
            :text="copiedAction === 'code' ? t('party.copied') : t('party.copyCode')"
            :active="copiedAction === 'code'"
            :block="true"
            @click.native="copyInvite('code')"
          />
          <base-button
            :text="copiedAction === 'link' ? t('party.copied') : t('party.copyLink')"
            :block="true"
            @click.native="copyInvite('link')"
          />
        </div>

        <!-- Free or approval, the host may switch at any moment -->
        <div class="party_modeToggle">
          <base-button
            :text="t('party.modeFree')"
            :small="true"
            :active="entryMode === 'free'"
            @click.native="setEntryMode('free')"
          />
          <base-button
            :text="t('party.modeApproval')"
            :small="true"
            :active="entryMode === 'approval'"
            @click.native="setEntryMode('approval')"
          />
        </div>

        <div class="party_memberHeading">
          <p class="party_sectionTitle">{{ t('party.guests') }}</p>
          <span class="party_memberCount">{{ guests.length + 1 }}</span>
        </div>
        <div class="party_memberList">
          <div class="party_memberRow party_memberHost">
            <span class="party_avatar">F</span>
            <span class="party_memberInfo"><strong>{{ t('party.you') }}</strong><small>{{ t('party.host') }}</small></span>
            <span class="party_memberOnline"><i class="party_statusDot" />{{ t('party.online') }}</span>
          </div>
          <div
            v-for="guest in guests"
            :key="guest.id"
            class="party_memberRow"
          >
            <span class="party_avatar">{{ (guest.name || '?').charAt(0).toUpperCase() }}</span>
            <span class="party_memberInfo"><strong>{{ guest.name }}</strong><small>{{ guest.addedTracks }} 🎵</small></span>
            <span class="party_memberOnline" :class="{ 'is-connecting': guest.status === 'connecting' }"><i class="party_statusDot" />{{ guest.status === 'connecting' ? t('party.connecting') : t('party.online') }}</span>
            <span class="party_chipActions">
              <base-button
                icon="user-minus"
                :small="true"
                :transparent="true"
                :title="t('party.kick')"
                @click.native="kickGuest(guest)"
              />
              <base-button
                icon="prohibit"
                :small="true"
                :transparent="true"
                :title="t('party.block')"
                @click.native="blockGuest(guest)"
              />
            </span>
          </div>
          <p
            v-if="!guests.length"
            class="party_emptyMembers"
          >
            {{ t('party.noGuests') }}
          </p>
        </div>

        <div
          v-if="blockedList.length"
          class="party_blocked"
        >
          <base-button
            :text="t('party.blockedCount', { n: blockedList.length })"
            :small="true"
            :transparent="true"
            icon="prohibit"
            @click.native="showBlocked = !showBlocked"
          />
          <transition
            enter-active-class="animated fadeIn extrafaster"
            leave-active-class="animated fadeOut extrafaster"
          >
            <div
              v-if="showBlocked"
              class="party_blockedList"
            >
              <div
                v-for="blocked in blockedList"
                :key="blocked.token"
                class="party_row"
              >
                <p class="party_trackInfo text-small-1">
                  {{ blocked.name }}
                </p>
                <base-button
                  :text="t('party.unblock')"
                  :small="true"
                  @click.native="unblockDevice(blocked.token)"
                />
              </div>
            </div>
          </transition>
        </div>
      </aside>

      <div class="party_main">
        <div class="party_tabs">
          <base-button
            :text="t('party.tabQueue')"
            :active="hostTab === 'queue'"
            :small="true"
            @click.native="hostTab = 'queue'"
          />
          <base-button
            :text="t('party.tabAdd')"
            :active="hostTab === 'add'"
            :small="true"
            @click.native="switchToAddTab"
          />
          <base-button
            v-if="entryMode === 'approval'"
            :text="t('party.tabPending') + (pendingList.length ? ` (${pendingList.length})` : '')"
            :active="hostTab === 'pending'"
            :small="true"
            @click.native="hostTab = 'pending'"
          />
        </div>

        <!-- Queue of the host: covers, remove, reorder, play -->
        <div
          v-if="hostTab === 'queue'"
          class="party_list party_scrollable"
        >
          <draggable v-model="adminQueue">
            <div
              v-for="track in adminQueue"
              :key="track.fileLocation"
              class="party_row party_adminRow"
              @click="playTrack(track)"
            >
              <img
                v-if="track.albumArt"
                :src="localArtUrl(track.albumArt)"
                class="party_rowArt"
                @error="hideBrokenArt"
              >
              <div class="party_trackInfo">
                <p class="text-small-1">
                  {{ track.defaultTitle }}
                </p>
                <p class="card_subTitle weight300 text-small-2">
                  {{ track.defaultArtist }}
                </p>
                <p
                  v-if="track.suggestedBy"
                  class="party_by"
                >
                  {{ t('party.suggestedBy', { name: track.suggestedBy.guestName }) }}
                </p>
              </div>
              <base-button
                icon="x"
                :small="true"
                class="party_removeBt"
                @click.native.stop="removeFromQueue(track)"
              />
            </div>
          </draggable>
          <p
            v-if="!adminQueue.length"
            class="party_hint weight300"
          >
            {{ t('party.emptyQueue') }}
          </p>
        </div>

        <!-- Add from the playlists of the host -->
        <div
          v-if="hostTab === 'add'"
          class="party_list party_scrollable"
        >
          <template v-if="!selectedPlaylist">
            <input
              v-model="hostSearch"
              :placeholder="t('party.hostLibrarySearchPlaceholder')"
              type="search"
              class="inputElem mb10"
            >
            <template v-if="hostSearch.trim()">
              <div
                v-for="track in hostLibraryResults"
                :key="track.fileLocation"
                class="party_row party_adminRow"
              >
                <img
                  v-if="track.albumArt"
                  :src="localArtUrl(track.albumArt)"
                  class="party_rowArt"
                  @error="hideBrokenArt"
                >
                <div class="party_trackInfo">
                  <p class="text-small-1">{{ track.defaultTitle || track.title || track.fileName }}</p>
                  <p class="card_subTitle weight300 text-small-2">{{ track.defaultArtist || track.artist }}</p>
                </div>
                <base-button icon="plus" :small="true" @click.native="addFromPlaylist(track)" />
              </div>
              <p v-if="!hostLibraryResults.length" class="party_hint weight300">{{ t('party.noResults') }}</p>
            </template>
            <template v-else>
            <div
              v-for="playlist in playlists"
              :key="playlist.name"
              class="party_row party_adminRow"
              @click="selectedPlaylist = playlist"
            >
              <div class="party_trackInfo">
                <p class="text-small-1">
                  {{ playlist.name }}
                </p>
                <p class="card_subTitle weight300 text-small-2">
                  {{ t('party.trackCount', { n: playlist.tracks.length }) }}
                </p>
              </div>
              <base-icon
                icon="caret-right"
                :size="16"
              />
            </div>
            <p
              v-if="!playlists.length"
              class="party_hint weight300"
            >
              {{ t('party.noPlaylists') }}
            </p>
            </template>
          </template>
          <template v-else>
            <div class="party_playlistHeader">
              <base-button
                icon="caret-left"
                :small="true"
                :transparent="true"
                @click.native="selectedPlaylist = null"
              />
              <p class="party_sectionTitle">
                {{ selectedPlaylist.name }}
              </p>
            </div>
            <div
              v-for="track in selectedPlaylist.tracks"
              :key="track.fileLocation"
              class="party_row"
            >
              <img
                v-if="track.albumArt"
                :src="localArtUrl(track.albumArt)"
                class="party_rowArt"
                @error="hideBrokenArt"
              >
              <div class="party_trackInfo">
                <p class="text-small-1">
                  {{ track.defaultTitle }}
                </p>
                <p class="card_subTitle weight300 text-small-2">
                  {{ track.defaultArtist }}
                </p>
              </div>
              <base-button
                icon="plus"
                :small="true"
                @click.native="addFromPlaylist(track)"
              />
            </div>
          </template>
        </div>

        <!-- Suggestions waiting for approval -->
        <div
          v-if="hostTab === 'pending' && entryMode === 'approval'"
          class="party_list party_scrollable"
        >
          <div class="party_playlistHeader">
            <p class="party_sectionTitle">
              {{ t('party.pendingCount', { n: pendingList.length }) }}
            </p>
            <base-button
              v-if="pendingList.length"
              :text="t('party.acceptAll')"
              :small="true"
              @click.native="acceptAllPending"
            />
          </div>
          <div
            v-for="pending in pendingList"
            :key="pending.id"
            class="party_row party_pendingRow"
          >
            <img
              v-if="pending.localArt"
              :src="localArtUrl(pending.localArt)"
              class="party_rowArt"
              @error="hideBrokenArt"
            >
            <div class="party_trackInfo">
              <p class="text-small-1">
                {{ pending.track.title }}
              </p>
              <p class="card_subTitle weight300 text-small-2">
                {{ pending.track.artist }}
              </p>
              <p class="party_by">
                {{ t('party.suggestedBy', { name: pending.guestName }) }}
              </p>
            </div>
            <base-button
              icon="check"
              :small="true"
              class="party_acceptBt"
              @click.native="resolvePending(pending, true)"
            />
            <base-button
              icon="x"
              :small="true"
              class="party_removeBt"
              @click.native="resolvePending(pending, false)"
            />
          </div>
          <p
            v-if="!pendingList.length"
            class="party_hint weight300"
          >
            {{ t('party.pendingEmpty') }}
          </p>
        </div>
      </div>
    </section>

    <!-- ==================== GUEST: SAME PAGE, PARTY RULES ==================== -->
    <section v-else-if="mode === 'guest'" class="party_body party_guestBody">
      <aside class="party_guestOverview">
        <div class="party_guestRoomStatus blurred_bg blur20">
          <span class="party_liveBadge"><i class="party_statusDot" />{{ connectionLabel }}</span>
          <p>{{ t('party.connectedTo', { name: joinedRoom ? joinedRoom.hostName : roomName }) }}</p>
          <small>{{ joinedRoom ? joinedRoom.hostUrl : '' }}</small>
        </div>
        <div class="party_guestMembers blurred_bg blur20">
          <div class="party_memberHeading">
            <p class="party_sectionTitle">{{ t('party.guests') }}</p>
            <span class="party_memberCount">{{ guests.length + 1 }}</span>
          </div>
          <div class="party_memberRow party_memberHost">
            <span class="party_avatar">F</span>
            <span class="party_memberInfo"><strong>{{ joinedRoom ? joinedRoom.hostName : t('party.host') }}</strong><small>{{ t('party.host') }}</small></span>
            <span class="party_memberOnline"><i class="party_statusDot" />{{ t('party.online') }}</span>
          </div>
          <div v-for="guest in guests" :key="guest.id" class="party_memberRow">
            <span class="party_avatar">{{ (guest.name || '?').charAt(0).toUpperCase() }}</span>
            <span class="party_memberInfo"><strong>{{ guest.name }}</strong><small>{{ guest.addedTracks }} 🎵</small></span>
            <span class="party_memberOnline"><i class="party_statusDot" />{{ t('party.online') }}</span>
          </div>
        </div>
      <!-- What is playing on the host, followed live. No controls here. -->
      <div
        v-if="nowPlaying"
        class="party_nowPlayingCard blurred_bg blur20"
      >
        <img
          v-if="nowPlaying.artId"
          :src="artUrl(nowPlaying.artId)"
          class="party_nowArt"
          @error="hideBrokenArt"
        >
        <div class="party_nowInfo">
          <p class="text-small-2 weight300">
            {{ t('party.nowPlaying') }}
          </p>
          <p class="party_nowTitle">
            {{ nowPlaying.title }}
          </p>
          <p class="text-small-1 weight300">
            {{ nowPlaying.artist }}
          </p>
          <div class="party_progressTrack">
            <div :style="{ width: progressPercent + '%' }" />
          </div>
          <div class="party_times text-small-2 weight300">
            <span>{{ formatTime(displayPosition) }}</span>
            <span>{{ playing ? '▶' : '⏸' }} {{ formatTime(remainingTime) }}</span>
          </div>
        </div>
      </div>

      <!-- What this guest has sent and how it ended -->
      <div
        v-if="mySubmissions.length"
        class="party_submissions blurred_bg blur20"
      >
        <p class="party_sectionTitle">
          {{ t('party.mySubmissions') }}
        </p>
        <div
          v-for="submission in mySubmissions"
          :key="submission.id"
          class="party_row"
        >
          <span class="party_statusIcon">{{ statusIcon(submission.status) }}</span>
          <div class="party_trackInfo">
            <p class="text-small-1">
              {{ submission.track ? submission.track.title : '...' }}
            </p>
            <p class="party_by">
              {{ statusLabel(submission.status) }}
            </p>
          </div>
          <base-button
            v-if="submission.status === 'pending'"
            icon="x"
            :small="true"
            class="party_removeBt"
            :title="t('party.cancel')"
            @click.native="cancelSubmission(submission.id)"
          />
        </div>
      </div>
      </aside>

      <main class="party_guestMain">
      <div v-if="connection === 'error' || connection === 'connecting'" class="party_connectionNotice" :class="`is-${connection}`">
        <span>{{ connection === 'connecting' ? t('party.reconnecting') : t(connectionError || 'party.errorLost') }}</span>
        <base-button
          :text="t('party.reconnect')"
          :small="true"
          :loading="connection === 'connecting'"
          @click.native="reconnectParty"
        />
      </div>
      <div class="party_tabs">
        <base-button
          :text="t('party.tabQueue')"
          :active="guestTab === 'queue'"
          :small="true"
          @click.native="guestTab = 'queue'"
        />
        <base-button
          :text="t('party.tabTracks')"
          :active="guestTab === 'tracks'"
          :small="true"
          @click.native="switchToTracks"
        />
        <span
          v-if="entryMode === 'approval'"
          class="party_slots weight300"
        >
          {{ t('party.slots', { n: pendingSubmissionCount, max: pendingLimit }) }}
        </span>
      </div>

      <!-- Queue: read only, no remove, no reorder, no play buttons -->
      <div
        v-if="guestTab === 'queue'"
        class="party_list party_scrollable"
      >
        <div
          v-for="(track, index) in queue"
          :key="index"
          class="party_row"
        >
          <img
            v-if="track.artId"
            :src="artUrl(track.artId)"
            class="party_rowArt"
            @error="hideBrokenArt"
          >
          <div class="party_trackInfo">
            <p class="text-small-1">
              {{ track.title }}
            </p>
            <p class="card_subTitle weight300 text-small-2">
              {{ track.artist }}
            </p>
            <p
              v-if="track.suggestedBy"
              class="party_by"
            >
              {{ t('party.suggestedBy', { name: track.suggestedBy.guestName }) }}
            </p>
          </div>
        </div>
        <p
          v-if="!queue.length"
          class="party_hint weight300"
        >
          {{ t('party.emptyQueue') }}
        </p>
      </div>

      <!-- Music: the host's library or the one on this machine -->
      <div
        v-if="guestTab === 'tracks'"
        class="party_list party_scrollable"
      >
        <div class="party_modeToggle mb10">
          <base-button
            :text="t('party.subTabHost')"
            :small="true"
            :active="tracksSource === 'host'"
            @click.native="switchTracksSource('host')"
          />
          <base-button
            :text="t('party.subTabMine')"
            :small="true"
            :active="tracksSource === 'mine'"
            @click.native="switchTracksSource('mine')"
          />
        </div>

        <!-- The library of the host, only an add button per track -->
        <template v-if="tracksSource === 'host'">
          <input
            v-model="searchInput"
            :placeholder="t('party.searchPlaceholder')"
            type="text"
            class="inputElem mb10"
            @input="onSearchInput"
          >
          <div
            v-for="track in searchResults"
            :key="track.id"
            class="party_row"
          >
            <img
              v-if="track.artId"
              :src="artUrl(track.artId)"
              class="party_rowArt"
              @error="hideBrokenArt"
            >
            <div class="party_trackInfo">
              <p class="text-small-1">
                {{ track.title }}
              </p>
              <p class="card_subTitle weight300 text-small-2">
                {{ track.artist }}
              </p>
            </div>
            <base-button
              icon="plus"
              :small="true"
              @click.native="addTrack(track)"
            />
          </div>
          <p v-if="searching" class="party_hint weight300">{{ t('party.searchingTracks') }}</p>
          <p v-else-if="searchError" class="party_hint weight300 party_error">{{ t(searchError) }}</p>
          <p v-else-if="!searchResults.length" class="party_hint weight300">
            {{ t('party.noResults') }}
          </p>
        </template>

        <!-- The music of this machine, sent to the party with a plus -->
        <template v-else>
          <p class="party_hint weight300 mb10">
            {{ entryMode === 'approval' ? t('party.approvalUploadHint') : t('party.mineHint') }}
          </p>
          <input
            v-model="localSearch"
            :placeholder="t('party.mineSearchPlaceholder')"
            type="text"
            class="inputElem mb10"
          >
          <div
            v-for="track in localResults"
            :key="track.fileLocation"
            class="party_row"
          >
            <img
              v-if="track.albumArt"
              :src="localArtUrl(track.albumArt)"
              class="party_rowArt"
              @error="hideBrokenArt"
            >
            <div class="party_trackInfo">
              <p class="text-small-1">
                {{ track.defaultTitle }}
              </p>
              <p class="card_subTitle weight300 text-small-2">
                {{ track.defaultArtist }}
              </p>
            </div>
            <base-button
              icon="plus"
              :small="true"
              :loading="uploading"
              @click.native="sendLocalTrack(track)"
            />
          </div>
          <p
            v-if="!localResults.length"
            class="party_hint weight300"
          >
            {{ t('party.noLocalResults') }}
          </p>
          <div
            v-if="uploading"
            class="party_progressBar"
          >
            <div :style="{ width: uploadProgress + '%' }" />
          </div>
        </template>
      </div>
      </main>
    </section>
  </div>
</template>

<script>
import { ipcRenderer, isMobileApp } from '@/platform/ipc';
import jsQR from 'jsqr';
import { mapMutations } from 'vuex';
import { toFileUrl } from '@/renderer/utils';
import { PARTY_PENDING_LIMIT } from '@/renderer/store/modules/local-music/party-manager';

export default {
  name: 'PartyView',
  data() {
    return {
      // Landing: two doors, create a party or walk into one
      startChoice: 'menu',
      // Creating a new party
      newPartyName: '',
      newEntryMode: 'free',
      // Joining someone else's party
      joinCode: '',
      joinHostUrl: '',
      // The name is remembered from the last party, a returning guest
      // only has to scan the QR and press enter
      joinName: localStorage.getItem('flbPartyGuestName') || '',
      // Camera reading of the QR code of the host
      showScanner: false,
      scannedHost: '',
      // Tabs
      hostTab: 'queue',
      guestTab: 'queue',
      // Inside the music tab of the guest: the host's or this machine's
      tracksSource: 'host',
      localSearch: '',
      selectedPlaylist: null,
      searchInput: '',
      hostSearch: '',
      searchTimer: null,
      showBlocked: false,
      copiedAction: '',
      copyFeedbackTimer: null,
      pendingLimit: PARTY_PENDING_LIMIT,
      // Keeps the mirrored progress bar moving between two updates
      clock: Date.now()
    };
  },
  computed: {
    isMobileApp() {
      return isMobileApp;
    },
    /** The PC must always be able to type the address of a phone-hosted party. */
    showHostAddress() {
      return !this.isMobileApp && !this.scannedHost;
    },
    showCodeInput() {
      if (!this.isMobileApp) return !!String(this.joinHostUrl || '').trim();
      return !this.scannedHost || !this.joinCode;
    },
    mode() {
      return this.$store.state.PartyManager.mode;
    },
    hostInfo() {
      return this.$store.state.PartyManager.hostInfo;
    },
    guests() {
      return this.$store.state.PartyManager.guests;
    },
    connection() {
      return this.$store.state.PartyManager.connection;
    },
    connectionError() {
      return this.$store.state.PartyManager.connectionError;
    },
    joinedRoom() {
      return this.$store.state.PartyManager.joinedRoom;
    },
    roomName() {
      return this.$store.state.PartyManager.roomName;
    },
    entryMode() {
      return this.$store.state.PartyManager.entryMode;
    },
    pendingList() {
      return this.$store.state.PartyManager.pendingList;
    },
    blockedList() {
      return this.$store.state.PartyManager.blockedList;
    },
    mySubmissions() {
      return this.$store.state.PartyManager.mySubmissions;
    },
    pendingSubmissionCount() {
      return this.mySubmissions.filter((item) => item.status === 'pending').length;
    },
    playlists() {
      return this.$store.state.TabsManager.tabsData.playlists;
    },
    queue() {
      return this.$store.state.PartyManager.queue;
    },
    nowPlaying() {
      return this.$store.state.PartyManager.nowPlaying;
    },
    playing() {
      return this.$store.state.PartyManager.playing;
    },
    duration() {
      return this.$store.state.PartyManager.duration;
    },
    receivedAt() {
      return this.$store.state.PartyManager.receivedAt;
    },
    searchResults() {
      return this.$store.state.PartyManager.searchResults;
    },
    searching() {
      return this.$store.state.PartyManager.searching;
    },
    searchError() {
      return this.$store.state.PartyManager.searchError;
    },
    hostLibraryResults() {
      const query = this.hostSearch.trim().toLocaleLowerCase();
      const library = this.$store.state.TabsManager.tabsData.addedTracks || [];
      if (!query) return [];
      return library.filter((track) => {
        const text = `${track.defaultTitle || track.title || track.fileName || ''} ${track.defaultArtist || track.artist || ''} ${track.album || ''}`;
        return text.toLocaleLowerCase().includes(query);
      }).slice(0, 80);
    },
    /**
     * The music of this machine, filtered as the guest types. Only the
     * first matches are shown, the search does the narrowing.
     */
    localResults() {
      const library = this.$store.state.TabsManager.tabsData.addedTracks || [];
      const query = this.localSearch.trim().toLowerCase();
      const matching = query
        ? library.filter((track) => {
            const haystack = `${track.defaultTitle || ""} ${
              track.defaultArtist || ""
            } ${track.album || ""}`.toLowerCase();
            return haystack.includes(query);
          })
        : library;
      return matching.slice(0, 60);
    },
    uploading() {
      return this.$store.state.PartyManager.uploading;
    },
    connectionLabel() {
      if (this.connection === 'connecting') return this.t('party.connecting');
      if (this.connection === 'error') return this.t(this.connectionError || 'party.errorLost');
      return this.mode === 'host' || this.mode === 'guest'
        ? this.t('party.online')
        : this.t('party.ready');
    },
    uploadProgress() {
      return this.$store.state.PartyManager.uploadProgress;
    },
    /**
     * Position of the song on the host, kept moving locally while it plays
     * so the bar does not wait for the next update to advance.
     */
    displayPosition() {
      const base = this.$store.state.PartyManager.position;
      if (!this.playing) return base;
      const elapsed = (this.clock - this.receivedAt) / 1000;
      const position = base + elapsed;
      return this.duration ? Math.min(position, this.duration) : position;
    },
    remainingTime() {
      if (!this.duration) return 0;
      return Math.max(0, this.duration - this.displayPosition);
    },
    progressPercent() {
      if (!this.duration) return 0;
      return Math.min(100, (this.displayPosition / this.duration) * 100);
    },
    /** The admin queue, with the playing track on top when it is missing. */
    adminQueue: {
      get() {
        const queue = this.$store.state.PlaybackManger.customQueue;
        const playingTrack = this.$store.state.PlaybackManger.playingTrackInfo.track;
        if (!playingTrack) return queue;
        const isPlayingQueued = queue.some(
          (track) => track.fileLocation === playingTrack.fileLocation
        );
        if (isPlayingQueued) return queue;
        return [playingTrack, ...queue];
      },
      set(value) {
        this.$store.commit('reorderQueue', value);
      }
    }
  },
  mounted() {
    this.clockTimer = setInterval(() => {
      this.clock = Date.now();
    }, 500);
  },
  beforeDestroy() {
    clearInterval(this.clockTimer);
    clearTimeout(this.copyFeedbackTimer);
    this.stopScanner();
  },
  methods: {
    ...mapMutations(['setPlayingTrack', 'removeTrackFromCustomQueue', 'queueTracksFromGuest', 'pushNotification']),
    goBackToMusic() {
      this.$store.commit('UIcontrollerSetPropertyValue', {
        property: 'currentPage',
        newValue: 'My Music'
      });
    },
    createRoom() {
      if (this.connection === 'connecting') return;
      this.$store
        .dispatch('createParty', {
          name: this.newPartyName,
          entryMode: this.newEntryMode
        })
        .catch((error) => {
          this.pushNotification({
            title: this.t('party.errorCreateTitle'),
            subTitle: error && error.message ? error.message : '',
            type: 'danger'
          });
        });
    },
    joinRoom() {
      if (this.connection === 'connecting') return;
      this.$store.dispatch('joinParty', {
        code: this.joinCode,
        name: this.joinName,
        // When the QR code of the host was read, its address comes from
        // there; otherwise the party is found on the network
        hostUrl: this.scannedHost || this.joinHostUrl
      });
    },
    parseHostInput(value) {
      const text = String(value || '').trim();
      if (!/^https?:\/\//i.test(text)) return;
      try {
        const invite = new URL(text);
        const code = String(invite.searchParams.get('code') || '').replace(/\D/g, '').slice(0, 6);
        if (code.length === 6) this.joinCode = code;
      } catch (_) { /* Keep the text so the user can correct an invalid invite. */ }
    },
    parseInviteInput(value) {
      const text = String(value || '').trim();
      if (!/^https?:\/\//i.test(text)) return;
      try {
        const invite = new URL(text);
        const code = String(invite.searchParams.get('code') || '').replace(/\D/g, '').slice(0, 6);
        if (code.length !== 6) return;
        this.joinCode = code;
        this.joinHostUrl = `${invite.protocol}//${invite.host}`;
      } catch (_) { /* Keep the text so the user can correct an invalid invite. */ }
    },
    reconnectParty() {
      this.$store.dispatch('reconnectParty');
    },
    async copyInvite(kind) {
      if (!this.hostInfo) return;
      const invite = `${this.hostInfo.lanUrl}/?code=${this.hostInfo.code}`;
      const value = kind === 'code' ? this.hostInfo.code : invite;
      let copied = false;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(value);
          copied = true;
        }
      } catch (_) { /* Use the clipboard fallback for older WebViews. */ }
      if (!copied) {
        const field = document.createElement('textarea');
        field.value = value;
        field.setAttribute('readonly', '');
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.appendChild(field);
        field.select();
        try { copied = document.execCommand('copy'); } catch (_) { copied = false; }
        field.remove();
      }
      if (copied) {
        this.copiedAction = kind;
        clearTimeout(this.copyFeedbackTimer);
        this.copyFeedbackTimer = setTimeout(() => { this.copiedAction = ''; }, 1800);
      } else {
        this.pushNotification({
          title: this.t('party.copyFailed'),
          subTitle: value,
          type: 'warning'
        });
      }
    },
    endParty() {
      this.$store.dispatch('stopParty');
      this.pushNotification({ title: this.t('party.endedLocalTitle'), subTitle: '', type: 'success' });
      this.goBackToMusic();
    },
    leaveRoom() {
      this.$store.dispatch('leaveParty');
      this.pushNotification({ title: this.t('party.leftTitle'), subTitle: '', type: 'success' });
      this.goBackToMusic();
    },
    // -----------------------------------------------------------------
    // Guest: camera reading of the QR code of the host
    // -----------------------------------------------------------------
    /** The QR of the host carries its address, the camera reads it. */
    async startScanner() {
      this.showScanner = true;
      await this.$nextTick();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
        this.scannerStream = stream;
        const video = this.$refs.qrVideo;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        this.scanLoop();
      } catch (error) {
        this.showScanner = false;
        this.pushNotification({
          title: this.t('party.noCameraTitle'),
          subTitle: this.t('party.noCameraSubTitle'),
          type: 'warning'
        });
      }
    },
    scanLoop() {
      if (!this.showScanner) return;
      const video = this.$refs.qrVideo;
      if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
        const canvas =
          this.scanCanvas || (this.scanCanvas = document.createElement('canvas'));
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        const found = jsQR(image.data, image.width, image.height);
        // A valid QR stops the camera, anything else keeps scanning
        if (found && found.data && this.onQrScanned(found.data)) return;
      }
      this.scanFrame = requestAnimationFrame(() => this.scanLoop());
    },
    /**
     * The QR of the host is a full invitation: address and room code.
     * After reading it the guest only has to type its name.
     */
    onQrScanned(data) {
      let url;
      try {
        url = new URL(String(data).trim());
      } catch (error) {
        return false;
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
      this.scannedHost = `${url.protocol}//${url.host}`;
      const code = (url.searchParams.get('code') || '')
        .replace(/\D/g, '')
        .slice(0, 6);
      if (code.length === 6) this.joinCode = code;
      this.stopScanner();
      return true;
    },
    stopScanner() {
      this.showScanner = false;
      if (this.scanFrame) cancelAnimationFrame(this.scanFrame);
      if (this.scannerStream) {
        this.scannerStream.getTracks().forEach((track) => track.stop());
        this.scannerStream = null;
      }
    },
    /**
     * Android back closes the panels that live inside the party before the
     * shell decides whether to leave the party page.
     */
    handleAndroidBack() {
      if (this.showScanner) {
        this.stopScanner();
        return true;
      }
      if (this.showBlocked) {
        this.showBlocked = false;
        return true;
      }
      if (this.selectedPlaylist) {
        this.selectedPlaylist = null;
        return true;
      }
      if (this.mode === 'idle' && this.startChoice !== 'menu') {
        this.startChoice = 'menu';
        return true;
      }
      return false;
    },
    // -----------------------------------------------------------------
    // Host: room administration
    // -----------------------------------------------------------------
    setEntryMode(mode) {
      if (mode === this.entryMode) return;
      this.$store.commit('setPartyEntryMode', mode);
      ipcRenderer.send('partySetEntryMode', mode);
    },
    kickGuest(guest) {
      ipcRenderer.invoke('partyKickGuest', guest.id);
    },
    blockGuest(guest) {
      ipcRenderer.invoke('partyBlockGuest', guest.id);
    },
    unblockDevice(token) {
      ipcRenderer.invoke('partyUnblockGuest', token);
    },
    resolvePending(pending, accept) {
      ipcRenderer.send('partyPendingResolve', {
        pendingId: pending.id,
        accept
      });
    },
    acceptAllPending() {
      const waiting = [...this.pendingList];
      waiting.forEach((pending) => this.resolvePending(pending, true));
    },
    // -----------------------------------------------------------------
    // Host: queue and playlists
    // -----------------------------------------------------------------
    playTrack(track) {
      this.setPlayingTrack({ track, index: 0 });
    },
    /**
     * The displayed queue can carry the playing track even when it is not
     * part of the real queue, the index has to point to the real queue so
     * the right track gets removed.
     */
    removeFromQueue(track) {
      const realQueue = this.$store.state.PlaybackManger.customQueue;
      const index = realQueue.findIndex(
        (queued) => queued.fileLocation === track.fileLocation
      );
      if (index === -1) return;
      this.removeTrackFromCustomQueue(index);
    },
    switchToAddTab() {
      this.hostTab = 'add';
      this.selectedPlaylist = null;
    },
    addFromPlaylist(track) {
      this.queueTracksFromGuest([track]);
      this.pushNotification({
        title: this.t('party.queuedTitle'),
        subTitle: track.defaultTitle,
        type: 'success'
      });
    },
    // -----------------------------------------------------------------
    // Guest: submissions and browsing
    // -----------------------------------------------------------------
    switchToTracks() {
      this.guestTab = 'tracks';
      this.tracksSource = 'host';
      this.$store.dispatch('guestSearchTracks', this.searchInput);
    },
    switchTracksSource(source) {
      this.tracksSource = source;
      if (source === 'host') {
        this.$store.dispatch('guestSearchTracks', this.searchInput);
      }
    },
    onSearchInput() {
      clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => {
        this.$store.dispatch('guestSearchTracks', this.searchInput);
      }, 300);
    },
    addTrack(track) {
      if (!track.id) return;
      this.$store.dispatch('guestAddTrack', track.id);
    },
    cancelSubmission(submissionId) {
      this.$store.dispatch('guestCancelPending', submissionId);
    },
    /** Sends one track of this machine's library to the party. */
    sendLocalTrack(track) {
      if (this.uploading) return;
      this.$store.dispatch('guestSendLocalTrack', track);
    },
    statusIcon(status) {
      if (status === 'accepted') return '✅';
      if (status === 'refused') return '❌';
      return '⏳';
    },
    statusLabel(status) {
      if (status === 'accepted') return this.t('party.submissionAccepted');
      if (status === 'refused') return this.t('party.submissionRefused');
      return this.t('party.submissionPending');
    },
    artUrl(artId) {
      if (!this.joinedRoom) return '';
      return `${this.joinedRoom.hostUrl}/api/art?artId=${encodeURIComponent(artId)}`;
    },
    hideBrokenArt(event) {
      if (event && event.target) event.target.remove();
    },
    /** Covers of the host come straight from its own disk. */
    localArtUrl(albumArt) {
      if (!albumArt) return '';
      return toFileUrl(albumArt);
    },
    formatTime(seconds) {
      const safe = Math.max(0, Math.floor(seconds || 0));
      const minutes = Math.floor(safe / 60);
      const rest = safe % 60;
      return `${minutes}:${String(rest).padStart(2, '0')}`;
    }
  }
};
</script>

<style lang="scss">
.partyView {
  /* Every Party surface/status color is derived from the active theme. The
     first value of each pair is the fallback for older Android WebViews,
     which do not support color-mix(). */
  --party-cyan: var(--accentColor, #0066ff);
  --party-lime: var(--accentColor, #0066ff);
  --party-card: var(--secondaryColor, rgba(255, 255, 255, 0.056));
  --party-line: var(--borderColor, rgba(255, 255, 255, 0.356));
  --party-soft: var(--primaryColor, rgba(255, 255, 255, 0.028));
  --party-glow: var(--accentColor, #0066ff);
  --party-accent-13: var(--party-soft);
  --party-accent-7: var(--party-soft);
  --party-danger: #ff4d6d;
  --party-warning: var(--accentColor, #0066ff);
  --party-ok: var(--accentColor, #0066ff);
  position: relative;
  isolation: isolate;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 15px 25px;
  box-sizing: border-box;
  overflow: hidden;
  color: var(--textColor);
  background: var(--appBackground, #000) !important;
  background:
    radial-gradient(ellipse at 14% 0%, var(--party-accent-13), transparent 36%),
    radial-gradient(ellipse at 90% 100%, var(--party-accent-7), transparent 38%),
    var(--appBackground) !important;

  &::before {
    content: "";
    position: absolute;
    z-index: -1;
    inset: 0;
    pointer-events: none;
    opacity: .22;
    background-image: linear-gradient(var(--party-line) 1px, transparent 1px), linear-gradient(90deg, var(--party-line) 1px, transparent 1px);
    background-image: linear-gradient(color-mix(in srgb, var(--accentColor) 7%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--accentColor) 7%, transparent) 1px, transparent 1px);
    background-size: 34px 34px;
    mask-image: linear-gradient(to bottom, black, transparent 88%);
  }

  .party_header {
    flex: 0 0 auto;
    min-height: 58px;
    padding: 0 4px 12px;
    border-bottom: 1px solid var(--party-line);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 18px;
  }
  .party_backIcon {
    width: 30px;
    height: 30px;
    padding: 3px;
    box-sizing: border-box;
    cursor: pointer;
    border-radius: 50%;
    transition: 0.2s ease;
    &:hover {
      background: var(--hoverColor);
    }
  }
  .party_backSmall {
    align-self: flex-start;
    margin-bottom: 10px;
  }
  .party_qrRead {
    color: var(--party-ok);
  }
  .party_scanner {
    width: 100%;
    max-width: 360px;
    border-radius: 20px;
    padding: 15px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }
  .party_scannerVideo {
    width: 100%;
    max-width: 320px;
    border-radius: 15px;
    background: var(--appBackground, #000);
  }
  .party_headerSpacer {
    width: 35px;
  }
  .party_title {
    margin: 0 auto 0 8px;
    color: var(--textColor);
    font-size: clamp(1.05rem, 2vw, 1.35rem);
    font-weight: 750;
    letter-spacing: .02em;
  }
  .party_hiddenAction {
    visibility: hidden;
  }
  .party_hint {
    font-size: 0.85rem;
    text-align: center;
    opacity: 0.75;
    overflow-wrap: anywhere;
  }
  .party_error {
    color: var(--party-danger);
    font-size: 0.9rem;
    margin-top: 10px;
  }
  .party_divider {
    width: 320px;
    max-width: 90%;
    height: 1px;
    background: var(--borderColor);
    opacity: .5;
    margin: 15px 0px;
  }
  .party_modeToggle {
    display: flex;
    gap: 5px;
    justify-content: center;
  }

  .party_start {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    max-width: 520px;
    margin: 0 auto;
    width: 100%;
  }
  .party_formCard {
    box-sizing: border-box;
    width: 100%;
    padding: 20px;
    border: 1px solid var(--party-line);
    border-radius: 22px;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    background: var(--party-card);
    box-shadow: 0 22px 65px rgba(0, 0, 0, .35), inset 0 1px color-mix(in srgb, var(--textColor) 4%, transparent);
    backdrop-filter: blur(22px);
  }
  .party_formCard h2 {
    margin: 0 0 4px;
    text-align: center;
    font-size: 1.25rem;
  }
  .party_formControl {
    box-sizing: border-box;
    display: block;
    width: 100%;
    min-width: 0;
    min-height: 48px;
    margin: 0 !important;
    padding: 0 14px;
    border: 1px solid var(--borderColor);
    border-radius: 14px;
  }
  .party_formButton {
    width: 100%;
    min-height: 48px;
  }
  .party_formModes {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
    gap: 8px;
  }
  .party_formModes > * {
    min-width: 0;
    width: 100%;
    min-height: 44px;
  }
  .party_formCard .party_hint {
    margin: 0;
    line-height: 1.45;
  }
  .party_codeInput {
    text-align: center;
    letter-spacing: 8px;
    font-size: 1.4rem;
  }

  .party_body {
    flex: 1;
    display: grid;
    grid-template-columns: minmax(270px, 340px) minmax(0, 1fr);
    gap: 20px;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
  }
  .party_main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
  }

  .party_roomCard {
    width: auto;
    min-width: 0;
    border: 1px solid var(--party-line);
    border-radius: 22px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    overflow-y: auto;
    background: var(--party-card);
    box-shadow: inset 0 1px color-mix(in srgb, var(--textColor) 4%, transparent), 0 18px 45px rgba(0,0,0,.25);
  }
  .party_codeRow {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .party_code {
    font-size: 2.6rem;
    font-weight: 700;
    letter-spacing: 10px;
    padding-left: 10px;
  }
  .party_qr {
    width: 180px;
    height: 180px;
    border-radius: 15px;
    background: white;
    padding: 5px;
  }
  .party_guestChips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    justify-content: center;
    margin-top: 5px;
  }
  .party_guestChip {
    background: var(--secondaryColor);
    border-radius: 20px;
    padding: 4px 6px 4px 10px;
    font-size: 0.8rem;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .party_chipActions {
    display: flex;
    gap: 2px;
  }
  .party_blocked {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    margin-top: 5px;
  }
  .party_blockedList {
    width: 100%;
    max-height: 140px;
    overflow-y: auto;
  }

  .party_sectionTitle {
    font-weight: 600;
    margin-bottom: 8px;
  }
  .party_list {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    border-radius: 15px;
    padding: 5px;
    background: color-mix(in srgb, var(--appBackground) 45%, transparent);
  }
  .party_scrollable {
    margin-top: 5px;
  }
  .party_playlistHeader {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 5px;
    .party_sectionTitle {
      margin-bottom: 0px;
    }
  }
  .party_row {
    display: flex;
    align-items: center;
    gap: 12px;
    box-sizing: border-box;
    min-width: 0;
    padding: 10px 12px;
    border-radius: 12px;
    p {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
  }
  .party_adminRow {
    cursor: pointer;
    background: var(--primaryColor);
    margin-bottom: 4px;
    &:hover {
      background: var(--degreeColor);
    }
  }
  .party_pendingRow {
    background: var(--primaryColor);
    margin-bottom: 4px;
  }
  .party_removeBt {
    background: var(--party-danger) !important;
  }
  .party_acceptBt {
    background: var(--party-ok) !important;
  }
  .party_trackInfo {
    flex: 1;
    min-width: 0;
  }
  .party_by {
    font-size: 0.75rem;
    color: var(--accentColor);
    white-space: nowrap;
  }
  .party_rowArt {
    width: 42px;
    height: 42px;
    border-radius: 8px;
    object-fit: cover;
    flex-shrink: 0;
    background: var(--secondaryColor);
  }

  .party_nowPlayingCard {
    display: flex;
    gap: 15px;
    border-radius: 20px;
    padding: 15px;
    margin-bottom: 15px;
    align-items: center;
  }
  .party_nowArt {
    width: 110px;
    height: 110px;
    border-radius: 15px;
    object-fit: cover;
    flex-shrink: 0;
    background: var(--secondaryColor);
  }
  .party_nowInfo {
    flex: 1;
    min-width: 0;
  }
  .party_nowTitle {
    font-size: 1.1rem;
    font-weight: 600;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .party_progressTrack {
    width: 100%;
    height: 6px;
    border-radius: 6px;
    background: color-mix(in srgb, var(--textColor) 15%, transparent);
    margin-top: 10px;
    overflow: hidden;
    div {
      height: 100%;
      background: var(--accentColor);
      transition: width 0.4s linear;
    }
  }
  .party_times {
    display: flex;
    justify-content: space-between;
    margin-top: 4px;
  }

  .party_submissions {
    border-radius: 20px;
    padding: 12px 15px;
    margin-bottom: 15px;
    max-height: 180px;
    overflow-y: auto;
  }
  .party_statusIcon {
    font-size: 1rem;
    width: 26px;
    text-align: center;
    flex-shrink: 0;
  }

  .party_tabs {
    display: flex;
    gap: 5px;
    align-items: center;
    margin-bottom: 10px;
  }
  .party_slots {
    margin-left: auto;
    font-size: 0.8rem;
    opacity: 0.8;
  }
  .party_progressBar {
    width: 320px;
    max-width: 90%;
    height: 8px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--textColor) 15%, transparent);
    margin-top: 15px;
    overflow: hidden;
    div {
      height: 100%;
      background: var(--accentColor);
      transition: width 0.2s ease;
    }
  }
  .party_connectionBadge,
  .party_liveBadge,
  .party_memberOnline {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    width: fit-content;
    border: 1px solid var(--party-line);
    border-radius: 999px;
    padding: 6px 10px;
    background: var(--party-soft);
    color: var(--party-cyan);
    font-size: .72rem;
    font-weight: 700;
    white-space: nowrap;
  }
  .party_connectionBadge { margin-left: auto; }
  .party_connectionBadge.is-error,
  .party_connectionNotice.is-error { color: var(--party-danger); border-color: var(--party-danger); background: var(--party-soft); }
  .party_connectionBadge.is-connecting,
  .party_connectionNotice.is-connecting { color: var(--party-warning); border-color: var(--party-warning); background: var(--party-soft); }
  .party_statusDot { width: 7px; height: 7px; border-radius: 50%; background: var(--party-lime); box-shadow: 0 0 10px var(--party-glow); }
  .party_liveBadge { color: var(--party-lime); border-color: var(--party-line); background: var(--party-soft); }
  .party_eyebrow { margin: 0 0 4px; color: var(--party-cyan); font-size: .66rem; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
  .party_roomCardHeader { width: 100%; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .party_roomCardHeader h2 { margin: 0; font-size: 1.15rem; }
  .party_inviteActions { width: 100%; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .party_memberHeading { width: 100%; display: flex; align-items: center; gap: 8px; margin-top: 8px; }
  .party_memberHeading .party_sectionTitle { margin: 0; }
  .party_memberCount { min-width: 22px; padding: 2px 6px; border-radius: 999px; text-align: center; color: var(--party-cyan); background: var(--party-soft); font-size: .72rem; }
  .party_memberList { width: 100%; display: flex; flex-direction: column; gap: 7px; }
  .party_memberRow { display: flex; align-items: center; min-width: 0; gap: 9px; padding: 8px; border: 1px solid var(--primaryColor); border-radius: 13px; background: var(--primaryColor); }
  .party_memberHost { border-color: var(--party-line); background: var(--party-soft); }
  .party_avatar { width: 32px; height: 32px; flex: 0 0 32px; display: grid; place-items: center; border-radius: 11px; background: linear-gradient(145deg, color-mix(in srgb, var(--accentColor) 25%, transparent), color-mix(in srgb, var(--secondaryColor) 55%, transparent)); color: var(--party-cyan); font-weight: 800; }
  .party_memberInfo { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; overflow: hidden; }
  .party_memberInfo strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .85rem; }
  .party_memberInfo small { opacity: .62; font-size: .7rem; }
  .party_memberOnline { padding: 4px 6px; border: 0; background: transparent; font-size: .66rem; }
  .party_memberOnline.is-connecting { color: var(--party-warning); }
  .party_memberOnline.is-connecting .party_statusDot { background: var(--party-warning); box-shadow: 0 0 10px var(--party-warning); }
  .party_memberOnline .party_statusDot { width: 6px; height: 6px; }
  .party_emptyMembers { margin: 2px 0; padding: 10px; border: 1px dashed var(--party-line); border-radius: 12px; color: color-mix(in srgb, var(--textColor) 60%, transparent); text-align: center; font-size: .78rem; }
  .party_guestBody { grid-template-columns: minmax(260px, 380px) minmax(0, 1fr); }
  .party_guestOverview { min-width: 0; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; }
  .party_guestRoomStatus { padding: 14px; border: 1px solid var(--party-line); border-radius: 18px; background: var(--party-card); }
  .party_guestMembers { padding: 12px; border: 1px solid var(--party-line); border-radius: 18px; background: var(--party-card); }
  .party_guestRoomStatus p { margin: 10px 0 3px; font-weight: 650; }
  .party_guestRoomStatus small { display: block; overflow-wrap: anywhere; opacity: .55; font-size: .7rem; }
  .party_guestMain { min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
  .party_connectionNotice { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; padding: 10px 12px; border: 1px solid var(--party-line); border-radius: 14px; color: var(--party-warning); background: var(--party-soft); font-size: .82rem; }
  &.party_mode_guest {
    .party_nowPlayingCard { margin: 0; box-shadow: 0 15px 45px rgba(0,0,0,.24); }
    .party_nowInfo { min-width: 0; }
    .party_progressTrack div { background: linear-gradient(90deg, var(--accentColor), color-mix(in srgb, var(--accentColor) 58%, var(--textColor))); box-shadow: 0 0 12px var(--party-glow); }
    .party_tabs { flex: 0 0 auto; padding-bottom: 9px; border-bottom: 1px solid var(--party-line); }
    .party_list { flex: 1 1 auto; min-height: 0; max-height: none; }
    .party_row { border: 1px solid transparent; transition: background .16s, border-color .16s; }
    .party_row:hover { border-color: var(--party-line); background: var(--party-soft); }
    .party_rowArt,
    .party_nowArt { border: 1px solid var(--party-line); }
  }
  .party_roomCard .party_code { color: var(--textColor); text-shadow: 0 0 24px color-mix(in srgb, var(--accentColor) 26%, transparent); }
  .party_roomCard .party_qr { box-shadow: 0 0 25px color-mix(in srgb, var(--accentColor) 12%, transparent); }
  .party_guestMain .party_tabs > button,
  .party_roomCard button,
  .party_start button { border: 1px solid color-mix(in srgb, var(--accentColor) 14%, transparent); transition: .18s ease; }
  .party_guestMain .party_tabs > button.activeBtn,
  .party_roomCard button.activeBtn,
  .party_start button.activeBtn { border-color: color-mix(in srgb, var(--accentColor) 50%, transparent); box-shadow: 0 0 20px var(--party-soft); }
  /* Keep the original, simple create/join card until a room is opened. */
  &.party_mode_none .party_formCard {
    border-color: var(--borderColor);
    background: color-mix(in srgb, var(--secondaryColor) 90%, transparent);
    box-shadow: none;
    backdrop-filter: blur(20px);
  }
  &.party_mobile {
    .party_start {
      justify-content: flex-start;
      align-items: stretch;
      max-width: 520px;
      padding: 10px 2px 20px;
      overflow-y: auto;
    }
    .party_body {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      align-items: stretch;
      gap: 14px;
      width: 100%;
      min-width: 0;
      padding-bottom: calc(80px + env(safe-area-inset-bottom));
      overflow-x: hidden;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    .party_roomCard,
    .party_main,
    .party_list,
    .party_nowPlayingCard,
    .party_submissions {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      max-width: 100%;
    }
    .party_roomCard {
      max-height: none;
      padding: 16px;
      border: 1px solid var(--borderColor);
    }
    .party_main { flex: none; min-height: 0; }
    .party_list { max-height: 46vh; }
    .party_row { width: 100%; min-width: 0; box-sizing: border-box; }
    .party_trackInfo { overflow: hidden; }
    .party_nowPlayingCard { gap: 12px; padding: 12px; margin-bottom: 12px; }
    .party_nowArt { width: 68px; height: 68px; }
    .party_guestChips { justify-content: flex-start; }
    .party_formCard {
      padding: 18px 16px;
      border-radius: 20px;
      gap: 12px;
      background: color-mix(in srgb, var(--secondaryColor) 90%, transparent);
    }
    .party_codeInput { letter-spacing: .45em; padding-left: calc(14px + .45em); }
    .party_scanner { box-sizing: border-box; max-width: none; padding: 12px; }
    .party_formModes { gap: 8px; }
    .party_formModes > * { font-size: 12px; }
  }
}

/* Modern WebViews get soft translucent accent tints. The plain theme tokens
   above remain the fallback when color-mix() is not available. */
@supports (color: color-mix(in srgb, red 50%, transparent)) {
  .partyView {
    --party-card: color-mix(in srgb, var(--secondaryColor) 92%, transparent);
    --party-line: color-mix(in srgb, var(--accentColor) 20%, transparent);
    --party-soft: color-mix(in srgb, var(--accentColor) 7%, transparent);
    --party-glow: color-mix(in srgb, var(--accentColor) 55%, transparent);
    --party-accent-13: color-mix(in srgb, var(--accentColor) 13%, transparent);
    --party-accent-7: color-mix(in srgb, var(--accentColor) 7%, transparent);
    --party-danger: color-mix(in srgb, #ff4d6d 72%, var(--accentColor));
    --party-warning: color-mix(in srgb, #ffcf4a 55%, var(--accentColor));
    --party-ok: color-mix(in srgb, #3ddc97 42%, var(--accentColor));
  }
}

@media (min-width: 601px) {
  .partyView.party_mobile .party_body { display: grid; grid-template-columns: minmax(270px, 340px) minmax(0, 1fr); overflow: hidden; }
  .partyView.party_mobile .party_guestBody { grid-template-columns: minmax(260px, 380px) minmax(0, 1fr); }
  .partyView.party_mobile .party_roomCard,
  .partyView.party_mobile .party_main,
  .partyView.party_mobile .party_guestOverview,
  .partyView.party_mobile .party_guestMain { width: auto; min-width: 0; max-width: none; }
  .partyView.party_mobile .party_main { flex: initial; min-height: 0; }
  .partyView.party_mobile .party_list { max-height: none; }
  .partyView.party_mobile .party_nowPlayingCard { padding: 12px; margin: 0; }
}

@media (max-width: 980px) {
  .partyView .party_body { grid-template-columns: minmax(0, 1fr); overflow-y: auto; overflow-x: hidden; }
  .partyView .party_guestBody { grid-template-columns: minmax(0, 1fr); }
  .partyView .party_guestOverview { overflow: visible; }
  .partyView .party_guestMain { min-height: 340px; }
}

@media (max-width: 600px) {
  .partyView { padding: 10px 5px calc(75px + env(safe-area-inset-bottom)); }
  .partyView .party_header { min-height: 48px; gap: 6px; margin-bottom: 12px; padding-bottom: 8px; }
  .partyView .party_headerSpacer { width: 20px; }
  .partyView .party_title { font-size: 1rem; }
  .partyView .party_connectionBadge { padding: 5px 7px; font-size: .62rem; }
  .partyView .party_body { gap: 12px; padding-bottom: 4px; }
  .partyView .party_roomCard { padding: 12px; border-radius: 17px; }
  .partyView .party_guestMain { min-height: 270px; }
  .partyView .party_nowPlayingCard,
  .partyView.party_mobile .party_nowPlayingCard { gap: 10px; padding: 10px; margin: 0; border-radius: 17px; }
  .partyView .party_nowArt { width: 72px; height: 72px; }
  .partyView .party_inviteActions { grid-template-columns: minmax(0, 1fr); }
  .partyView .party_modeToggle { width: 100%; }
  .partyView .party_modeToggle > * { flex: 1 1 0; }
  .partyView .party_code { font-size: 2.15rem; letter-spacing: .22em; padding-left: .22em; }
  .partyView .party_guestRoomStatus { padding: 11px; }
  .partyView .party_guestMembers { padding: 9px; }
  .partyView .party_row { gap: 8px; padding: 8px; }
  .partyView .party_rowArt { width: 38px; height: 38px; }
  .partyView .party_memberOnline { display: none; }
}
</style>

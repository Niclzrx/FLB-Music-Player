import { TrackType } from '@/types';
import { isMobileApp } from '@/platform/ipc';
import { updateMobileMediaNotification } from '@/platform/mobile-ipc';

export function updateMediaInfo (trackInfo: TrackType | null, playing = true) {
  if (!trackInfo) return;
  const window_ = window as any;
  if (window_.navigator.mediaSession && window_.MediaMetadata) {
    const cover = trackInfo.albumArt || '';
    const artwork = /^(data:image\/|https?:\/\/|blob:)/i.test(cover)
      ? [{ src: cover, sizes: '512x512', type: cover.startsWith('data:image/png') ? 'image/png' : 'image/jpeg' }]
      : undefined;
    window_.navigator.mediaSession.metadata = new window_.MediaMetadata({
      title: trackInfo.defaultTitle,
      artist: trackInfo.defaultArtist,
      album: trackInfo.album,
      artwork
    }) as any;
    try {
      window_.navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    } catch (error) {
      // Older WebViews expose the metadata but not the playback state.
    }
  }
  if (isMobileApp) updateMobileMediaNotification(trackInfo, playing);
}

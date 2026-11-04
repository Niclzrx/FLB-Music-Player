import { TrackType } from '@/types';
import { isMobileApp } from '@/platform/ipc';
import { updateMobileMediaNotification } from '@/platform/mobile-ipc';

export function updateMediaInfo (trackInfo: TrackType | null, playing = true) {
  if (!trackInfo) return;
  const window_ = window as any;
  if (window_.navigator.mediaSession && window_.MediaMetadata) {
    window_.navigator.mediaSession.metadata = new window_.MediaMetadata({
      title: trackInfo.defaultTitle,
      artist: trackInfo.defaultArtist,
      album: trackInfo.album
      // artwork: [
      //     { src: trackInfo.albumArt, sizes: '500x500', type: 'image/jpeg' },
      // ]
    }) as any;
    try {
      window_.navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    } catch (error) {
      // Older WebViews expose the metadata but not the playback state.
    }
  }
  if (isMobileApp) updateMobileMediaNotification(trackInfo, playing);
}

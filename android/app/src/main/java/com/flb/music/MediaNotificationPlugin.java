package com.flb.music;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.drawable.Icon;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.util.Base64;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "MediaNotification")
public class MediaNotificationPlugin extends Plugin {
    private static final String CHANNEL_ID = "flb_music_playback";
    private static final int NOTIFICATION_ID = 7011;
    private static final int PERMISSION_REQUEST = 7021;

    static final String ACTION_PREVIOUS = "com.flb.music.MEDIA_PREVIOUS";
    static final String ACTION_TOGGLE = "com.flb.music.MEDIA_TOGGLE";
    static final String ACTION_NEXT = "com.flb.music.MEDIA_NEXT";

    private static MediaNotificationPlugin instance;

    private MediaSession mediaSession;
    private String title = "";
    private String artist = "";
    private boolean playing = false;
    private long durationMs = 0;
    private String artworkSource = "";
    private Bitmap artwork;
    private boolean notificationPermissionAsked = false;

    @Override
    public void load() {
        instance = this;
        createNotificationChannel();
        mediaSession = new MediaSession(getContext(), "FLB Music");
        mediaSession.setCallback(new MediaSession.Callback() {
            @Override
            public void onPlay() {
                dispatchAction("play");
            }

            @Override
            public void onPause() {
                dispatchAction("pause");
            }

            @Override
            public void onSkipToNext() {
                dispatchAction("next");
            }

            @Override
            public void onSkipToPrevious() {
                dispatchAction("previous");
            }
        });
        mediaSession.setActive(true);
    }

    @PluginMethod
    public void update(PluginCall call) {
        title = call.getString("title", "");
        artist = call.getString("artist", "");
        playing = Boolean.TRUE.equals(call.getBoolean("playing", false));

        Double duration = call.getDouble("duration", 0d);
        durationMs = duration == null ? 0 : Math.max(0, Math.round(duration * 1000));
        Double position = call.getDouble("position", 0d);
        double positionSeconds = position == null ? 0 : Math.max(0, position);

        String nextArtwork = call.getString("artwork", "");
        if (nextArtwork == null) nextArtwork = "";
        if (!nextArtwork.equals(artworkSource)) {
            artworkSource = nextArtwork;
            artwork = decodeArtwork(nextArtwork);
        }

        if (title == null || title.isEmpty()) {
            call.resolve();
            return;
        }

        updateSession(positionSeconds);
        showNotification();
        requestNotificationPermission();
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.cancel(NOTIFICATION_ID);
        artworkSource = "";
        artwork = null;
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.setPlaybackState(new PlaybackState.Builder()
                .setState(PlaybackState.STATE_STOPPED, 0, 0f)
                .build());
        }
        call.resolve();
    }

    static void dispatchAction(String action) {
        MediaNotificationPlugin plugin = instance;
        if (plugin == null || action == null) return;
        if (ACTION_PREVIOUS.equals(action)) action = "previous";
        else if (ACTION_NEXT.equals(action)) action = "next";
        else if (ACTION_TOGGLE.equals(action)) action = "toggle";

        JSObject payload = new JSObject();
        payload.put("action", action);
        plugin.notifyListeners("mediaAction", payload);
    }

    private void updateSession(double positionSeconds) {
        if (mediaSession == null) return;

        MediaMetadata metadata = new MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE, title)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
            .putLong(MediaMetadata.METADATA_KEY_DURATION, durationMs)
            .build();
        if (artwork != null) {
            metadata = new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
                .putLong(MediaMetadata.METADATA_KEY_DURATION, durationMs)
                .putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, artwork)
                .putBitmap(MediaMetadata.METADATA_KEY_ART, artwork)
                .build();
        }
        mediaSession.setMetadata(metadata);

        long actions = PlaybackState.ACTION_PLAY
            | PlaybackState.ACTION_PAUSE
            | PlaybackState.ACTION_PLAY_PAUSE
            | PlaybackState.ACTION_SKIP_TO_NEXT
            | PlaybackState.ACTION_SKIP_TO_PREVIOUS;
        PlaybackState.Builder playbackState = new PlaybackState.Builder()
            .setActions(actions)
            .setState(
                playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                Math.round(positionSeconds * 1000),
                playing ? 1f : 0f
            );
        mediaSession.setPlaybackState(playbackState.build());
        mediaSession.setActive(true);
    }

    private void showNotification() {
        Context context = getContext();
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setAction(Intent.ACTION_MAIN);
        openIntent.addCategory(Intent.CATEGORY_LAUNCHER);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPendingIntent = PendingIntent.getActivity(
            context,
            0,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(context, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(context);
        }

        builder
            .setSmallIcon(R.drawable.ic_stat_music)
            .setContentTitle(title)
            .setContentText(artist)
            .setContentIntent(openPendingIntent)
            .setCategory(Notification.CATEGORY_TRANSPORT)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setOngoing(playing)
            .addAction(buildAction(android.R.drawable.ic_media_previous, "Anterior", ACTION_PREVIOUS, 1))
            .addAction(buildAction(
                playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                playing ? "Pausar" : "Reproduzir",
                ACTION_TOGGLE,
                2
            ))
            .addAction(buildAction(android.R.drawable.ic_media_next, "Próxima", ACTION_NEXT, 3));

        if (artwork != null) {
            builder.setLargeIcon(artwork);
        }

        if (mediaSession != null) {
            builder.setStyle(new Notification.MediaStyle()
                .setMediaSession(mediaSession.getSessionToken())
                .setShowActionsInCompactView(0, 1, 2));
        }

        manager.notify(NOTIFICATION_ID, builder.build());
    }

    /**
     * The web layer sends a small, compressed data URL (JPEG, at most 512px)
     * so the notification never has to download an image or deal with large
     * bitmaps in the WebView.
     */
    private Bitmap decodeArtwork(String dataUrl) {
        if (dataUrl == null || !dataUrl.startsWith("data:image/")) return null;
        int comma = dataUrl.indexOf(',');
        if (comma < 0 || comma + 1 >= dataUrl.length()) return null;
        try {
            byte[] bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
            int sample = 1;
            int largest = Math.max(bounds.outWidth, bounds.outHeight);
            while (largest / sample > 512) sample *= 2;
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inSampleSize = sample;
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
        } catch (Exception error) {
            return null;
        }
    }

    private Notification.Action buildAction(int iconResource, String label, String action, int requestCode) {
        Intent intent = new Intent(getContext(), MediaNotificationReceiver.class);
        intent.setAction(action);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            getContext(),
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        return new Notification.Action.Builder(
            Icon.createWithResource(getContext(), iconResource),
            label,
            pendingIntent
        ).build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Reprodutor de música",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Controles de reprodução do FLB Music");
        channel.setShowBadge(false);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(channel);
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || notificationPermissionAsked) return;
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
            == PackageManager.PERMISSION_GRANTED) return;
        if (getActivity() == null) return;

        notificationPermissionAsked = true;
        getActivity().runOnUiThread(() -> getActivity().requestPermissions(
            new String[] { Manifest.permission.POST_NOTIFICATIONS },
            PERMISSION_REQUEST
        ));
    }

    @Override
    protected void handleOnDestroy() {
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
            mediaSession = null;
        }
        NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.cancel(NOTIFICATION_ID);
        artwork = null;
        artworkSource = "";
        if (instance == this) instance = null;
        super.handleOnDestroy();
    }
}

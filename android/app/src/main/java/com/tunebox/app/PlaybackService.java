package com.tunebox.app;

import android.app.PendingIntent;
import android.content.Intent;
import android.net.Uri;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.ForwardingPlayer;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DataSpec;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.ResolvingDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;

import java.util.Collections;

/**
 * Plays audio in the background with lock-screen and notification controls (Media3).
 * The queue lives in the web app, so next/previous are forwarded to it as commands.
 */
@UnstableApi
public class PlaybackService extends MediaSessionService {
    public interface CommandListener {
        void onCommand(String command);
    }

    /** Set by PlayerPlugin: receives "next" / "prev" from the notification, lock screen and headset. */
    static volatile CommandListener commands;
    /** The User-Agent yt-dlp used when it resolved the current stream URL. */
    static volatile String streamUserAgent;

    private MediaSession session;

    @Override
    public void onCreate() {
        super.onCreate();
        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(15000)
            .setReadTimeoutMs(20000);
        ResolvingDataSource.Factory sources =
            new ResolvingDataSource.Factory(new DefaultDataSource.Factory(this, http), PlaybackService::resolve);
        ExoPlayer exo = new ExoPlayer.Builder(this)
            .setMediaSourceFactory(new DefaultMediaSourceFactory(sources))
            .setAudioAttributes(
                new AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .build(),
                true)
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .build();

        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent activity =
            PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        session = new MediaSession.Builder(this, new QueuePlayer(exo)).setSessionActivity(activity).build();
    }

    /**
     * YouTube's stream servers refuse Range headers for some clients but accept the same range as a
     * `range=` query parameter (the desktop app's stream proxy does the same translation).
     */
    static DataSpec resolve(DataSpec spec) {
        Uri uri = spec.uri;
        String host = uri.getHost();
        if (host == null || !host.endsWith(".googlevideo.com")) return spec;
        DataSpec out = spec;
        String ua = streamUserAgent;
        if (ua != null) out = out.withAdditionalHeaders(Collections.singletonMap("User-Agent", ua));
        long end;
        if (spec.length != C.LENGTH_UNSET) {
            end = spec.position + spec.length - 1;
        } else {
            String clen = uri.getQueryParameter("clen");
            if (clen == null) return out;
            try {
                end = Long.parseLong(clen) - 1;
            } catch (NumberFormatException e) {
                return out;
            }
        }
        if (spec.position > end) return out;
        Uri ranged = uri.buildUpon().appendQueryParameter("range", spec.position + "-" + end).build();
        return out.buildUpon().setUri(ranged).setPosition(0).setLength(C.LENGTH_UNSET).build();
    }

    @Nullable
    @Override
    public MediaSession onGetSession(@NonNull MediaSession.ControllerInfo controllerInfo) {
        return session;
    }

    @Override
    public void onTaskRemoved(@Nullable Intent rootIntent) {
        Player p = session == null ? null : session.getPlayer();
        // Swiping the app away keeps music going, but a paused player has no reason to stay.
        if (p == null || !p.getPlayWhenReady() || p.getMediaItemCount() == 0) stopSelf();
    }

    @Override
    public void onDestroy() {
        if (session != null) {
            session.getPlayer().release();
            session.release();
            session = null;
        }
        super.onDestroy();
    }

    /** Shows next/previous buttons and hands them to the web app's queue. */
    private static class QueuePlayer extends ForwardingPlayer {
        QueuePlayer(Player player) {
            super(player);
        }

        private static boolean send(String command) {
            CommandListener l = commands;
            if (l == null) return false;
            l.onCommand(command);
            return true;
        }

        @NonNull
        @Override
        public Commands getAvailableCommands() {
            return super.getAvailableCommands().buildUpon()
                .addAll(COMMAND_SEEK_TO_NEXT, COMMAND_SEEK_TO_NEXT_MEDIA_ITEM,
                    COMMAND_SEEK_TO_PREVIOUS, COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
                .build();
        }

        @Override
        public boolean isCommandAvailable(int command) {
            return getAvailableCommands().contains(command);
        }

        @Override
        public boolean hasNextMediaItem() {
            return true;
        }

        @Override
        public boolean hasPreviousMediaItem() {
            return true;
        }

        @Override
        public void seekToNext() {
            send("next");
        }

        @Override
        public void seekToNextMediaItem() {
            send("next");
        }

        @Override
        public void seekToPrevious() {
            send("prev");
        }

        @Override
        public void seekToPreviousMediaItem() {
            send("prev");
        }
    }
}

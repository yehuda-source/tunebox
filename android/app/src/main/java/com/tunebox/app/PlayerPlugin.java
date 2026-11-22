package com.tunebox.app;

import android.content.ComponentName;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.common.util.concurrent.ListenableFuture;

import java.util.function.Consumer;

/**
 * The web app's audio element, backed by the native PlaybackService so music keeps playing with
 * the screen off. Events: "state" (playing/buffering/ended), "time" (position), "error", "command".
 */
@UnstableApi
@CapacitorPlugin(name = "Player")
public class PlayerPlugin extends Plugin {
    private final Handler main = new Handler(Looper.getMainLooper());
    private ListenableFuture<MediaController> future;
    private MediaController controller;

    private final Runnable ticker = new Runnable() {
        @Override
        public void run() {
            if (controller == null) return;
            notifyListeners("time", times(controller));
            if (controller.isPlaying()) main.postDelayed(this, 500);
        }
    };

    @Override
    public void load() {
        PlaybackService.commands = command -> {
            JSObject e = new JSObject();
            e.put("command", command);
            notifyListeners("command", e);
        };
        SessionToken token = new SessionToken(getContext(), new ComponentName(getContext(), PlaybackService.class));
        future = new MediaController.Builder(getContext(), token).buildAsync();
        future.addListener(() -> {
            try {
                controller = future.get();
                controller.addListener(listener);
            } catch (Exception e) {
                controller = null;
            }
        }, ContextCompat.getMainExecutor(getContext()));
    }

    @Override
    protected void handleOnDestroy() {
        main.removeCallbacks(ticker);
        if (controller != null) controller.removeListener(listener);
        if (future != null) MediaController.releaseFuture(future);
        controller = null;
    }

    private static JSObject times(Player p) {
        JSObject o = new JSObject();
        o.put("position", Math.max(0, p.getCurrentPosition()) / 1000.0);
        long d = p.getDuration();
        o.put("duration", d < 0 ? 0 : d / 1000.0);
        return o;
    }

    private JSObject state(Player p) {
        JSObject o = times(p);
        o.put("playing", p.isPlaying());
        o.put("playWhenReady", p.getPlayWhenReady());
        o.put("buffering", p.getPlaybackState() == Player.STATE_BUFFERING);
        o.put("ready", p.getPlaybackState() == Player.STATE_READY);
        o.put("ended", p.getPlaybackState() == Player.STATE_ENDED);
        return o;
    }

    private final Player.Listener listener = new Player.Listener() {
        @Override
        public void onEvents(@NonNull Player player, @NonNull Player.Events events) {
            if (events.containsAny(Player.EVENT_IS_PLAYING_CHANGED, Player.EVENT_PLAYBACK_STATE_CHANGED,
                Player.EVENT_PLAY_WHEN_READY_CHANGED)) {
                notifyListeners("state", state(player));
                main.removeCallbacks(ticker);
                if (player.isPlaying()) main.post(ticker);
            }
            if (events.contains(Player.EVENT_POSITION_DISCONTINUITY)) notifyListeners("time", times(player));
        }

        @Override
        public void onPlayerError(@NonNull PlaybackException error) {
            JSObject e = new JSObject();
            e.put("message", error.getErrorCodeName() + ": " + error.getMessage());
            e.put("code", error.errorCode);
            notifyListeners("error", e);
        }
    };

    /** Runs on the main thread once connected to the service. */
    private void withController(PluginCall call, Consumer<MediaController> action) {
        future.addListener(() -> {
            if (controller == null) {
                call.reject("The audio player is unavailable");
                return;
            }
            try {
                action.accept(controller);
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "Player error" : e.getMessage(), e);
            }
        }, ContextCompat.getMainExecutor(getContext()));
    }

    @PluginMethod
    public void load(PluginCall call) {
        String url = call.getString("url");
        if (url == null) {
            call.reject("url is required");
            return;
        }
        MediaMetadata.Builder meta = new MediaMetadata.Builder()
            .setTitle(call.getString("title", ""))
            .setArtist(call.getString("artist", ""))
            .setAlbumTitle(call.getString("album", ""));
        String artwork = call.getString("artwork");
        if (artwork != null && !artwork.isEmpty()) meta.setArtworkUri(Uri.parse(artwork));
        MediaItem item = new MediaItem.Builder()
            .setUri(Uri.parse(url))
            .setMediaId(call.getString("key", url))
            .setMediaMetadata(meta.build())
            .build();
        String ua = call.getString("userAgent");
        if (ua != null) PlaybackService.streamUserAgent = ua;
        long startMs = (long) (call.getDouble("startAt", 0.0) * 1000);
        boolean autoplay = Boolean.TRUE.equals(call.getBoolean("autoplay", true));
        withController(call, c -> {
            c.setMediaItem(item, startMs);
            c.prepare();
            c.setPlayWhenReady(autoplay);
            call.resolve();
        });
    }

    @PluginMethod
    public void play(PluginCall call) {
        withController(call, c -> {
            if (c.getPlaybackState() == Player.STATE_ENDED) c.seekTo(0);
            if (c.getPlaybackState() == Player.STATE_IDLE) c.prepare();
            c.play();
            call.resolve();
        });
    }

    @PluginMethod
    public void pause(PluginCall call) {
        withController(call, c -> {
            c.pause();
            call.resolve();
        });
    }

    @PluginMethod
    public void seek(PluginCall call) {
        long ms = (long) (call.getDouble("position", 0.0) * 1000);
        withController(call, c -> {
            c.seekTo(Math.max(0, ms));
            call.resolve();
        });
    }

    @PluginMethod
    public void setVolume(PluginCall call) {
        float v = call.getFloat("volume", 1f);
        withController(call, c -> {
            c.setVolume(Math.max(0f, Math.min(1f, v)));
            call.resolve();
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        withController(call, c -> {
            c.stop();
            c.clearMediaItems();
            call.resolve();
        });
    }

    @PluginMethod
    public void getState(PluginCall call) {
        withController(call, c -> call.resolve(state(c)));
    }
}

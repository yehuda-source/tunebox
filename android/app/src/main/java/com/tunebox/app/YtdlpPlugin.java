package com.tunebox.app;

import android.os.Environment;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.yausername.ffmpeg.FFmpeg;
import com.yausername.youtubedl_android.YoutubeDL;
import com.yausername.youtubedl_android.YoutubeDLRequest;
import com.yausername.youtubedl_android.YoutubeDLResponse;

import java.io.File;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import kotlin.Unit;

/**
 * yt-dlp for TuneBox on Android, via youtubedl-android (embedded Python + yt-dlp + ffmpeg, with
 * QuickJS so yt-dlp can solve YouTube's JavaScript challenges). Mirrors the desktop app: run yt-dlp
 * with arguments, stream progress, cancel by id, and update yt-dlp without updating the app.
 */
@CapacitorPlugin(name = "Ytdlp")
public class YtdlpPlugin extends Plugin {
    // Capacitor runs plugin calls on one shared thread; yt-dlp runs go elsewhere so cancel works.
    private final ExecutorService pool = Executors.newCachedThreadPool();
    private volatile boolean ready = false;

    private File musicDir() {
        File dir = getContext().getExternalFilesDir(Environment.DIRECTORY_MUSIC);
        if (dir == null) dir = new File(getContext().getFilesDir(), "Music");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        return dir;
    }

    private synchronized void ensureInit() throws Exception {
        if (ready) return;
        YoutubeDL.getInstance().init(getContext());
        FFmpeg.getInstance().init(getContext());
        ready = true;
    }

    @PluginMethod
    public void start(PluginCall call) {
        pool.execute(() -> {
            try {
                ensureInit();
                JSObject ret = new JSObject();
                String version = YoutubeDL.getInstance().version(getContext());
                ret.put("version", version == null ? "" : version);
                ret.put("musicDir", musicDir().getAbsolutePath());
                ret.put("cacheDir", getContext().getCacheDir().getAbsolutePath());
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Could not start yt-dlp: " + e.getMessage(), e);
            }
        });
    }

    @PluginMethod
    public void update(PluginCall call) {
        pool.execute(() -> {
            try {
                ensureInit();
                YoutubeDL.UpdateStatus status =
                    YoutubeDL.getInstance().updateYoutubeDL(getContext(), YoutubeDL.UpdateChannel.STABLE.INSTANCE);
                JSObject ret = new JSObject();
                ret.put("status", status == null ? "UNKNOWN" : status.name());
                String version = YoutubeDL.getInstance().version(getContext());
                ret.put("version", version == null ? "" : version);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Could not update yt-dlp: " + e.getMessage(), e);
            }
        });
    }

    @PluginMethod
    public void run(PluginCall call) {
        final String id = call.getString("id");
        final JSArray args = call.getArray("args");
        if (id == null || args == null) {
            call.reject("id and args are required");
            return;
        }
        pool.execute(() -> {
            try {
                ensureInit();
                List<String> list = new ArrayList<>();
                for (int i = 0; i < args.length(); i++) list.add(args.getString(i));
                // URLs are part of args, so the request itself carries none.
                YoutubeDLRequest request = new YoutubeDLRequest(Collections.<String>emptyList());
                request.addCommands(list);
                YoutubeDLResponse res = YoutubeDL.getInstance().execute(request, id, (progress, eta, line) -> {
                    JSObject e = new JSObject();
                    e.put("id", id);
                    e.put("progress", progress);
                    e.put("eta", eta);
                    e.put("line", line);
                    notifyListeners("progress", e);
                    return Unit.INSTANCE;
                });
                JSObject ret = new JSObject();
                ret.put("exitCode", res.getExitCode());
                ret.put("out", res.getOut());
                ret.put("err", res.getErr());
                call.resolve(ret);
            } catch (YoutubeDL.CanceledException e) {
                call.reject("Canceled", "CANCELED");
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "yt-dlp failed" : e.getMessage(), e);
            }
        });
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        String id = call.getString("id");
        JSObject ret = new JSObject();
        ret.put("canceled", id != null && YoutubeDL.getInstance().destroyProcessById(id));
        call.resolve(ret);
    }
}

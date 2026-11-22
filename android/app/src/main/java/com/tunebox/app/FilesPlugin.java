package com.tunebox.app;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/** File operations for the phone library (absolute paths inside the app's own folders), plus ffmpeg. */
@CapacitorPlugin(name = "Files")
public class FilesPlugin extends Plugin {
    private final ExecutorService pool = Executors.newCachedThreadPool();

    private interface Task {
        void run(PluginCall call) throws Exception;
    }

    private void background(PluginCall call, Task task) {
        pool.execute(() -> {
            try {
                task.run(call);
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage(), e);
            }
        });
    }

    private static File file(PluginCall call, String key) throws IOException {
        String p = call.getString(key);
        if (p == null || p.isEmpty()) throw new IOException(key + " is required");
        return new File(p);
    }

    private static void copy(InputStream in, OutputStream out) throws IOException {
        byte[] buf = new byte[64 * 1024];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
    }

    private static void mkParent(File f) {
        File parent = f.getParentFile();
        //noinspection ResultOfMethodCallIgnored
        if (parent != null) parent.mkdirs();
    }

    private static boolean deleteTree(File f) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteTree(k);
        return f.delete();
    }

    @PluginMethod
    public void dirs(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("files", getContext().getFilesDir().getAbsolutePath());
        ret.put("cache", getContext().getCacheDir().getAbsolutePath());
        File ext = getContext().getExternalFilesDir(null);
        ret.put("external", (ext != null ? ext : getContext().getFilesDir()).getAbsolutePath());
        call.resolve(ret);
    }

    @PluginMethod
    public void readText(PluginCall call) {
        background(call, c -> {
            File f = file(c, "path");
            JSObject ret = new JSObject();
            if (!f.exists()) {
                ret.put("text", null);
                c.resolve(ret);
                return;
            }
            try (InputStream in = new FileInputStream(f); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                copy(in, out);
                ret.put("text", out.toString(StandardCharsets.UTF_8.name()));
            }
            c.resolve(ret);
        });
    }

    /** Writes through a temporary file, so a crash mid-write never leaves half a library. */
    @PluginMethod
    public void writeText(PluginCall call) {
        background(call, c -> {
            File f = file(c, "path");
            String text = c.getString("text", "");
            mkParent(f);
            File tmp = new File(f.getPath() + ".tmp");
            try (FileOutputStream out = new FileOutputStream(tmp)) {
                out.write(text.getBytes(StandardCharsets.UTF_8));
                out.getFD().sync();
            }
            if (!tmp.renameTo(f)) throw new IOException("Could not save " + f.getName());
            c.resolve();
        });
    }

    @PluginMethod
    public void stat(PluginCall call) {
        background(call, c -> {
            File f = file(c, "path");
            JSObject ret = new JSObject();
            ret.put("exists", f.exists());
            ret.put("size", f.length());
            ret.put("dir", f.isDirectory());
            c.resolve(ret);
        });
    }

    /** Which of these paths exist (for library rescans). */
    @PluginMethod
    public void existing(PluginCall call) {
        background(call, c -> {
            JSArray paths = c.getArray("paths");
            JSArray out = new JSArray();
            if (paths != null)
                for (int i = 0; i < paths.length(); i++) {
                    String p = paths.getString(i);
                    if (new File(p).exists()) out.put(p);
                }
            JSObject ret = new JSObject();
            ret.put("paths", out);
            c.resolve(ret);
        });
    }

    @PluginMethod
    public void list(PluginCall call) {
        background(call, c -> {
            String[] names = file(c, "path").list();
            JSArray out = new JSArray();
            if (names != null) for (String n : names) out.put(n);
            JSObject ret = new JSObject();
            ret.put("names", out);
            c.resolve(ret);
        });
    }

    @PluginMethod
    public void mkdirs(PluginCall call) {
        background(call, c -> {
            File f = file(c, "path");
            //noinspection ResultOfMethodCallIgnored
            f.mkdirs();
            c.resolve();
        });
    }

    @PluginMethod
    public void move(PluginCall call) {
        background(call, c -> {
            File from = file(c, "from");
            File to = file(c, "to");
            mkParent(to);
            if (to.exists() && !to.delete()) throw new IOException("Could not replace " + to.getName());
            if (!from.renameTo(to)) {
                try (InputStream in = new FileInputStream(from); OutputStream out = new FileOutputStream(to)) {
                    copy(in, out);
                }
                //noinspection ResultOfMethodCallIgnored
                from.delete();
            }
            c.resolve();
        });
    }

    @PluginMethod
    public void remove(PluginCall call) {
        background(call, c -> {
            File f = file(c, "path");
            if (f.exists()) deleteTree(f);
            // Tidy up folders the removal left empty, up to (not including) the given root.
            String stop = c.getString("pruneUpTo");
            if (stop != null) {
                File dir = f.getParentFile();
                while (dir != null && dir.getPath().startsWith(stop) && !dir.getPath().equals(stop)) {
                    String[] kids = dir.list();
                    if (kids == null || kids.length > 0 || !dir.delete()) break;
                    dir = dir.getParentFile();
                }
            }
            c.resolve();
        });
    }

    @PluginMethod
    public void download(PluginCall call) {
        background(call, c -> {
            String url = c.getString("url");
            File to = file(c, "path");
            if (url == null) throw new IOException("url is required");
            HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(30000);
            conn.setInstanceFollowRedirects(true);
            try {
                int code = conn.getResponseCode();
                if (code / 100 != 2) throw new IOException("HTTP " + code);
                mkParent(to);
                try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(to)) {
                    copy(in, out);
                }
            } finally {
                conn.disconnect();
            }
            JSObject ret = new JSObject();
            ret.put("size", to.length());
            c.resolve(ret);
        });
    }

    /** Runs the ffmpeg that youtubedl-android unpacked (used for tags and cover art). */
    @PluginMethod
    public void ffmpeg(PluginCall call) {
        background(call, c -> {
            JSArray args = c.getArray("args");
            List<String> cmd = new ArrayList<>();
            String libDir = getContext().getApplicationInfo().nativeLibraryDir;
            cmd.add(new File(libDir, "libffmpeg.so").getAbsolutePath());
            if (args != null) for (int i = 0; i < args.length(); i++) cmd.add(args.getString(i));
            File packages = new File(getContext().getNoBackupFilesDir(), "youtubedl-android/packages");
            ProcessBuilder pb = new ProcessBuilder(cmd).redirectErrorStream(true);
            Map<String, String> env = pb.environment();
            env.put("LD_LIBRARY_PATH",
                new File(packages, "ffmpeg/usr/lib").getAbsolutePath() + ":" + new File(packages, "python/usr/lib").getAbsolutePath());
            Process p = pb.start();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            try (InputStream in = p.getInputStream()) {
                copy(in, out);
            }
            if (!p.waitFor(5, TimeUnit.MINUTES)) {
                p.destroy();
                throw new IOException("ffmpeg timed out");
            }
            JSObject ret = new JSObject();
            ret.put("exitCode", p.exitValue());
            ret.put("out", out.toString(StandardCharsets.UTF_8.name()));
            c.resolve(ret);
        });
    }
}

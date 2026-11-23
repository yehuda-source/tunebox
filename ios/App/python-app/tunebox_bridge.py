"""TuneBox's bridge to yt-dlp in the iOS app's embedded Python.

iOS doesn't let apps start other programs, so yt-dlp runs inside the app: each `run` call executes
yt-dlp's normal command line in the calling thread, with its output captured for that thread.
YouTube's JavaScript challenges are solved by JavaScriptCore through a yt-dlp challenge provider
(`JavaScriptCoreJCP`) that hands the solver script to the app (`_tunebox.js_eval`). The solver logic
itself ships with yt-dlp, so a yt-dlp update (downloaded at runtime by `update`) keeps it current.

The app provides the `_tunebox` module (ios/App/App/Native/TBPython.c):
  js_eval(script) -> str   run a script in JavaScriptCore and return what it printed
  emit(id, line)           an output line from a running job (for progress)
"""

import ctypes
import io
import json
import os
import shutil
import ssl
import sys
import threading
import time
import traceback
import urllib.request
import zipfile

try:
    import _tunebox
except ImportError:  # running outside the app (tests)
    _tunebox = None

# Tests can replace these.
js_eval = getattr(_tunebox, 'js_eval', None)
emit = getattr(_tunebox, 'emit', None)

_local = threading.local()
_running = {}  # job id -> thread ident
_canceled = set()
_lock = threading.Lock()
_data_dir = None
_provider_installed = False

YTDLP_RELEASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp'
YTDLP_LATEST_API = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest'


# ---------- per-thread stdout / stderr ----------

class _ThreadOutput(io.TextIOBase):
    """Sends writes to the current job's buffer (and its lines to the app), or to the real stream."""

    def __init__(self, name, fallback):
        self._name = name
        self._fallback = fallback

    @property
    def encoding(self):
        return 'utf-8'

    @property
    def errors(self):
        return 'replace'

    def writable(self):
        return True

    def isatty(self):
        return False

    def write(self, s):
        buf = getattr(_local, self._name, None)
        if buf is None:
            if self._fallback is not None:
                return self._fallback.write(s)
            return len(s)
        buf.write(s)
        job = getattr(_local, 'job', None)
        if job and emit:
            pending = _local.pending + s
            *lines, _local.pending = pending.replace('\r', '\n').split('\n')
            for line in lines:
                if line.strip():
                    emit(job, line)
        return len(s)

    def flush(self):
        if getattr(_local, self._name, None) is None and self._fallback is not None:
            self._fallback.flush()


def _install_streams():
    if not isinstance(sys.stdout, _ThreadOutput):
        sys.stdout = _ThreadOutput('out', sys.stdout)
    if not isinstance(sys.stderr, _ThreadOutput):
        sys.stderr = _ThreadOutput('err', sys.stderr)


# ---------- JavaScriptCore challenge provider ----------

def _install_provider():
    global _provider_installed
    if _provider_installed:
        return
    from yt_dlp.extractor.youtube.jsc._builtin.ejs import EJSBaseJCP
    from yt_dlp.extractor.youtube.jsc.provider import (
        JsChallengeProviderError,
        register_preference,
        register_provider,
    )
    from yt_dlp.utils._jsruntime import JsRuntimeInfo

    class JavaScriptCoreJCP(EJSBaseJCP):
        PROVIDER_NAME = 'javascriptcore'
        PROVIDER_VERSION = '1.0.0'
        BUG_REPORT_LOCATION = 'https://github.com/yehuda-source/tunebox/issues'
        JS_RUNTIME_NAME = 'javascriptcore'

        @property
        def runtime_info(self):
            return JsRuntimeInfo(name='javascriptcore', path='(built into iOS)', version='1', version_tuple=(1,))

        def is_available(self):
            return js_eval is not None

        def _run_js_runtime(self, stdin, /):
            try:
                return js_eval(stdin)
            except Exception as e:
                raise JsChallengeProviderError(f'JavaScriptCore failed: {e}') from e

    register_provider(JavaScriptCoreJCP)

    @register_preference(JavaScriptCoreJCP)
    def _prefer(provider, requests):
        return 1000

    _provider_installed = True


# ---------- setup and updates ----------

def _updated_zip():
    return os.path.join(_data_dir, 'yt-dlp.zip') if _data_dir else None


def _ssl_context():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def setup(data_dir):
    """Call once at startup. Uses a downloaded yt-dlp (data_dir/yt-dlp.zip) over the bundled one."""
    global _data_dir
    _data_dir = data_dir
    os.makedirs(data_dir, exist_ok=True)
    # Bundled with the app (scripts/ios-prepare.sh): yt-dlp, mutagen, certifi.
    here = os.path.dirname(os.path.abspath(__file__))
    for bundled in (os.path.join(here, 'site-packages'), os.path.join(here, 'yt-dlp.zip')):
        if os.path.exists(bundled) and bundled not in sys.path:
            sys.path.append(bundled)
    # A newer yt-dlp downloaded by update() takes precedence.
    zip_path = _updated_zip()
    if os.path.exists(zip_path) and zip_path not in sys.path:
        sys.path.insert(0, zip_path)
    _install_streams()
    try:
        import yt_dlp  # noqa: F401
    except Exception:
        # A broken update must not break the app: fall back to the bundled copy.
        if zip_path in sys.path:
            sys.path.remove(zip_path)
        os.remove(zip_path)
        _forget_ytdlp()
        import yt_dlp  # noqa: F401
    _install_provider()
    os.environ.setdefault('SSL_CERT_FILE', _cafile())
    return version()


def _cafile():
    try:
        import certifi
        return certifi.where()
    except ImportError:
        return ''


def version():
    from yt_dlp.version import __version__
    return __version__


def _forget_ytdlp():
    global _provider_installed
    for name in list(sys.modules):
        if name == 'yt_dlp' or name.startswith('yt_dlp.') or name.startswith('yt_dlp_ejs'):
            del sys.modules[name]
    _provider_installed = False


def update():
    """Download the latest yt-dlp release if it's newer. Returns JSON {status, version}."""
    req = urllib.request.Request(YTDLP_LATEST_API, headers={'User-Agent': 'TuneBox'})
    with urllib.request.urlopen(req, timeout=30, context=_ssl_context()) as r:
        latest = json.load(r)['tag_name']
    current = version()
    if _norm(latest) <= _norm(current):
        return json.dumps({'status': 'ALREADY_UP_TO_DATE', 'version': current})

    tmp = _updated_zip() + '.download'
    req = urllib.request.Request(YTDLP_RELEASE, headers={'User-Agent': 'TuneBox'})
    with urllib.request.urlopen(req, timeout=120, context=_ssl_context()) as r, open(tmp, 'wb') as f:
        shutil.copyfileobj(r, f)
    # The release file is a zip of the yt_dlp package behind a shebang line; zipimport reads it.
    with zipfile.ZipFile(tmp) as z:
        text = z.read('yt_dlp/version.py').decode()
    if latest not in text:
        os.remove(tmp)
        raise RuntimeError(f'Downloaded yt-dlp does not look like version {latest}')
    os.replace(tmp, _updated_zip())

    # Switch now if nothing is running; otherwise the new version is used from the next launch.
    with _lock:
        idle = not _running
    if idle:
        _forget_ytdlp()
        zip_path = _updated_zip()
        if zip_path not in sys.path:
            sys.path.insert(0, zip_path)
        import yt_dlp  # noqa: F401
        _install_provider()
        return json.dumps({'status': 'DONE', 'version': version()})
    return json.dumps({'status': 'DONE', 'version': latest})


def _norm(v):
    return tuple(int(p) for p in v.split('.') if p.isdigit())


# ---------- running yt-dlp ----------

def run(job_id, args_json):
    """Run yt-dlp with these arguments in this thread. Returns JSON {exitCode, out, err, canceled}."""
    args = json.loads(args_json)
    out, err = io.StringIO(), io.StringIO()
    _local.out, _local.err, _local.job, _local.pending = out, err, job_id, ''
    with _lock:
        _running[job_id] = threading.get_ident()
        _canceled.discard(job_id)
    code = 0
    try:
        import yt_dlp
        try:
            yt_dlp.main(args)
        except SystemExit as e:
            code = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
            if isinstance(e.code, str):
                err.write(e.code + '\n')
        except KeyboardInterrupt:
            code = 1
    except BaseException:
        err.write(traceback.format_exc())
        code = 1
    finally:
        _local.out = _local.err = _local.job = None
        with _lock:
            _running.pop(job_id, None)
            canceled = job_id in _canceled
            _canceled.discard(job_id)
    return json.dumps({'exitCode': code, 'out': out.getvalue(), 'err': err.getvalue(), 'canceled': canceled})


def cancel(job_id):
    """Interrupt a running job (it stops at its next Python instruction or network timeout)."""
    with _lock:
        ident = _running.get(job_id)
        if ident is None:
            return False
        _canceled.add(job_id)
    ctypes.pythonapi.PyThreadState_SetAsyncExc(ctypes.c_ulong(ident), ctypes.py_object(KeyboardInterrupt))
    return True


# ---------- tags ----------

def tag(path, tags_json, cover_path):
    """Write title/artist/album/... and cover art (JPEG) into an .m4a or .mp3 file."""
    t = json.loads(tags_json)
    ext = os.path.splitext(path)[1].lower()
    cover = None
    if cover_path and os.path.exists(cover_path):
        with open(cover_path, 'rb') as f:
            cover = f.read()
    if ext in ('.m4a', '.mp4'):
        from mutagen.mp4 import MP4, MP4Cover
        f = MP4(path)
        if f.tags is None:
            f.add_tags()
        fields = {
            '\xa9nam': t.get('title'),
            '\xa9ART': t.get('artist'),
            '\xa9alb': t.get('album'),
            'aART': t.get('albumArtist'),
            '\xa9day': t.get('year'),
            '\xa9cmt': f"youtube:{t['videoId']}" if t.get('videoId') else None,
        }
        for key, value in fields.items():
            if value:
                f.tags[key] = [str(value)]
            elif key in f.tags:
                del f.tags[key]
        if t.get('trackNumber'):
            f.tags['trkn'] = [(int(t['trackNumber']), 0)]
        elif 'trkn' in f.tags:
            del f.tags['trkn']
        if cover:
            f.tags['covr'] = [MP4Cover(cover, imageformat=MP4Cover.FORMAT_JPEG)]
        f.save()
    elif ext == '.mp3':
        from mutagen.id3 import APIC, COMM, ID3, TALB, TDRC, TIT2, TPE1, TPE2, TRCK, ID3NoHeaderError
        try:
            f = ID3(path)
        except ID3NoHeaderError:
            f = ID3()
        for frame, value in (
            (TIT2, t.get('title')), (TPE1, t.get('artist')), (TALB, t.get('album')),
            (TPE2, t.get('albumArtist')), (TDRC, t.get('year')),
            (TRCK, str(t['trackNumber']) if t.get('trackNumber') else None),
        ):
            f.delall(frame.__name__)
            if value:
                f.add(frame(encoding=3, text=str(value)))
        if t.get('videoId'):
            f.delall('COMM')
            f.add(COMM(encoding=3, lang='eng', desc='', text=f"youtube:{t['videoId']}"))
        if cover:
            f.delall('APIC')
            f.add(APIC(encoding=3, mime='image/jpeg', type=3, desc='Cover', data=cover))
        f.save(path, v2_version=3)
    else:
        raise ValueError(f'Tagging {ext} files is not supported')
    return 'ok'


def jsc_check():
    """Solve a real YouTube challenge with the current player script in JavaScriptCore.

    Checks the challenge solver on its own (for CI, where YouTube blocks the video pages).
    Returns JSON {player, seconds, input, output}.
    """
    import re

    import yt_dlp_ejs.yt.solver as solver

    def get(url):
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=60, context=_ssl_context()) as r:
            return r.read().decode()

    player_id = re.search(r'player\\?/([0-9a-zA-Z_-]{8})\\?/', get('https://www.youtube.com/iframe_api')).group(1)
    player = get(f'https://www.youtube.com/s/player/{player_id}/player_ias.vflset/en_US/base.js')
    challenge = 'ZdZIqFPQK-Ty8wId'
    data = {'type': 'player', 'player': player, 'output_preprocessed': False,
            'requests': [{'type': 'n', 'challenges': [challenge]}]}
    script = (f'{solver.lib()}\nObject.assign(globalThis, lib);\n{solver.core()}\n'
              f'console.log(JSON.stringify(jsc({json.dumps(data)})));')
    began = time.time()
    out = json.loads(js_eval(script))
    seconds = round(time.time() - began, 2)
    if out.get('type') == 'error':
        raise RuntimeError(out.get('error'))
    response = out['responses'][0]
    if response.get('type') == 'error':
        raise RuntimeError(response.get('error'))
    solved = response['data'][challenge]
    if not solved or solved == challenge:
        raise RuntimeError(f'Unexpected solution {solved!r}')
    return json.dumps({'player': player_id, 'seconds': seconds, 'input': challenge, 'output': solved})


def ping():
    return json.dumps({'python': sys.version.split()[0], 'time': time.time()})

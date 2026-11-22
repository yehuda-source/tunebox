#!/usr/bin/env bash
# Build the phone app, install it on the running emulator/phone, start it, and forward its
# WebView DevTools to localhost:9230 (inspect with: node scripts/cdp.mjs 9230 eval "...").
set -euo pipefail
cd "$(dirname "$0")/.."
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export PATH="$PATH:$ANDROID_HOME/platform-tools"
if [ "${1:-}" != "--no-build" ]; then npm run -s android:apk >/dev/null; fi
adb install -r android/app/build/outputs/apk/debug/app-debug.apk >/dev/null
adb shell am force-stop com.tunebox.app
adb shell am start -n com.tunebox.app/.MainActivity >/dev/null
for _ in $(seq 1 30); do
  pid="$(adb shell pidof com.tunebox.app || true)"
  if [ -n "$pid" ] && adb shell cat /proc/net/unix | grep -q "webview_devtools_remote_$pid"; then break; fi
  sleep 0.5
done
adb forward tcp:9230 "localabstract:webview_devtools_remote_$pid" >/dev/null
sleep 2
echo "TuneBox running (pid $pid), DevTools on localhost:9230"

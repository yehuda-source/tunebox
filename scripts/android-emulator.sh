#!/usr/bin/env bash
# Start the "tunebox" Android emulator headless for testing (screenshots via adb).
# Guest rendering with Vulkan off: the default host/SwiftShader Vulkan renderer segfaults here.
set -euo pipefail
SDK="${ANDROID_HOME:-$HOME/Android/Sdk}"
if pgrep -f qemu-system-x86_64 >/dev/null; then echo "emulator already running"; exit 0; fi
setsid nohup "$SDK/emulator/emulator" -avd tunebox -no-window -no-audio -no-boot-anim \
  -gpu guest -feature -Vulkan -no-snapshot-save >"${TMPDIR:-/tmp}/tunebox-emulator.log" 2>&1 </dev/null &
for _ in $(seq 1 100); do
  sleep 3
  if [ "$("$SDK/platform-tools/adb" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; then
    echo "emulator ready"; exit 0
  fi
done
echo "emulator did not boot; see ${TMPDIR:-/tmp}/tunebox-emulator.log" >&2; exit 1

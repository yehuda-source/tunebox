#!/usr/bin/env bash
# Fetch what the iOS app bundles but the repo doesn't store: Python for iOS (BeeWare's
# Python-Apple-support), the yt-dlp release (a zip that also carries its challenge-solver scripts),
# and the pure-Python packages for tags (mutagen) and HTTPS certificates (certifi).
# Run before building the iOS app (GitHub Actions does). Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/../ios/App"

PYTHON_SUPPORT="3.14-b14"
if [ ! -d Python.xcframework ]; then
  echo "Downloading Python for iOS ($PYTHON_SUPPORT)"
  curl -fsSL "https://github.com/beeware/Python-Apple-support/releases/download/$PYTHON_SUPPORT/Python-${PYTHON_SUPPORT%%-*}-iOS-support.${PYTHON_SUPPORT##*-}.tar.gz" | tar xz Python.xcframework
fi

echo "Downloading yt-dlp"
curl -fsSL -o python-app/yt-dlp.zip https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp

echo "Installing mutagen and certifi"
rm -rf python-app/site-packages
python3 -m pip install --quiet --no-deps --only-binary=:all: --target python-app/site-packages mutagen certifi
find python-app/site-packages -name '__pycache__' -prune -exec rm -rf {} +
echo "Ready: $(du -sh Python.xcframework | cut -f1) Python, $(du -sh python-app | cut -f1) app code"

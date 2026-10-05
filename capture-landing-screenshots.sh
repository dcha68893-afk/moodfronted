#!/usr/bin/env bash
# Captures REAL screenshots from a connected Android device/emulator (adb) and installs them as the landing images.
# Use a test account with real-looking but non-private content: screenshots show whatever is on screen.
# Run from the moodfronted repo root:  bash capture-landing-screenshots.sh
set -e
DEST="android/app/src/main/res/drawable-nodpi"
mkdir -p "$DEST"
adb get-state >/dev/null || { echo "No device found. Connect a phone or start an emulator."; exit 1; }
shot() {  # $1 = file key, $2 = what to open
  echo; echo ">> Open: $2"; read -rp "   Press Enter when the screen is showing... "
  adb exec-out screencap -p > "$DEST/landing_$1.png"
  echo "   saved $DEST/landing_$1.png"
}
shot messaging     "a chat conversation with a few messages (Messages)"
shot friends       "the Friends screen"
shot accommodation "the Accommodation search/listing screen"
shot marketplace   "the Marketplace listings screen"
shot groups        "a group conversation"
shot status        "the Status screen"
echo; echo "Done. Rebuild the app; each image appears in its feature card on the native landing screen."
echo "Tip: keep each PNG under ~1 MB (e.g. pngquant --quality 70-90) to keep the APK small."

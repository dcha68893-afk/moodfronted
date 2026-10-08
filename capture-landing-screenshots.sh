#!/usr/bin/env bash
# Captures REAL screenshots from a connected Android device/emulator (adb) and installs them as the landing images.
# Use a test account with real-looking but non-private content: screenshots show whatever is on screen.
# Run from the moodfronted repo root:  bash capture-landing-screenshots.sh
set -e
DEST="android/app/src/main/res/drawable-nodpi"
WEB="assets/landing"
mkdir -p "$DEST" "$WEB"
adb get-state >/dev/null || { echo "No device found. Connect a phone or start an emulator."; exit 1; }
shot() {  # $1 = file key, $2 = what to open, $3 = web landing name
  echo; echo ">> Open: $2"; read -rp "   Press Enter when the screen is showing... "
  adb exec-out screencap -p > "$DEST/landing_$1.png"
  cp "$DEST/landing_$1.png" "$WEB/$3.png"
  echo "   saved $DEST/landing_$1.png and $WEB/$3.png"
}
shot messaging     "a chat conversation with a few messages (Messages)" chat
shot friends       "the Friends screen" friends
shot accommodation "the Accommodation search/listing screen" accommodation
shot marketplace   "the Marketplace listings screen" market
shot groups        "a group conversation" community
shot status        "the Status screen" status
echo; echo "Done. Rebuild the app; each image appears in its feature card on the native landing screen."
echo "Tip: keep each PNG under ~1 MB (e.g. pngquant --quality 70-90) to keep the APK small."

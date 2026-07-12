#!/usr/bin/env bash
# Run this ON THE TOUCHSCREEN PI (Raspberry Pi OS with Desktop, not Lite),
# after the dashboard.service is installed and running on port 8080.
#
# Sets up Firefox to auto-launch full-screen against the local dashboard
# whenever the desktop session starts, and writes autostart entries for
# whichever desktop is actually running: labwc (Bookworm's default Wayland
# compositor), wayfire (earlier Bookworm images), and legacy X11/LXDE - so
# this works regardless of which one your Pi has, without needing to detect
# it up front.
#
# Firefox instead of Chromium: Spotify's Web Playback SDK needs Widevine/EME
# for DRM-protected audio, and Raspberry Pi OS's Chromium package has proven
# unreliable for that (component-updater fetch blocked/never completing).
# Firefox ships its own officially-licensed Widevine download path, which is
# more likely to actually work. Safe to re-run this script after switching
# from an earlier Chromium-based setup - it replaces the old autostart
# entries rather than adding Firefox alongside them.

set -euo pipefail
KIOSK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

FIREFOX_BIN=$(command -v firefox || command -v firefox-esr || true)
if [ -z "$FIREFOX_BIN" ]; then
  echo "Could not find 'firefox' or 'firefox-esr' on PATH. Install with: sudo apt install firefox-esr" >&2
  exit 1
fi

# A dedicated profile, not your regular one - kiosk mode has no menu bar to
# click through Settings, so DRM playback and the various first-run/crash
# prompts that would otherwise block the kiosk have to be pre-configured
# here instead. Firefox reads user.js fresh on every launch, so re-running
# this script always picks up any changes made below.
FIREFOX_PROFILE_DIR="$HOME/.config/raspy-lab-firefox-kiosk"
mkdir -p "$FIREFOX_PROFILE_DIR"
cat > "$FIREFOX_PROFILE_DIR/user.js" <<'EOF'
// Enables DRM-protected playback (Widevine/EME) - the "Play DRM-controlled
// content" checkbox under Settings > General, set here since kiosk mode has
// no menu to click it manually.
user_pref("media.eme.enabled", true);
// Kiosk-mode prompts that would otherwise block the fullscreen window with
// no way to dismiss them (no window chrome/menu bar to click through).
user_pref("browser.sessionstore.resume_from_crash", false);
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("browser.aboutwelcome.enabled", false);
user_pref("browser.tabs.warnOnClose", false);
user_pref("datareporting.policy.dataSubmissionEnabled", false);
EOF

# A profile lock file (Firefox's way of detecting "am I already running")
# survives an unclean shutdown - common on a Pi that gets power-cycled
# instead of properly rebooted - and the next launch then shows an
# interactive "Firefox is already running" dialog with no way to dismiss it
# in kiosk mode. Clear any stale lock before every launch, not just once
# during setup, since this can happen after any future unclean shutdown too.
cat > "$FIREFOX_PROFILE_DIR/launch-kiosk.sh" <<EOF
#!/usr/bin/env bash
rm -f "$FIREFOX_PROFILE_DIR/lock" "$FIREFOX_PROFILE_DIR/.parentlock"
exec "$FIREFOX_BIN" -kiosk -profile "$FIREFOX_PROFILE_DIR" http://localhost:8080
EOF
chmod +x "$FIREFOX_PROFILE_DIR/launch-kiosk.sh"

KIOSK_CMD="$FIREFOX_PROFILE_DIR/launch-kiosk.sh"

# Bluetooth speaker auto-reconnect - installed as a user systemd service, not
# a system one, because the Bluetooth audio profile has to be negotiated with
# this user's own PipeWire/WirePlumber instance, which only exists once the
# desktop session has started (see bluetooth-autoconnect.service's own
# comment for the full reasoning). Edit DEVICE_MAC in bluetooth-autoconnect.sh
# for your own speaker before running this if you haven't already.
if [ -f "$KIOSK_DIR/bluetooth-autoconnect.sh" ] && [ -f "$KIOSK_DIR/bluetooth-autoconnect.service" ]; then
  sudo cp "$KIOSK_DIR/bluetooth-autoconnect.sh" /usr/local/bin/bluetooth-autoconnect.sh
  sudo chmod +x /usr/local/bin/bluetooth-autoconnect.sh
  mkdir -p "$HOME/.config/systemd/user"
  cp "$KIOSK_DIR/bluetooth-autoconnect.service" "$HOME/.config/systemd/user/"
  systemctl --user daemon-reload
  systemctl --user enable --now bluetooth-autoconnect.service
  echo "Bluetooth auto-connect installed and enabled (systemctl --user status bluetooth-autoconnect.service to check)."
fi

# Pick the best audio output on every login: prefer a paired Bluetooth
# speaker if one is connected, otherwise fall back to the HDMI monitor's
# speakers (some Pi audio hardware exposes both an HDMI sink and a 3.5mm
# jack sink, and PipeWire/WirePlumber sometimes defaults to the unused
# jack). Bluetooth reconnection itself is handled separately by the
# bluetooth-autoconnect service installed above - this only picks which
# resulting sink is default. Looked up by name (not a hardcoded numeric id)
# because PipeWire reassigns object ids on every boot.
mkdir -p "$HOME/.config/labwc"
cat > "$HOME/.config/labwc/hdmi-audio-default.sh" <<'EOF'
#!/usr/bin/env bash
# Retry for a while in case PipeWire hasn't enumerated the sink yet, or the
# Bluetooth reconnect (handled by bluetooth-autoconnect.service) hasn't
# finished.
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  SINK_ID=$(wpctl status 2>/dev/null | awk '/Sinks:/,/Sources:/' | grep -i "bluez" | grep -oE '[0-9]+' | head -1)
  [ -n "$SINK_ID" ] && break
  sleep 2
done
if [ -z "$SINK_ID" ]; then
  SINK_ID=$(wpctl status 2>/dev/null | awk '/Sinks:/,/Sources:/' | grep -i "hdmi" | grep -oE '[0-9]+' | head -1)
fi
[ -n "$SINK_ID" ] && wpctl set-default "$SINK_ID"
EOF
chmod +x "$HOME/.config/labwc/hdmi-audio-default.sh"

# labwc (Raspberry Pi OS Bookworm's default compositor) - reads a plain shell
# script, not .desktop files. Managed via markers (not a plain append-if-
# missing) so re-running this script after switching kiosk browsers replaces
# the old launch command instead of leaving both autostarting - the file may
# also contain unrelated lines (panel/wallpaper) from outside this script,
# which are left untouched since only the marked block is ever rewritten.
touch "$HOME/.config/labwc/autostart"
sed -i '/# BEGIN raspy-lab-kiosk/,/# END raspy-lab-kiosk/d' "$HOME/.config/labwc/autostart"
{
  echo "# BEGIN raspy-lab-kiosk"
  echo "$HOME/.config/labwc/hdmi-audio-default.sh &"
  echo "$KIOSK_CMD &"
  echo "# END raspy-lab-kiosk"
} >> "$HOME/.config/labwc/autostart"

# wayfire (used by some earlier Bookworm images) - ini-style autostart section.
# Same idempotent-replace reasoning as labwc above.
if [ -f "$HOME/.config/wayfire.ini" ]; then
  sed -i '/^dashboard-kiosk = /d' "$HOME/.config/wayfire.ini"
  grep -qx '\[autostart\]' "$HOME/.config/wayfire.ini" || printf '\n[autostart]\n' >> "$HOME/.config/wayfire.ini"
  printf 'dashboard-kiosk = %s\n' "$KIOSK_CMD" >> "$HOME/.config/wayfire.ini"
fi

# Legacy X11/LXDE - standard XDG autostart .desktop entry.
mkdir -p "$HOME/.config/autostart"
cat > "$HOME/.config/autostart/dashboard-kiosk.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Dashboard Kiosk
Exec=$KIOSK_CMD
X-GNOME-Autostart-enabled=true
EOF

echo "Kiosk autostart installed for labwc/wayfire/X11 (firefox binary: $FIREFOX_BIN)."
echo "Reboot the touchscreen Pi to launch it full-screen: sudo reboot"

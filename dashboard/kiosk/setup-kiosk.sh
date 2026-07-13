#!/usr/bin/env bash
# Run this ON THE TOUCHSCREEN PI (Raspberry Pi OS with Desktop, not Lite),
# after the dashboard.service is installed and running on port 8080.
#
# Sets up Chromium to auto-launch full-screen against the local dashboard
# whenever the desktop session starts. Detects the actual chromium binary
# name (Bookworm ships "chromium", older releases shipped "chromium-browser")
# and writes autostart entries for whichever desktop is actually running:
# labwc (Bookworm's default Wayland compositor), wayfire (earlier Bookworm
# images), and legacy X11/LXDE - so this works regardless of which one your
# Pi has, without needing to detect it up front.

set -euo pipefail
KIOSK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CHROMIUM_BIN=$(command -v chromium || command -v chromium-browser || true)
if [ -z "$CHROMIUM_BIN" ]; then
  echo "Could not find 'chromium' or 'chromium-browser' on PATH. Install with: sudo apt install chromium" >&2
  exit 1
fi

KIOSK_CMD="$CHROMIUM_BIN --kiosk --noerrdialogs --disable-infobars --disable-session-crashed-bubble --check-for-update-interval=1 --incognito --app=http://localhost:8080"

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
# script, not .desktop files. Append (don't overwrite - the file may already
# start the panel/wallpaper) and only add our lines once.
touch "$HOME/.config/labwc/autostart"
grep -qxF "$HOME/.config/labwc/hdmi-audio-default.sh &" "$HOME/.config/labwc/autostart" || echo "$HOME/.config/labwc/hdmi-audio-default.sh &" >> "$HOME/.config/labwc/autostart"
grep -qxF "$KIOSK_CMD &" "$HOME/.config/labwc/autostart" || echo "$KIOSK_CMD &" >> "$HOME/.config/labwc/autostart"

# wayfire (used by some earlier Bookworm images) - ini-style autostart section.
if [ -f "$HOME/.config/wayfire.ini" ] && ! grep -q "dashboard-kiosk" "$HOME/.config/wayfire.ini"; then
  printf '\n[autostart]\ndashboard-kiosk = %s\n' "$KIOSK_CMD" >> "$HOME/.config/wayfire.ini"
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

echo "Kiosk autostart installed for labwc/wayfire/X11 (chromium binary: $CHROMIUM_BIN)."
echo "Reboot the touchscreen Pi to launch it full-screen: sudo reboot"
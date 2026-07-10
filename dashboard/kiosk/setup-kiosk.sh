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

CHROMIUM_BIN=$(command -v chromium || command -v chromium-browser || true)
if [ -z "$CHROMIUM_BIN" ]; then
  echo "Could not find 'chromium' or 'chromium-browser' on PATH. Install with: sudo apt install chromium" >&2
  exit 1
fi

KIOSK_CMD="$CHROMIUM_BIN --kiosk --noerrdialogs --disable-infobars --disable-session-crashed-bubble --check-for-update-interval=1 --incognito --app=http://localhost:8080"

# labwc (Raspberry Pi OS Bookworm's default compositor) - reads a plain shell
# script, not .desktop files. Append (don't overwrite - the file may already
# start the panel/wallpaper) and only add our line once.
mkdir -p "$HOME/.config/labwc"
touch "$HOME/.config/labwc/autostart"
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

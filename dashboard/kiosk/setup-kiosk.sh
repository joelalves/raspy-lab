#!/usr/bin/env bash
# Run this ON THE TOUCHSCREEN PI (Raspberry Pi OS with Desktop, not Lite),
# after the dashboard.service is installed and running on port 8080.
#
# Sets up Chromium to auto-launch full-screen against the local dashboard
# whenever the desktop session starts. Assumes the default 'pi' user
# and LXDE/labwc autostart mechanism used by Raspberry Pi OS.

set -euo pipefail

AUTOSTART_DIR="$HOME/.config/autostart"
mkdir -p "$AUTOSTART_DIR"

cat > "$AUTOSTART_DIR/dashboard-kiosk.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=Dashboard Kiosk
Exec=chromium-browser --kiosk --noerrdialogs --disable-infobars --disable-session-crashed-bubble --check-for-update-interval=1 --incognito --app=http://localhost:8080
X-GNOME-Autostart-enabled=true
EOF

# Disable screen blanking/DPMS so the kiosk stays on
mkdir -p "$HOME/.config/lxsession/LXDE-pi"
cat >> "$HOME/.config/lxsession/LXDE-pi/autostart" <<'EOF'
@xset s off
@xset -dpms
@xset s noblank
EOF

echo "Kiosk autostart installed. Reboot the touchscreen Pi to launch it full-screen."

####sudo nano /usr/local/bin/bluetooth-autoconnect.sh
####sudo chmod +x /usr/local/bin/bluetooth-autoconnect.sh
#!/bin/bash

DEVICE_MAC="D8:37:3B:BE:DD:E5"  # JBL Go 3
MAX_ATTEMPTS=12
WAIT_SECONDS=5

rfkill unblock bluetooth 2>/dev/null || true

for ((attempt=1; attempt<=MAX_ATTEMPTS; attempt++)); do
    bluetoothctl power on >/dev/null 2>&1 || true

    if bluetoothctl info "$DEVICE_MAC" | grep -q "Connected: yes"; then
        echo "Bluetooth device already connected."
        exit 0
    fi

    echo "Bluetooth connection attempt $attempt/$MAX_ATTEMPTS..."

    if bluetoothctl --timeout 15 connect "$DEVICE_MAC"; then
        echo "Bluetooth device connected."
        exit 0
    fi

    sleep "$WAIT_SECONDS"
done

echo "Unable to connect Bluetooth device."
exit 1
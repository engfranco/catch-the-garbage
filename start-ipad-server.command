#!/bin/bash
# Catch the Garbage - Local server for iPad
# Double-click this file to start. Press Ctrl+C in the window to stop.

cd "$(dirname "$0")"
PORT=8000

# Find the Mac's local IP on the active interface
IP=$(ipconfig getifaddr en0 2>/dev/null)
if [ -z "$IP" ]; then IP=$(ipconfig getifaddr en1 2>/dev/null); fi
if [ -z "$IP" ]; then IP=$(ipconfig getifaddr en2 2>/dev/null); fi

clear
echo ""
echo "  ====================================================="
echo "    CATCH THE GARBAGE - iPad Server"
echo "  ====================================================="
echo ""
if [ -n "$IP" ]; then
  echo "  On your iPad, open Safari and go to this address:"
  echo ""
  echo "      http://$IP:$PORT/"
  echo ""
  echo "  (The iPad must be on the same Wi-Fi as this Mac.)"
  echo ""
  echo "  Then tap the Share button in Safari and choose"
  echo "  'Add to Home Screen' to install it like an app."
  echo ""
else
  echo "  Could not detect your Wi-Fi IP automatically."
  echo "  Open System Settings > Wi-Fi > (i) next to your"
  echo "  network and look for the IP Address."
  echo "  Then on the iPad use:  http://YOUR-IP:$PORT/"
  echo ""
fi
echo "  To stop the server, close this window or press Ctrl+C."
echo "  ====================================================="
echo ""

# Try Python 3 first (preinstalled on modern macOS via Xcode CLT)
if command -v python3 >/dev/null 2>&1; then
  python3 -m http.server $PORT
elif command -v python >/dev/null 2>&1; then
  python -m SimpleHTTPServer $PORT
else
  echo ""
  echo "  Python isn't installed. Open the Terminal app and run:"
  echo "      xcode-select --install"
  echo "  Then double-click this file again."
  echo ""
  read -p "Press Enter to close..."
fi

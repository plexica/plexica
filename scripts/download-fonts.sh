#!/usr/bin/env bash
# File: scripts/download-fonts.sh
#
# Downloads all 25 curated WOFF2 font files (ADR-020) from Google Fonts API
# server-side (one-time setup) and organises them into:
#   apps/web/public/fonts/{font-id}/{font-id}-{weight}.woff2
#
# Usage:
#   chmod +x scripts/download-fonts.sh
#   ./scripts/download-fonts.sh
#
# Optional: upload to MinIO
#   UPLOAD_TO_MINIO=true MINIO_ALIAS=local ./scripts/download-fonts.sh
#
# Requirements:
#   - curl
#   - python3 (for CSS parsing)
#   - mc (MinIO client) — only if UPLOAD_TO_MINIO=true
#
# NOTE: This script downloads fonts from Google Fonts server-side (one-time
# setup only). Font files are then self-hosted from apps/web/public/fonts/
# and served from the same origin. No user browsers ever connect to
# fonts.googleapis.com or fonts.gstatic.com at runtime. (ADR-020)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FONTS_DIR="$REPO_ROOT/apps/web/public/fonts"
UPLOAD_TO_MINIO="${UPLOAD_TO_MINIO:-false}"
MINIO_ALIAS="${MINIO_ALIAS:-local}"
MINIO_BUCKET="plexica-assets"
MINIO_PATH="fonts"

# User-Agent header that requests WOFF2 format from Google Fonts
WOFF2_UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

echo "==> Downloading Plexica curated fonts (ADR-020)"
echo "    Output: $FONTS_DIR"
echo ""

# Font definitions: "font-id|Google Fonts family name|weight1,weight2,..."
FONTS=(
  "inter|Inter|400,500,600,700"
  "roboto|Roboto|400,500,700"
  "open-sans|Open+Sans|400,600,700"
  "lato|Lato|400,700"
  "source-sans-3|Source+Sans+3|400,600,700"
  "nunito|Nunito|400,600,700"
  "poppins|Poppins|400,500,600,700"
  "work-sans|Work+Sans|400,500,600,700"
  "dm-sans|DM+Sans|400,500,700"
  "plus-jakarta-sans|Plus+Jakarta+Sans|400,500,600,700"
  "noto-sans|Noto+Sans|400,500,700"
  "manrope|Manrope|400,500,600,700"
  "figtree|Figtree|400,500,600,700"
  "merriweather|Merriweather|400,700"
  "playfair-display|Playfair+Display|400,700"
  "lora|Lora|400,700"
  "source-serif-4|Source+Serif+4|400,600,700"
  "bitter|Bitter|400,700"
  "jetbrains-mono|JetBrains+Mono|400,700"
  "fira-code|Fira+Code|400,700"
  "source-code-pro|Source+Code+Pro|400,700"
  "outfit|Outfit|400,500,600,700"
  "space-grotesk|Space+Grotesk|400,500,700"
  "sora|Sora|400,500,600,700"
  "rubik|Rubik|400,500,700"
  "raleway|Raleway|400,600,700"
)

download_font() {
  local font_id="$1"
  local google_family="$2"
  local weights="$3"

  local out_dir="$FONTS_DIR/$font_id"
  mkdir -p "$out_dir"

  echo "  Downloading $font_id ($weights)..."

  # Build weight query string: wght@400;500;600;700
  local weight_param
  weight_param=$(echo "$weights" | tr ',' ';')

  # Fetch the Google Fonts CSS2 API to get direct WOFF2 URLs
  local css_url="https://fonts.googleapis.com/css2?family=${google_family}:wght@${weight_param}&display=swap"
  local css_content
  css_content=$(curl -fsSL -H "User-Agent: $WOFF2_UA" "$css_url" 2>/dev/null) || {
    echo "    WARNING: Failed to fetch CSS for $font_id. Skipping."
    return 0
  }

  # Extract WOFF2 URLs and their weight context using python3
  python3 - "$css_content" "$font_id" "$weights" "$out_dir" <<'PYTHON'
import sys
import re
import urllib.request
import os

css = sys.argv[1]
font_id = sys.argv[2]
weights_str = sys.argv[3]
out_dir = sys.argv[4]

weights = [int(w) for w in weights_str.split(',')]

# Parse font-face blocks to associate weights with URLs
blocks = re.findall(r'@font-face\s*\{([^}]+)\}', css, re.DOTALL)

downloaded = set()
for block in blocks:
    weight_match = re.search(r'font-weight:\s*(\d+)', block)
    url_match = re.search(r'url\(([^)]+\.woff2[^)]*)\)', block)
    if not weight_match or not url_match:
        continue
    weight = int(weight_match.group(1))
    url = url_match.group(1).strip("'\"")
    if weight not in weights or weight in downloaded:
        continue
    out_file = os.path.join(out_dir, f"{font_id}-{weight}.woff2")
    if os.path.exists(out_file):
        print(f"    [{font_id}-{weight}] already exists, skipping")
        downloaded.add(weight)
        continue
    try:
        urllib.request.urlretrieve(url, out_file)
        size_kb = os.path.getsize(out_file) // 1024
        print(f"    [{font_id}-{weight}] {size_kb}KB -> {out_file}")
        downloaded.add(weight)
    except Exception as e:
        print(f"    WARNING: Failed to download {font_id}-{weight}: {e}")

missing = set(weights) - downloaded
if missing:
    print(f"    WARNING: Missing weights for {font_id}: {sorted(missing)}")
PYTHON
}

# Download all fonts
for font_entry in "${FONTS[@]}"; do
  IFS='|' read -r font_id google_family weights <<< "$font_entry"
  download_font "$font_id" "$google_family" "$weights"
done

echo ""
echo "==> Download complete."

# Optionally upload to MinIO
if [ "$UPLOAD_TO_MINIO" = "true" ]; then
  echo ""
  echo "==> Uploading to MinIO ($MINIO_ALIAS/$MINIO_BUCKET/$MINIO_PATH)..."
  if ! command -v mc &>/dev/null; then
    echo "    ERROR: 'mc' (MinIO client) not found. Install from https://min.io/docs/minio/linux/reference/minio-mc.html"
    exit 1
  fi
  mc mirror --overwrite "$FONTS_DIR/" "$MINIO_ALIAS/$MINIO_BUCKET/$MINIO_PATH/"
  echo "    Upload complete."
fi

echo ""
echo "==> Font files are ready at: $FONTS_DIR"
echo "    Serve via Vite dev server: http://localhost:5173/fonts/{id}/{id}-{weight}.woff2"
echo "    Production: configure CDN/MinIO to serve from /fonts/ path prefix."
echo ""
echo "    REMINDER: Font files are loaded only from same origin (ADR-020)."
echo "    Never load fonts from fonts.googleapis.com or fonts.gstatic.com at runtime."

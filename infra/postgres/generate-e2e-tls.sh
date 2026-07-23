#!/usr/bin/env sh
set -eu

readonly OUT=/tls
rm -f "$OUT"/*
cp /source/ca.crt /source/server.crt /source/server.key "$OUT/"
chown 70:70 "$OUT/server.key" "$OUT/server.crt"
chmod 600 "$OUT/server.key"
chmod 644 "$OUT/ca.crt" "$OUT/server.crt"

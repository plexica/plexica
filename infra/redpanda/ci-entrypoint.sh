#!/bin/sh
set -eu

contract=${REDPANDA_LISTENER_CONTRACT:-/run/plexica-ci/redpanda-listener.env}
[ -r "$contract" ] || { echo 'Missing Redpanda listener contract' >&2; exit 1; }
. "$contract"

case "${REDPANDA_EXTERNAL_LISTENER:-}" in
  127.0.0.1:[1-9][0-9]*) ;;
  *) echo 'Invalid Redpanda external listener contract' >&2; exit 1 ;;
esac

exec redpanda start --smp 1 --memory 256M --overprovisioned \
  --set redpanda.developer_mode=true \
  --kafka-addr PLAINTEXT://0.0.0.0:9092,OUTSIDE://0.0.0.0:19092 \
  --advertise-kafka-addr PLAINTEXT://redpanda:9092,OUTSIDE://"$REDPANDA_EXTERNAL_LISTENER" \
  --pandaproxy-addr 0.0.0.0:8082

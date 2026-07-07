#!/bin/sh
# Entrypoint for the all-in-one image.
#
# The vault + sqlite databases live under /data (KNOWLEDGE_ROOT). By default
# docker-compose bind-mounts a host folder there so all data is visible and
# backup-able. A fresh bind mount can arrive owned by root (or the host user),
# which the unprivileged `loom` app user cannot write to — so when we start as
# root we make /data writable, then drop privileges to loom before running the
# server. When /data is already loom-owned (named volume, or a warm bind mount)
# the chown is skipped, so restarts stay fast even for large vaults.
set -e

if [ "$(id -u)" = "0" ]; then
  mkdir -p /data/knowledge
  if [ "$(stat -c %U /data 2>/dev/null)" != "loom" ]; then
    chown -R loom:loom /data
  fi
  exec runuser -u loom -- "$@"
fi

exec "$@"

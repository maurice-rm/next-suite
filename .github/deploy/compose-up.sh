#!/usr/bin/env bash
set -euo pipefail

image=$1
cd "$HOME/$2"

[[ -f .env ]] || { echo "No .env in ~/$2; an admin creates it before the first deploy." >&2; exit 1; }

previous=$(grep '^DOCKER_IMAGE=' .env || true)

set_image() {
  sed -i -e '$a\' .env
  sed -i '/^DOCKER_IMAGE=/d' .env
  if [[ -n $1 ]]; then
    printf '%s\n' "$1" >> .env
  fi
}

set_image "DOCKER_IMAGE=$image"
if ! docker compose pull; then
  set_image "$previous"
  exit 1
fi

if ! docker compose up -d --remove-orphans --wait --wait-timeout 180; then
  echo "The new version did not come up healthy; going back to the previous one." >&2
  set_image "$previous"
  docker compose up -d --remove-orphans --wait --wait-timeout 180 || true
  exit 1
fi

docker image prune -f --filter until=168h

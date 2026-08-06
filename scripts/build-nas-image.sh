#!/bin/sh
set -eu

workspace_root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
version="$(tr -d '[:space:]' < "$workspace_root/VERSION")"
image_name="massage-note:$version"
artifact_dir="${MASSAGE_NOTE_ARTIFACT_DIR:-$workspace_root/artifacts}"
archive_path="$artifact_dir/massage-note-$version-linux-amd64.tar"

mkdir -p "$artifact_dir"

if ! docker buildx inspect massage-note-builder >/dev/null 2>&1; then
  docker buildx create --name massage-note-builder --driver docker-container --use >/dev/null
else
  docker buildx use massage-note-builder
fi
docker buildx inspect --bootstrap >/dev/null

docker buildx build \
  --platform linux/amd64 \
  --target nas \
  --build-arg "APP_VERSION=$version" \
  --build-arg "NEXT_PUBLIC_API_BASE_URL=/api/v1" \
  --build-arg "API_PROXY_TARGET=http://127.0.0.1:4000" \
  --build-arg "NEXT_PUBLIC_FIREBASE_API_KEY=${NEXT_PUBLIC_FIREBASE_API_KEY:-}" \
  --build-arg "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:-}" \
  --build-arg "NEXT_PUBLIC_FIREBASE_PROJECT_ID=${NEXT_PUBLIC_FIREBASE_PROJECT_ID:-}" \
  --build-arg "NEXT_PUBLIC_FIREBASE_APP_ID=${NEXT_PUBLIC_FIREBASE_APP_ID:-}" \
  --tag "$image_name" \
  --load \
  "$workspace_root"

architecture="$(docker image inspect --format '{{.Architecture}}' "$image_name")"
if [ "$architecture" != "amd64" ]; then
  echo "镜像架构错误：期望 amd64，实际为 $architecture" >&2
  exit 1
fi

docker save --output "$archive_path" "$image_name"
shasum -a 256 "$archive_path" > "$archive_path.sha256"
echo "已生成 $archive_path"

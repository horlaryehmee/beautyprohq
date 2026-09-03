#!/usr/bin/env bash
set -Eeuo pipefail

REMOTE_URL="${REMOTE_URL:-https://github.com/horlaryehmee/beautyprohq.git}"
BRANCH="${BRANCH:-main}"
SOURCE_ROOT="${SOURCE_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
APP_ROOT="${APP_ROOT:-$SOURCE_ROOT}"
BACKUP_ROOT="${BACKUP_ROOT:-$(dirname "$APP_ROOT")/.beautyprohq-deploy-backups}"
KEEP_BACKUPS="${KEEP_BACKUPS:-3}"

for command in git tar rsync php composer flock; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Deployment failed: required command is unavailable: $command" >&2
    exit 1
  fi
done

if [ ! -d "$SOURCE_ROOT/.git" ]; then
  echo "Deployment failed: the deployment source is not a Git checkout: $SOURCE_ROOT" >&2
  exit 1
fi

mkdir -p "$APP_ROOT/storage/app" "$APP_ROOT/storage/framework" "$BACKUP_ROOT"
chmod o+x "$APP_ROOT"
exec 9>"$APP_ROOT/storage/framework/deployment.lock"
if ! flock -n 9; then
  echo "Deployment failed: another deployment is in progress." >&2
  exit 1
fi

cd "$SOURCE_ROOT"

# Fetch latest from GitHub
git fetch origin "$BRANCH" --no-tags
RELEASE_REF="$(git rev-parse "FETCH_HEAD^{commit}")"

if [ -s "$APP_ROOT/storage/app/deployment-ref" ]; then
  PREVIOUS_REF="$(<"$APP_ROOT/storage/app/deployment-ref")"
elif [ "$APP_ROOT" != "$SOURCE_ROOT" ] && [ -d "$APP_ROOT/.git" ]; then
  PREVIOUS_REF="$(git -C "$APP_ROOT" rev-parse HEAD)"
else
  PREVIOUS_REF="$(git rev-parse HEAD)"
fi

if [ "$RELEASE_REF" = "$PREVIOUS_REF" ]; then
  echo "Already at ${RELEASE_REF:0:12}. Nothing to deploy."
  exit 0
fi

RELEASE_ID="$(date -u +%Y%m%d%H%M%S)-${RELEASE_REF:0:12}"
STAGE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/bphq-release.XXXXXX")"
BACKUP_FILE="$BACKUP_ROOT/${RELEASE_ID}-before.tar.gz"
ROLLBACK_REQUIRED=false
MAINTENANCE_ENABLED=false

# Validate staged release
validate_staged_release() {
  if find "$STAGE_ROOT/app" "$STAGE_ROOT/bootstrap" "$STAGE_ROOT/config" \
    "$STAGE_ROOT/database" "$STAGE_ROOT/routes" \
    -type f -name '*.php' -size 0 -print -quit | grep -q .; then
    echo "Deployment failed: staged release contains empty PHP files." >&2
    return 1
  fi

  find "$STAGE_ROOT/app" "$STAGE_ROOT/bootstrap" "$STAGE_ROOT/config" \
    "$STAGE_ROOT/database" "$STAGE_ROOT/routes" \
    -type f -name '*.php' -print | while IFS= read -r php_file; do
    php -l "$php_file" >/dev/null
  done
}

validate_built_assets() {
  local manifest="$STAGE_ROOT/public/build/manifest.json"

  if [ ! -s "$manifest" ]; then
    echo "Deployment failed: public/build/manifest.json is missing. Run npm run build locally and commit public/build." >&2
    return 1
  fi

  php -r '
    $root = $argv[1];
    $manifestPath = $root . "/public/build/manifest.json";
    $manifest = json_decode(file_get_contents($manifestPath), true);
    if (!is_array($manifest)) {
        fwrite(STDERR, "Deployment failed: public/build/manifest.json is invalid JSON.\n");
        exit(1);
    }
    foreach ($manifest as $entry) {
        foreach (["file", "css"] as $key) {
            if (!isset($entry[$key])) {
                continue;
            }
            $files = is_array($entry[$key]) ? $entry[$key] : [$entry[$key]];
            foreach ($files as $file) {
                if (!is_file($root . "/public/build/" . $file)) {
                    fwrite(STDERR, "Deployment failed: missing built asset public/build/$file.\n");
                    exit(1);
                }
            }
        }
    }
  ' "$STAGE_ROOT"
}

remove_deleted_paths() {
  git diff --diff-filter=D --name-only "$PREVIOUS_REF" "$RELEASE_REF" | while IFS= read -r path; do
    [ -n "$path" ] || continue
    case "$path" in /*|../*|*/../*) continue ;; esac
    rm -f "$APP_ROOT/$path"
  done
}

restore_previous() {
  echo "Deployment failed. Restoring previous release from ${PREVIOUS_REF:0:12}." >&2
  remove_deleted_paths
  git archive "$PREVIOUS_REF" | tar -x -C "$APP_ROOT"
  composer install --working-dir="$APP_ROOT" --no-dev --no-interaction --prefer-dist --optimize-autoloader
  php "$APP_ROOT/artisan" optimize:clear
  php "$APP_ROOT/artisan" optimize
}

finish() {
  local status=$?
  set +e

  if [ "$status" -ne 0 ] && [ "$ROLLBACK_REQUIRED" = true ]; then
    restore_previous
    if [ $? -ne 0 ]; then
      echo "Rollback also failed. Restore manually: $BACKUP_FILE" >&2
    fi
  fi

  if [ "$MAINTENANCE_ENABLED" = true ]; then
    php "$APP_ROOT/artisan" up >/dev/null 2>&1
  fi

  chmod o+x "$APP_ROOT"
  rm -rf "$STAGE_ROOT"
  exit "$status"
}
trap finish EXIT

echo "Staging release ${RELEASE_REF:0:12}."

# Stage the release
git archive "$RELEASE_REF" | tar -x -C "$STAGE_ROOT"
validate_staged_release
validate_built_assets

composer validate --working-dir="$STAGE_ROOT" --no-check-publish --no-interaction

# Enter maintenance mode
php "$APP_ROOT/artisan" down --retry=60 || true
MAINTENANCE_ENABLED=true

# Backup current state
tar -C "$APP_ROOT" \
  --exclude='.git' --exclude='.env' --exclude='storage' \
  --exclude='public/uploads' --exclude='vendor' --exclude='node_modules' \
  -czf "$BACKUP_FILE" .

ROLLBACK_REQUIRED=true

# Remove files deleted in the new release
remove_deleted_paths

# Copy new files
rsync -a --no-perms \
  --exclude='.git/' --exclude='.env' --exclude='storage/' \
  --exclude='public/uploads/' --exclude='vendor/' --exclude='node_modules/' \
  "$STAGE_ROOT/" "$APP_ROOT/"

# Install dependencies and run post-deploy tasks
composer install --working-dir="$APP_ROOT" --no-dev --no-interaction --prefer-dist --optimize-autoloader
php "$APP_ROOT/artisan" optimize:clear
php "$APP_ROOT/artisan" migrate --force
php "$APP_ROOT/artisan" storage:link || true
php "$APP_ROOT/artisan" optimize
php "$APP_ROOT/artisan" queue:restart || true
php "$APP_ROOT/artisan" ops:check --production

# Verify deployment
if [ ! -s "$APP_ROOT/public/.htaccess" ]; then
  echo "Deployment failed: public/.htaccess is missing." >&2
  exit 1
fi

if [ ! -s "$APP_ROOT/public/index.php" ]; then
  echo "Deployment failed: public/index.php is missing." >&2
  exit 1
fi

php "$APP_ROOT/artisan" up
MAINTENANCE_ENABLED=false
ROLLBACK_REQUIRED=false

printf '%s\n' "$RELEASE_REF" > "$APP_ROOT/storage/app/deployment-ref"

# Prune old backups
if ls "$BACKUP_ROOT"/*-before.tar.gz >/dev/null 2>&1; then
  ls -t "$BACKUP_ROOT"/*-before.tar.gz | tail -n "+$((KEEP_BACKUPS + 1))" | xargs -r rm -f
fi

echo "Deployment complete: ${RELEASE_REF:0:12}."

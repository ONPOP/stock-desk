#!/bin/bash
# launchd 진입점 (D16) — usage: run-slot.sh <slot_id>
# 오케스트레이션은 run-slot.ts가 한다. 이 스크립트는 작업 디렉토리·PATH·로그만 책임진다.
set -uo pipefail

SLOT_ID="${1:-}"
if [ -z "$SLOT_ID" ]; then
  echo "usage: run-slot.sh <slot_id>" >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

# launchd는 로그인 셸 PATH를 물려받지 않는다 — node/npx 경로를 명시적으로 보강
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | tail -1)/bin:$PATH"

RUN_DATE="$(TZ=Asia/Seoul date +%F)"
LOG_DIR="$REPO_ROOT/data/logs/$RUN_DATE"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/$SLOT_ID.log"

{
  echo "===== $(TZ=Asia/Seoul date '+%F %T') KST · slot=$SLOT_ID ====="
  npx tsx scripts/engine/run-slot.ts "$SLOT_ID"
  STATUS=$?
  echo "===== exit=$STATUS ====="
  exit $STATUS
} 2>&1 | tee -a "$LOG_FILE"

exit "${PIPESTATUS[0]}"

#!/usr/bin/env bash
set -euo pipefail
cd /home/scraper/scraper
exec 9>/var/lock/kmquant-scraper.lock
flock -n 9 || { echo 'KMQuant run already active'; exit 1; }

notify_failure() {
  status=$?
  if (( status != 0 )); then
    /bin/bash /home/scraper/send-notification.sh \
      'Bare Fakta - KMQuant HATA' "KMQuant job failed (exit $status) at $(date -Is)" || true
  fi
}
trap notify_failure EXIT

git fetch origin main
git merge --ff-only origin/main
npm ci --silent
npm run check
timeout 20m npm run scrape:kmquant
git add public/api/latest.json
if ! git diff --staged --quiet; then
  git -c user.name='KMQuant VPS' -c user.email='kmquant-vps@users.noreply.github.com' \
    commit -m "Daily KMQuant data $(date +%F)"
fi
for attempt in 1 2 3; do
  if git push origin HEAD:main; then
    /bin/bash /home/scraper/send-notification.sh \
      'Bare Fakta - KMQuant Basarili' "KMQuant data published at $(date -Is)" || true
    exit 0
  fi
  sleep $((attempt * 10))
done
echo 'GitHub push failed after three attempts' >&2
exit 1

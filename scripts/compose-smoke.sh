#!/usr/bin/env bash
# Checks a running kadkerja stack from the outside, through the web container (nginx):
#   KADKERJA_PROFILES=postgres,demo docker compose up -d --build --wait
#   scripts/compose-smoke.sh http://localhost:8081
# Needs the demo profile (signs in as the demo advisor; blocks the demo user "tech" for 15 minutes
# from this machine at the end, by design).
set -euo pipefail
base="${1:-http://localhost:8081}"
jar="$(mktemp)"
trap 'rm -f "$jar"' EXIT
fail() { echo "FAIL: $*" >&2; exit 1; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

# The app and its routes are index.html; unknown files under /assets are a real 404.
[[ "$(code "$base/")" == 200 ]] || fail "/ is not 200"
curl -s "$base/jobs/1" | grep -q '<div id="root">' || fail "/jobs/1 is not the app"
curl -s "$base/t/AAAAAAAAAAAAAAAAAAAAAAAA" | grep -q '<div id="root">' || fail "/t/... is not the app"
[[ "$(code "$base/assets/missing.js")" == 404 ]] || fail "missing asset is not 404"
curl -sI "$base/" | grep -qi '^referrer-policy: no-referrer' || fail "no Referrer-Policy"
echo "ok   web: app, routes, headers"

# The API through nginx: signed out is 401; the demo advisor signs in with the CSRF cookie.
[[ "$(code "$base/api/auth/me")" == 401 ]] || fail "/api/auth/me signed out is not 401"
csrf() { curl -s -c "$jar" -b "$jar" "$base/api/auth/csrf" >/dev/null; awk '$6=="XSRF-TOKEN"{print $7}' "$jar"; }
login() { # username password [extra curl args]
  local t; t="$(csrf)"
  curl -s -o /dev/null -w '%{http_code}' -c "$jar" -b "$jar" -H 'Content-Type: application/json' \
    -H "X-XSRF-TOKEN: $t" "${@:3}" -d "{\"username\":\"$1\",\"password\":\"$2\"}" "$base/api/auth/login"
}
[[ "$(login advisor demo-kadkerja)" == 200 ]] || fail "demo advisor cannot sign in"
curl -s -b "$jar" "$base/api/auth/me" | grep -q '"role":"ADVISOR"' || fail "/api/auth/me is not the advisor"
curl -s -b "$jar" "$base/api/jobs" | grep -q 'PKR 1234' || fail "demo job PKR 1234 missing (PostgreSQL + Flyway + demo data)"
echo "ok   api: sign-in, session, demo data from PostgreSQL"

# nginx must overwrite X-Forwarded-For: five wrong passwords, each with a different made-up
# address, still count against this one client, so the right password is then refused (429).
rm -f "$jar"
for i in 1 2 3 4 5; do
  [[ "$(login tech wrong-password-$i -H "X-Forwarded-For: 203.0.113.$i")" == 401 ]] || fail "wrong password $i not 401"
done
[[ "$(login tech demo-kadkerja -H 'X-Forwarded-For: 198.51.100.7')" == 429 ]] \
  || fail "sign-in limit dodged with a fake X-Forwarded-For"
echo "ok   proxy: sign-in limit counts the real client, not X-Forwarded-For"
echo "all compose smoke checks passed"

#!/bin/bash
# Off-box copies of the nightly backup.
#
# `backup.sh` protects against a bad migration or a mistaken delete. It does
# NOT protect against the box being lost, because its backups sit on the same
# disk as the database. This closes that gap: it takes the newest backup pair,
# encrypts it, and puts it somewhere that is not this machine.
#
# Deliberately accepted as a launch gap on 26 Aug 2026, to be revisited after
# the 24 Sept deadline. This is that revisit.
#
# ---------------------------------------------------------------------------
# Three things about the design are load-bearing.
#
# 1. ENCRYPTED BEFORE IT LEAVES, WITH A PUBLIC KEY.
#    The archive holds PAN cards, business proofs and bank-transfer
#    screenshots. Off-box means on somebody else's disk, so it is encrypted
#    here, first. Asymmetrically: this box carries only the PUBLIC half, so
#    whoever gets into the box cannot read the archives already sitting on the
#    remote — nor the ones it goes on to write. A passphrase would have sat in
#    the same file they had just read.
#
#    The private key MUST live off this box. `offsite.sh keygen` prints it once
#    and never writes it to disk here. Lose it and every archive is landfill;
#    that is the trade for the property above.
#
# 2. VERIFIED BY READING IT BACK.
#    "rsync exited 0" says the bytes left. It does not say they arrived whole
#    or that they can be read again. Every upload is downloaded back and its
#    SHA-256 compared, and the digest is recorded so `verify` can re-check
#    older archives against bit-rot — which is precisely the thing a second
#    copy exists to survive.
#
# 3. IT CANNOT FAIL THE NIGHTLY BACKUP, AND IT CANNOT FAIL SILENTLY.
#    backup.sh calls this with `|| true`: an unreachable remote must not cost
#    the local backup, which is the one that has to work. In exchange this
#    script owns its own alerting — it emails on failure using the SMTP
#    settings already in .env.production, and writes a status file the admin
#    Settings screen reads. A backup system that quietly stops is worse than
#    none, because it is still trusted.
# ---------------------------------------------------------------------------
#
# Install:  nothing to add to crontab — backup.sh calls this at the end.
# Configure: /opt/b2b-portal/.env.offsite  (see `offsite.sh help`)
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/b2b-portal}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
ENV_FILE="$APP_DIR/.env.offsite"
STATUS_FILE="${STATUS_FILE:-$APP_DIR/data/offsite-status.json}"

# Defaults. Everything here is overridable from .env.offsite.
OFFSITE_REMOTE="${OFFSITE_REMOTE:-}"
OFFSITE_SSH_KEY="${OFFSITE_SSH_KEY:-/root/.ssh/b2b-offsite}"
OFFSITE_SSH_PORT="${OFFSITE_SSH_PORT:-22}"
OFFSITE_CERT="${OFFSITE_CERT:-$APP_DIR/offsite-key.pub.pem}"
OFFSITE_KEEP_DAYS="${OFFSITE_KEEP_DAYS:-30}"
OFFSITE_VERIFY="${OFFSITE_VERIFY:-1}"

# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && . "$ENV_FILE"

# `date -uIs` is GNU-only, and `open` has to run on whatever machine holds the
# private key — which is a Mac. Same string, spelled portably.
now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
log() { echo "[$(now)] offsite: $*"; }

# One working directory, cleaned up once.
#
# An EXIT trap written inside a function cannot refer to that function's own
# `local` — by the time the trap runs the variable is out of scope, so the
# cleanup either does nothing or, without the ${:?} guard, runs `rm -rf` with
# an empty path. Keeping it global is the fix; keeping the guard is the thing
# that caught it.
WORK=""
cleanup() { [ -n "$WORK" ] && rm -rf "${WORK:?}"; return 0; }
trap cleanup EXIT

# --- portability ------------------------------------------------------------
# This runs on the Debian box, and `open` runs on a Mac. Neither GNU-only nor
# BSD-only flags are safe to assume.
sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

# The cutoff as a plain YYYYMMDD. ISO dates compare correctly as strings, which
# is the whole reason for the format — no date maths against a remote's clock.
cutoff_date() {
  date -u -d "$OFFSITE_KEEP_DAYS days ago" +%Y%m%d 2>/dev/null \
    || date -u -v-"$OFFSITE_KEEP_DAYS"d +%Y%m%d
}

# --- alerting ---------------------------------------------------------------
# Reuses the SMTP credentials already configured for booking notifications.
# curl speaks SMTP, so this needs nothing installed that is not here already.
#
# The password goes in a 0600 config file, never on the command line, where
# `ps` would show it to every user on a box that also runs the ERP.
alert() {
  local subject="$1" body="$2" cfg to
  local host="" port="" user="" pass="" from="" notify=""
  local env_prod="$APP_DIR/.env.production"
  if [ -f "$env_prod" ]; then
    host="$(sed -n 's/^SMTP_HOST=//p' "$env_prod" | tail -1)"
    port="$(sed -n 's/^SMTP_PORT=//p' "$env_prod" | tail -1)"
    user="$(sed -n 's/^SMTP_USER=//p' "$env_prod" | tail -1)"
    pass="$(sed -n 's/^SMTP_PASS=//p' "$env_prod" | tail -1)"
    from="$(sed -n 's/^SMTP_FROM=//p' "$env_prod" | tail -1)"
    notify="$(sed -n 's/^BOOKING_NOTIFY_TO=//p' "$env_prod" | tail -1)"
    [ -n "$notify" ] || notify="$(sed -n 's/^ADMIN_EMAIL=//p' "$env_prod" | tail -1)"
  fi
  port="${port:-587}"
  to="${notify:-}"
  if [ -z "$host" ] || [ -z "$to" ]; then
    log "(no SMTP configured, so this is only in the log: $subject)"
    return 0
  fi
  cfg="$(mktemp)"; chmod 600 "$cfg"
  { printf 'url = "smtp://%s:%s"\n' "$host" "$port"
    printf 'ssl-reqd\n'
    [ -n "$user" ] && printf 'user = "%s:%s"\n' "$user" "$pass"
    printf 'mail-from = "%s"\n' "${from:-$to}"
    printf 'mail-rcpt = "%s"\n' "$to"
    printf 'silent\nshow-error\n'
  } > "$cfg"
  {
    printf 'From: %s\nTo: %s\nSubject: %s\n\n' "${from:-$to}" "$to" "$subject"
    printf '%s\n\nHost: %s\nLog: /var/log/b2b-backup.log\n' "$body" "$(hostname)"
  } | curl -K "$cfg" --upload-file - --max-time 20 >/dev/null 2>&1 \
      && log "alert emailed to $to" || log "could not email the alert"
  rm -f "${cfg:?}"
}

# --- status the admin screen can read --------------------------------------
# In data/, which is the container's bind mount, so /admin/settings can show
# whether this is on and when it last worked. Configuration an operator cannot
# see is configuration nobody trusts.
#
# The remote is written with everything after the colon cut off: it is a
# hostname and a login, and the screen only has to answer "is it going
# somewhere", not "where exactly".
write_status() {
  local state="$1" detail="${2:-}" archive="${3:-}" bytes="${4:-0}"
  mkdir -p "$(dirname "$STATUS_FILE")" 2>/dev/null || return 0
  printf '{"state":"%s","at":"%s","detail":"%s","archive":"%s","bytes":%s,"remote":"%s","keepDays":%s}\n' \
    "$state" "$(now)" "${detail//\"/\'}" "$archive" "$bytes" \
    "$(printf '%s' "$OFFSITE_REMOTE" | sed 's/:.*$/:…/')" "$OFFSITE_KEEP_DAYS" \
    > "$STATUS_FILE.tmp" && mv "$STATUS_FILE.tmp" "$STATUS_FILE"
  chmod 644 "$STATUS_FILE" 2>/dev/null || true
}

die() {
  log "ERROR: $*"
  write_status "error" "$*"
  alert "B2B off-box backup FAILED" "$*"
  exit 1
}

# --- the remote, either over SSH or a plain directory ----------------------
# A destination with a colon is a host; one without is a path — a second disk,
# a USB drive, an NFS mount. Both are genuinely useful, and the filesystem one
# is what makes `self-test` runnable anywhere, including on a laptop. A
# transport that can be exercised beats one that can only be reasoned about.
is_ssh_remote() { case "$OFFSITE_REMOTE" in *:*) return 0;; *) return 1;; esac; }
ssh_host() { printf '%s' "${OFFSITE_REMOTE%%:*}"; }
ssh_path() { printf '%s' "${OFFSITE_REMOTE#*:}"; }

SSH_OPTS=()
ssh_setup() {
  SSH_OPTS=(-p "$OFFSITE_SSH_PORT" -o BatchMode=yes -o ConnectTimeout=20)
  [ -f "$OFFSITE_SSH_KEY" ] && SSH_OPTS+=(-i "$OFFSITE_SSH_KEY")
  return 0
}

# `sftp -b`, not `ssh <command>`: a Hetzner Storage Box runs a restricted shell
# that refuses arbitrary commands but does speak sftp. Listing and deleting
# have to work there, because that is the destination this was built for.
sftp_batch() {
  local args=(-oBatchMode=yes -oConnectTimeout=20 -P "$OFFSITE_SSH_PORT")
  [ -f "$OFFSITE_SSH_KEY" ] && args+=(-i "$OFFSITE_SSH_KEY")
  sftp "${args[@]}" -b - "$(ssh_host)" 2>&1
}

remote_put() {
  local src="$1" name="$2"
  if is_ssh_remote; then
    ssh_setup
    printf 'mkdir %s\n' "$(ssh_path)" | sftp_batch >/dev/null 2>&1 || true
    rsync -e "ssh ${SSH_OPTS[*]}" --partial --inplace "$src" "$OFFSITE_REMOTE/$name"
  else
    # Written aside and moved into place, so a copy interrupted half way
    # through never looks like a complete archive.
    mkdir -p "$OFFSITE_REMOTE"
    cp "$src" "$OFFSITE_REMOTE/.$name.part"
    mv "$OFFSITE_REMOTE/.$name.part" "$OFFSITE_REMOTE/$name"
  fi
}

remote_get() {
  local name="$1" dest="$2"
  if is_ssh_remote; then
    ssh_setup
    scp "${SSH_OPTS[@]}" -q "$(ssh_host):$(ssh_path)/$name" "$dest"
  else
    cp "$OFFSITE_REMOTE/$name" "$dest"
  fi
}

remote_list() {
  if is_ssh_remote; then
    printf 'cd %s\nls -1\n' "$(ssh_path)" | sftp_batch \
      | sed -e 's#^.*/##' -e 's/[[:space:]]*$//' \
      | grep -E '^b2b-[0-9]{8}T[0-9]{6}Z\.tar\.cms$' || true
  else
    [ -d "$OFFSITE_REMOTE" ] || return 0
    ls -1 "$OFFSITE_REMOTE" 2>/dev/null | grep -E '^b2b-[0-9]{8}T[0-9]{6}Z\.tar\.cms$' || true
  fi
}

remote_rm() {
  local name="${1:?remote_rm needs a name}"
  if is_ssh_remote; then
    printf 'cd %s\nrm %s\n' "$(ssh_path)" "$name" | sftp_batch >/dev/null 2>&1
  else
    rm -f "${OFFSITE_REMOTE:?}/${name:?}"
  fi
}

# --- send ------------------------------------------------------------------
cmd_send() {
  local force="${1:-}"

  if [ -z "$OFFSITE_REMOTE" ]; then
    log "NOT CONFIGURED — no off-box copy was made. See $ENV_FILE (offsite.sh help)."
    write_status "unconfigured" "No OFFSITE_REMOTE set in $ENV_FILE"
    return 0
  fi
  [ -f "$OFFSITE_CERT" ] || die "no recipient certificate at $OFFSITE_CERT — run: deploy/offsite.sh keygen"

  # The newest stamp backup.sh wrote. Taking the pair from ONE run is the
  # point: a database restored beside somebody else's uploads directory has
  # agent rows whose documents are the wrong ones.
  local newest stamp db uploads
  newest="$(ls -1t "$BACKUP_DIR"/prod-*.db.gz 2>/dev/null | head -1 || true)"
  [ -n "$newest" ] || die "no local backup to send — has backup.sh run?"
  stamp="$(basename "$newest" | sed -e 's/^prod-//' -e 's/\.db\.gz$//')"
  db="$newest"
  uploads="$BACKUP_DIR/uploads-$stamp.tar.gz"

  local name="b2b-$stamp.tar.cms"
  local today="${stamp%%T*}"

  # One copy a night, however often backup.sh runs. CI runs it before every
  # deploy, and ten deploys in a day should not mean ten archives.
  if [ "$force" != "--force" ]; then
    if remote_list | grep -q "^b2b-$today"; then
      log "an archive for $today is already off-box — skipping (--force to add another)"
      return 0
    fi
  fi

  WORK="$(mktemp -d)"; local tmp="$WORK"

  # A manifest, so whoever restores this in two years can tell what they have
  # and check it member by member without trusting the archive's own metadata.
  { echo "Series Tours B2B portal — off-box backup"
    echo "stamp: $stamp"
    echo "made:  $(now)"
    echo "host:  $(hostname)"
    echo "Restore: deploy/offsite.sh open $name <private-key.pem>"
    echo
    echo "sha256  file"
    echo "$(sha256 "$db")  $(basename "$db")"
    [ -f "$uploads" ] && echo "$(sha256 "$uploads")  $(basename "$uploads")"
  } > "$tmp/MANIFEST.txt"

  local members=("MANIFEST.txt" "$(basename "$db")")
  cp "$db" "$tmp/"
  if [ -f "$uploads" ]; then
    cp "$uploads" "$tmp/"; members+=("$(basename "$uploads")")
  else
    log "no uploads archive for $stamp — sending the database alone"
  fi

  # tar straight into openssl, so the plaintext archive never exists on disk,
  # and -stream so neither process buffers it. WITHOUT -stream openssl holds
  # roughly five times the file in memory (measured: 316MB for a 60MB input,
  # 1.7MB with it) — and on a 4GB box that also runs the ERP and MariaDB that
  # is how a nightly job becomes an outage.
  local out="$tmp/$name"
  tar -cf - -C "$tmp" "${members[@]}" \
    | openssl cms -encrypt -binary -aes-256-cbc -stream -outform DER -out "$out" "$OFFSITE_CERT" \
    || die "encryption failed"

  # Assert it actually names a recipient. openssl does refuse an empty
  # recipient list, but an archive nobody can ever decrypt is the one failure
  # that stays invisible until the day it matters, so it is checked rather
  # than assumed.
  openssl cms -cmsout -inform DER -in "$out" -noout -print 2>/dev/null \
    | grep -qi "keyEncryptionAlgorithm" \
    || die "the encrypted archive names no recipient — check $OFFSITE_CERT"

  local bytes digest
  bytes="$(wc -c < "$out" | tr -d ' ')"
  digest="$(sha256 "$out")"
  log "built $name ($(du -h "$out" | cut -f1)) sha256=${digest:0:16}…"

  remote_put "$out" "$name" || die "upload to $OFFSITE_REMOTE failed"

  if [ "$OFFSITE_VERIFY" = "1" ]; then
    remote_get "$name" "$tmp/check.cms" || die "uploaded $name but could not read it back"
    local back; back="$(sha256 "$tmp/check.cms")"
    [ "$back" = "$digest" ] || die "the copy on the remote does not match what was sent ($back vs $digest)"
    log "verified: the remote copy reads back byte-identical"
  else
    log "verification skipped (OFFSITE_VERIFY=0)"
  fi

  # ONE row per archive, replaced rather than appended.
  #
  # Re-sending a stamp produces different bytes every time — CMS picks a fresh
  # content key on each run — so a leftover row from the earlier send makes
  # `verify` report ALTERED against a perfectly good archive. A monitor that
  # cries wolf is a monitor nobody reads, and this is the one that has to be
  # believed.
  local idx="$BACKUP_DIR/offsite.index" tab
  tab="$(printf '\t')"
  if [ -f "$idx" ]; then
    grep -v "^$stamp$tab" "$idx" > "$idx.tmp" 2>/dev/null || true
    mv "$idx.tmp" "$idx"
  fi
  printf '%s\t%s\t%s\n' "$stamp" "$bytes" "$digest" >> "$idx"

  # Prune on the stamp in the NAME, not the remote's mtime. A copy may land
  # with whatever mtime the transport feels like, and a 30-day rule run
  # against the wrong clock either keeps everything or deletes what is needed.
  local cut; cut="$(cutoff_date)"
  local pruned=0 f d
  while read -r f; do
    [ -n "$f" ] || continue
    d="${f#b2b-}"; d="${d%%T*}"
    if [ "$d" -lt "$cut" ] 2>/dev/null; then
      remote_rm "$f" && pruned=$((pruned + 1)) && log "pruned $f"
    fi
  done <<< "$(remote_list)"
  [ "$pruned" -gt 0 ] && log "pruned $pruned archive(s) older than $OFFSITE_KEEP_DAYS days"

  # The index follows the remote. Rows for archives that are gone would have
  # `verify` reporting "gone" for every night since the portal launched.
  awk -F'\t' -v cut="$cut" 'substr($1,1,8) >= cut' "$idx" > "$idx.tmp" && mv "$idx.tmp" "$idx"

  write_status "ok" "Verified byte-identical on the remote" "$name" "$bytes"
  log "ok: $name is off-box"
}

# --- keygen ----------------------------------------------------------------
cmd_keygen() {
  if [ -f "$OFFSITE_CERT" ]; then
    echo "A recipient certificate already exists at $OFFSITE_CERT."
    echo
    echo "Generating a new one does not make the old one go away: the OLD private"
    echo "key is still the only thing that can read every archive sent before"
    echo "today. Move the old certificate aside first if that is really what you"
    echo "want, and keep both keys."
    exit 1
  fi
  WORK="$(mktemp -d)"; local tmp="$WORK"
  chmod 700 "$tmp"
  openssl req -x509 -newkey rsa:4096 -nodes -days 36500 \
    -subj "/CN=Series Tours B2B off-box backup" \
    -keyout "$tmp/private.pem" -out "$OFFSITE_CERT" 2>/dev/null
  chmod 644 "$OFFSITE_CERT"
  cat <<EOF

  The PUBLIC half is now at:
      $OFFSITE_CERT
  That is all this box needs, and all it will ever hold.

  The PRIVATE half is below. It is NOT saved anywhere — it exists only in this
  output. Put it in a password manager, or print it, or both, somewhere that is
  not this server. Without it every off-box archive is unreadable, including
  the ones already sent; with it, all of them are readable, so treat it as the
  key to the whole database.

EOF
  cat "$tmp/private.pem"
  cat <<EOF

  Then check you really have it, from your own machine:
      deploy/offsite.sh open <archive.tar.cms> <the-file-you-just-saved.pem>

EOF
}

# --- list / fetch / verify / open ------------------------------------------
cmd_list() {
  [ -n "$OFFSITE_REMOTE" ] || { echo "Not configured. See $ENV_FILE"; exit 1; }
  local n=0 f
  while read -r f; do
    [ -n "$f" ] || continue
    echo "$f"; n=$((n + 1))
  done <<< "$(remote_list)"
  echo "($n archive(s) on $OFFSITE_REMOTE)"
}

cmd_fetch() {
  local name="${1:?usage: offsite.sh fetch <b2b-...tar.cms> [dest]}"
  local dest="${2:-./$name}"
  remote_get "$name" "$dest"
  echo "$dest ($(du -h "$dest" | cut -f1))"
  echo "Open it with: deploy/offsite.sh open $dest <private-key.pem>"
}

# Re-reads what is on the remote and checks it against the digests recorded
# when it was sent. This is the bit-rot check — the reason a second copy on
# somebody else's disk is worth having at all.
cmd_verify() {
  [ -f "$BACKUP_DIR/offsite.index" ] || { echo "Nothing sent yet (no $BACKUP_DIR/offsite.index)"; exit 1; }
  WORK="$(mktemp -d)"; local tmp="$WORK"
  local bad=0 checked=0 stamp bytes digest name
  while IFS=$'\t' read -r stamp bytes digest; do
    [ -n "${stamp:-}" ] || continue
    name="b2b-$stamp.tar.cms"
    if ! remote_list | grep -qx "$name"; then
      echo "gone:    $name (pruned, or missing)"; continue
    fi
    if ! remote_get "$name" "$tmp/c" 2>/dev/null; then
      echo "UNREADABLE: $name"; bad=$((bad + 1)); continue
    fi
    if [ "$(sha256 "$tmp/c")" = "$digest" ]; then
      echo "ok:      $name  ($bytes bytes)"
    else
      echo "ALTERED: $name"; bad=$((bad + 1))
    fi
    checked=$((checked + 1))
    rm -f "${tmp:?}/c"
  done < "$BACKUP_DIR/offsite.index"
  echo "$checked checked, $bad bad"
  if [ "$bad" -ne 0 ]; then
    alert "B2B off-box backup: $bad archive(s) no longer match" "Run deploy/offsite.sh verify on $(hostname)"
    exit 1
  fi
}

# Runs on whatever machine holds the private key — a laptop, a rescue shell.
# It needs openssl and tar and nothing else, which is why CMS was chosen over
# anything that would have to be installed first on the worst day of the year.
cmd_open() {
  local archive="${1:?usage: offsite.sh open <archive.tar.cms> <private-key.pem> [dest-dir]}"
  local key="${2:?usage: offsite.sh open <archive.tar.cms> <private-key.pem> [dest-dir]}"
  local dest="${3:-./restored-$(basename "$archive" .tar.cms)}"
  mkdir -p "$dest"
  openssl cms -decrypt -binary -inform DER -in "$archive" -inkey "$key" \
    | tar -xf - -C "$dest" \
    || { echo "Could not decrypt — is that the matching private key?"; exit 1; }
  echo
  cat "$dest/MANIFEST.txt" 2>/dev/null || true
  echo
  echo "Checking the manifest against what came out:"
  local sum file
  while read -r sum file; do
    # Only a 64-character hex digest counts as a row. Reading to end-of-file
    # and trusting whatever is there reported the manifest's own closing line
    # as a MISSING file.
    case "$sum" in
      *[^0-9a-f]* | "") continue ;;
    esac
    [ "${#sum}" -eq 64 ] || continue
    [ -n "${file:-}" ] || continue
    if [ ! -f "$dest/$file" ]; then echo "  MISSING $file"; continue; fi
    if [ "$(sha256 "$dest/$file")" = "$sum" ]; then
      echo "  ok      $file"
    else
      echo "  ALTERED $file"
    fi
  done < <(sed -n '/^sha256  file$/,$p' "$dest/MANIFEST.txt" 2>/dev/null || true)
  echo
  echo "Restore the database with:  deploy/restore.sh $dest"/prod-*.db.gz
  # Only mentioned when it is really there: an instruction for a file that does
  # not exist sends whoever is restoring at 3am hunting for it.
  if ls "$dest"/uploads-*.tar.gz >/dev/null 2>&1; then
    echo "The uploads unpack over data/: tar -xzf $dest/uploads-*.tar.gz -C <app>/data"
  else
    echo "(no uploads archive in this one — there were none on the box that night)"
  fi
}

# --- self-test -------------------------------------------------------------
# The whole pipeline against a throwaway keypair and a throwaway destination.
# It proves the mechanism — the openssl flags, the transport, the round trip —
# WITHOUT the real private key ever being on this box, which is the one thing
# that must stay true. Run it before trusting any of this.
cmd_self_test() {
  WORK="$(mktemp -d)"; local tmp="$WORK"
  echo "Self-test in $tmp"
  openssl req -x509 -newkey rsa:4096 -nodes -days 1 -subj "/CN=selftest" \
    -keyout "$tmp/k.pem" -out "$tmp/c.pem" 2>/dev/null
  echo "  keypair ok"

  mkdir -p "$tmp/backups" "$tmp/dest" "$tmp/data"
  local stamp; stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  dd if=/dev/urandom bs=1024 count=700 2>/dev/null | gzip > "$tmp/backups/prod-$stamp.db.gz"
  dd if=/dev/urandom bs=1024 count=300 2>/dev/null | gzip > "$tmp/backups/uploads-$stamp.tar.gz"
  local db_sha up_sha
  db_sha="$(sha256 "$tmp/backups/prod-$stamp.db.gz")"
  up_sha="$(sha256 "$tmp/backups/uploads-$stamp.tar.gz")"
  echo "  made a stand-in backup pair"

  APP_DIR="$tmp" BACKUP_DIR="$tmp/backups" OFFSITE_REMOTE="$tmp/dest" \
  OFFSITE_CERT="$tmp/c.pem" STATUS_FILE="$tmp/data/offsite-status.json" \
    "$0" send --force || { echo "  SEND FAILED"; exit 1; }

  local archive="$tmp/dest/b2b-$stamp.tar.cms"
  [ -f "$archive" ] || { echo "  FAIL: no archive at the destination"; exit 1; }
  echo "  uploaded and verified"

  # The real test: can it be read back with the key, and is it bit-identical?
  "$0" open "$archive" "$tmp/k.pem" "$tmp/out" > "$tmp/open.log" 2>&1 \
    || { echo "  OPEN FAILED"; cat "$tmp/open.log"; exit 1; }
  grep -q "ok      prod-$stamp.db.gz" "$tmp/open.log" \
    || { echo "  FAIL: the database member did not verify"; cat "$tmp/open.log"; exit 1; }
  grep -q "ok      uploads-$stamp.tar.gz" "$tmp/open.log" \
    || { echo "  FAIL: the uploads member did not verify"; cat "$tmp/open.log"; exit 1; }
  [ "$(sha256 "$tmp/out/prod-$stamp.db.gz")" = "$db_sha" ] || { echo "  FAIL: database bytes differ"; exit 1; }
  [ "$(sha256 "$tmp/out/uploads-$stamp.tar.gz")" = "$up_sha" ] || { echo "  FAIL: uploads bytes differ"; exit 1; }
  echo "  decrypted, and both members are byte-identical"

  # And the property the whole design rests on: the wrong key cannot read it.
  openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj "/CN=wrong" \
    -keyout "$tmp/w.pem" -out "$tmp/wc.pem" 2>/dev/null
  if openssl cms -decrypt -binary -inform DER -in "$archive" -inkey "$tmp/w.pem" >/dev/null 2>&1; then
    echo "  FAIL: a different key decrypted the archive"; exit 1
  fi
  echo "  a different key cannot read it"
  grep -q '"state":"ok"' "$tmp/data/offsite-status.json" \
    || { echo "  FAIL: no ok status written for the admin screen"; exit 1; }
  echo "  status file written for the admin screen"
  echo
  echo "Self-test PASSED. The mechanism works; what is left is a real"
  echo "OFFSITE_REMOTE and a private key kept somewhere that is not this box."
}

cmd_help() {
  cat <<EOF
Off-box copies of the nightly backup.

  deploy/offsite.sh self-test        prove the whole pipeline, no real key needed
  deploy/offsite.sh keygen           make the keypair; prints the private half ONCE
  deploy/offsite.sh send [--force]   encrypt the newest backup and put it off-box
  deploy/offsite.sh list             what is on the remote
  deploy/offsite.sh verify           re-read every archive, check it still matches
  deploy/offsite.sh fetch <name>     pull one down
  deploy/offsite.sh open <a> <key>   decrypt and check it (run where the key is)

Configure in $ENV_FILE (chmod 600):

  OFFSITE_REMOTE=u123456@u123456.your-storagebox.de:b2b-portal
      Where copies go. With a colon it is ssh/rsync; without, a plain path —
      a second disk or an NFS mount. Unset means no off-box copy is made, and
      that is said in the log, in the status file, and on /admin/settings.
  OFFSITE_SSH_KEY=/root/.ssh/b2b-offsite    ssh key for that host
  OFFSITE_SSH_PORT=23                       Hetzner Storage Boxes use 23
  OFFSITE_CERT=$APP_DIR/offsite-key.pub.pem recipient cert from \`keygen\`
  OFFSITE_KEEP_DAYS=30                      pruned on the stamp in the name
  OFFSITE_VERIFY=1                          read every upload back and compare

backup.sh calls \`send\` at the end, so there is no second cron entry to forget.
EOF
}

case "${1:-send}" in
  send)      shift || true; cmd_send "${1:-}" ;;
  keygen)    cmd_keygen ;;
  list)      cmd_list ;;
  fetch)     shift; cmd_fetch "$@" ;;
  verify)    cmd_verify ;;
  open)      shift; cmd_open "$@" ;;
  self-test) cmd_self_test ;;
  help|-h|--help) cmd_help ;;
  *) echo "Unknown command: $1"; echo; cmd_help; exit 1 ;;
esac

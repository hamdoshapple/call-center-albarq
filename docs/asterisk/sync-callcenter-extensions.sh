#!/usr/bin/env bash
set -euo pipefail

DB_HOST="127.0.0.1"
DB_USER="albarq"
DB_PASS="albarqpass"
DB_NAME="callcenter"

OUT="/etc/asterisk/pjsip_callcenter_extensions.conf"
MAIN="/etc/asterisk/pjsip.conf"

docker exec -i albarq-mysql mysql \
-u"$DB_USER" \
-p"$DB_PASS" \
"$DB_NAME" \
-N -e "
SELECT number, sipUsername, sipPassword
FROM Extension
WHERE number IS NOT NULL AND number <> ''
ORDER BY number;
" > /tmp/callcenter_extensions.tsv

cat > "$OUT" <<'ASTERISK'
; Auto-generated from Call Center DB
; Do not edit manually. Use /opt/scripts/sync-callcenter-extensions.sh

ASTERISK

while IFS=$'\t' read -r number sipuser sippass; do
  [[ -z "${number:-}" ]] && continue
  [[ -z "${sipuser:-}" ]] && sipuser="$number"
  [[ -z "${sippass:-}" ]] && sippass="$number"

  cat >> "$OUT" <<ASTERISK
[$number]
type=endpoint
transport=transport-udp
context=internal
disallow=all
allow=ulaw,alaw
auth=${number}
aors=${number}
direct_media=no
rtp_symmetric=yes
force_rport=yes
rewrite_contact=yes

[$number]
type=auth
auth_type=userpass
username=${sipuser}
password=${sippass}

[$number]
type=aor
max_contacts=5
remove_existing=yes

ASTERISK
done < /tmp/callcenter_extensions.tsv

if ! grep -q '#include "pjsip_callcenter_extensions.conf"' "$MAIN"; then
  echo '#include "pjsip_callcenter_extensions.conf"' >> "$MAIN"
fi

asterisk -rx "pjsip reload"
asterisk -rx "dialplan reload"

echo "Synced extensions:"
cat /tmp/callcenter_extensions.tsv

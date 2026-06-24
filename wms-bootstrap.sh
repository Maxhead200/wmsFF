#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

DOMAIN="wms.logoff.pro"
SERVER_IP="159.194.217.147"
ANDROID_HOME="/opt/android-sdk"
SECRETS_FILE="/root/wms-secrets.env"
LOG_PREFIX="[wms-bootstrap]"

log() {
  echo "$(date -Is) ${LOG_PREFIX} $*"
}

log "starting bootstrap for ${DOMAIN}"

log "setting hostname and mailname"
hostnamectl set-hostname "${DOMAIN}" || true
if ! grep -q "${DOMAIN}" /etc/hosts; then
  printf '127.0.1.1 %s wms\n' "${DOMAIN}" >> /etc/hosts
fi
printf '%s\n' "${DOMAIN}" > /etc/mailname

log "ensuring 1G swap"
if ! swapon --show=NAME | grep -qx '/swapfile'; then
  if [ ! -f /swapfile ]; then
    fallocate -l 1G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=1024 status=progress
    chmod 600 /swapfile
    mkswap /swapfile
  fi
  swapon /swapfile || true
fi
if ! grep -q '^/swapfile ' /etc/fstab; then
  printf '/swapfile none swap sw 0 0\n' >> /etc/fstab
fi

log "apt update"
apt-get update

log "preseeding postfix"
printf 'postfix postfix/mailname string %s\n' "${DOMAIN}" | debconf-set-selections
printf 'postfix postfix/main_mailer_type select Internet Site\n' | debconf-set-selections

log "installing base packages and services"
apt-get install -y --no-install-recommends \
  ca-certificates curl gnupg lsb-release unzip zip git nano htop ufw ssl-cert \
  nginx certbot python3-certbot-nginx \
  docker.io docker-compose-v2 \
  postgresql postgresql-contrib redis-server \
  postfix mailutils dovecot-core dovecot-imapd dovecot-pop3d opendkim opendkim-tools \
  openjdk-17-jdk-headless nodejs npm build-essential

log "enabling core services"
systemctl enable --now docker nginx postgresql redis-server postfix dovecot opendkim >/dev/null 2>&1 || true

log "creating WMS secrets file when missing"
umask 077
if [ ! -f "${SECRETS_FILE}" ]; then
  DB_PASS="$(openssl rand -hex 24)"
  MAIL_PASS="$(openssl rand -hex 24)"
  cat > "${SECRETS_FILE}" <<EOF
WMS_DOMAIN=${DOMAIN}
WMS_DB_NAME=wms
WMS_DB_USER=wms
WMS_DB_PASSWORD=${DB_PASS}
WMS_DB_HOST=127.0.0.1
WMS_DB_PORT=5432
WMS_DATABASE_URL=postgresql://wms:${DB_PASS}@127.0.0.1:5432/wms
WMS_REDIS_URL=redis://127.0.0.1:6379/0
WMS_SMTP_HOST=127.0.0.1
WMS_SMTP_PORT=25
WMS_SMTP_FROM=no-reply@${DOMAIN}
WMS_MAIL_USER=wmsmail
WMS_MAIL_ADDRESS=wmsmail@${DOMAIN}
WMS_MAIL_PASSWORD=${MAIL_PASS}
EOF
  chmod 600 "${SECRETS_FILE}"
fi
# shellcheck disable=SC1090
source "${SECRETS_FILE}"

log "provisioning PostgreSQL role and database"
runuser -u postgres -- psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'wms') THEN
    CREATE ROLE wms LOGIN PASSWORD '${WMS_DB_PASSWORD}';
  ELSE
    ALTER ROLE wms WITH LOGIN PASSWORD '${WMS_DB_PASSWORD}';
  END IF;
END
\$\$;
SELECT 'CREATE DATABASE wms OWNER wms' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'wms')\gexec
SQL

log "provisioning local mail user"
if ! id wmsmail >/dev/null 2>&1; then
  useradd -m -s /usr/sbin/nologin wmsmail
fi
printf 'wmsmail:%s\n' "${WMS_MAIL_PASSWORD}" | chpasswd
install -d -o wmsmail -g wmsmail /home/wmsmail/Maildir /home/wmsmail/Maildir/cur /home/wmsmail/Maildir/new /home/wmsmail/Maildir/tmp

log "configuring nginx site"
mkdir -p /var/www/wms
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "${SCRIPT_DIR}/web/index.html" ]; then
  log "copying static WMS frontend"
  cp -R "${SCRIPT_DIR}/web/." /var/www/wms/
  chmod -R a+rX /var/www/wms
else
cat > /var/www/wms/index.html <<HTML
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WMS</title>
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, sans-serif; background: #101820; color: #f3f6f8; display: grid; min-height: 100vh; place-items: center; }
    main { max-width: 720px; padding: 32px; }
    h1 { margin: 0 0 12px; font-size: 36px; }
    p { margin: 8px 0; color: #c7d2da; line-height: 1.5; }
    code { color: #9ee493; }
  </style>
</head>
<body>
  <main>
    <h1>WMS infrastructure is online</h1>
    <p>Domain: <code>${DOMAIN}</code></p>
    <p>Nginx and HTTPS are ready. Backend traffic can be proxied to <code>127.0.0.1:8080</code>.</p>
  </main>
</body>
</html>
HTML
fi
chmod 755 /var/www/wms
chmod 644 /var/www/wms/index.html
if [ -e "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
  cat > /etc/nginx/sites-available/${DOMAIN} <<'NGINX_SSL'
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

server {
    listen 80;
    listen [::]:80;
    server_name wms.logoff.pro;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/wms;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name wms.logoff.pro;

    ssl_certificate /etc/letsencrypt/live/wms.logoff.pro/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/wms.logoff.pro/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    root /var/www/wms;
    index index.html;
    client_max_body_size 64m;

    location = /health {
        access_log off;
        add_header Content-Type text/plain;
        return 200 "ok\n";
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINX_SSL
else
  cat > /etc/nginx/sites-available/${DOMAIN} <<'NGINX'
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

server {
    listen 80;
    listen [::]:80;
    server_name wms.logoff.pro;

    root /var/www/wms;
    index index.html;
    client_max_body_size 64m;

    location = /health {
        access_log off;
        add_header Content-Type text/plain;
        return 200 "ok\n";
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINX
fi
ln -sf /etc/nginx/sites-available/${DOMAIN} /etc/nginx/sites-enabled/${DOMAIN}
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

log "requesting letsencrypt certificate"
if [ ! -e "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
  certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos --register-unsafely-without-email --redirect || log "certbot failed; nginx remains on HTTP until DNS/port 80 is reachable"
else
  certbot renew --quiet || true
fi

CERT_FILE="/etc/ssl/certs/ssl-cert-snakeoil.pem"
KEY_FILE="/etc/ssl/private/ssl-cert-snakeoil.key"
if [ -e "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
  CERT_FILE="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
  KEY_FILE="/etc/letsencrypt/live/${DOMAIN}/privkey.pem"
fi

log "configuring postfix"
postconf -e "myhostname = ${DOMAIN}"
postconf -e "myorigin = \$myhostname"
postconf -e "mydestination = \$myhostname, localhost.\$mydomain, localhost"
postconf -e "inet_interfaces = all"
postconf -e "inet_protocols = ipv4"
postconf -e "home_mailbox = Maildir/"
postconf -e "smtpd_tls_cert_file = ${CERT_FILE}"
postconf -e "smtpd_tls_key_file = ${KEY_FILE}"
postconf -e "smtpd_tls_security_level = may"
postconf -e "smtp_tls_security_level = may"
postconf -e "smtpd_sasl_type = dovecot"
postconf -e "smtpd_sasl_path = private/auth"
postconf -e "smtpd_sasl_auth_enable = yes"
postconf -e "smtpd_relay_restrictions = permit_mynetworks permit_sasl_authenticated defer_unauth_destination"
postconf -e "smtpd_recipient_restrictions = permit_sasl_authenticated,permit_mynetworks,reject_unauth_destination"
postconf -M submission/inet="submission inet n - y - - smtpd"
postconf -P "submission/inet/syslog_name=postfix/submission"
postconf -P "submission/inet/smtpd_tls_security_level=encrypt"
postconf -P "submission/inet/smtpd_sasl_auth_enable=yes"
postconf -P "submission/inet/smtpd_recipient_restrictions=permit_sasl_authenticated,reject"

log "configuring dovecot"
cat > /etc/dovecot/conf.d/99-wms.conf <<EOF
protocols = imap pop3
mail_location = maildir:~/Maildir
ssl = required
ssl_cert = <${CERT_FILE}
ssl_key = <${KEY_FILE}
auth_mechanisms = plain login
disable_plaintext_auth = yes
service auth {
  unix_listener /var/spool/postfix/private/auth {
    mode = 0660
    user = postfix
    group = postfix
  }
}
EOF

log "configuring opendkim"
mkdir -p /etc/opendkim/keys/${DOMAIN}
if [ ! -f /etc/opendkim/keys/${DOMAIN}/default.private ]; then
  opendkim-genkey -b 2048 -D /etc/opendkim/keys/${DOMAIN} -d ${DOMAIN} -s default
fi
chown root:root /etc/opendkim
chmod 755 /etc/opendkim
chown root:root /etc/opendkim/keys
chmod 755 /etc/opendkim/keys
chown -R root:root /etc/opendkim/keys/${DOMAIN}
chmod 700 /etc/opendkim/keys/${DOMAIN}
chmod 600 /etc/opendkim/keys/${DOMAIN}/default.private
cat > /etc/opendkim/key.table <<EOF
default._domainkey.${DOMAIN} ${DOMAIN}:default:/etc/opendkim/keys/${DOMAIN}/default.private
EOF
cat > /etc/opendkim/signing.table <<EOF
*@${DOMAIN} default._domainkey.${DOMAIN}
EOF
cat > /etc/opendkim/trusted.hosts <<EOF
127.0.0.1
localhost
${DOMAIN}
${SERVER_IP}
EOF
cat > /etc/opendkim.conf <<EOF
Syslog yes
UMask 002
Canonicalization relaxed/simple
Mode sv
SubDomains no
AutoRestart yes
Socket inet:8891@localhost
PidFile /run/opendkim/opendkim.pid
OversignHeaders From
TrustAnchorFile /usr/share/dns/root.key
KeyTable refile:/etc/opendkim/key.table
SigningTable refile:/etc/opendkim/signing.table
ExternalIgnoreList refile:/etc/opendkim/trusted.hosts
InternalHosts refile:/etc/opendkim/trusted.hosts
EOF
chown root:root /etc/opendkim/key.table /etc/opendkim/signing.table /etc/opendkim/trusted.hosts /etc/opendkim.conf
chmod 644 /etc/opendkim/key.table /etc/opendkim/signing.table /etc/opendkim/trusted.hosts /etc/opendkim.conf
if [ -f /etc/default/opendkim ]; then
  sed -i 's|^SOCKET=.*|SOCKET="inet:8891@localhost"|' /etc/default/opendkim || true
  grep -q '^SOCKET=' /etc/default/opendkim || printf 'SOCKET="inet:8891@localhost"\n' >> /etc/default/opendkim
fi
postconf -e "milter_default_action = accept"
postconf -e "milter_protocol = 6"
postconf -e "smtpd_milters = inet:localhost:8891"
postconf -e "non_smtpd_milters = inet:localhost:8891"

log "validating mail config"
doveconf -n >/root/doveconf-wms.txt
postfix check
systemctl restart opendkim dovecot postfix

log "configuring firewall"
ufw allow OpenSSH >/dev/null || true
ufw allow 'Nginx Full' >/dev/null || true
ufw allow 25/tcp >/dev/null || true
ufw allow 587/tcp >/dev/null || true
ufw allow 143/tcp >/dev/null || true
ufw allow 993/tcp >/dev/null || true
ufw allow 995/tcp >/dev/null || true
ufw --force enable >/dev/null || true

log "installing SDKMAN kotlin and gradle"
export SDKMAN_DIR="/root/.sdkman"
export SDKMAN_AUTO_ANSWER=true
export SDKMAN_SELFUPDATE_ENABLE=false
if [ ! -s "${SDKMAN_DIR}/bin/sdkman-init.sh" ]; then
  curl -s "https://get.sdkman.io" | bash
fi
# shellcheck disable=SC1091
set +u
source "${SDKMAN_DIR}/bin/sdkman-init.sh"
sdk install kotlin || true
sdk install gradle || true
set -u
if [ -x "${SDKMAN_DIR}/candidates/kotlin/current/bin/kotlin" ]; then
  ln -sf "${SDKMAN_DIR}/candidates/kotlin/current/bin/kotlin" /usr/local/bin/kotlin
  ln -sf "${SDKMAN_DIR}/candidates/kotlin/current/bin/kotlinc" /usr/local/bin/kotlinc
fi
if [ -x "${SDKMAN_DIR}/candidates/gradle/current/bin/gradle" ]; then
  ln -sf "${SDKMAN_DIR}/candidates/gradle/current/bin/gradle" /usr/local/bin/gradle
fi
cat > /etc/profile.d/sdkman.sh <<'EOF'
export SDKMAN_DIR="/root/.sdkman"
[ -s "$SDKMAN_DIR/bin/sdkman-init.sh" ] && source "$SDKMAN_DIR/bin/sdkman-init.sh"
EOF

log "installing Android command line tools"
mkdir -p "${ANDROID_HOME}/cmdline-tools"
ANDROID_ZIP="/tmp/android-commandlinetools.zip"
if [ ! -x "${ANDROID_HOME}/cmdline-tools/latest/bin/sdkmanager" ]; then
  curl -L --fail -o "${ANDROID_ZIP}" "https://dl.google.com/android/repository/commandlinetools-linux-14742923_latest.zip"
  echo '04453066b540409d975c676d781da1477479dde3761310f1a7eb92a1dfb15af7  /tmp/android-commandlinetools.zip' | sha256sum -c -
  rm -rf /tmp/android-cmdline-tools "${ANDROID_HOME}/cmdline-tools/latest"
  mkdir -p /tmp/android-cmdline-tools "${ANDROID_HOME}/cmdline-tools/latest"
  unzip -q "${ANDROID_ZIP}" -d /tmp/android-cmdline-tools
  mv /tmp/android-cmdline-tools/cmdline-tools/* "${ANDROID_HOME}/cmdline-tools/latest/"
  rm -rf /tmp/android-cmdline-tools "${ANDROID_ZIP}"
fi
cat > /etc/profile.d/android-sdk.sh <<'EOF'
export ANDROID_HOME=/opt/android-sdk
export ANDROID_SDK_ROOT=/opt/android-sdk
export PATH="$PATH:/opt/android-sdk/platform-tools:/opt/android-sdk/cmdline-tools/latest/bin"
EOF
export ANDROID_HOME="${ANDROID_HOME}"
export ANDROID_SDK_ROOT="${ANDROID_HOME}"
export PATH="${PATH}:${ANDROID_HOME}/platform-tools:${ANDROID_HOME}/cmdline-tools/latest/bin"
SDKMANAGER="${ANDROID_HOME}/cmdline-tools/latest/bin/sdkmanager"
yes | "${SDKMANAGER}" --sdk_root="${ANDROID_HOME}" --licenses >/root/android-sdk-licenses.log 2>&1 || true
SDK_LIST="$("${SDKMANAGER}" --sdk_root="${ANDROID_HOME}" --list 2>/root/android-sdk-list.err || true)"
PLATFORM="$(printf '%s\n' "${SDK_LIST}" | awk -F'|' '/platforms;android-[0-9]+[[:space:]]*\|/ {gsub(/ /,"",$1); print $1}' | sort -t- -k2,2n | tail -1)"
BUILD_TOOLS="$(printf '%s\n' "${SDK_LIST}" | awk -F'|' '/build-tools;[0-9][0-9.]+[[:space:]]*\|/ {gsub(/ /,"",$1); print $1}' | grep -Ev 'rc|preview' | sort -V | tail -1)"
[ -n "${PLATFORM}" ] || PLATFORM="platforms;android-36"
[ -n "${BUILD_TOOLS}" ] || BUILD_TOOLS="build-tools;36.0.0"
yes | "${SDKMANAGER}" --sdk_root="${ANDROID_HOME}" "platform-tools" "${PLATFORM}" "${BUILD_TOOLS}" || true
yes | "${SDKMANAGER}" --sdk_root="${ANDROID_HOME}" --licenses >/root/android-sdk-licenses-final.log 2>&1 || true
chown -R root:root "${ANDROID_HOME}"
chmod -R a+rX "${ANDROID_HOME}"

log "installing CSS tooling"
npm install -g sass@1.69.7 postcss@8 postcss-cli@10 autoprefixer@10 || log "npm css tooling install failed"

log "writing WMS ops notes"
mkdir -p /opt/wms
cat > /opt/wms/README.md <<EOF
# WMS server

Domain: ${DOMAIN}

Installed services:
- nginx + Let's Encrypt HTTPS
- PostgreSQL database: wms
- Redis on 127.0.0.1:6379
- Docker + Compose v2
- Postfix + Dovecot + OpenDKIM
- Java 17, Kotlin, Gradle, Node/npm, CSS tooling
- Android SDK command-line tools under /opt/android-sdk

Secrets are stored in ${SECRETS_FILE} with mode 600.
Backend reverse proxy is prepared for http://127.0.0.1:8080 at /api/ and /ws/.
EOF
cat > /opt/wms/.env.example <<EOF
WMS_DOMAIN=${DOMAIN}
WMS_DB_NAME=wms
WMS_DB_USER=wms
WMS_DB_HOST=127.0.0.1
WMS_DB_PORT=5432
WMS_REDIS_URL=redis://127.0.0.1:6379/0
WMS_SMTP_HOST=127.0.0.1
WMS_SMTP_PORT=25
WMS_SMTP_FROM=no-reply@${DOMAIN}
EOF

log "final service restarts"
systemctl enable --now docker nginx postgresql redis-server postfix dovecot opendkim >/dev/null 2>&1 || true
systemctl reload nginx || systemctl restart nginx

log "bootstrap complete"

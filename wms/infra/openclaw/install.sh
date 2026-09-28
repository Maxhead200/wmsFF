#!/usr/bin/env bash
# FIX: additive, pinned installation on our server; no WMS restart or secret output.
set -euo pipefail
[[ ${EUID} -eq 0 ]] || { echo 'Run as root on our WMS server.' >&2; exit 1; }
docker inspect infra-api-1 >/dev/null
docker inspect infra-web-1 >/dev/null
[[ $(uname -m) == x86_64 ]] || { echo 'Only verified linux-x64 runtime is supported.' >&2; exit 1; }
available=$(df --output=avail -B1 /opt | tail -1)
(( available > 5368709120 )) || { echo 'At least 5 GiB free space is required.' >&2; exit 1; }
base=/opt/wms-openclaw
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
install -d -m 0755 "$base" "$base/app" "$base/downloads"
if [[ ! -x "$base/node/bin/node" ]]; then
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 https://nodejs.org/dist/v24.19.0/node-v24.19.0-linux-x64.tar.xz -o "$base/downloads/node-v24.19.0-linux-x64.tar.xz"
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 https://nodejs.org/dist/v24.19.0/SHASUMS256.txt -o "$base/downloads/SHASUMS256.txt"
  (cd "$base/downloads" && awk '$2 == "node-v24.19.0-linux-x64.tar.xz" {print}' SHASUMS256.txt | sha256sum --check --strict)
  tar -xJf "$base/downloads/node-v24.19.0-linux-x64.tar.xz" -C "$base"
  ln -s "$base/node-v24.19.0-linux-x64" "$base/node"
fi
[[ $("$base/node/bin/node" --version) == v24.19.0 ]] || { echo 'Unexpected Node version.' >&2; exit 1; }
export PATH="$base/node/bin:$PATH"
[[ -e "$base/app/package.json" ]] || printf '{"name":"our-wms-openclaw-runtime","private":true,"allowScripts":{"openclaw":true}}\n' > "$base/app/package.json"
npm install --prefix "$base/app" --save-exact openclaw@2026.9.6 --no-audit --no-fund
id wms-openclaw >/dev/null 2>&1 || useradd --system --home-dir /var/lib/wms-openclaw --create-home --shell /bin/bash wms-openclaw
# Docker access intentionally permits maintenance of our server, as requested by Konstantin.
usermod --append --groups docker wms-openclaw
install -d -o wms-openclaw -g wms-openclaw -m 0700 /var/lib/wms-openclaw/state /var/lib/wms-openclaw/workspace
install -d -o root -g wms-openclaw -m 0750 /etc/wms-openclaw
[[ ! -e /etc/wms-openclaw/openclaw.json ]] || { echo 'Existing config found; refuse overwrite.' >&2; exit 1; }
install -o root -g wms-openclaw -m 0640 "$source_dir/openclaw.json" /etc/wms-openclaw/openclaw.json
install -o wms-openclaw -g wms-openclaw -m 0600 "$source_dir/AGENTS.md" /var/lib/wms-openclaw/workspace/AGENTS.md
umask 077
if [[ ! -e /etc/wms-openclaw/gateway.env ]]; then
  printf 'OPENCLAW_GATEWAY_TOKEN=%s\n' "$(openssl rand -hex 32)" > /etc/wms-openclaw/gateway.env
fi
[[ -e /etc/wms-openclaw/provider.env ]] || printf '# Configure OpenAI API key using configure-openai.sh\n' > /etc/wms-openclaw/provider.env
install -o root -g root -m 0700 "$source_dir/configure-openai.sh" "$base/configure-openai.sh"
install -o root -g root -m 0644 "$source_dir/wms-openclaw.service" /etc/systemd/system/wms-openclaw.service
systemctl daemon-reload
"$base/node/bin/node" "$base/app/node_modules/openclaw/openclaw.mjs" --version
echo 'Installed. Gateway remains stopped until provider configuration and verification.'

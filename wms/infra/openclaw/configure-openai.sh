#!/usr/bin/env bash
# FIX: enter the provider key interactively on the server; never in chat or argv.
set -euo pipefail
[[ ${EUID} -eq 0 && -t 0 ]] || { echo 'Run as root in an interactive server terminal.' >&2; exit 1; }
set +x
umask 077
read -r -s -p 'OpenAI API key (hidden): ' task_openai_key
printf '\n'
[[ $task_openai_key =~ ^sk-[A-Za-z0-9_-]{20,}$ ]] || { unset task_openai_key; echo 'Invalid key format.' >&2; exit 1; }
task_temp=$(mktemp /etc/wms-openclaw/provider.env.XXXXXX)
trap 'rm -f -- "$task_temp"; unset task_openai_key' EXIT
printf 'OPENAI_API_KEY=%s\n' "$task_openai_key" > "$task_temp"
unset task_openai_key
chmod 0600 "$task_temp"
mv -- "$task_temp" /etc/wms-openclaw/provider.env
echo 'Key saved privately. No service has been started or restarted.'

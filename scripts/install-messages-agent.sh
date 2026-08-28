#!/bin/zsh
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  print -u2 "messages-agent 只能安装在 macOS。"
  exit 1
fi
if [[ -z "${MASSAGE_NOTE_API_URL:-}" || -z "${MASSAGE_NOTE_AGENT_TOKEN:-}" ]]; then
  print -u2 "请设置 MASSAGE_NOTE_API_URL 和 MASSAGE_NOTE_AGENT_TOKEN 后重试。"
  exit 1
fi

script_dir="${0:A:h}"
repo_dir="${script_dir:h}"
node_bin="$(command -v node || true)"
pnpm_bin="$(command -v pnpm || true)"
if [[ -z "$node_bin" || -z "$pnpm_bin" ]]; then
  print -u2 "需要先安装 Node.js 24 和 pnpm。"
  exit 1
fi

agent_dir="$HOME/Library/Application Support/Massage Note Messages Agent"
launch_agents_dir="$HOME/Library/LaunchAgents"
plist_path="$launch_agents_dir/com.massagenote.messages-agent.plist"
config_path="$agent_dir/agent.env"
label="com.massagenote.messages-agent"

"$pnpm_bin" --dir "$repo_dir" --filter @massage-note/messages-agent build
mkdir -p "$agent_dir/app" "$launch_agents_dir"
chmod 700 "$agent_dir"
ditto "$repo_dir/apps/messages-agent/dist" "$agent_dir/app"

printf 'export MASSAGE_NOTE_API_URL=%q\nexport MASSAGE_NOTE_AGENT_TOKEN=%q\nexport MASSAGE_NOTE_AGENT_DATA_DIR=%q\n' \
  "$MASSAGE_NOTE_API_URL" "$MASSAGE_NOTE_AGENT_TOKEN" "$agent_dir" > "$config_path"
chmod 600 "$config_path"

print "正在前台检查‘信息’登录状态与 macOS 自动化权限…"
MASSAGE_NOTE_AGENT_DATA_DIR="$agent_dir" "$node_bin" "$agent_dir/app/index.js" --diagnose

cat > "$plist_path" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key><array><string>/bin/zsh</string><string>-lc</string><string>source '$config_path'; exec '$node_bin' '$agent_dir/app/index.js'</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$agent_dir/agent.log</string>
  <key>StandardErrorPath</key><string>$agent_dir/agent-error.log</string>
</dict></plist>
PLIST
chmod 600 "$plist_path"

launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
for attempt in {1..25}; do
  if ! launchctl print "gui/$(id -u)/$label" >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done
if launchctl print "gui/$(id -u)/$label" >/dev/null 2>&1; then
  print -u2 "旧 Messages Agent 尚未完全停止，请稍后重试。"
  exit 1
fi
launchctl bootstrap "gui/$(id -u)" "$plist_path"
launchctl kickstart -k "gui/$(id -u)/$label"

print "已安装并启动 Massage Note Messages Agent。"
print "‘信息’自动化权限与可用服务已经通过前台检查。"
print "日志：$agent_dir/agent-error.log"

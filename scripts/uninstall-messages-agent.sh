#!/bin/zsh
set -euo pipefail

label="com.massagenote.messages-agent"
plist_path="$HOME/Library/LaunchAgents/$label.plist"
launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
if [[ -f "$plist_path" ]]; then
  mv "$plist_path" "$HOME/.Trash/$label.plist.$(date +%s)"
fi
print "代理已停止，LaunchAgent 配置已移到废纸篓。发送日志仍保留在 Application Support。"

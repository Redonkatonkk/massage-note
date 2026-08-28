#!/bin/zsh
set -euo pipefail

label="com.massagenote.messages-agent"
plist_path="$HOME/Library/LaunchAgents/$label.plist"
stager_app="$HOME/Applications/Massage Note Attachment Stager.app"
launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
if [[ -f "$plist_path" ]]; then
  mv "$plist_path" "$HOME/.Trash/$label.plist.$(date +%s)"
fi
if [[ -d "$stager_app" ]]; then
  mv "$stager_app" "$HOME/.Trash/Massage Note Attachment Stager.$(date +%s).app"
fi
tccutil reset SystemPolicyAllFiles com.massagenote.messages-stager >/dev/null 2>&1 || true
print "代理已停止，LaunchAgent 配置与附件暂存 App 已移到废纸篓。发送日志和 Messages 已发送附件仍保留。"

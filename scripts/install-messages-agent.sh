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
user_apps_dir="$HOME/Applications"
stager_app="$user_apps_dir/Massage Note Attachment Stager.app"
stager_bin="$stager_app/Contents/MacOS/MassageNoteAttachmentStager"
stager_source="$repo_dir/apps/messages-agent/macos/AttachmentStager.swift"
stager_hash_path="$agent_dir/stager-source.sha256"
label="com.massagenote.messages-agent"

"$pnpm_bin" --dir "$repo_dir" --filter @massage-note/messages-agent build
mkdir -p "$agent_dir/app" "$launch_agents_dir"
chmod 700 "$agent_dir"
ditto "$repo_dir/apps/messages-agent/dist" "$agent_dir/app"

stager_source_hash="$(/usr/bin/shasum -a 256 "$stager_source" | /usr/bin/awk '{print $1}')"
installed_stager_hash="$(cat "$stager_hash_path" 2>/dev/null || true)"
if [[ ! -x "$stager_bin" || "$installed_stager_hash" != "$stager_source_hash" ]] || \
   ! codesign --verify --deep --strict "$stager_app" >/dev/null 2>&1; then
  mkdir -p "$stager_app/Contents/MacOS"
  xcrun swiftc -O \
    -framework Foundation \
    "$stager_source" \
    -o "$stager_bin"
  cat > "$stager_app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleExecutable</key><string>MassageNoteAttachmentStager</string>
  <key>CFBundleIdentifier</key><string>com.massagenote.messages-stager</string>
  <key>CFBundleName</key><string>Massage Note Attachment Stager</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.12.28</string>
  <key>LSUIElement</key><true/>
</dict></plist>
PLIST
  codesign --force --sign - --identifier com.massagenote.messages-stager "$stager_app"
  printf '%s\n' "$stager_source_hash" > "$stager_hash_path"
  chmod 600 "$stager_hash_path"
fi

printf 'export MASSAGE_NOTE_API_URL=%q\nexport MASSAGE_NOTE_AGENT_TOKEN=%q\nexport MASSAGE_NOTE_AGENT_DATA_DIR=%q\nexport MASSAGE_NOTE_MESSAGES_STAGER=%q\n' \
  "$MASSAGE_NOTE_API_URL" "$MASSAGE_NOTE_AGENT_TOKEN" "$agent_dir" "$stager_bin" > "$config_path"
chmod 600 "$config_path"

print "正在前台检查‘信息’登录状态与 macOS 自动化权限…"
if ! "$stager_bin" --diagnose; then
  print -u2 "附件暂存程序还不能写入 Messages 的受保护附件目录。"
  print -u2 "请在‘系统设置 → 隐私与安全性 → 完全磁盘访问权限’中添加并开启："
  print -u2 "$stager_app"
  print -u2 "完成后重新运行本安装脚本。该程序不读取聊天数据库，也不控制任何界面。"
  exit 2
fi
MASSAGE_NOTE_AGENT_DATA_DIR="$agent_dir" MASSAGE_NOTE_MESSAGES_STAGER="$stager_bin" \
  "$node_bin" "$agent_dir/app/index.js" --diagnose

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
print "‘信息’自动化权限、可用服务与后台附件暂存已经通过检查。"
print "附件暂存程序：$stager_app"
print "日志：$agent_dir/agent-error.log"

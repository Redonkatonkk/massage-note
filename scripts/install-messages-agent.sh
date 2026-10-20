#!/bin/zsh
set -euo pipefail

start_agent=1
if [[ "${1:-}" == "--no-start" && "$#" == 1 ]]; then
  start_agent=0
elif [[ "$#" != 0 ]]; then
  print -u2 "用法：$0 [--no-start]"
  exit 1
fi

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
monitor_source="$repo_dir/apps/messages-agent/macos/MessagesDeliveryState.swift"
stager_hash_path="$agent_dir/stager-source.sha256"
stager_script="$agent_dir/app/dist/messages.js"
label="com.massagenote.messages-agent"

"$pnpm_bin" --dir "$repo_dir" --filter @massage-note/messages-agent... build
mkdir -p "$agent_dir" "$launch_agents_dir"
chmod 700 "$agent_dir"
# Never replace runtime files while an older process can still claim/send jobs.
launchctl disable "gui/$(id -u)/$label"
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
"$pnpm_bin" --dir "$repo_dir" --filter @massage-note/messages-agent deploy --prod --legacy --force "$agent_dir/app"
# Legacy deploy temporarily marks the shared workspace node_modules as production-only.
# Restore the lockfile-defined development links so installing the agent never breaks the checkout.
"$pnpm_bin" --dir "$repo_dir" install --frozen-lockfile

stager_source_hash="$(cat "$stager_source" "$monitor_source" "$stager_script" | /usr/bin/shasum -a 256 | /usr/bin/awk '{print $1}')"
installed_stager_hash="$(cat "$stager_hash_path" 2>/dev/null || true)"
if [[ ! -x "$stager_bin" || "$installed_stager_hash" != "$stager_source_hash" ]] || \
   ! codesign --verify --deep --strict "$stager_app" >/dev/null 2>&1; then
  mkdir -p "$stager_app/Contents/MacOS" "$stager_app/Contents/Resources"
  stager_build_dir="$(mktemp -d /tmp/massage-note-stager-build.XXXXXX)"
  trap 'rm -rf "$stager_build_dir"' EXIT
  cp "$stager_source" "$stager_build_dir/main.swift"
  xcrun swiftc -O \
    -framework Foundation \
    -framework Carbon \
    -lsqlite3 \
    "$monitor_source" "$stager_build_dir/main.swift" \
    -o "$stager_bin"
  rm -rf "$stager_build_dir"
  trap - EXIT
  "$node_bin" --input-type=module - "$stager_script" "$stager_app/Contents/Resources/messages.applescript" <<'JS'
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const { messagesAttachmentScript } = await import(pathToFileURL(process.argv[2]).href);
await writeFile(process.argv[3], messagesAttachmentScript, { mode: 0o600 });
JS
  cat > "$stager_app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleExecutable</key><string>MassageNoteAttachmentStager</string>
  <key>CFBundleIdentifier</key><string>com.massagenote.messages-stager</string>
  <key>CFBundleName</key><string>Massage Note Attachment Stager</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.12.48</string>
  <key>LSUIElement</key><true/>
  <key>NSAppleEventsUsageDescription</key><string>Send approved Massage Note attachments through Messages.</string>
</dict></plist>
PLIST
  codesign --force --sign - --identifier com.massagenote.messages-stager "$stager_app"
  printf '%s\n' "$stager_source_hash" > "$stager_hash_path"
  chmod 600 "$stager_hash_path"
fi

printf 'export MASSAGE_NOTE_API_URL=%q\nexport MASSAGE_NOTE_AGENT_TOKEN=%q\nexport MASSAGE_NOTE_AGENT_DATA_DIR=%q\nexport MASSAGE_NOTE_MESSAGES_STAGER_APP=%q\n' \
  "$MASSAGE_NOTE_API_URL" "$MASSAGE_NOTE_AGENT_TOKEN" "$agent_dir" "$stager_app" > "$config_path"
chmod 600 "$config_path"

print "正在前台检查‘信息’登录状态与 macOS 自动化权限…"
if ! MASSAGE_NOTE_AGENT_DATA_DIR="$agent_dir" MASSAGE_NOTE_MESSAGES_STAGER_APP="$stager_app" \
  "$node_bin" "$agent_dir/app/dist/index.js" --diagnose; then
  print -u2 "附件 App 的受保护文件读取或 Messages 自动化检查未通过。"
  print -u2 "请在‘系统设置 → 隐私与安全性 → 完全磁盘访问权限’中添加并开启："
  print -u2 "$stager_app"
  print -u2 "若已经开启，请关闭再开启该 App 的完全磁盘访问权限，并允许它自动化控制 Messages。"
  print -u2 "完成后重新运行本安装脚本。该程序仅查询本次任务的发送状态元数据，不控制任何界面。"
  exit 2
fi

cat > "$plist_path" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key><array><string>/bin/zsh</string><string>-lc</string><string>source '$config_path'; exec '$node_bin' '$agent_dir/app/dist/index.js'</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$agent_dir/agent.log</string>
  <key>StandardErrorPath</key><string>$agent_dir/agent-error.log</string>
</dict></plist>
PLIST
chmod 600 "$plist_path"

if [[ "$start_agent" == 0 ]]; then
  print "已更新并验证 Massage Note Messages Agent，发送服务保持停止。"
  exit 0
fi
launchctl enable "gui/$(id -u)/$label"
launchctl bootstrap "gui/$(id -u)" "$plist_path"
launchctl kickstart -k "gui/$(id -u)/$label"

print "已安装并启动 Massage Note Messages Agent。"
print "‘信息’自动化权限、可用服务与后台附件暂存已经通过检查。"
print "附件暂存程序：$stager_app"
print "日志：$agent_dir/agent-error.log"

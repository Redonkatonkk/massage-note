# Mac“信息”发送代理

本文是固定 Mac 上“信息”发送代理的唯一安装与排障手册。NAS 只保存发送任务并提供 HTTPS API；本地 LaunchAgent 主动领取任务，再调用本机“信息”App。通用监控、数据库备份和恢复见 [`OPERATIONS.md`](OPERATIONS.md)，安全边界见 [`SECURITY.md`](SECURITY.md)。

## 发送内容与运行边界

| 任务类型 | 附件 | 路由要求 |
| --- | --- | --- |
| 个人日结 | 一张中英文 PNG，不附带重复文字气泡 | iMessage、RCS 或 SMS/MMS |
| 员工区间结算 | 摘要 PNG，再发送逐笔多页 PDF | PNG 可走 iMessage、RCS 或 SMS/MMS；PDF 只走 iMessage 或 RCS |

- 代理不开放入站端口，只向 API 发起出站 HTTPS 请求；NAS 不需要连接或控制 Mac。
- 固定 Mac 必须保持对应 macOS 用户登录。锁屏不影响运行，退出该用户会停止 LaunchAgent。
- 代理不模拟键盘、不使用剪贴板或相册、不激活“信息”窗口，也不读写聊天数据库。
- AppleScript 返回只表示“信息”接受了发送指令，不等于运营商已经送达；结果不明确时不得自动重发。

## 安装前准备

1. 安装 Node.js 24 LTS 和仓库声明的 pnpm 版本，确认新的登录 shell 中 `node --version`、`pnpm --version` 可用。LaunchAgent 不应依赖 Codex、IDE 或临时缓存目录里的 Node。
2. 登录目标 Mac 的“信息”App。向非 Apple 号码发送图片时，同 Apple 账户的 iPhone 还需开启短信转发，并由运营商支持 MMS/RCS。
3. 在生产“店铺设置 → Mac 信息代理”生成店铺级令牌。令牌只显示一次，安装后只保存在当前用户的 `~/Library/Application Support/Massage Note Messages Agent/agent.env`，权限必须为 `0600`。

## 安装

在已登录“信息”的目标 macOS 桌面用户会话中运行：

```bash
MASSAGE_NOTE_API_URL='https://<production-domain>/api/v1' \
MASSAGE_NOTE_AGENT_TOKEN='<设置页生成的令牌>' \
./scripts/install-messages-agent.sh
```

首次运行会安装无界面的 `~/Applications/Massage Note Attachment Stager.app`。若脚本以状态 2 停止：

1. 打开“系统设置 → 隐私与安全性 → 完全磁盘访问权限”。
2. 只添加并开启 `Massage Note Attachment Stager.app`，不要给 Node、终端或“信息”整体授予更宽权限。
3. 用相同命令重新运行安装脚本；系统询问自动化权限时，允许 Node/终端控制“信息”。

安装脚本通过 LaunchServices 以这个 App 的身份验证 Messages 附件目录的“分片/任务”两级探针。不能把 `Contents/MacOS` 二进制直接作为 LaunchAgent 子进程执行；macOS 26 会把这种访问归因给后台 Node，使 App 的完全磁盘访问权限失效。

脚本用源码 SHA-256 识别暂存程序。代码未变时会保留现有二进制和签名，避免 macOS 撤销权限；只在首次安装或源码变化时重建签名。若升级后权限失效，关闭再开启该 App 的完全磁盘访问权限，然后重跑安装。

## 安装后验证

```bash
launchctl print "gui/$(id -u)/com.massagenote.messages-agent"
stat -f '%Lp %Su' "$HOME/Library/Application Support/Massage Note Messages Agent/agent.env"
tail -n 50 "$HOME/Library/Application Support/Massage Note Messages Agent/agent-error.log"
```

正常结果是 LaunchAgent `state = running`、配置权限 `600`，且店铺设置显示代理最近在线。重复安装时，脚本会等待 `bootout` 的旧服务注册完全消失后再调用 `bootstrap`；不要把偶发的 `Bootstrap failed: 5` 当成 Messages 权限问题。

## 附件暂存与重试

代理先把附件以 `0600` 权限写入 `~/Library/Application Support/Massage Note Messages Agent/outbox`。暂存 App 验证源路径、任务 UUID、固定文件名和 PNG/PDF 文件头，再写入：

```text
~/Library/Messages/Attachments/MassageNote/<前两位>/<任务 UUID>/
```

同一任务已有不同内容时拒绝覆盖。App 只在 `stager-results/<任务 UUID>.json` 返回成功或失败；代理读取后立即删除结果文件，并核对返回路径必须精确等于该任务目标。没有明确成功结果时绝不调用“信息”。

区间结算的 PNG 与 PDF 分别记录完成检查点，重试只发送未完成的附件。代理串行处理队列，发送脚本额外保留 15 秒让“信息”接管附件；源 outbox 保留 30 分钟后清理，正式附件交由“信息”管理。

## 路由规则

数据库、权限和审计始终保存 E.164 号码。对 `+1` 号码，交给“信息”时转换为十位本地号码：

- PNG 优先交给已连接的 SMS 账户，由配对 iPhone 升级为 RCS 或发送 SMS/MMS；没有 SMS 时再回退到 RCS/iMessage。
- PDF 只使用 iMessage 或 RCS 数据通道，不走 SMS/MMS。
- “本机有 iMessage 账号”不代表收件号码已注册 iMessage，不能据此单独判断路由。
- 真实设备日志出现 `RCS Relay received message delivered` 才是 RCS 送达回执。

## 故障速查

| 现象 | 优先检查 |
| --- | --- |
| 队列显示“排队、尝试 0” | LaunchAgent 状态、API URL、令牌和网络 |
| 尝试数增加但失败 | 页面队列详情和本地 `agent-error.log` |
| 安装诊断失败 | “信息”登录、自动化权限、暂存 App 的完全磁盘访问权限、可用的 iMessage/RCS/SMS 服务 |
| `argv 未定义` | AppleScript 必须用 `on run argv` 接收 `osascript -e ... -- <参数>` |
| macOS 26 账户枚举报 `-10000` | 逐账户读取 `service type` 时必须各自包在 `try` 内，忽略无法转换的额外账户类型 |
| PNG 显示 `0 KB / 原大小`，或出现 `fileTransfer rejected error 30`、`IMFileTransfer error 15` | 确认交给 AppleScript 的路径位于 Messages 专用附件目录，再运行暂存程序 `--diagnose` |
| 非 Apple 号码图片失败 | iPhone 短信转发、运营商 MMS/RCS 和已连接 SMS 账户 |
| PDF 无法发送 | 收件人是否可通过 iMessage 或 RCS 接收；PDF 不回退 SMS/MMS |

遇到附件读取问题时，不要改用模拟键盘、剪贴板粘贴、相册最近项、复制私有 `com.apple.macl` 属性，或操作 Messages/Photos 数据库。正式代理不需要“辅助功能”权限。

正式代理完全不使用系统“照片”。若诊断时临时用相册作对照，必须保存 `Photos import` 返回的唯一 `media item id`，后续定位、复制和删除都按该 ID 且要求恰好匹配一项；不得按导入时间、排序位置或“最近项目”猜测目标。

## 卸载

```bash
./scripts/uninstall-messages-agent.sh
```

卸载后应确认 LaunchAgent 已消失。若不再使用该 Mac，还应在店铺设置中轮换或撤销代理令牌。

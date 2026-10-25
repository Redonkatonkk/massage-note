<a id="langbot-记工机器人"></a>

# LangBot work record robot

**English** | **[简体中文](LANGBOT_WORK_BOT.zh-CN.md)**

The current plug-in is **1.4.1**, and complete capabilities require API **at least 1.7.0** and protocol 2; the current version of the application is subject to the root directory `VERSION`. Reason: The plug-in installation package version is independent of the application. Protocol 2 and multi-player intent require corresponding back-end support.

After adding the @bot in the group, each message is combined with the store’s real-time catalog and natural language description and handed over to the model for understanding. Final writes, permissions and queries are performed by the Massage Note backend, with the database being the only source of amounts.

The Work bot settings page follows the app’s Chinese/English language selection, including group/member counts, activity labels, input hints, confirmation prompts, and timestamps. Store instructions, employee identities, original group messages, and bot replies retain their original content. Binding examples retain the actual Chinese commands, with translated placeholders. Reason: interface language must not rewrite business instructions or message history.

<a id="记工与查询"></a>

## Work record and query

| Example | Behavior |
| --- | --- |
| `绑定店铺 123456`, `绑定 Lily` | Bind group and WeChat identities; name recognition itself does not grant historical financial access |
| `Lily 大力 60` | Work for Lily, the same store, using catalog prices and commissions |
| `Lily 下了, 收 75/15卡, 评论` | Actual service fee $75, credit card tips $15, add configuration review discount; keep the original price of the project |
| `Lily 加热石`, `Lily 加评论折扣` | Add configuration items to the only pending payment record. Repeated additions of the same preset items will not overlap. |
| `Lily 移除热石`, `Lily 取消评论折扣` | Remove existing add-on or discount, deactivated catalog items can still be removed by snapshot name |
| `Lily 高亮`, `Lily 取消高亮` | Set or cancel highlight; affect the original card processing fee rules of the web page |
| `最近 15 天的折后大费都是多少?给我列表` | Query based on store business day, including current business day, default paid records, transaction list and full range total |
| `最近 15 天折后大费按天汇总` | Summarized by business day; also summarized by employee |
| `查询 Lily 最近 15 天折后大费, 第 2 页` | Employee filtering and paging; 20 entries per page, no silent truncation |
| `查询今天待付款记工`, `查询最近 15 天高亮记录` | Filter by payment status, highlight; deleted records can be queried to obtain recovery numbers |
| `高亮 <完整记录编号>` | Precisely operate specified records, including paid work records |
| `修改 <完整记录编号> 原价 90, 现金大费 30, 卡大费 60, 卡小费 10` | Atomic modification project original price and mixed payment; gift card payment must specify the serial number |
| `删除 <完整记录编号>`, `恢复 <完整记录编号>` | soft deletion or recovery; daily closing lock and historical permissions continue to take effect |

The actual receipt and tips are displayed in the response after work is completed; the highlight status is displayed only when highlighted, and the item amount is equal to the hidden item amount when actual receipt. When receivables (project amount + add-on - discount, excluding tips) are inconsistent with actual receipts, indicate the receivables and under/overcharge differences; only display the corresponding amount and name when there is an add-on or discount, and do not display the number and post-discount service fee. The query list still provides the complete number and discounted service fee. "Service fee after discount" is the main item plus add-on minus the discount. The discount does not reduce the employee's service commission. No records will be guessed when the configuration is unknown, there are multiple pending payment records or key information is missing; you can check the list first to get the complete number. Reason: Actual receipts, receivables, and salary definitions are different, and the complete number is used to eliminate operational ambiguity in multiple records.

Editing by number also supports employees, projects, duration, notes, automatic discount switches, manual settlement marks, custom discounts/add-ons and commissions. Custom amounts must be provided explicitly in the message; modifications to the complete add-on/discount list will replace the original list, and individual items can be added or removed using the simple commands above. Start/end time modification and historical supplementary recording require clear ISO time with time zone, such as `2026-09-08T14:00:00-04:00`. Supplementary recording can specify preset projects or provide fully customized project names, duration and amounts. Only supports the business capabilities of existing web pages and does not support arbitrary SQL or bypass daily closing. Reason: The semantics of complete replacement are different from single additions and deletions. Clarifying the time and original amount can avoid mistakenly modifying historical accounts.

The query covers up to 366 business day periods. Ordinary employees can only query their personal financial history, while managers and store owners can query the entire store. The total in paginated replies always covers the complete filtering range; long pages are split into multiple WeChat replies. When turning pages, you need to repeat the query range and indicate the page number. Reason: Limit query load, protect employee privacy, and keep pagination totals consistent with actual filtering.

<a id="核实身份并开启数据访问"></a>

## Verify identity and enable data access

1. Complete binding within the group.
2. The store owner or manager logs in to the web page → Store Management → Work Record Robot → Bind the WeChat group and check the WeChat senderId and the employee himself.
3. Click "Verify identity and enable data access". The query results will be sent to the WeChat group.

Reason: Only by binding first and then verifying can the real WeChat identity be associated with the current store member and his or her actual role.

Before verification, only ordinary employee-level work records of the day are allowed. History editing and financial query permissions cannot be obtained by claiming the name of the manager. After verification, the current role of the member will still prevail; managers or store owners who have not participated in the service can also bind and check accounts. Switching the binding identity cancels verification, and replaying old queries after closing data access will also re-authenticate. Reason: Name recognition is not an identity credential, and replaying historical messages after revoking permissions cannot bypass authentication.

<a id="组件与接口"></a>

## Components and Interfaces

- Plug-in: `integrations/langbot-plugin`, event component `components/events/work_bot.py`.
- Contract: `packages/contracts/src/work-bot.ts`. Backend intents are BIND_STORE, BIND_MEMBER, START, FINISH, ADJUST, QUERY, MANAGE, HELP, BATCH; CLARIFY is only handled within the plugin.
- Backend: `apps/api/src/work-bot`. Complex writing uses the internal binding identity adapter and reuses `WorkRecordsService`; WeChat sources and membership identities are also audited.
- Management UI: `apps/web/app/manage/work-bot-panel.tsx`.
- `POST /api/v1/integrations/langbot/work-context`: Returns `protocolVersion: 2`, store business day/timezone, description, live directory, employees and intent JSON Schema. The model does not hold database connection information.
- `POST /api/v1/integrations/langbot/work-events`: Verify integration token and `Idempotency-Key: wechatpad:<bot-id>:<message-id>`, execute structured query or work record. Repeatedly writing the message will return the original result; the same number but different content will be rejected.
- `PATCH /api/v1/stores/:storeId/work-bot/members/:bindingId/verification`: The logged-in administrator submits `{version, verified}` to verify or revoke the WeChat identity, with version verification and auditing.

<a id="部署"></a>

## Deploy

Upgrade APIs that meet the current minimum requirements and apply any existing migrations before building and installing the current plugin. The configuration fields, packaging and verification commands are subject to the [Plug-in Development Guide](../../integrations/langbot-plugin/DEVELOPMENT.md) and the Chinese and English instructions included with the package. Reason: Just installing the old plugin or just updating the API does not mean that the full functionality is online; the old step-by-step upgrade steps no longer apply to the current installation.

Keep the work record turnover line only triggered by @ group messages, and the dedicated robot and plug-in configuration remain unchanged. The new version of the plug-in checks the backend protocol to avoid mistakenly connecting to the old version of the API. After installation, check the `mounted` and `initialized` logs, and enable the real WeChat identity that needs to be audited on the management page. Reason: The plug-in listener will not judge by itself, and the turnover line is required to limit the handoff scope; protocol and identity checks prevent mistaken connections to old services or wrong accounts.

Verification covers amount and payment definition, permissions and revocation, business day and daylight saving time, paging, discount/add-on, highlight, atomic hybrid payment, failure rollback, soft deletion recovery, duplicate events and concurrent work.

 The highlight operation can be directly said `高亮`, `取消高亮`(use sender to bind employee), or `Lily 高亮`, `Lily 取消高亮`.`去掉高亮`, `移除高亮`, `关闭高亮`, `不高亮`, `unhighlight` All indicate cancellation. Please use the complete record number for paid records; without a number, only the unique record to be paid will be operated. Highlight/cancel highlight can also be included during off-duty time. The model must retain negative words; questions or ambiguous expressions such as "don't cancel highlight" are not included in the account. Reason: Back-end original text verification relies on complete action evidence, and omitting negative words will reverse user instructions.

<a id="店铺默认时长与解析失败"></a>

## Store default duration and parsing failure

When the store description stipulates that "Defensively refers to Deep Tissue Massage; if the duration is not mentioned, the default is 60 minutes",`@Jeunesse jessica 上工 大力` Should be mapped to the corresponding projects in the catalog, Jessica and 60 Minutes. Default duration of use `durationSource=SKILL`, do not fabricate evidence of the duration of the original text; explicit duration takes precedence. Employees, items, and price brackets must still exist in the current store. The backend retains evidence of @employees' names. Reason: Only the store configuration can authorize the default duration, explicit user input and live catalogs still take precedence.

Each message still reads the current store description. When it is resolved to HELP for the first time and the store has a description, or the structure is unqualified, the plug-in will be reviewed at most once; if there is still ambiguity after review, HELP will be maintained. Twice the structure is unqualified and an error is clearly reported; the back-end original text evidence does not match and returns `INTENT_EVIDENCE_REJECTED`, indicating that there is no accounting this time. Review adds at most one model call. Reason: Limit the number of reviews and explicitly not write accounts when failures occur to avoid infinite retries or incomplete parsing.

<a id="源码与安装包"></a>

## Source code and installation package

For the plug-in directory, testing and packaging commands, see [Plug-in Development Guide](../../integrations/langbot-plugin/DEVELOPMENT.md). The running version is subject to the installed package and log. Reason: Source file modifications will not automatically update the independent plug-in process; historical imported versions are only traced in CHANGELOG.

<a id="上工回复的人员状态"></a>

## Personnel status responded to at work

Add a line after the success content:`空闲: Lily, Anna`. When everyone is busy, change to `全员上工｜最早下工: Lily 15:30 (预计)`;The employees who ended the earliest period are displayed together, with dates attached across local calendar days. Displayed when there is no determinable end time `全员上工｜下工时间待定`.

The scope is limited to members who have joined our store’s today’s work schedule, whose work schedule has not been hidden/removed, who are employed, participated in work records, and whose associated accounts have not been deactivated. WeChat binding is not required. "Today" is determined based on the local natural date of the store at the time when the reply is generated; employees who are not scheduled for today but are only scheduled for other dates will not appear in the idle or earliest off-duty list. Displayed when there are no qualified schedulers today `今日暂无排工`. Reason: The status reply should be consistent with today's board, and unscheduled personnel cannot be counted as available to pick up customers.

The status is based on the time when the reply is generated, including undeleted work records created by web pages and robots. It follows the web page definition: pending payment, which has been started and the estimated end has not yet arrived (or the end time is unknown) is considered busy; when it is expected to arrive, it is considered idle, which does not mean that payment has been received. Multiple ongoing records for the same person will be calculated based on the last end time. Duplicate messages return the previously saved reply. Reason: Personnel status comes from the current schedule and records in the backend and cannot be estimated based on chat memory.

<a id="最近对话记忆"></a>

## Recent conversation memory

Each time the model is called, between the current store system prompt and this user message, the last 5 rounds of user original texts and actual sent robot replies from the same robot, group and sender are attached in chronological order; the parsing review also retains these histories. Concurrent requests from the same sender are processed in sequence, and repeated messages will not add themselves to this context or accumulate repeatedly. On failure, the actual failure/result unconfirmed prompt is recorded, and the model intention is not treated as a accounting success. Reason: Sequential processing and deduplication avoid concurrent conversation threading and do not count unsuccessful model intents as successful.

The memory only exists in the plug-in process memory. It expires after 30 minutes of idle time and is cleared upon restart. Requests with different current store contexts or configurations do not share history, and a maximum of 256 sessions are retained; if any text exceeds 4,000 characters in a round, the entire round will not be saved. Only the text conversations taken over by the plug-in are included, and other chats in the group are not read. Reason: Range isolation and capacity capping prevent cross-store leaks and unbounded memory growth.

History helps understand context, but cannot be used directly as a new operation, amount fact, or authorization. The original text evidence still comes from this message, and historical references such as "he" and "previous transaction" cannot be used to complete the accounting object; help will still be returned when necessary information is missing. Live catalogs, queries, and backend validations continue to take effect. Reason: History is not evidence of this writing, and new accounts cannot be generated based on past objects or amounts.

<a id="学习记忆"></a>

## Learning memory

Ambiguity and Correction Trigger CLARIFY: State the specific guess first and ask. The user saves the experience after replying "Yes/Yes/Confirm" within 30 minutes; confirmation is only for learning, not accounting, and complete instructions must be sent for operation. Correction will deactivate synchronization experience and wait for re-confirmation. The latest catalog, original text evidence, store configuration and permission verification still take priority, and experience cannot authorize the default duration or payment method. Reason: Pause the error experience first and confirm the explanation to prevent the correction message itself from triggering the error work record.

The memory is persisted using LangBot SDK's get_plugin_storage/set_plugin_storage, isolated by API configuration, storeId, robot, group, sender and binding name; retained across dates and restarts. Each range retains the latest 50 experiences, 30 ununderstood events, and 30 clarification responses (for deduplication). Changing the configuration or binding will switch the memory range. If the storage fails, a prompt will appear and you cannot claim to have remembered it. The backup contains message fragments and should be protected against running data. Reason: Persistent experience contains message fragments, which need to be isolated, limited, and truthfully reported on failure to save.

CLARIFY is only handled by plugins and does not submit to the work record API. Reason: The backend business contract does not accept CLARIFY, confirming that learning cannot be turned into financial writing.

<a id="多人员指令"></a>

## Multiple personnel instructions

`Ling Jessie 上工 大力` It means that Ling and Jessie work separately, sharing clear projects and store default duration. The plug-in recognizes the complete employee name and does not spell multiple people into one name; each person can have different specific projects and durations. The common amount for multiple people off work must be clearly stated as the amount per person. If the total or allocation is unclear, please clarify first. Reason: Full name matching and clear payment allocation avoid missing employees or double-billing totals to each person.

The parsing result uses `{ "kind": "BATCH", "actions": [...] }`, containing 2-10 START, FINISH or ADJUST. Each item must have memberName/memberMention. Employees must not be repeated, nested or with recordId. The original text is verified item by item, and permissions and directories are reviewed item by item; BATCH_COMPLETED will be returned only when all transactions are successful, and all writes will be rolled back if any failure occurs. Message-level idempotency saves the merged reply, and resending the original message will not be executed again. Reason: Message-level idempotency and same-transaction commit prevent multi-instructions from only partially completing or replaying writes.

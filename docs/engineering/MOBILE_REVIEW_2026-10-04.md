<a id="手机阅读与操作复核"></a>

# Mobile phone reading and operation review

**English** | **[简体中文](MOBILE_REVIEW_2026-10-04.zh-CN.md)**

Date: 2026-10-04 (America/New_York) · Version: `1.18.6`

This round covers all 8 routes and their partitions, focusing on checking the reading order, field correspondence, long content and operation location of low-frequency pages. According to user agreement, only the source code, DOM, CSS cascading and automated interaction of real React components are checked without opening the browser. This recording is not a substitute for visual, soft keyboard, or user usability testing on a real device.

<a id="页面逐项记录"></a>

## Page itemized records

| Entrance | Mobile reading and operation structure | Results of this round |
| --- | --- | --- |
| Today's work record, historical work record | Date → Summary → Employees and work record → Auxiliary operations; highlight remains uniform gray-green. | Review the empty status, the four combinations of selling cards/walkouts, editing work records, employee selection and weekly work scheduling. The scheduling matrix retains independent cross slides and prompts. |
| Financial Summary | Filter → Key Summary → Daily Comparison → Employee Subtotal. | The cross-day comparison table retains the horizontal sliding and fixed first columns; the original 21 columns of the composition details are changed to vertical records on the phone. Guest payments, selected employee income and mixed payment prompts are first displayed, and then the amount composition is expanded. |
| Operational Analysis | Scope → Legend and Trends → Period → Weekly Distribution. | The phone chart text and heat table text are changed to 14px, the touch area of the heat unit is at least 44×44px, and the day of the week label is fixed. Charts slide across their respective containers. |
| Expenses | Month → Monthly total/budget → Expenses for the month → Project rules. | The details are changed to vertical records, clearly distinguishing this month's apportionment from the entire period's amount, the nature of the budget and the coverage date are continuously visible; periodic editing operations and cancellation confirmations are retained, and the closed entry at the top of the long editing form is fixed. |
| daily closing and cash | business day → exception → employee salary/cash → closing operation. | The original 12-column checklist is changed to a phone record, which first displays employees, wages due, accounts to be settled, and amounts due/reserved; other components are expanded as needed. Cash continues to match the cash settlement interface by employee ID, with operations disabled when data is missing. |
| daily closing SMS queue | Employee → daily closing times/type → status/number → failure reason → operation. | The original 10 list is changed to phone records; errors are not hidden in the expansion items, and the number of attempts and time are expanded sub-level. Only queued tasks can be canceled, confirmation and busy disable retention. |
| gift card account book | serial number → sales date/status → payment → same card usage record. | Mobile phone vertical records replace wide tables, old card usage records and sales cards are still sorted by serial number, and all write-off details are retained. |
| Salary settlement and ledger | Employee → Date and source → Outstanding/deducted/actual payment → Payment; the ledger is read by employee and interval. | The summary of all sources is no longer squeezed into four columns of about 11px, and is changed to two sets of labeled amounts for service fee / tips; cents and totals are retained. The daily card width is adapted to the narrow screen; the account book first displays actual wages, scope, source and historical modification prompts, and the deleted status is clear. |
| Salary SMS sending record | Employee and section → Attachment progress → Receive number/error → Operation. | The original 8 list is changed to phone records, and cancellation, retry and resending continue to be determined by the original status. |
| Store Settings | Basic Information → Business Rules → Sending Equipment → Permissions and High-Risk Operations. | Review input font size, single column and grouping of fields; maintain separate areas for dangerous operations. |
| Member Management | Roster → Select File → Category Edit → Save. | Review the mobile directory/detail switching, return entrance and long name; existing draft, role, deactivation and version conflict tests continue to be covered. |
| Projects and commissions | Main projects/add-on/discounts → Summary → Expand to edit. | Review long names, multiple duration slots, and button wrapping; use separators to group and single-column editing. |
| work record robot | Terminology → Group → Membership/Work Status → Data Access/Removal → Operational Dynamics. | Identity, status and operation branches, long ID/original message is completely wrapped; delegated identity cannot be opened for access, and cannot be released while the work record is still in progress. |
| Business recycle bin | Employee or card number → business day/item → amount/deletion time/reason → recovery. | The original 8/7 column width table is changed to phone records; the reason for deletion is fully displayed before the restore button. The original confirmation, version, idempotency and daily closing rules are retained. |
| Audit records | Filter → Operator/time/action → Before and after modification → Complete data. | Known fields are changed to Chinese labels, US dollars/percentage and clear Boolean values; before and after modification, in phone column. ID, request number, and full JSON are collapsed by default, and unknown/nested fields remain intact. |
| Profile | Account Summary → Name → Workspace → Password/Logout. | Review single columns, number/language control alignment, and password fields. |
| AI Assistant and Floating Assistant | Example → Message → Preview → Confirm → Enter. | Review the single column, line wrapping of long text, input font size and voice/send button; writing still goes through the original confirmation process. |
| Login, initialization, offline | Current task description → Form/Selection → Main operation. | Review the single column of phones, the same height of number prefixes, initial project editing and return entry. |
| Help | Commonly used work record first → Topic → Step-by-step instructions/amount definition. | Clicking on the topic will open and focus the corresponding description. The text uses 16px and 1.75 line height on phones; the native folding operation is retained. |

<a id="验证依据与边界"></a>

## Verification basis and boundaries

- [Mobile style checker](../../scripts/check-mobile-ui.mjs) checks all routes, 29 representative structures (including quick placeholders and full-card X/delete dialogs added on 2026-10-06), and cascading rules at 320/360/390/414/480/600/760px. Bot, recycle-bin, and heatmap examples are synchronized.
- [Real component reading and operation regression](../../apps/web/app/ui/mobile-reading.test.tsx) Use real component output, covering recovery confirmation/version, salary cents and permissions, send failure and cancellation restrictions, auditing zero/boolean/full data, mixed payments, old card write-off, robot restrictions, cash interface matching, cycle fee editing and help topics. The style of the real DOM also checks the switching between 900px mobile landscape and 1200px desktop display.
- [Member Process Test](../../apps/web/app/manage/members-panel.test.tsx) and [daily closing cash test](../../apps/web/app/finance/closing-employee-table.test.tsx) continue to verify legacy protections. Full web testing, build and version, document linking, and style checking constitute this round of code acceptance.

CSS selects vertical records at 900px and below, and selects comparison tables on the desktop. The hidden copy does not participate in reading and keyboard operations. Both displays share data and operation processing functions. Reason: The item-by-item verification on the phone and the cross-column comparison on the desktop have different information arrangement requirements, and financial sources and business protection must be consistent.

DOM/CSS inspection verifies structure, cascading rules, and interaction protections, but cannot measure final pixel width, actual text cropping, container query sizes, device safe areas, or soft keyboard behavior. Whether the page is easy to use still needs to be evaluated by users on real devices, and it cannot be claimed that visual testing has been completed based on this.

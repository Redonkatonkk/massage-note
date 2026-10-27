# Changelog

**English** | **[简体中文](CHANGELOG.zh-CN.md)**

For version maintenance rules, see [AGENTS.md](AGENTS.md). Reason: This page saves the changes that have occurred, and the version policy is defined in the unified maintenance portal. The entries below are a record of historical changes. Reason: Version traceability and rollback require a complete history, and the behavior descriptions of older versions do not serve as current rules.

## 1.43.0 — 2026-10-27

- After successful quick entry, placeholder confirmation, detailed creation or editing, refresh the record and animate the dialog into its saved board card over 300ms, fading the backdrop and briefly pulsing the destination. Keep submission locked until the motion finishes.
- Respect reduced motion; use a local shrink/fade if the destination is unavailable, bound interrupted animations, and leave failed writes open for correction. Cancellation and deletion keep their existing close behavior.
- NAS requires a Web update; no API contract, database migration or Messages agent changes.

## 1.42.2 — 2026-10-27

- Label the placeholder action Confirm. Selecting Placeholder keeps only Start time and Confirm below the mode switch, with no write until confirmation; verify that the confirmed placeholder uses the adjusted time.
- NAS requires a Web update; no API, database or Messages agent changes.

## 1.42.1 — 2026-10-27

- Tint the entire quick-entry dialog by mode: white for Normal rotation, gray for Placeholder, pale yellow for Exclude from rotation and pale green for Highlight. Fade the surface and capsule over the same distance-based travel duration, continuing from visible colors on rapid changes and switching immediately with reduced motion.
- NAS requires a Web update; no API, database or Messages agent changes.

## 1.42.0 — 2026-10-27

- Add Normal rotation before Placeholder and make all four quick-entry modes mutually exclusive, defaulting to Normal on every opening. Placeholder now reveals Save placeholder instead of writing during mode selection.
- Add a single stretching capsule with a damped spring, distance-based timing, interruption handling, keyboard navigation and reduced-motion support; cover mode payloads and animation behavior with component regressions.
- NAS requires a Web update; no API contract, database migration or Messages agent changes.

## 1.41.1 — 2026-10-27

- Remove the instruction paragraph below quick-entry duration options and its unused English translation.
- NAS requires a Web update; no API, database or Messages agent changes.

## 1.41.0 — 2026-10-27

- Restore a service dropdown between quick-entry start time and duration, defaulting to the first enabled service in Store settings order. Show that service’s durations and save its catalog price/commission snapshots as pending payment; carry the selection into Detailed entry.
- Cover service ordering, switching, unavailable services, placeholders, duplicate-write protection and detailed-entry defaults in component regressions; synchronize bilingual help and documentation.
- NAS requires a Web update; no API contract, database migration or Messages agent changes.

## 1.40.2 — 2026-10-27

- Standardize USD amounts to the $ symbol in both languages across pages, charts, expense totals, shared settlement images and AI answers. Preserve rounding, cents, signs and stored amounts.
- NAS requires Web/API updates; update the independent Mac Messages agent for newly generated settlement and employee-summary attachments. No database migration.

## 1.40.1 — 2026-10-27

- Remove the explanatory note below recorded Cash change amounts; retain explicit +/− signs, cents and the missing-history notice.
- NAS requires a Web update; no API, database or Messages agent changes.

## 1.40.0 — 2026-10-26

- Replace the homepage Gift card total metric after closing with signed Cash change, including cash gift-card sales and expected employee payouts; exclude owner/manager wages and direct cash tips. Freeze the value in closing snapshots, preserve cents, protect store-only data and explain missing legacy values.
- Add Non-highlighted / Highlighted checkboxes below the monthly summary toolbar, both selected by default, and a Search button that applies selections and reloads data even when criteria are unchanged. Require at least one selection.
- Apply the highlight condition consistently to server summaries, three-month comparisons, averages, employee subtotals, details and CSV exports. Preserve manual refresh, retries and stale-response isolation; synchronize bilingual help and documentation.
- NAS requires Web/API updates; no database migration or Messages agent update.

## 1.39.4 — 2026-10-26

- Preserve actual Mac Messages receipts separately from task completion for daily closings, range settlements and employee summaries. Display delivered, sent without confirmation and Mac-reported failure consistently.
- Keep obsolete task errors hidden for legacy submitted records; show subsequent failures only when an actual Mac receipt reports them.
- Recheck recent completed/ambiguous tasks every minute without resending, including manual retries in Messages; keep pending web histories refreshed, isolate attempts and audit changed receipts. Add contract, agent, component and database regressions.
- Requires Web/API deployment, the additive delivery-receipt migration and a separate Mac agent update. Older agents remain compatible and unconfirmed.

## 1.39.3 — 2026-10-26

- Move Close to the right of Detailed entry on the same quick-entry header row; keep the three record flags below. Synchronize bilingual help and layout documentation.
- NAS requires a Web update; no API, database or Messages agent changes.

## 1.39.2 — 2026-10-26

- Restore Close as the last direct button in the original quick-entry action row. Place Detailed entry separately in the header above it, removing the shared vertical wrapper that displaced Close and enlarged the action row.
- Synchronize bilingual design/product documentation and DOM/responsive checks. NAS requires a Web update; no API, database or Messages agent changes.

## 1.39.1 — 2026-10-26

- Allow detail saves without a service when receipts are zero or blank; keep new detailed forms prefilled with 60 minutes. Support an explicit unknown duration through `durationMinutes: null`, preserving null end/duration fields on existing incomplete records.
- Preserve service-free metadata edits and zero-receipt saves without creating a service/price/commission snapshot; positive receipts still require a service. Add focused contract, component and database regressions and synchronize bilingual documentation. NAS requires Web/API updates; no database migration or Messages agent update.

## 1.39.0 — 2026-10-26

- Add Detailed entry directly above Close in quick entry. It opens an unsaved full form with the selected employee, time and flags; closing creates no record. Add an atomic detailed-create endpoint for service, add-ons, discounts, notes and optional payment.
- Treat zero or blank cash/card service fees and tips as pending on detail save, including previously confirmed records; positive gift card receipts still confirm payment. Clear obsolete payment snapshots and derived receipt/income fields when returning to pending, retaining price snapshots, permissions, locks, versions and idempotency.
- Add focused contract, component and database regressions and synchronize bilingual documentation. NAS requires Web/API updates; no database migration or Messages agent update.

## 1.38.0 — 2026-10-26

- Simplify quick entry to all enabled services’ unique durations, sorted by minutes; clicking saves a pending record with only time and duration, without selecting a service, price or commission. Remove the service/custom-service selector and confirmation button; Placeholder also saves immediately.
- Require service selection in record details, retaining the selected duration when supported, then save catalog/custom pricing, commission and optional payment atomically. Show unassigned services and unfilled amounts on the board, finance details, recovery and personal statements.
- Add Enter to save details while preserving notes, composition, control activation, daily closing locks and duplicate-write protection. Add contract, component, image and database regressions and synchronize bilingual documentation. Web/API updates are required; no database migration. Update the Messages agent for unpriced pending-service attachments.

## 1.37.1 — 2026-10-25

- Keep Monthly summary and Business analytics stable while reading: stop automatic report reloads on realtime events, reconnects, foreground recovery and idle timers. Add Refresh actions that update dependent comparisons, averages, subtotals and open analytics details; keep filters, retries and operational finance synchronization.
- Add focused component regressions and synchronize bilingual documentation. No API or database changes; NAS requires a Web update.

## 1.37.0 — 2026-10-25

- Replace payroll source menus with Card/Cash checkboxes, defaulting to Card (including gift cards). Add Service/Tips checkboxes, both selected by default; each group supports one or both options.
- Apply earnings types to server-calculated previews, payment confirmations, payroll edits, calendar balances and image/SMS snapshots. Keep separate service/tip confirmations and older backups compatible.
- Add a forward database migration and focused contract, financial, component and integration regressions. NAS requires a Web/API update and database migration; the Messages agent needs an update for earnings-type labels in attachments.

## 1.36.2 — 2026-10-22

- Shorten the English work-record status from “Payment pending” to “Pending” and align its help text. No API or database changes; NAS requires a Web update.

## 1.36.1 — 2026-10-22

- Complete English translations for Work bot settings, group/member counts, activity labels, placeholders, confirmation prompts, and locale-aware timestamps. Preserve original instructions, employee identities, group messages, and bot replies during language switching.
- Add component regressions for both language directions, unsaved instructions, empty/busy states, verification and save requests. No API or database changes; NAS requires a Web update.

## 1.36.0 — 2026-10-22

- Add a public, sign-in-free GitHub Pages demo using the original Web pages and an isolated synthetic API snapshot. Block writes, live authentication, AI calls and message delivery in the demo build.
- Add English/Chinese portfolio entry points, a page gallery and reproducible demo build/data tooling.
- Keep the production Web/API behavior and database schema unchanged.

## 1.35.0 — 2026-10-22

- Rename Audit log to Data operations; owners can export a full or anonymized single-store JSON file and preview an atomic replacement import with a mandatory full recovery download.
- Preserve exact money, business dates, soft-deleted history, and audit actor snapshots; anonymize identifiers and nested history for interview demonstrations.
- Keep the target owner, require other members to reclaim accounts, and revoke external delivery authorization after import.
- Run API integration tests sequentially because atomic store replacement locks shared database tables.

## 1.34.5 — 2026-10-22

- Improve the GitHub description and technology topics, enable automatic deletion of merged PR branches, and enable secret scanning and push protection while preserving branches with unmerged commits.
- Add prominent latest-release and changelog links to both README editions, clarify the English release/security document titles, and correct a historical English description of the agent's read-only access to sending metadata.
- Use English CI workflow/job names and run push-triggered CI on branches only, avoiding duplicate full verification when a Release tag is created. Preserve pull requests, manual runs, parallel verification/image builds, and immutable image promotion.
- No application behavior or database changes.

## 1.34.4 — 2026-10-22

- Merge online gift card sales into the gift card ledger table, with separate physical-card and online-sale sections and shared sale columns. Group repeated purchases by username, show usage once, and retain accounts without registered sales and matching mobile sections.
- Sync bilingual product/design documentation and component checks. No API or database changes; NAS requires a Web update.

## 1.34.3 — 2026-10-22

- Increase trend percentage numbers from 14px to 20px while retaining 14px labels and 30px primary values. Keep the first metric and all financial calculations unchanged. NAS requires a Web update.

## 1.34.2 — 2026-10-22

- Make current amounts and average daily service count the primary numbers in Business analytics trend cards, with smaller percentage changes below. Retain direction arrows and both date ranges; remove the separate direction line, closed-day counts, and sample-difference notices.
- Preserve financial calculations, precision and missing/zero/negative-baseline explanations. Sync bilingual help/product/design documentation and responsive code checks. No API or database changes; NAS requires a Web update.

## 1.34.1 — 2026-10-22

- Complete English-first bilingual documentation across current manuals, maintenance instructions, recovery tools, plugin instructions, changelog history, and archived records. Preserve technical examples and historical facts; add matching Chinese editions, reciprocal language links, localized navigation, and compatibility anchors.
- Extend `pnpm docs:check` with paired-language, heading, prose, and executable-example checks, and validate current version markers in both editions. Document the guard’s semantic-review limits.
- Generate backup overview, privacy, and terms pages with English followed by Chinese; retain section routing and HTML escaping with regression coverage. Documentation and tooling only; no database or business behavior changes. Published documentation requires its separate publication process.

## 1.34.0 — 2026-10-22

- Replace the four Business analytics overview totals with 7/30-day average revenue changes, 30-day average daily service count change, and 30-day total income change after card fees. Lead with percentages, preserve current values, cents, one-decimal counts, arrows and direction text, both periods and sample counts.
- Anchor fixed calendar-day windows to the latest closed day at or before the selected end; ignore the selected start, follow highlights, include empty closings as zero, and exclude open/missing dates and deleted/placeholder work. Explain missing history and zero/negative baselines without misleading percentages.
- Extend the existing analytics contract and RepeatableRead query with narrow 60-day projections; reuse finance domain functions and round fees once per window. Top cards load independently of daily subtotals, preserving realtime refresh and stale-response isolation. All lower charts/details remain. No new HTTP calls or database migrations; NAS requires a Web/API update.
- Add domain, API integration and bilingual component regressions, plus responsive code checks. Sync bilingual product, API, architecture, design and help documentation.

## 1.33.1 — 2026-10-22

- Rename Finance Summary to Monthly Summary. Show monthly turnover, monthly store income, monthly total income, and service record count in that order.
- Replace daily turnover/earnings trends with current/prior-month daily trailing 30-day average revenue using server analytics, preserving cross-month samples, cents and open-day gaps; store-wide analytics remain manager-only.
- Remove the employee earnings comparison panel, expand monthly metrics to a full-width three-month comparison with explicit periods and isolated retries, and retain employee subtotals below. Sync bilingual help, navigation and responsive code checks. No API or database changes; NAS requires a Web update.

## 1.33.0 — 2026-10-22

- Rebuild Finance Summary as a monthly dashboard with four key results, daily current/prior-month trends, service payment shares, employee wage/tip comparisons, and a monthly comparison table. Keep employee subtotals and their details/SMS controls at the bottom.
- Compare month-to-date with the previous month through the same calendar day, capped at month end; completed months compare full months. Reuse server financial totals, preserve cents and negative values, distinguish missing data from zero, and retain monthly exports and detail links.
- Add bilingual help and responsive code checks; remove the obsolete 26-card configuration. No API or database changes. NAS requires a Web update.

## 1.32.19 — 2026-10-22

- Show each day's actual revenue alongside selected averages when hovering, focusing, or selecting an average-curve date, preserving cents, zero, and open-day gaps without affecting the average-only scale.
- Size the desktop weekday/income row from the weekday panel and scroll the income panel internally. Keep every period, amount, data table, and keyboard entry point; mobile remains naturally expanded.

## 1.32.18 — 2026-10-22

- Scale average revenue curves from the lowest to highest visible value, ignoring missing samples; mark the maximum with its amount, date, and series. Handle zero, negative, constant, and empty data without changing other charts or financial calculations.

## 1.32.17 — 2026-10-22

- Add a four-metric business overview using existing daily subtotals and analytics responses, preserving cents, negative values, and loading/error states without new requests or financial formulas.
- Promote average revenue curves and the calendar into a 3:2 main area. Keep the original daily revenue trend and all other charts, tables, details, and daily subtotals below. Update mobile reading order, bilingual help, and code regression coverage; no API or database changes. NAS requires a Web update.

## 1.32.16 — 2026-10-22

- Record English-first bilingual documentation as a standing maintenance rule: synchronize English and Chinese, use English as the default entry point, and keep language-switch links prominent.

## 1.32.15 — 2026-10-22

- Make English the default project README for portfolio review, with a prominent Chinese README link and matching bilingual coverage of the product, architecture, implementation references, local setup, and verification.
- Add both README versions to version consistency checks and document their maintenance entry points; no application behavior or database changes.

## 1.32.14 — 2026-10-20

- After a send command is accepted, the Mac agent observes only that task's sending-status metadata through read-only access. Explicit failures use the existing bounded retries; unconfirmed results, unreadable databases, and receipts from earlier attempts are not recorded as success. The agent does not read chat bodies or modify the Messages database.
- There will be an interval of 2 minutes after the end of a normal task, and at least 5 minutes after a failure, the next collection time will be persisted; restart to resume observation and retreat, and the heartbeat will run independently. Keep the original sending route, no API contracts or database migrations.
- The history of daily closing, interval settlement and employee subtotal SENT uniformly displays "Submitted·Unconfirmed Delivery", changes to the color to be verified and explains the true delivery source; adds asynchronous failure, status isolation, read-only metadata, waiting for retry and phone status return. The agent needs to be updated independently, and the web copy needs to be updated on the NAS.

## 1.32.13 — 2026-10-20

- Fix Access denied when Mac agent temporarily saves and sends attachments using different permission identities: the same restricted App is responsible for temporary storage, reading files, and executing the included AppleScript; the diagnosis covers the actual reading of files and Messages automation, and no test text messages are sent.
- Extract the actual cause of the sending error and limit it to 1000 characters. Repair failed writeback and heartbeat rejection with 400; daily closing and settlement save the sending start/acceptance checkpoint, and do not send repeatedly after the receipt is interrupted.
- The installation first stops the old process and then replaces the running file, adds the --no-start mode that only updates verification, updates permissions and troubleshooting manuals and regressions; there is no API contract or database migration, only updating the independent Mac agent will take effect.

## 1.32.12 — 2026-10-20

- The weekly average revenue and turnover revenue graph of the business analysis is changed to a day/date arrangement from top to bottom, with three horizontal columns in each group, and the amounts are horizontally aligned, retaining complete cents, negative values, zero values, no samples, keyboard operations, and details.
- The two pictures are adjusted to the third and fourth positions, starting from 1100px and occupying half width side by side. The narrow screen is arranged in a single column in order, and the long date is browsed downwards. Synchronized Chinese and English help, product and design rules, and code regression, with no API or database changes; the Web needs to be updated for NAS to take effect.

## 1.32.11 — 2026-10-19

- Oracle A1 monitoring only queries and applies for the user-specified 2 OCPU / 12GB, and removes 1 OCPU / 6GB for downgrading; processing of low-configuration requests in the old state is suspended, and it is not reused to create low-configuration instances.
- Added the return of low-configuration inventory, legacy low-configuration requests, and existing low-configuration instances, and maintained notifications, free quota, and anti-duplicate creation protection. Update NAS monitoring independently and do not update business applications.

## 1.32.10 — 2026-10-19

- New independent NAS Oracle A1 free instance application runner: fixed model and region, capacity check every five minutes, free quota check for all tenants, persistent retry token, stop application after success and Gmail notification; keep quiet without inventory and do not modify existing business or backup.
- Add timeout and restart to prevent repeated creation, quota, disk, email failure and failback regression and independent installation manual. The real identity and NAS activation status are subject to the operation manual, and there is no database migration.
- Standalone OCI identity, pre-built network, NAS runner, and test email acceptance completed; container identity consistent with existing SMTP password owner, credentials read with minimal file permissions. The backend is waiting for A1 inventory, and existing business remains in NAS.

## 1.32.9 — 2026-10-18

- Solidify the optimized update deployment process into maintenance rules, AI handoff, deployment manual, release list and document entry: use parallel CI after local pre-checking, complete NAS backup, migration and acceptance in one go after the official label is successful, and reuse existing effective checks.
- Clarify the difference between branch benchmarking and official release, as well as the timing range of CI, NAS, and the entire deployment; do not repeat full local testing, build, or open new speed testing during handoff. Only documents and versions are synchronized, there are no business or database changes, and no production release is performed.

## 1.32.8 — 2026-10-18

- The release turnover line runs the complete verification and NAS candidate image construction in parallel; after both are successful, the official label is released according to the same digest, and existing versions of different products are refused to be overwritten. Normal branches and PRs retain original production build checks.
- Docker prefetches dependencies according to the lock file and installs them offline. Application version changes reuse the download cache; the build cache is changed to GHCR, and the main branch is isolated from the benchmark cache. Added branched manual builds and stage timing summary for each run, with no business or database changes.

## 1.32.7 — 2026-10-18

- Charts in the same row of business analysis are automatically equal in height according to the highest content in the row, and expand/collapse adaptively with the month, description and details; narrow screen single columns continue to grow naturally according to their respective contents, without fixing the height or cutting the content. Synchronize product and design rules and style checks without API or database changes; the Web needs to be updated for NAS to take effect.

## 1.32.6 — 2026-10-18

- The turnover and income histogram adopts compact grouping by day/week/month, shortening the date and the distance between the three columns in the group; when the amount is too long, it is marked vertically, retaining the complete amount, cents, zero values and negative income; long date ranges continue to only scroll within the chart.
- Reuse the annotation layout of the weekly chart, and synchronize the return of Chinese and English help, product and design documents, and grouping width. No API or database changes; a web update is required for NAS to take effect.

## 1.32.5 — 2026-10-18

- The business analysis is adjusted to the daily revenue calendar, daily revenue trend, weekly average revenue, average curve and other charts are extended. Weekly average revenue occupies the entire row, and the seven days are laid out within the width of the container, without the need to slide left or right.
- The weekly chart retains three sets of comparisons, complete amounts and cents, with vertical markings in narrow areas and staggered sequence markings in extremely narrow areas; zero values, negative values, no samples, keyboard selections and daily details remain available for review. Synchronized Chinese and English help, product and design documents, and code regression, without API or database changes; the Web needs to be updated for NAS to take effect.

## 1.32.4 — 2026-10-18

- The total income of today's page is restored to store income + store manager income + manager income, and the average daily expenditure deduction for this month and the reading of expenditure data by the dashboard are removed; the expenditure page continues to be independently calculated and managed.
- Synchronize desktop/mobile Chinese and English descriptions, product/API/UI documents and regressions. The verification cycle and the addition, modification, deletion and recovery of one-time expenditures will not affect the total revenue of the billboard. No database migration; Web/API needs to be updated for NAS to take effect.

## 1.32.3 — 2026-10-18

- Corrected the double calculation of gift card revenue: card sales are included in actual revenue, and the service amount paid by gift card is excluded when used; synchronize today's dashboard, calendar, business analysis and all average revenue.
- The existing amounts of turnover, store revenue, wages and gift card tips are retained to avoid repeated deductions and write-offs under new revenue; negative revenue and mean values are completely retained, and the chart supports negative values.
- Updated Chinese and English amount descriptions and regression testing. No database migration is required, historical queries directly use the new definition, and saved daily closing/sent snapshots are not rewritten; the Web/API needs to be updated for NAS to take effect.

## 1.32.2 — 2026-10-17

- Added NAS complete cloud recovery package and Mac on-demand recovery tool: same database snapshot, role/permission and full table summary verification, offline running image, age encryption, Google Drive independent directory and three successful backup rotations. The old manual database backup/restore interface remains compatible.
- A new independent NAS loopback static proxy is added to provide public instructions, privacy policies and terms of use for Google OAuth. Other requests continue to be forwarded to the original application; the proxy configuration and page are archived with the encryption package.
- Added isolation recovery drills, failure/corruption/out of space tests, official tool verification locking and security setup instructions; covers equivalent reconstruction of PostgreSQL old CHECK expressions and real Caddy configuration verification. 2026-10-18 Completed the NAS → Drive → ARM Mac independent recovery acceptance of two real cloud packages and activated the NAS midnight task; the recovery report records the actual time consumption and external dependencies, and no local backup services are resident.

## 1.32.1 — 2026-10-17

- The local web page test data is replaced with verified online backup snapshots, and the independent recovery library is verified before importing and the original development database and backup are retained as recovery points; the fixed SMS-free test login is retained, only the store owner identity is mapped locally and the copied sending agent authorization is revoked, and the online data is not modified.
- The development documents clarify the purpose of the web development database and the independent automated testing library. Business snapshots are retained by default, and fixed demo seeds are only run when a synthetic scenario is clearly needed; business snapshots and recovery records are retained in a restricted directory that is ignored by Git. No application functionality or database migration changes.

## 1.32.0 — 2026-10-17

- All histograms in the business analysis directly mark the amount or quantity: the actual cents are retained for the amount, zero values are displayed as zero, dashes are retained for no samples, and negative income is marked at the end of the negative column; the daily quantity displays the number of work records and the number of customers respectively. Dense column charts reserve width by the full number and only scroll horizontally within the chart.
- Weekly average revenue is always compared side by side with highlight, non-highlight, and all. The selected date is used and the same closed sample is used, and it is not hidden by the top highlight filter. Empty daily closing counts as zero, and the actual revenue from card sales continues to use the existing definition to enter non-highlight and all. Click on the week to view three groups of daily amounts.
- The same API read transaction returns an independent week comparison aggregation without new requests or database migrations; other charts and daily subtotals continue to use highlight filtering. Synchronized Chinese and English descriptions, product/API/architecture/UI documents and calculations, permissions, column top numbers and phone reading return; NAS needs to upgrade Web/API to take effect.

## 1.31.1 — 2026-10-17

- Fixed an issue where the focus of a hidden radio button might push the outer pop-up window when switching durations in a fast work record on the computer, causing the top to be cropped and unable to be scrolled back; the native focus boxes for items and durations are uniformly limited to their respective options, retaining keyboard selection, top closing entry, and independent scrolling of the form. Synchronized style checking and design instructions, no API or database changes; the Web needs to be upgraded for NAS to take effect.

## 1.31.0 — 2026-10-17

- The total income of today's page is based on the original store income + store manager income + manager income, minus the average daily expenditure in the month of the selected date. The server reuses the monthly amortization and daily average results of the expenditure page, deducting only once, and retaining cents and negative numbers.
- The daily average includes periodic expenses and one-time expenses for the month, and the unentry exclusion, true zero, and deletion recovery are used; changes in expenses automatically refresh the dashboard. Employees do not read store costs; synchronize Chinese and English descriptions, product/API/UI documents and calculations, cross-month/leap months, permissions and page returns. There is no new database migration; the Web/API needs to be upgraded for NAS to take effect.

## 1.30.0 — 2026-10-17

- The expenditure page unifies four monthly indicators: total expenditure, monthly amortization of all cycle costs, daily average for the whole month, and one-time; four columns for desktop, two columns for tablets and phones, and a single column for extremely narrow screens. Combined into one-time expenses at the top and fixed expenses at the bottom, each item only appears once, the period is expanded to the amount of each period, the details are centralized to manage notes, history and stop/restart, and the collapsed items and deleted recovery entries are retained.
- Delete budget options, source tags and budget summaries, and the period-unified common amounts are automatically inherited and modified once for the entire period; the interface rejects `BUDGET` and is compatible with the old `FIXED`. The server returns period/one-time totals, project totals and unentered periods. Empty amounts are different from real zeros.
- Added forward migration `20261017010000_expense_usual_amount`: the fixed rule will use the original start date, and the old budget rule will be aligned upwards with the first legal period based on the local month of the store at the time of upgrade; the old amount, rule ID, bill and audit will be retained, and the complete period without a bill before will not be counted in the total. Synchronize Chinese and English with product/API/UI documents and amounts, migration, and interactive regression; for NAS to take effect, you need to upgrade the Web/API and apply migration.

## 1.29.0 — 2026-10-17

- The fourth section of business analysis has added "turnover and revenue bar chart", which defaults to weekly and can be switched to daily/monthly; total turnover, store revenue and total revenue are always displayed side by side, and the remaining charts are postponed.
- The new graph reuses the same financial summary response of the daily subtotal, using the date and highlight conditions; the natural week is based on Monday to Sunday, the natural month is based on the first to the end of the month, only the selected date is totaled from the beginning to the end, and cents, zero values, negative revenue, read failure retries, and fixed graph width are retained. The total income follows the daily subtotal before fees, and the financial formula is not recalculated.
- Synchronize Chinese and English help, product, API and design documents, supplement New Year's Eve/leap day grouping, three-sequence display and filter refresh return. No API or database changes; Web upgrade required for NAS to take effect.

## 1.28.0 — 2026-10-17

- The top three items in business analysis are daily revenue calendar, weekly average revenue, and average revenue curve. The remaining charts are moved back in the original order, and the daily subtotals are retained after the heat map.
- The new curve displays the average of the last 30 days by default, and you can check both the cumulative average of all dates and the average of the last 7 days. The cumulative definition is from the selected starting date to the current day, and the rolling window reads 29 days/6 days before the starting date. The current highlight filtering and closed samples are used, and zero values, gaps, and sample numbers are retained.
- All line charts use smooth curves, the horizontal axis adapts to the fixed chart width, and the date curve range follows the date selection above; Chinese and English help, API, product and design documents and regressions are synchronized. No database migration is required; Web/API upgrade is required for NAS to take effect.

## 1.27.0 — 2026-10-15

- When recording card sales, a new "Sell Card Online" button is added to the right of the serial number. After switching, enter any username (including pure numbers and leading zeros); the same username can be purchased repeatedly and does not occupy the automatic serial number of the physical card.
- Gift card payment adds "Use username", which directly saves the username and amount used, without querying the account number or sales registration; editing, draft, payment snapshot, audit and AI modification retain the username mode.
- The ledger displays purchases and uses by physical card and user name respectively, and write-offs for repeated purchases are only totaled once; financial details, CSV and recycle bin are marked with user names simultaneously. Added forward database migration. For NAS to take effect, you need to upgrade the Web/API and apply the migration.

## 1.26.0 — 2026-10-13

- The historical work record allows store owners/managers to hide and restore employee attendance, and the closed historical days is also operable; historical blank lines and shifts are retained, and the work record, finance, cash, and daily closing snapshots remain unchanged.
- Hidden dates are regarded as not working, and subsequent rotations will skip that day and recalculate visible positions on that day; today's initial automatic generation, active regeneration, and future automatic scheduling use the same historical basis, retaining future manual sequence protection.
- Earlier attendance changes synchronously refresh the subsequent dates being viewed by other devices; update historical read-only prompts, Chinese and English help, product and API descriptions, and supplement historical permissions/versions/replays, financial retention, and two types of generation order regression. No database migration is required; Web/API upgrade is required for NAS to take effect.

## 1.25.1 — 2026-10-12

- Repository-wide cleaning: Remove the salary registration matching, navigation, scheduling tags and time linkage helpers that are only referenced by old tests, delete the corresponding obsolete tests and eight unused contract type aliases, and retain the existing salary revision confirmation, deep link resolution and server-side time compatibility.
- Individual daily statement and interval settlement share Web SVG conversion, canvas capacity limit and temporary URL recycling; SMS receiving number verification and sending failure retry status are maintained centrally, maintaining original permissions, leases and transaction boundaries.
- Remove the old `WEB_STATIC_EXPORT` branch that has no corresponding build/launch product; Web unified uses the existing standalone delivery link.
- Correct automatic daily closing recipients and Web/API response header descriptions, sync architecture, development and review records. There are no new features or database migrations, and the Web/API needs to be upgraded for NAS to take effect.

## 1.25.0 — 2026-10-12

- The individual daily statement page, Web-generated PNG and SMS PNG are unified into a work record card template: the top highlights the source of confirmed income and cash/card + gift card, and the two columns below display the work record by time.
- The card retains the pre-discount service fee, accurate receipt split, tips and current income; cash has no frame, card swiping has a frame, gift card has text, highlights, discounts and add-on are displayed simultaneously, and summary is explicitly excluded after checkout.
- API personal preview and new SMS snapshots add highlight and discount fields; old snapshots can still be rendered if they are missing fields. Keep cash handover, generation/sharing and sending operations, and clear old images after preview update.
- Updated Chinese and English content and documentation, supplementary pages, mobile overlays, SVG borders and Mac PNG conversion returns. No database migration is required; the Web/API needs to be upgraded for NAS to take effect, and SMS attachments need to be updated separately to have the Mac agent installed.

## 1.24.1 — 2026-10-12

- When the quick work record has exactly three duration options, both the desktop and the phone are lined up in a row, and the duration and price are displayed up and down in each grid.
- When opening a quick work record and switching projects, the default is 60 minutes. If there is no such gear, the first gear in the directory is selected. The same rules are used for detailed switching projects, synchronizing prices and end times, and retaining the original duration of saved records and manual selection.
- Synchronize Chinese and English help, product and design instructions, supplement component interaction and return to phone style. There are no API or database changes, and a web upgrade is required for NAS to take effect.

## 1.24.0 — 2026-10-09

- The details of work record are added to the left side of highlight, and the same button is added between quick work record and highlight. Marks are saved independently and support cancellation and details draft recovery. This button is disabled in placeholder mode.
- Mark records and highlight records are mixed and arranged on the right side according to time, and the ordinary small card style is used; there is no automatic highlight, and the number of work records, automatic discounts, financial screening, handling fees or salary definitions are not changed.
- Added Boolean fields compatible with old records and forward database migration, inheriting version conflicts, permissions, idempotency and auditing. For NAS to take effect, you need to upgrade the Web/API and apply migration.

## 1.23.0 — 2026-10-08

- The weekly average revenue of business analysis supports clicking the week or pressing Enter/space to automatically expand the data table and list the revenue of each date of the week within the current range; switch the week update details, retain cents, closed zero values and not closed dashes, and clear the old selection after switching date/store/highlight conditions.
- The daily subtotal is moved below the week × hour heat map, the revenue calendar is placed after the subtotal, and the same grid as other charts is used: the desktop occupies half width, and the narrow screen has a single column; the subtotal, calendar, and today's details continue to use the same date and highlight conditions.
- Synchronize Chinese and English help, product and design documents, and supplement React/jsdom interaction and layout regression. There are no API or database changes, and a web upgrade is required for NAS to take effect.

## 1.22.1 — 2026-10-08

- The Finance and Store Settings subdirectories in the left navigation of the desktop are collapsed by default. Click the parent item to expand it and click it again to collapse it. The two groups of directories can be switched independently. The parent item only controls expansion. Click the child item to enter the page.
- Retain sidebar hover/keyboard expansion, role permissions, store deep links and current section switching; the bottom navigation of the phone continues to enter the page directly. Supplemented React/jsdom interaction and breakpoint style regression, no API or database changes, NAS needs to be upgraded to take effect.

## 1.22.0 — 2026-10-07

- Daily subtotals are moved from financial summary to operating analysis, following the analysis page independent date and "highlight only / exclude highlight / all" conditions; retain weekday, turnover, average reference of the whole store in the past 30 days, main amount/all column switching and amount composition details.
- Business analysis adds a monthly calendar that is the same as today's work record. The currently filtered closed revenue is displayed under the date and cents are retained; not closed displays dashes and empty daily closing displays zero. The amount is not displayed outside the range and cannot be clicked. Month switching is limited to the selected range. Click on a date to see today's details for the same condition.
- Reuse existing analysis, financial summary and detail interfaces and real-time refresh. Old responses will become invalid after switching store/scope/highlight conditions; Chinese and English, mobile styles and React/jsdom returns will be added. There are no API contracts or database changes, and the Web needs to be upgraded for NAS to take effect.

## 1.21.0 — 2026-10-07

- Business analysis has added the "highlight only/exclude highlight/all" filter, which defaults to all. The switch refreshes immediately and retains independent date ranges; all charts and hourly details use the same conditions, and old requests and selected details become invalid with the filter switch.
- The highlight condition applies uniformly to the work record quantity, revenue, and moving average windows; only highlight excludes gift card sales, and other modes retain the actual receipts from card sales, and the number of runners and daily closing samples remain unchanged. Permissions and placeholder/deletion exclusion rules are inherited, without database migration; the Web/API needs to be updated for NAS to take effect.
- Synchronize Chinese and English filtering, desktop/tablet/mobile form layout and product, API, architecture documents, supplementary contracts, API integration and React/jsdom regression.

## 1.20.1 — 2026-10-06

- Completing the React/jsdom return of Walkout Walk-in function, covering new creation, editing and saving, draft cancellation, read-only mark, duplicate submission protection and version conflict refresh. No production logic or database changes.

## 1.20.0 — 2026-10-06

- A new `Walk-in` switch button is added to Walkout entry and editing. After saving, a small walking icon will be displayed in the upper right corner of the card; refresh and read-only history retain the source, editing can be canceled, and old records are unmarked by default.
- The source is saved through an independent Boolean field, the creation is closed by default, the modification is omitted and retained, and is included in the list and audit snapshot; the business day lock, version, idempotency and real-time refresh are used, and the number of people and financial statistics remain unchanged.
- Added forward database migration, supplemented contracts, API integration and React/jsdom regression, updated Chinese and English help and design instructions. For NAS to take effect, you need to upgrade the Web/API and apply migration.

## 1.19.1 — 2026-10-06

- The top of the placeholder card displays the time selected when saving, following the time format and current time zone of the work record page; the entire card is retained from corner to corner X, with the diagonal line below the time text, and the white background ensures that the time is readable.
- Synchronize placeholder help and design instructions, React/jsdom regression and mobile style samples; do not change placeholder data, sorting, work, finance or delete recovery rules. This time display update only requires upgrading the NAS Web.

## 1.19.0 — 2026-10-06

- Quick work record adds a placeholder mode on the left side of the highlight. The retention time selection is used for date attribution and sorting, without a project. The placeholder card on the main interface consists of two diagonal lines covering the card and connecting the four corners. X, which only provides deletion confirmation after clicking.
- The placeholder uses an independent `PLACEHOLDER` state, does not create projects, discounts or payment details, and is not included in the number of work records, income, wages, daily closing exceptions, cash settlement, business analysis and robot work occupation; creation, deletion and recovery will not roll back cash settlement. Inherit permissions, business day locks, versions, idempotency, auditing and multi-device synchronization, and recycle bin recovery.
- Added forward database migration of placeholder status and business field constraints, supplemented contract, database, API and React/jsdom regression; synchronized product, API, architecture, design and Chinese and English help. For NAS to take effect, you need to upgrade the Web/API and apply migration.

## 1.18.10 — 2026-10-05

- Salary range images establish reading context by store, date range, employee, and salary source, then display earnings summary, daily summary, and chronological breakdown; Web PNG and Mac SMS JPEG continue to share templates.
- Individual daily statement Web export and text message PNG changed to share SVG: first look at the confirmed total income, then vertically check cash, non-cash (swipe card + gift card) and total by service fee / tips, and finally check time, project, employee income, pre-discount amount and guest payment source one by one. It is clear that pending checkout is not included in the summary, unknown values are distinguished from zero values, the amount is kept in cents, and long content is completely wrapped in new lines; the reading level and field correspondence are adjusted, not only the color is changed.
- Synchronize individual daily statement and salary picture design rules, maintenance portal, product and agent description; no interface or database changes, NAS Web and installed Mac agent need to be updated separately, local modification does not mean online, historical sent attachments remain unchanged.

## 1.18.9 — 2026-10-05

- The payroll settlement Web PNG and Mac SMS JPEG share a template that removes warm gradients, red-brown backgrounds, shadows, and excessive font weight, and instead uses the project's existing lime-white background, white surface, ink text, dark green accents, thin edges, and unified rounded corners.
- The summary is marked with service fee, tips and total according to the salary source, and the amount is kept in cents; the long store name, name, payment split and amount are completely wrapped in new lines, and the header and card increase with the content. Keep the leftmost summary of each day, arrangement of each transaction by time, 2 to 4 columns, and the capacity boundary of a single long picture.
- Synchronized image design specifications, product and agent manuals, and rendering regressions; no business interface or database migration, NAS Web and installed Mac agents need to be updated separately to take effect.

## 1.18.8 — 2026-10-04

- Today's work record removes the exit button, and normal exits use the existing exit account area on the "My" page; a single store no longer occupies an empty account operation area, and multiple stores can still be switched directly.
- Slightly enlarge the business day calendar, the wide-screen calendar increases from 288px to 336px, the date line increases from 28px to at least 36px, the medium desktop width and narrow-screen pop-up calendar are adjusted simultaneously; the daily revenue increases from 9px to 12px, and long amounts are wrapped without shrinking into small characters. Date selection, cache, permissions and original amount are retained, without database migration, and will take effect after updating NAS Web.

## 1.18.7 — 2026-10-04

- Write the project's aesthetic goals, information level, module consistency at the same level, semantic color, mobile reading, exposed issues and design judgment methods into the UI design document, explaining the purpose and reason of each criterion.
- Add learning portals to maintenance rules, AI handoff, root README and document index, requiring subsequent front-end modifications to continue common specifications and cover low-frequency pages and data status. This time only documents and necessary versions are synchronized, with no interface, business or database changes.

## 1.18.6 — 2026-10-04

- Rearrange the recycle bin, daily closing check/SMS queue, gift card ledger, payroll ledger/send record, expenditure and financial composition details according to phone reading tasks; vertical records with field names are used for 900px and below, key amounts, status, deletion reasons and sending failures precede operations, secondary details are expanded on demand, and a comparison table is retained on the desktop.
- The summary of all salary sources is changed to readable group amounts, retaining cents and totals; adapting to narrow-screen daily cards, robot identity/status/operation branches, auditing known fields using amounts, ratios, and Chinese labels, and the complete JSON is still retained in the expanded item.
- For mobile business analysis, the chart text and thermal touch area are enlarged and the week label is fixed; frequently used work records are placed in the front of the help page, and the corresponding description is directly expanded by clicking on the topic. The font size and line height of the main text are increased; the long finance/expense/salary editing pop-up layer keeps the top closed entrance available.
- Added mobile reading, style and operation regression of real React components, covering width 320–900px and matching desktop switching, permissions, confirmation, version, cents, mixed payment and cash interfaces; synchronizing full page review records. Only code verification is performed according to user agreement, without browser visual testing, interface or database migration. Effective after updating NAS Web.

## 1.18.5 — 2026-10-04

- Fixed the problem of two columns being restored by high-priority rules when the mobile card seller/runner side is empty, covering four empty/recorded combinations; more summaries are changed to stable two-column separation, and odd-numbered tail items occupy the entire row.
- The amount and payment fields of mobile salary settlement are unified into single columns, and the readable font size and operation height are restored to 44px; input controls such as stores, members, and audits are unified to 16px, and the login number prefix and input box remain at the same height.
- Pagination labels retain underlines and right-angled edges, and public button rounded corners are removed; the daily closing sending area on phones has a single column, filter titles can be wrapped, and the touch height of the assistant, employee subtotal sending and detail operations is completed.
- Added `pnpm ui:mobile` to check 8 routes, 27 groups of pages/sections and the cascading styles of common elastic layers at 320/360/390/414/480/600/760px in the actual CSS loading order, add layout/control degradation samples and connect to CI. Only code and DOM style verification, does not represent actual browser visual testing; no business interface or database migration. The NAS needs to update the web to apply this change.

## 1.18.4 — 2026-10-04

- Scan all 481 project files, remove financial calculation adapters without business callers and their registration/forwarding self-tests; merge gift card serialization of new and old card usage details, and XML, amount and time image formatting for Web/message brokers.
- Clear 23 old style classes and cross-breakpoint rules that are no longer used by the page, and retain the dynamically spliced payment method, delivery status, and catalog type styles.
- Organize the product, development, handoff, UI, API, deployment and security documents, delete the old color matching/sidebar, prohibit automatic daily closing, round all site amounts, old member processes, the rightmost column of the settlement summary and temporary album diagnosis and other outdated rules; retain the rules to explain the reasons one by one, and no longer copy the entire set of business definitionss for release inspection.
- Solidify the repository-wide cleanup meaning of "carrying out a round of documentation"; retain existing uncommitted work, published migrations, compatibility portals, history records and licenses. No functions will be added in this round, and there will be no database migration. Application cleaning requires updating the NAS; formatting of shared images requires a separate update of the installed Mac agent.

## 1.18.3 — 2026-10-04

- Unify the white surface, solid border and rounded corners of the work record empty state, employee scheduling operation, gift card sales and customer records, and remove the overlay in the old responsive style; the employee addition and scheduling entrance is moved to the side of the employee table, and the mobile auxiliary module is changed to a single column.
- The highlight work record is changed to a soft gray green. The work record card, detail button and financial details continue to use the same semantic color, which remains stable when hovering and read-only. The remaining independent warm colors, purple payment labels, large rounded corners, decorative shadows and excessive font weights of the entire site are cleaned up, and the discount and fee rules corresponding to highlight are not changed.
- Native month/date and other controls complete the unified baseline; expenditure filtering, project buttons and editing pop-ups are synchronized with common controls. The member form adds independent content grouping, tightens the white space and fixes the alignment of SMS number and picture language controls; other information, salary and filter forms also avoid auxiliary descriptions from elevating the fields next to them.
- Added `pnpm ui:check` and style rule regression, prohibiting breakpoints from reintroducing independent colors, large rounded corners or covering the work record panel surface; synchronizing Chinese and English help and design maintenance records. No database migration is required and it will take effect after updating NAS Web.

## 1.18.2 — 2026-10-04

- Desktop navigation is reduced to a 64px icon bar by default. It expands when the mouse is moved or the keyboard is focused, and is automatically retracted when moved away; the current visual style, sub-page entry and accessible name of the icon are retained.
- Expand the sidebar to cover the content, reserve only the width of the icon bar in the main area and cancel the maximum width limit on the desktop to avoid squeezing the layout during operation; synchronize the position of the AI pop-up layer, and continue to use the original layout for the bottom navigation of small screens. No database migration is required and it will take effect after updating NAS Web.

## 1.18.1 — 2026-10-04

- Fixed the problem of automatic ranking overwriting when the future work record page is moved up or down when loaded; the manual order is retained after refresh, real-time synchronization and previous attendance changes, the weekly template still updates the list, and new employees are appended to the end.
- Automatic ranking updates are restored after proactively regenerating the order; the first template initialization also protects manual sorting, uses audit versions to distinguish operations within the same millisecond, and retains permissions, idempotency and version conflict protection.
- Synchronize Chinese and English help and product/API/architecture descriptions, and supplement database integration regression. No new database migration is required, it will take effect after the NAS updates the API and Web.

## 1.18.0 — 2026-10-02

- The front end of the entire site has been changed to a lime white, ink and dark green store workbench, with unified font sizes, edges, rounded corners, status colors and amount layouts; decorative gradients, card floats and large area shadows have been removed, and the desktop uses a fixed full sidebar and permanent navigation in the current partition.
- The overall member management has been changed to "select existing employees → profile details → save changes". Centrally maintain information, wages and text messages, project exclusive commissions, account and status partition management; the narrow screen adopts a two-step directory/details layout, retaining unsaved reminders, version conflict drafts, duplicate submission protection and store owner permission boundaries.
- Organize the work record header and overview, financial sub-pages, store rules and equipment, project categories, robots, personal information, login, offline and help levels respectively; help add topic entrances and expandable guides, synchronize semantic colors for analysis charts, and turn off the assistant to smooth scrolling when reducing dynamic effects.
- Supplement the React/jsdom automated verification and Chinese and English copywriting of the member process, and record the actual GitHub reference source code and maintenance boundaries. No database migration is required and it will take effect after updating NAS Web.

## 1.17.4 — 2026-10-02

- The automatic synchronization of the homepage (including work record, daily closing notification and reconnection) only refreshes business data such as tables, and no longer clears the monthly calendar cache or re-obtains the read calendar; manual refresh, local business operations and cross-day refreshes can still be refreshed, and uncached months can be read normally when viewed for the first time.
- Keep existing date range synchronization, request merging and isolation of old responses. No database migration is required, it will take effect after the NAS updates the web.

## 1.17.3 — 2026-10-02

- The title, icon and amount of the business overview card on the homepage are uniformly displayed in the center and are suitable for wide screen, narrow screen and expanded summary. No database migration is required, it will take effect after the NAS updates the web.

## 1.17.2 — 2026-10-02

- The home page calendar uses in-page caching by store and month. Switching dates, returning to read months, narrow screen re-expansion and table re-mounting no longer obtain repeated acquisitions; merge requests in transit for the same month, and reuse directories and member information across dates.
- Manual refresh, work record/sell card/daily closing changes, cross-day and reconnection will still update the calendar, retaining the same month mark during the refresh period; changes in other dates will also invalidate the calendar cache, and old responses cannot overwrite the new cache. Sub-panels re-subscribe to live connections only initialize themselves to avoid triggering a re-read of the entire home page.
- Supplement caching, request race conditions and real-time subscription regression testing. No database migration is required, it will take effect after the NAS updates the web.

## 1.17.1 — 2026-10-02

- Member management is changed to team profile, search and status/role filtering, and compact member form; adding employees, data editing, project commissions, joining approval, and deactivation recovery use the right drawer respectively, and the narrow screen uses a full-screen form.
- Data is grouped by permissions, salary commissions, and daily closing text messages. It provides pop-up windows for errors, unsaved reminders, duplicate submission protection, and version conflict checks; it refreshes in real time to retain the draft being edited.
- Save only the interface corresponding to the submitted changed field to avoid repeated recalculation when the commission is not modified; retain the registered phone number for rollback, and support the adjustment of the display name of employees with the same name during recovery.
- The toolbar is adapted to the MIT source code of GitHub shadcn/ui, supplementing source and license instructions; synchronizing Chinese and English with maintenance documents. No database migration is required, it will take effect after the NAS updates the web.

## 1.17.0 · 2026-10-02

- Finance adds an independent expense page, so store owners and managers can manage fixed periods, budgetary floating and one-time expenses, supporting historical and future months.
- Costs are summarized by calendar month and average daily expenses are calculated; monthly periods are divided evenly, and daily periods are amortized by date covered, with cents retained.
- Supports single-period actual amount coverage (including zero), cancellation coverage, rule history effective by period, stop and restart, and deletion recovery; the income, salary and daily closing formulas will not be changed.
- Added forward expenditure migration, permissions, idempotency, version control, auditing and real-time refresh, and closed months can be re-recorded.

## 1.16.0 — 2026-10-02

- Member management and new employee profile creation add the optional "whether to clear every daily closing", the default is no. After enabling, individual daily statement cash handover displays the sum of service fee commissions and credit card/gift card tips from all payment sources, excluding cash tips directly given by guests to employees.
- "Settled" saves a complete salary snapshot at each daily closing. The salary settlement calendar marks all settlements on the day and excludes repeated payments. The balance includes newly added wages; canceling or canceling the daily closing of the whole store or modifying the work record will continue to use automatic rollback. Historical settlement is not affected by subsequent member settings; unsettled work records and existing salary settlement confirmations prevent repeated full payment.
- Added forward migration `20261002020000_daily_full_settlement`; the NAS needs to deploy the new version and apply the migration to take effect.

## 1.15.9 — 2026-10-02

- Remove the "end of work time" prefix below the employee's name, make the expected end time bold and keep AM/PM aligned, and retain the green status point calculated with the original work status. No new database migration is required; it will take effect after the NAS updates the web.

## 1.15.8 — 2026-10-02

- The financial cash settlement is integrated into the daily closing employee checklist, which displays what should be submitted, what should be retained, settlement status, and person-by-person operations. Cash details are expanded by row and retained for one-click settlement; employees only view their own cash. Old Cash Link goes into same store same day daily closing. Unsettled cash or failed loading will not affect normal daily closing, and can still be settled after daily closing; continue to use work record exception check and cancel daily closing fallback. No new database migration is required; it will take effect after the NAS updates the web.

## 1.15.7 — 2026-10-02

- The salary settlement summary adds "Generate Image" to the left of "Send SMS Long Image", reuse the summary of SMS long image and daily work record layout, preview and save PNG at the bottom of the page; switch employees, scopes, sources or languages and clear old images after refreshing the settlement form, prevent repeated clicks during generation and recycle temporary image resources. No new database migration is required; it will take effect after the NAS updates the web.

## 1.15.6 — 2026-10-02

- On the salary page, the widescreen employee operations, calendar and settlement summary are unified to the same height, and the generation and settlement operations are arranged at the bottom; when there are more than 6 viewable members, the employee column is automatically widened and arranged into two columns, and ten people are displayed in five rows. For more members, the list is reserved for scrolling. Tablets retain a single column of employees, and phones retain horizontal scrolling. No new database migration is required; it will take effect after the NAS updates the web.

## 1.15.5 — 2026-10-02

- After the salary settlement form is generated, cancel the upper limit of the total width of the selection area, and the summary fills the remaining space on the right side of the calendar; increase the amount, font size, and spacing according to the width of the summary itself, and the calendar will still maintain a compact size, and the narrow screen will continue to be arranged up and down. No new database migration is required; it will take effect after the NAS updates the web.

## 1.15.4 — 2026-10-02

- After the salary settlement form is generated, employee information, complete income summary, outstanding/deducted/actually paid amounts and payments, text messages, and send record buttons are condensed into the third column on the right side of the calendar; the deduction instructions can be expanded, and the daily work record details continue to be located below. Tablets and phones automatically return to the top and bottom arrangement, the amount remains in cents, and the payment and long picture content remain unchanged. No new database migration is required; it will take effect after the NAS updates the web.

## 1.15.3 — 2026-10-02

- On the salary settlement page, the salary source and "Generate Settlement Statement" button are moved to the left below the employee list, and only the calendar is retained on the right; the selection boxes and buttons are adapted to narrow columns and Chinese and English, and the narrow screen still uses a top-down layout. No new database migration is required; it will take effect after the NAS updates the web.

## 1.15.2 — 2026-10-02

- The salary settlement entrance is changed to a vertical employee button on the left and a compact calendar on the right. The salary source and generation buttons are placed under the calendar; when there are more employees, the list scrolls independently. Narrow screens retain employee buttons with horizontal scrolling at the top and calendar at the bottom. No new database migration is required; it will take effect after the NAS updates the web.

## 1.15.1 — 2026-10-02

- The salary settlement monthly calendar is limited to a maximum width of 360px, the date grid is compressed to 44px, the spacing between the title, legend and range description is tightened, and the narrow screen maintains a compact size; date selection, settlement mark and payment logic maintain the original behavior. No new database migration is required; it will take effect after the NAS updates the web.

## 1.15.0 — 2026-10-02

- The salary settlement page is changed to an employee button and a monthly calendar that allows you to select the first and last dates across months; the yellow/green check marks indicate cash and credit card + gift card settlement respectively, and the cash status is compatible with daily cash settlement. The complete settlement statement and long text message image do not exclude the settlement date.
- Added independent settlement confirmation and manual deduction: the server calculates the outstanding amount and only registers the actual payment after deduction. Zero actual payment can also be confirmed; the settlement record is associated with the payroll ledger to modify, delete and restore the synchronized calendar status. There is no need to guess the settlement range for historical and manual payments; keep the existing ledger and send long drawings. Prevent duplicate or expired payments using transactions, business day locks, idempotency, and preview revision verification.
- Added `20261002010000_payroll_settlement_confirmations` database migration; for NAS to take effect, you need to apply the migration and update the API and Web. There is no need to update the Mac information agent.

## 1.14.23 — 2026-10-02

- The prompts for success, failure, saving, sending and form verification of all web operations will automatically disappear after 3 seconds, covering weekly scheduling application failures; the same prompt will be re-timed if the same prompt is triggered repeatedly, and the timer will be cleared when uninstalling. The financial SMS queuing and member SMS number prompts are changed to on-page feedback, and the retry and original operation restrictions are retained after the loading failure prompt disappears. No database migration is required; it will take effect after the NAS updates the web.

## 1.14.22 — 2026-10-01

- On the widescreen work record page, the work record title, date, synchronization status, and account operations are changed to be left aligned based on the first row of store information. No database migration is required; it will take effect after the NAS updates the web.

## 1.14.21 — 2026-09-30

- The widescreen work record page calendar has been moved to the far left, and operations such as refresh and daily closing are placed on the right side of the calendar. Store codes, work record titles, dates, and account operations are displayed on the right side of the page; Chinese and English switching has been moved to the bottom of the left navigation bar and above the usage help. The language entry and original date toolbar at the top are retained in narrow screens. No database migration is required; it will take effect after the NAS updates the web.

## 1.14.20 — 2026-09-30

- A "Settled" button is added after generating the salary settlement form, which automatically extracts the employee, date range, selected salary source and total amount to register paid wages; refreshes the account book and outstanding balance after saving, prevents repeated clicks and reuses the idempotency key when retrying. Manual registration, modification and ledger are unified into four items: employee, date range, amount, and salary source. The amount is kept in cents; historical records do not infer the salary source. Added salary source field migration; migration must be applied and API and Web updated before NAS update.

## 1.14.19 — 2026-09-30

- The independent "summary of the day" for each day of the salary settlement form is fixed at the front of the day, and the page preview is adjusted synchronously with the long text message image; the long image digest occupies the leftmost column of the first row of the day, and subsequent work records are arranged by time, and the logic of filling gaps at the end is removed. No database migration is required; it will take effect after the NAS updates the web and reinstalls the Mac Information Agent.

## 1.14.18 — 2026-09-30

- Highlight work record automatically excludes automatic discounts from Monday to Thursday: new, edit, and robot highlight operations take effect uniformly, and discounts are immediately removed from detailed preview; manual discounts and manual deactivation status are retained, and re-judged according to current store rules after canceling highlight. Historical records are not rewritten in batches and no database migration is required; it will take effect after the NAS updates the API and Web.

## 1.14.17 — 2026-09-30

- The fixed navigation submenu no longer fixes the sidebar width: the icon bar automatically retracts after the mouse moves out of the entire navigation bar, and the fixed submenu is restored when the mouse is moved in again; keyboard focus expansion is retained. No database migration is required; it will take effect after the NAS updates the web.

## 1.14.16 — 2026-09-30

- The work record and financial AI assistant are moved from the bubble in the lower right corner to the navigation bar as a fixed entrance; when the desktop sidebar is contracted, only the icons are displayed, and when expanded, the "AI Assistant" is displayed, and the small screen is displayed at the bottom navigation. The dialogue panel is displayed through the body portal to avoid navigation clipping, and the focus returns to the portal after closing. No database migration is required; it will take effect after the NAS updates the web.


## 1.14.15 — 2026-09-30

- When clicking on the name of finance or store settings in the desktop navigation, the submenu will be fixed to expand, and the page will be entered through the subitems; after moving out of the sidebar, it will remain expanded, click repeatedly or Escape to unpin it, and click another group to switch to the fixed item. The bottom bar of small screens retains direct navigation. No database migration is required; it will take effect after the NAS updates the web.

## 1.14.14 — 2026-09-30

- The default date range of the salary settlement page is changed to the 1st of this month to the current business day; the coverage start date for registering paid wages is synchronized and defaults to the 1st of this month, which can still be adjusted manually. Existing settlement modifications retain the original date. No database migration is required; it will take effect after the NAS updates the web.

## 1.14.13 — 2026-09-30

- The arrow buttons on the right side of the desktop financial and store settings navigation are removed, and the width of the four main options is unified; the expanded sidebar is narrowed from 256px to 224px, and hover and keyboard focus are retained to expand the submenu. No database migration is required; it will take effect after the NAS updates the web.

## 1.14.12 — 2026-09-30

- Delete the independent business day date and status description area on the widescreen work record page; "Return to today" is moved to the right of "Cancel daily closing". It is not closed or employees can still return when viewing something other than today. The narrow screen button is put into "More Actions" along with the secondary actions, retaining the date picker. No database migration is required; it will take effect after the NAS updates the web.

## 1.14.11 — 2026-09-30

- Fixed the problem of the close button disappearing after scrolling the fast work record: the title and close operation are fixed at the top of the pop-up window, and only the form content scrolls; the pop-up window is positioned through the body portal to avoid the influence of the parent container. The closed entry remains visible on both desktop and small screens. No database migration is required; it will take effect after the NAS updates the web.

## 1.14.10 — 2026-09-30

- The distance between the desktop navigation bar and the main content is adjusted to 12px, the margin on the right side of the main content is adjusted to 18px, and the top language entry is aligned with the edge of the content. No database migration is required; it will take effect after the NAS updates the web.

## 1.14.9 — 2026-09-30

- When viewing today on the work record page, the business day copy is merged into "Current business day: date", and "View business day" and repeated prompts are removed; historical and future dates retain the original description, and the English copy is synchronized. No database migration is required; it will take effect after the NAS updates the web.

## 1.14.8 — 2026-09-30

- The widescreen work record page separates the business day, calendar and action buttons, and cancels the large cards that wrap them; the compact resident calendar is placed on the left side of the language switch, the date line height is reduced from 44px to 28px, and the month navigation and grid space are reduced. The language switching component is reused, and the account operation is placed below it; below 1200px, the original layout and date pop-up window will continue to be automatically restored. No database migration is required; it will take effect after the NAS updates the web.

## 1.14.7 — 2026-09-30

- The new header layout, resident calendar, direct actions and digital logo of the work record page are only enabled when the browser width reaches 1200px; below this width, the original toolbar below the title, calendar pop-up, "more actions", sent text and calendar description are automatically restored. Window zoom switches instantly and retains the selected business day; the financial calendar returns to its original description. No database migration is required; it will take effect after the NAS updates the web.

## 1.14.6 — 2026-09-30

- The business day information and operation area of the work record page are moved to the right side of the store code at the top of the page. The calendar is permanently displayed and will continue to be displayed after month cutting, day selection and refresh; narrow screen automatically wraps lines and arranges vertically. The financial daily closing page retains the click-to-expand calendar.
- Remove the outer menu of "More Operations" on the work record page, display the SMS queue and closed sending summary, and cancel the daily closing directly; the sent quantity is changed to a small number logo, and the "There is a work record but not closed" description at the bottom of the calendar is deleted. No database migration is required; it will take effect after the NAS updates the web.

## 1.14.5 — 2026-09-30

- The desktop icon sidebar has been reduced from 76px to 56px, 4px from the left side of the window; the main content is close to the sidebar, leaving only a 2px gap and a 4px margin on the right side. The upper limit on the width of the desktop main content has been cancelled, freeing up more space for the horizontal work record card. The navigation click area is still at least 44px wide, retaining hover expansion and submenu animations. No database migration is required; it will take effect after the NAS updates the web.

## 1.14.4 — 2026-09-30

- The highlight work record card maintains the same yellow background, golden border and shadow when the mouse is moved in, out and pressed, and its hover discoloration, floating, scaling and transition are canceled to avoid flickering; the checkout pending and read-only highlight cards follow the same rules. No database migration is required; it will take effect after the NAS updates the web.

## 1.14.3 — 2026-09-30

- Restore the original light green background and offline red prompt of the synchronization status, as well as the green text of the success/closed prompt.
- Fixed the problem that the background color of the new version of ordinary cards covers the highlight state; the highlight work record continues to display a yellow background and a golden border in the normal, hover, pending checkout and closed read-only states. No database migration is required; it will take effect after the NAS updates the web.

## 1.14.2 — 2026-09-30

- When the mouse is moved into Finance or Store Settings in the desktop sidebar, the corresponding submenu will automatically expand. Move directly into the sub-item to select; when moving to other main navigations, switch to expand the group, and collapse after leaving the sidebar, retaining the short animation and keyboard expansion button. No database migration is required; it will take effect after the NAS updates the web.

## 1.14.1 — 2026-09-30

- Restore the original warm beige, brick red brand colors and business analysis chart colors according to user requirements, and retain the new version of buttons, cards and layouts.
- The desktop sidebar collapses into an icon by default, expands smoothly when the mouse is moved in or the keyboard is focused, and automatically collapses after leaving it; the expansion floats above the content to avoid table width jumps. Financial and store settings support direct expansion of submenus, expansion/collapse and arrows have short animations, and respond to reduce dynamic effect settings.
- The sidebar and page partition share the role menu configuration; partition switching synchronizes the URL and selected status, refreshes or cross-pages to directly reach the reserved target partition, and employees continue to display only the original available entrance. There are no new dependencies or database migrations; it will take effect after the NAS updates the web.

## 1.14.0 — 2026-09-30

- The web has been fully updated to a dark green and warm white shop workbench: branded sidebars starting from 1200px, and icon floating bottom bars for small screens; today’s indicators are split into independent cards, and work record, finance, settings, personal and login unified buttons, forms, card levels and icons.
- Add button press, card hover, pop-up window/details entry feedback, respect the reduction of dynamic effect settings; retain pending checkout, highlight, payment exception and historical read-only status, and complete the new Chinese and English copywriting. Business analysis chart color synchronization theme.
- Refer to the design ideas of shadcn/ui, Magic UI, Motion and React Bits, and implement it by yourself with existing React/CSS without any new dependencies. Maintenance and reference records are found in `docs/engineering/UI_DESIGN.md`. The business interface, financial calculations and permissions remain unchanged, and no database migration is required; it will take effect after the NAS updates the Web.

## 1.13.7 — 2026-09-29

- Only organize code and documentation: reuse Web API base address and share type, merge daily closing/interval settlement agent authentication, remove duplicate packaging of Walkout snapshots; existing functions, responses, financial formulas and permissions remain unchanged.
- The contract operation analysis test is moved to `test/`, domain and contract construction exclude tests; unused variable/parameter check is enabled, and Docker’s exclusion rules for generated files such as Python cache and plug-in packages are supplemented.
- Add `pnpm docs:check` and repository tool testing and connect to CI, improve the repository structure, plug-in entry, architecture and verification instructions; the repository-wide checklist is saved in `docs/archive/CODE_CLEANUP_2026-09-29.md`. No database migration, NAS deployment or plug-in reinstallation required.

## 1.13.6 — 2026-09-29

- "Cancel" at the bottom of the weekly schedule pop-up window is changed to "Apply", and the current check is used to overwrite the schedule of the date being viewed, and the weekly template is not saved; if there is already a work record (including pending settlement and deletion history) or closed on that date, it fails and the original list is retained. No database migration is required, and it will take effect after the NAS updates the API and Web.

## 1.13.5 — 2026-09-29

- Fixed the issue where employees were removed from tomorrow’s work record after automatic scheduling and then added back by the weekly template when refreshing; single-day removal and hidden blank row removal will continue to be retained, and manual re-adding is supported. Other dates will not be affected. No database migration is required, it will take effect after the NAS updates the API.

## 1.13.4 — 2026-09-29

- The work record details note column will no longer automatically select all when clicked or focused, retaining the native cursor positioning and text selection; other input boxes maintain the existing select all behavior. No database migration is required, it will take effect after the NAS updates the web.

## 1.13.3 — 2026-09-29

- A small note icon is displayed in the lower right corner of the work record card on the home page with non-empty notes, side by side with the pending settlement and payment difference prompts to avoid blocking the amount; blank notes are not displayed. No database migration is required, it will take effect after the NAS updates the web.

## 1.13.2 — 2026-09-29

- Streamlined ordinary deployment: local lightweight pre-checking, complete verification is handed over to the corresponding submitted CI; local image build or script completed online check is no longer repeated, backup, migration and health check are retained.
- CI shared package preparation is reduced from three times to once, and API unit tests are executed once along with integration tests; full SHA is used to wait for running, and only command line acceptance is performed by default. No database migration required.

## 1.13.1 — 2026-09-28

- The weekly work schedule is saved and takes effect immediately. The store owner/manager can check tomorrow through the business day calendar today; future dates are automatically updated according to the latest template and the current attendance sequence, and are no longer fixed by the results when first opened. A refresh without changes does not write a new version.
- Only the people who were automatically added by the template and have been canceled or have no work records or shifts will be removed from future dates, and will remain manually added; the people who have been scheduled today, their history, and their closed date will remain unchanged. No new migration is required, it will take effect after the NAS updates the API and Web.

## 1.13.0 — 2026-09-28

- A new weekly schedule setting is added to the Today page, and workers are configured from Monday to Sunday; the default workers for the day are automatically added every day and the existing schedule rules are used to generate the order.
- The financial gift card ledger supplements the usage records of old cards without card sales registration. The details are directly displayed for a single use and can be expanded after multiple uses are combined; no new sales revenue or unknown balances are calculated.
- Store preset discounts support percentages and coexist with fixed amount discounts; the work record follows the pre-discount items and add-on total calculations, integer cent rounding, and historical snapshot rules.
- Contains database forward migration; NAS needs to update API, Web and apply migration to take effect.

## 1.12.7 — 2026-09-27

- On the work record page, gift card sales and customer records are always of the same height when placed side by side; when there is a record in any column and the other column is empty, the empty column will also stretch with the taller card. Preserve existing width allocations and narrow screen layouts. No database migration is required, it will take effect after the NAS updates the web.

## 1.12.6 — 2026-09-27

- The new work record card is restored to the normal work record on the left, and the highlight group is still arranged on the right, and the new entry is no longer pushed to the right.
- When overflowing horizontally, it will automatically return to the right side of the new entrance to reveal 1.5 highlights; when there is only one highlight, the card will be displayed and half of the blank will be filled; if there is no highlight, half of the card will be left blank. Narrow screens with insufficient space will give priority to fully displaying the new entrance; if it does not overflow, no additional white space will be left, and it will remain for 10 seconds to stop operations and drag protection. No database migration is required, it will take effect after the NAS updates the web.

## 1.12.5 — 2026-09-27

- Employee work record cards are arranged according to ordinary work record, new entry, and highlight work record; highlights are concentrated on the right side and arranged from right to left according to time. When the record is less than one screen, the new entrance and highlight group are placed to the right.
- When the list overflows, you can slide left and right; when it is not closed, stop the operation for about 10 seconds and then return to the new entry as the anchor point to ensure that the new card is completely displayed on the right side of the visible area; maintain drag protection and reduce dynamic effects. No database migration is required, it will take effect after the NAS updates the web.

## 1.12.4 — 2026-09-25

- Add "Save Image" to the pop-up window for sorting, and export a PNG containing date, current/generated ranking, change prompt and complete reason for eviction locally in the browser; supports Chinese and English, automatic line wrapping of long content, and divided long content into numbered images.
- Disable export when there is no sorted snapshot, prevent repeated clicks during generation and display a failed retry prompt; no database migration is required, and it will take effect after the NAS updates the Web.

## 1.12.3 — 2026-09-25

- Roll back to this version as requested by users, withdraw the unreleased desktop accordion condensed card transformation, and restore the complete work record card and original employee row layout.

- The individual daily statement and web page PNG are changed to a compact work record card, which displays the project time, the service fee base before discounts and the total tips; the card amount is framed and accessibility instructions are provided, and the gift card is marked with small characters. Only the pending checkout status is retained, and the payment split and current salary are removed.

## 1.12.2 — 2026-09-24

- Adjust the gift card sales card: the "serial number" label goes with the number; the discount percentage is hidden when automatic discount is not enabled; the repeated actual receipts and card swipe amounts are merged, and the card swipe amount box indicates that the card has been swiped; the card height is consistent with the ordinary work record card.

## 1.12.1 — 2026-09-23

- Streamline the gift card area and remove the description, income summary and store item labels; the success prompt will disappear after 3 seconds. The sales display shows the actual discount derived based on actual receipts, the card amount is framed, and the zero-yuan payment is hidden.

## 1.12.0 — 2026-09-23

- The guest record adds an editable number of guests (default is 1 digit, 1–999 integer), and cards, title summaries, and business analysis are based on the actual number of guests; historical records are retained as 1 digit through forward migration.

## 1.11.4 — 2026-09-23

- Gift card sales allow the actual receipt to be lower or higher than the payable after discount; new additions and modifications are only prompted for confirmation when saving, and the page does not display different colors or marks. Store income is still calculated based on the total of cash and card payment. The new database forward migration removes the constraint that the actual revenue must be equal to the payable, and the migration needs to be applied when the NAS is updated.

## 1.11.3 — 2026-09-23

- Gift card sales and customer records always go hand in hand: when there are records in only one column, let that column occupy the main width, and keep the empty columns compact; when both columns have records or are empty, each takes half.

## 1.11.2 — 2026-09-23

- The description of the number of customers has been moved to the same line after the title, and will automatically wrap when there is insufficient space on a narrow screen.

## 1.11.1 — 2026-09-23

- When the gift card and Walkout records are both empty, they are side by side and of the same height. When there are records in any column, they are arranged one above the other. Remove the copy of the Pauke empty status, and the save and delete success prompts will automatically disappear after 3 seconds.

## 1.11.0 — 2026-09-23

- The runner record is moved below the gift card sales and occupies the entire row independently. Added optional notes (up to 500 characters), which support filling, modifying and clearing, and are displayed on the record card; historical records default empty notes, and forward migration is added.

## 1.10.0 — 2026-09-23

- On the work record page, gift card sales and customer records are displayed side by side; a new daily customer number record is added, which supports maintenance by business day and occurrence time, and follows permissions, daily closing lock, idempotency, version and audit rules.
- In the daily work record quantity chart of business analysis, the number of runners is superimposed on the number of work records. When the number of runners is zero, the segment is not displayed, and the unique date of runners is still displayed; runners do not affect finances. Added Walkout data table and migration, it will take effect after NAS updates API/Web and performs migration.

## 1.9.4 — 2026-09-22

- The hourly work record details of the business analysis only display the period selected in the chart, and the daily number of transactions is updated simultaneously when the period is switched; when no selection is made, a selection prompt is displayed, and zero transaction dates continue to be hidden.

## 1.9.3 — 2026-09-22

- A store manager or manager can generate or regenerate employee sequences for future dates, preserving past dates, daily closing, permissions, and version protection.
- The future date button and sorting basis clearly correspond to the selected date; rotation is based on the most recent visible order saved before the selected date, and the previous list needs to be manually regenerated after changes.
- Added future date generation, regeneration and historical basis regression verification; no new database migration is required, and the NAS needs to update the API/Web to take effect.

## 1.9.2 — 2026-09-22

- Clean up duplicate implementation: Financial pages share the date auxiliary module, robot amount and time parsing/display are separated from the service, Mac attachment rendering shares escaping, amount and time formatting, and unused parameters are removed.
- The Mac Information Agent heartbeat version reads the package version and removes obsolete hard-coded version numbers.
- Streamline document duplicate descriptions and indexes, correct CI test descriptions, dependency graphs, module lists, and duplicate API entries; retain historical designs, published migrations, and old snapshot compatibility logic.
- No business functions are added or interfaces or page interactions are changed; no database migration is required. The NAS application and the installed Mac agent need to be updated separately to use the code compiled this time.

## 1.9.1 — 2026-09-21

- Store owners and managers can enter future dates from the work record calendar and add employees in advance, support switching to subsequent months, and page data refresh to maintain the selected date.
- Added Chinese and English prompts for future business day; date range for ordinary employees and financial daily closing and cash settlement restrictions remain unchanged.
- No database migration is required; the NAS needs to update the web application to take effect.

## 1.9.0 — 2026-09-21

- Keep the position of the generate order button at the bottom, and add a question mark on the right side. You can view the latest attendance, rotation and comparison basis for the same position one by one. It supports Chinese and English.
- When generating the sequence, the transaction saves the interpretation snapshot; after manual adjustment, addition, hiding or removal, the current position and the ranking at the time of generation are distinguished. If the old version lacks a snapshot, it will be clearly prompted.
- The explanation is only open to store managers and managers, and does not introduce AI; a new `daily_boards.ranking_explanation` nullable field is added, and the NAS needs to be migrated and the API/Web is updated to take effect.

## 1.8.8 — 2026-09-21

- Move the Generate/Regenerate Today's Order button to the right side of the Add Employee button; the ranking entry will still be retained when all employees have joined, and the narrow screen allows the button to wrap.
- No database migration is required; the NAS needs to update the web application to take effect.

## 1.8.7 — 2026-09-21

- The daily opening ranking cancels the priority of the day's roster entry time; the historical rotation, full-time priority and latest attendance date rules are retained, and stable sorting is based on fixed member IDs when the players are in the same position.
- Covers the regression verification that the joining time of new employees and historical employees is independent of the input order; no database migration is required, and the NAS needs to update the API application to take effect.

## 1.8.6 — 2026-09-21

- Today's employee card removes the numerical ranking circle in front of the name, retaining the automatic ranking and manual moving up and down functions.
- No database migration is required; the NAS needs to update the web application to take effect.

## 1.8.5 — 2026-09-20

- Rearrange work date details by hour: time period and total stratification, date and number of transactions are displayed in pairs in an adaptive grid, and zero transaction dates are hidden.
- Business analysis cards are arranged independently according to content height to avoid expanding the details and stretching adjacent charts.

## 1.8.4 — 2026-09-20

- The operation error report of the work record details floats at the top of the window, automatically fades out after one second, and is no longer hidden at the bottom of the scroll area.
- When modifying the AM/PM, project or add-on duration of the start/end time, the linkage only adjusts the clock, and the service date is only modified by the date picker; if crossing midnight causes the end to be earlier than the start, a correction prompt will be prompted, and all save paths will be uniformly verified.
- No database migration is required; the NAS needs to update the web application to take effect.

## 1.8.3 — 2026-09-20

- Business analysis: The data table of hourly work quantity displays the number of transactions in each time period day by day. If there is no work record, the date will display zero, and the total time period will be retained.
- The analysis interface supplements the 24-hour number per day, inheriting the saved business day and time zone snapshot; no database migration is required.

## 1.8.2 — 2026-09-20

- Fixed the problem of the SMS queue pop-up window disappearing and locking the page 10 seconds after "More Actions" is expanded: the pop-up window is mounted independently and is not affected by the automatic collapse of the menu. It still supports the close button, Esc and clicking on the background to close. No database migration is required, the NAS needs to be updated to take effect.

## 1.8.1 — 2026-09-19

- The hourly work line and week × hour heat map only display the actual earliest to latest work hours in the selected date range, and empty hours in the middle are kept as zero; when there is no work record, an empty status is displayed.

## 1.8.0 — 2026-09-19

- Finance has added special business analysis for store owners/managers: hourly work line, daily work record bar, weekly average revenue, daily revenue and 7-day moving average, week × hour heat map.
- The analysis defaults to all history, independent date filtering; the quantity includes pending settlement, revenue is only counted based on the closed day, and the historical time zone snapshot is used for the hour.
- Added read-only business analysis interface, sharing contract, statistics and permission test; no database migration required.

## 1.7.7 — 2026-09-19

- The "Employee Operations" and "More Operations" on the work record page will automatically collapse 10 seconds after each expansion; the bottom navigation "Today" is renamed to "work record", synchronizing the English name. No database migration is required, the NAS needs to be updated to take effect.

## 1.7.6 — 2026-09-19

- The retryable failures of daily closing and interval settlement will be waited for 60 seconds, with a maximum of 3 additional retries (4 attempts in total); the protection of manual verification when the sending result is unclear is retained.

## 1.7.5 — 2026-09-19

- The first daily closing automatic text message will only be queued to employees who have undeleted work records on that day, and the receiving switch, number verification and idempotency protection will be retained; an empty business day can still be used for daily closing.
- The Mac message agent cools down for 60 seconds after the daily closing and interval settlement tasks. It will wait even if it fails to avoid intensive sending; it will not automatically resend text messages with unknown results. Filtering requires updating the NAS, sending rhythm requires upgrading the Mac agent separately, and no database migration is required.

## 1.7.4 — 2026-09-17

- The outer border of the "Actual Receipt" area of the work record small card is removed to avoid confusion between cash and credit card; the thin frame of the amount of card swiping and the "receivable" frame of pending settlement are retained.

## 1.7.3 — 2026-09-17

- Clear text message individual daily statement PNG fixed the original width of 1170 pixels, increased the actual PNG size and multiple line breaks regression verification in Chinese and English; continue to use the compact template with shallow bottom and eye-catching total income, payment details on the right and cash handover summary removed.
- Supplementary troubleshooting instructions for the independently installed version of SMS Agent: Web page or NAS updates will not automatically update image templates installed on the machine.

## 1.7.2 — 2026-09-17

- The daily summary changes "cash to be submitted" to "cash service fee", displays the cash service commission payable to employees in the store, uses the discount commission and cash payment allocation of the confirmed work record, and no longer displays the store's 40%.
- Make it clear that discounts will be borne by the store, cash tips will be collected by employees themselves, and cash disbursement status, Chinese and English instructions and help documents will be synchronized. The old API fields and financial cash settlement compatibility standards are retained without database migration.

## 1.7.1 — 2026-09-17

- Cleanup only: Remove unreferenced date and time components and styles, default language constants, unused imports/dependencies/parameters, and invalid role passes; retain HTTP input parameter validation and published compatible fields.
- Web work record and robot reuse the same automatic discount implementation; plug-in 1.4.1 merges employee name and original text fragment verification without changing the intent, amount or permission semantics.
- The document deletes the old plug-in version installation requirements and the old statement that person-by-person sending must be closed; collects duplicate handoff/maintenance rules, retains the rules with reasons, and archives historical reviews. No database migration, no new features.

## 1.7.0 — 2026-09-17

- LangBot plug-in 1.4.0 supports the same command to clearly specify multiple employees: for example, "Ling Jessie goes to work vigorously", which is the work record of two people respectively; the complete names are matched according to the employee directory.
- The new BATCH protocol supports start-up, shutdown and adjustment, and each person retains the original text evidence; the entire operation is executed with the same transaction, and all operations are rolled back if it fails. Repeated WeChat messages will not duplicate the work record.
- Fixed the problem of missing the name of the employee before the action was lost in the deterministic start-up analysis; when the amount distribution among multiple people is unclear, it still needs to be clarified.
- No database migration; taking effect requires upgrading the NAS API and installing new plug-ins.

## 1.6.0 — 2026-09-17

- LangBot plug-in 1.3.0: When encountering ambiguity or understanding correction, make guesses and ask, and after confirmation, personal language experience is persisted for reference for subsequent understanding.
- Learn to isolate by configuration, store, robot, group, and sender; including deduplication, expiration confirmation, correction replacement, and storage failure prompts.
- Work-context adds stable storeId without database migration; it will take effect after upgrading the API and installing new plug-ins.

## 1.5.3 — 2026-09-17

- The main number of today's work record card service fee shows the original price including add-on, and the small box behind shows the actual payment split; the small box waiting for checkout shows the amount receivable after discounts.
- Synchronize Chinese and English help instructions, retain discounts, payment methods, tips and exception flags; no database migration.

## 1.5.2 — 2026-09-17

- Improved work record synchronization for multiple devices under the same account: SSE event query shared by the same store, independent broadcast of connections by device, and continuous verification of respective permissions.
- Added heartbeat timeout reconnection, switching back to the foreground/restoring the network to supplement synchronization, and low-frequency retries in case of exceptions; synchronization will be displayed only after successful reading, and the real-time connection will be closed in the background.
- Merge continuous refresh and reduce irrelevant reads by entity and business day, retain the editing draft, date and scroll position; SSE explicitly disables proxy buffering and adds NAS troubleshooting instructions.
- Added multi-subscription, real work record transactions, silent disconnection, background recovery, slow request and failed retry regression tests; no new database migration.

## 1.5.1 — 2026-09-17

- Individual daily statement web page PNG and text message PNG remove the service fee base and the cash summary column that should be submitted, and use a light background and more eye-catching dark large fonts for the total income.
- The work record of each transaction is changed to a compact layout on the left and right, with projects, time and income on the left, and service fees and tips on the right; long content is automatically wrapped, and the height of the picture is calculated according to the content to reduce white space.

## 1.5.0 — 2026-09-17

- Added API built-in scheduled tasks: Check every day at 23:30 in each store's time zone. Daily closing will be automatically performed only if there are no daily closing exceptions; closed or canceled daily closing dates will not be automatically re-closed.
- At the first daily closing of each business day (manual, forced or automatic), an employee summary sending task is automatically created in the same transaction, and is limited to active members who have enabled reception and have valid numbers; summaries that have been sent, queued or being sent on the day will not be created repeatedly.
- Mac Messages agent sending and failure handling are still used; time zone, exception interception, concurrency idempotency and first daily closing sending verification are added.

## 1.4.48 — 2026-09-16

- The "Daily Work Record" card for salary settlement removes the actual collection of service fees, centrally arranges items and time, and aligns the service fee base and tips details.
- The income composition is changed to two columns, with the total occupying one row; the spacing between the day's summary cards is tightened, and the original salary calculation is retained.

## 1.4.47 — 2026-09-16

- Open the store owner's own in-store display name and default commission editing, and retain the store owner identity transfer restrictions.
- Member and financial SMS numbers are input and displayed using US 10 digits, and +1 is automatically added when saving; if there is no bound number, leave it blank and remove the sample number placeholder.
- Supplementary number format conversion and no-number verification.

## 1.4.46 — 2026-09-16

- The detailed discount of work record supports the input of amount or percentage. The percentage is calculated based on the total of the main items and all add-ons. The proportion and reduction amount are saved persistently and are automatically recalculated after editing the amount.
- The off mark in the upper right corner continues to display the actual deduction amount, retaining the fixed amount, automatic discount and employee salary rules.
- Added a new nullable rate_bps snapshot field and range constraints; old records continue to be processed as a fixed amount. Supplementary parsing, contract and database integration verification.

## 1.4.45 · 2026-09-16

- Move the "pending checkout" mark from the upper right corner of the work record card to the lower right corner, and reuse the location with the payment exception "!" that only occurs in confirmed records; only add-on and discount marks are retained in the upper right corner to reduce narrow card congestion.

## 1.4.44 · 2026-09-16

- The fixed width of the work record card and the new entrance is further narrowed by 5px to 177px, and the left and right inner margins are adjusted to 6px, leaving a net width of about 163px for the longest time range; the time continues to be displayed in a single line in full.

## 1.4.43 · 2026-09-16

- The fixed width of the work record card and the new entrance is further narrowed by 10px to 182px, and the left and right inner margins are simultaneously reduced to 9px; the time font size of 0.95rem is retained, and it is verified that the maximum time range can still be displayed in a complete single line.

## 1.4.42 · 2026-09-16

- The fixed width of the work record card and the new entrance is narrowed from 208px to 192px, and the left and right inner margins are reduced to 10px; the time font size is maintained, and the time range is displayed in a single line without line breaks or omissions.

## 1.4.41 · 2026-09-16

- Adjust the vertical layout of the work record card: the project, time and amount groups are evenly distributed, the amount group is close to the bottom inner margin, the distance between service fee and tips is increased to 6px, and the large blank space at the bottom after the card is stretched is eliminated.

## 1.4.40 · 2026-09-16

- The work record track is stretched according to the available height of the employee card, the upper and lower margins on the desktop are reduced to 6px, and the small card is at the same height as the new entrance.
- The work record time font size has been increased from 0.85rem to 0.95rem to improve readability and retain a compact amount layout.

## 1.4.39 · 2026-09-16

- Corrected the service fee display definition of the compact work record card: the confirmed record displays the actual credit card, cash and gift card amounts split, the card amount is framed, mixed payments are connected with a plus sign; the off discount mark is retained, and the pre-discount amount is not repeatedly displayed.
- The pre-discount service fee, tips and compact layout will remain unchanged pending checkout; Chinese and English help and product descriptions will be synchronized.

## 1.4.38 · 2026-09-15

- Today's work record card merges service fee, tips and payment methods, and removes duplicate paid figures; the service fee before discount is retained, including a frame for payment by card, the discount continues to use the off mark, and tips is retained and split by the payment method.
- Reduce the work record card height and padding, synchronize Chinese and English help and product descriptions; actual payment data and financial calculations remain unchanged.

## 1.4.37 · 2026-09-15

- Corrected the problem that the robot's work response treats all active employees in the store as today's work schedule: the idle and earliest dismissal lists only include employees who are not hidden or removed from today's local work schedule in the store.
- Added unscheduled, yesterday's scheduled, removed scheduled, cross-time zone date and empty list regression verification; maintain compact reply.

## 1.4.36 · 2026-09-15

- On the work record page, refresh, daily closing (cash settlement when closed) and more operations are moved to the right side of the business day column and placed above the summary card; the narrow screen automatically wraps lines, retaining the original permissions and operation behaviors.

## 1.4.35 · 2026-09-14

- The work record page refresh is changed to a serial merge queue. Sudden real-time notifications and manual refreshes only retain one subsequent read to avoid accumulation of concurrent refreshes. The employee list, table, catalog and store details are read in parallel, reducing network waiting.
- Add concurrent notifications, store cut cancellation and failed retry regression testing; authentication, business data and database structure will not be changed.

## 1.4.34 · 2026-09-14

- The financial daily subtotal displays the average revenue of the past 30 days after today's turnover. It follows the closed definition of the entire store on the work record page, and tightens the date and week columns; synchronizes Chinese, English and interface descriptions.

## 1.4.33 · 2026-09-14

- The scheduling type is no longer displayed under the working status of the employee card; the employee drag sorting entry, status, event and style are completely deleted, and only the move up, move down, and synchronization help instructions are retained.

## 1.4.32 · 2026-09-14

- Solid project maintenance requirements: Restart the local development and test service after each change is completed, open the fixed 3000 port page, check the Web/API readiness and keep the service running.

## 1.4.31 · 2026-09-14

- For financial cash settlement, click "Mark All Settled" to submit directly, and the remark input box will no longer pop up; delete the work record and retain the deletion confirmation. After confirmation, it will be deleted directly without asking for the reason. Inherit existing optional field contracts, permissions, versions and auditing mechanisms.

## 1.4.30 · 2026-09-14

- The local demo seeds were expanded to 5 main projects, shop owners and 4 employees. Each person made 3-6 transactions on the day, with a total of 22 work records; historical demonstration scenes were retained, and commission snapshots were generated according to the default ratio of employees. Synchronize local login and refresh instructions.

## 1.4.29 · 2026-09-14

- The expanded employee work record card uses a compact left employee information bar on tablets and desktops to concentrate name, status, employee operations, work record number and individual daily statement; the right amount column is narrowed to 156px, leaving more space for the work record list. The phone continues to wrap lines, and the collapsed state retains the horizontal summary.

## 1.4.28 · 2026-09-14

- On the computer side (width greater than 900px), the complete single-line summary of today's/historical work records is restored, the entire amount is displayed in the original order, and "more summaries" are no longer displayed; the narrow screens of phones and tablets retain the folded layout.

## 1.4.27 · 2026-09-14

- Complete the site-wide responsive acceptance, fix the 320px English date and "More Operations" extrusion, audit date and set drop-down box style; tighten the bottom operation area of work record details, and the tablet AI entrance is also arranged according to the content.

## 1.4.26 · 2026-09-14

- The store's revenue is uniformly calculated according to "revenue (including actual receipts from card sales) + tips - employees' dues - gift card write-off". The revenue field function is reused to keep the amount result unchanged and the card sales are only counted once.
- Synchronize work record page prompts, financial formulas, Chinese and English help and project documents, and supplement card sales and write-off regression verification.

## 1.4.25 · 2026-09-14

- The entire site unifies the font size, page header, form, tab navigation, and card spacing for phones, tablets, and desktops; uses normal document flow for language switching, and fixes the extrusion of titles, exit buttons, dates, and long text.
- Today's and historical work records are given priority to display revenue and total income, and the remaining statistics are placed in "More Summary"; daily closing/cash settlement retains the main entrance, and SMS queue, reissue and cancellation of daily closing are placed in "More Operations".
- Organize five financial sections, set up six sections, personal information, login, help, offline and AI pages; the mobile AI buttons are arranged according to the content, and the bottom navigation continues to be blank according to the actual height.
- Unify the narrow screen layout of work record, date, employee selection and settlement pop-up windows; restore browser zoom, and complete the selected state of the current page of the main navigation and the settings label.

## 1.4.24 · 2026-09-14

- When the hour and minute boxes for inputting new work records and shared time are clicked or focused, the original content is selected and replaced directly; if not input, the original time is retained.

## 1.4.23 · 2026-09-14

- Work record details additional items with added amount (dollars), extra time (minutes) and commission labels to avoid confusion about the meaning of the numbers.
- Fixed the problem that the extra time of this order of preset extra items is overwritten by the directory default value; the modification, zero minutes and blank are retained after saving.
- When the work record details text, amount, duration and remarks input box are clicked or focused, the original content is selected and can be replaced by directly typing it in. Simply clicking will not clear it.

## 1.4.22 · 2026-09-13

- The individual daily statement's image generation, saving/sharing, text message sending, and success or failure prompts are moved to the right side of the employee's name in the card; narrow screens automatically wrap lines.
- The original image generation, sending permissions and queue process are retained, and the image preview is still located below the work record one by one.

## 1.4.21 · 2026-09-13

- The business day is changed to the device's local date and midnight, and it no longer switches from closing or closing time to the next day in advance; today, permissions and new work record date rules are synchronized.
- Removed the business day cutoff controls for store creation, settings, and today pages; evening entries no longer go back to the previous day, and today is automatically refreshed across midnight.
- Preserve historical business day and compatible fields; add cutoff boundary, cross-year and device time zone context regression validation.

## 1.4.20 · 2026-09-13

- Corrected the repeated addition and subtraction of gift card net income in the financial summary: the actual charge from selling cards is added once, the write-off of gift card service fees and tips is reduced once, and the card processing fees are deducted after reusing the total income formula on the work record page.
- Synchronize work record page prompts, financial indicators, Chinese and English help instructions and examples; add two pages and daily subtotals, gift card income and expenditure regression verification, and retain negative income.

## 1.4.19 · 2026-09-13

- Revenue is changed to post-discount service performance plus actual receipts from gift card sales; the calendar and closed average revenue are synchronized, and the scope of card sales is limited according to the original filtering and permissions.
- Added server `revenueCents`, retaining the post-discount service performance field and store revenue, total revenue, turnover, salary and write-off formula to avoid repeated counting of selling cards.

## 1.4.18 — 2026-09-13

- A new "Additional minutes" input is added to each additional item in the work record details. The default item will bring the configuration value. You can also leave this item blank, fill in 0, or change it to the actual number of added minutes.
- After adjusting the additional project minutes, the end time is immediately recalculated based on the total duration of the main project and all add-ons; it is still used as a snapshot of the currently recorded duration when saved.
- Synchronized product documentation, versions, and regression testing; no database migration, no NAS deployed.

## 1.4.17 — 2026-09-13

- Fixed the issue where the end time is cumulatively offset by the historical difference when the work record details are repeatedly changed to project minutes; each time it is recalculated based on the current start time and the total duration of the project and additional projects.
- The end time is changed to editable hours, minutes and AM/PM input; after manual modification, the system back-calculates the start time based on the current total duration, and retains the same day and sequence verification.
- Synchronize product and engineering documents, versions and regression testing; no database migration, no NAS deployed.

## 1.4.16 — 2026-09-13

- Modified average performance denominator: The window is the current day plus the past 29 natural days, only the discounted performance and number of days on the actual closed date are included, and the current day is only counted once; missing or not closed dates are excluded, zero performance closed dates are retained, and are not added outside the window.
- Keep the closed date on the current day to be displayed; add only the regression tests for the current day, the complete 30 days and the lack of daily closing in between, and synchronize the documents and versions; there is no database migration, and no NAS is deployed.

## 1.4.15 — 2026-09-13

- Correct the 30-day average performance of the work record to be the total discounted performance of the "closed day + the previous 29 natural days" divided by 30; history no longer filters the closed date, and empty dates are calculated as zero.
- Keep the conditions that are displayed only when it is closed on the current day, synchronize documents, versions and regression tests; there is no database migration and no NAS is deployed.

## 1.4.14 — 2026-09-12

- The average revenue of the past N days at the top of the work record is clearly included in the revenue and number of days on the selected closed day. The amount is directly summarized from the dashboard of the day and is only counted once; it is still only displayed when the day is closed, and the previous 29 days are only included in the closed date.
- Synchronize products, API documents and versions, add not closed, zero revenue and anti-double counting tests; no database migration, no NAS deployed.

## 1.4.13 — 2026-09-12

- The "Hidden Employees" admin area has been moved below gift card sales.
- When hiding employees who do not have any work records on that day, atomically remove the employee rows and work records for that day; existing work records (including deleted history) will continue to be retained and support recovery display.
- Synchronization interface, product documentation, Chinese and English prompts and versions, supplementary removal, idempotency, permissions and conflict integration tests; no database migration, no NAS deployed.

## 1.4.12 — 2026-09-12

- When the number of employees working today is empty, "Please select an employee" will open a multi-select pop-up window that displays the check number. You can add the selected employees in the order of clicks with one click; after canceling, reselect to the end.
- If there are already employees, the single-person addition will be retained; batch addition will prevent repeated submissions. If it fails midway, the unfinished selection will be retained and the saved employees will be refreshed.
- Synchronize Chinese and English, product documents and versions, supplement the selection sequence and sequential submission test; no database migration, no NAS deployed.

## 1.4.11 — 2026-09-12

- The not closed work record list stops at the far right by default, making it easier to add new work records; after manually viewing the previous record, it will automatically return to the end after stopping the operation for about 10 seconds. It will not be forced to return when the operation is continued or when dragging.
- closed does not return automatically, retaining the existing "skip to last" button; synchronizing product documents, versions and scrolling behavior testing, no database migration, and no NAS deployed.

## 1.4.10 — 2026-09-12

- The save and delete buttons of the closed work record details are grayed out and disabled. The shop owner/manager can cancel the daily closing on the left side of the save. After refreshing, the currently filled content will be retained and continued to be saved.
- After the average revenue of the past N days at the top is moved to revenue (after discount), the calculation definition remains unchanged.
- A hover-displayed "Skip to the end" button is added to the far right of the desktop work record card area; it is hidden when there is no overflow or the end is reached, and is not displayed on phones.
- Synchronization of Chinese and English, product documents and versions, no database migration, no NAS deployment.

## 1.4.9 — 2026-09-12

- On the closed work record page, a dark brown "cash settlement" entry is added before "Cancel daily closing", which jumps to financial cash settlement and retains the store and selected business day.
- The SMS queue details are included in the light-colored button after "Send Employee Summary", which always displays the number of messages sent. The pop-up window retains the task status and cancels the queuing operation; the queue entry is also retained when it is not closed.
- Synchronize Chinese and English, product documents and versions, no database migration, no NAS deployed.

## 1.4.8 — 2026-09-12

- Added average revenue to the "Key Result" of the financial summary, calculated based on the discounted performance of the closed date in the selected range, showing the actual number of daily closing days, using the current filter.
- Not closed dates are excluded, empty daily closing dates are counted as zero; dashes are displayed for no daily closing dates. Synchronized Chinese and English instructions, card layout, product and interface documents, no database migration, no NAS deployment.

## 1.4.7 — 2026-09-12

- The closed work record page displays "average revenue over the past N days" after the total revenue. The discounted average revenue is calculated based on the actual number of closed days in the 30 natural days preceding the selected day (including the current day).
- Exclude not closed dates and keep zero revenue daily closing; support only 1 day, recalculate after canceling daily closing, employees will not return to the whole store indicators; synchronize Chinese, English and mobile layouts.
- Updated product, interface documentation and versions, no database migration, no NAS deployed.

## 1.4.6 — 2026-09-12

- "Total revenue" is added to the last column of the daily subtotal of the financial summary, which is calculated based on store revenue + store manager revenue + manager revenue. It is visible by default and when all columns are expanded.
- Remove the cumulative balance block from the financial summary page and retain the salary settlement ledger and back-end balance calculations.
- Synchronization of interfaces, product documents and versions, no database migration, and no NAS deployed.

## 1.4.5 — 2026-09-12

- The business day calendar displays the discounted revenue in small fonts under the closed day number, and only displays the amount; the not closed date continues to use orange dots.
- The backend summarizes the discounted amount of undeleted work records by business day, and employees can only see their own amounts; the amount is removed after canceling daily closing. Clean up the old marks when turning over the month, cutting stores, and reopening to avoid request racing to display the old amount.
- Synchronization of interfaces, product documents and versions, no database migration, and no NAS deployed.

## 1.4.4 — 2026-09-12

- When there is no card sales record for the selected business day, the gift card area is automatically reduced to a compact narrow strip at the height of the employee's folding column, leaving a zero card/revenue and editable record card sales entry.
- The complete card will be restored after saving the first sale, and it will be automatically abbreviated after deleting the last one; the narrow screen of the phone allows line wrapping, and the daily closing read-only permission remains unchanged.
- Product documents and versions are synchronized, no database migration is required, and NAS is not deployed.

## 1.4.3 — 2026-09-12

- The top of the today/history board is changed to revenue (after discount), total discount, total gift card, store revenue and total revenue.
- The total income at the top is calculated by the back end based on the store income plus the service commission and tips of the store manager and all managers. It contains hidden rows and does not overlap gift card income and expenditure; the total gift card amount shows the actual payment received from selling cards.
- Synchronize documents in Chinese, English and monetary terms, and add new field calculation tests; retain the compact employee column of the previous version, no database migration, and no NAS deployed.

## 1.4.2 — 2026-09-12

- The wide screen of employee cards moves employee operations and individual daily statements to the name column, and the narrow screen automatically wraps lines. Mobile phones retain the two-line layout and allow long names to wrap.
- A new work record number icon is added before the individual daily statement to display the number of undeleted work records (including pending settlement) for the selected business day. It can still be viewed after being folded.
- No database migration; only modification and verification, no NAS deployed.

## 1.4.1 — 2026-09-12

- The work record time period uses the AM/PM selection box uniformly, without manual input.
- The end time of the work record details is changed to read-only display, which is linked in real time with the start time and project duration; the missing end time is calculated based on the project and add-on duration, and the actual duration is retained.
- Same-day time verification is retained, and Chinese and English prompts are synchronized; there is no database migration, and no NAS is deployed.

## 1.4.0 — 2026-09-12

- LangBot plug-in upgraded to 1.2.0: Each AI understanding comes with the last 5 rounds of user messages and actual replies from the same robot, group and sender; it expires after 30 minutes of idle time, is cleared upon restart, and only the memory cache is retained.
- The history is isolated according to the real-time store context and plug-in configuration; concurrent requests from the same sender are processed in sequence, duplicate messages are not added to the history repeatedly, and the number of cached sessions and the length of a single message are limited.
- History only assists understanding and does not replace the original evidence of this article, real-time query, or back-end authority and accounting verification. Added historical delivery, isolation, deduplication, failure recovery and capacity/expiration regression testing.
- This round only modified and verified the source code, without installing plug-ins or deploying NAS; it is compatible with protocol 2 of API 1.3.7 and above, and there is no database migration.

## 1.3.10 — 2026-09-11

- The daily subtotal of financial statistics displays the week column next to the date by default. There is no need to click "Show all columns"; the business day period and Chinese and English week formats are used.

## 1.3.9 — 2026-09-11

- Successfully reply to add idle employees; when all employees are busy, the earliest expected off-duty employees and the store's local time will be displayed, and the employees will be listed together.
- The status includes robot and web page work records, which follow the web service time definition; dates are marked across days, and unknown end times are not guessed. The reply is still a compact two lines, and the original reply is retained for repeated messages.

## 1.3.8 — 2026-09-11

- Organize the workspace navigation and LangBot plug-in development entrance, and clarify the boundaries of plug-in source code, upstream operating environment, installation package and persistent data.
- Move early cross-project implementation records to the history archive; move the local 9 old plugin packages to `integrations/langbot-plugin/dist/archive/` and record SHA-256, retain the fallback material.
- The plug-in document version has been updated to 1.1.5, the Chinese and English configuration instructions are unified, and the complete business and deployment rules are concentrated in the robot manual; the plug-in execution code remains unchanged.
- Complete the Python cache and plug-in installation package ignoring rules; this round only organizes local files, no new plug-ins are built or installed, and no services are deployed.

## 1.3.7 — 2026-09-10

- Correct the conflict between the default duration of the work record plug-in work prompt and the optional field, and clarify the complete example of the default duration of project ID, employee and store.
- Plug-in 1.1.4 will review HELP with store description or unqualified parsing at most once; persistent protocol errors will be reported explicitly and will no longer be converted to help silently.
- The backend retains the original evidence of @ employee; if the evidence verification fails, an independent result and an unaccounted statement will be returned.
- Added regression coverage for screenshot start-up, default 60 minutes, designated employees, duplicate messages and verification rejection.
- Updated old hint injection regression assertions to ensure that original evidence rejections are not falsely reported as normal help.

## 1.3.5 — 2026-09-10

- Work record details share a service date, start and end times are arranged in groups, and projects and amounts are partitioned independently; title and field spacing is tightened.
- Modify the date to synchronize the start and end dates, and link the retention time input and duration; details that span days or end earlier than the start are prevented from being saved and prompted for adjustment, and the end time can still be left blank.

## 1.3.4 — 2026-09-10

- Change the hours, minutes and morning/afternoon of the work record time into three direct input boxes and remove the drop-down selection; retain the simple layout without explanatory text.
- The number field supports the phone numeric keyboard, the time period supports Chinese or AM/PM, and the verification is incomplete and out-of-bounds input; the end time is left blank and the duration is linked.

## 1.3.3 — 2026-09-10

- Complete the robot's separate highlight/cancel highlight command parsing to support employee names or complete record numbers; strengthen the LangBot model's operation examples and merge highlight instructions at the end of the work.
- Unified verification of canceling, removing, removing, closing and not highlighting prevents the model from performing the opposite operation after truncating negative words; new parsing and database round-trips and idempotency verification are added.
- LangBot plug-in version updated to 1.1.2.

## 1.3.2 — 2026-09-10

- The work record start and end time are changed to three independent options: hour, minute, am/pm, and time inference and format description are removed.
- Leave the end time blank, link the date selection and project duration, and support Chinese and English.

## 1.3.1 — 2026-09-10

- Fix the bottom navigation blocking the last line of content: each business page will leave space according to the actual height of the navigation, and will be updated with changes in text wrapping, window size, and device safety zone.
- Remove the conflicting rule that only reserves 32px on the desktop, and uniformly retain the 16px spacing above the navigation.

## 1.3.0 — 2026-09-09

- Individual daily statement No matter whether the daily closing of the whole store has been completed, the store owner or manager can send text messages one by one; the task saves a snapshot at the time, and the not closed task can be viewed, canceled and sent by Mac agent normally.
- The individual daily statement adds "cash settled" and "cancel cash settled", and follows the daily cash settlement status, indicating that the cash service fee and tips of the day have been settled; employees can view it and managers can operate it.
- Canceling daily closing no longer requires filling in the reason, and retains permissions, idempotency, version verification, auditing and cash status rollback.
- Added SMS task business day backfill migration, allowing tasks not to be associated with the daily closing cycle; the not closed picture no longer displays the fictitious cycle.

## 1.2.0 · 2026-09-09

- Work record employee rows will be sorted, removed and hidden into "employee operations", and direct individual daily statement entries will be retained.
- The entire site adopts larger main text and auxiliary text, clearer contrast and touch buttons; the spacing between page headers, panels and cards is tightened, and the simple and warm color interface is unified.
- The financial homepage gives priority to displaying turnover, store revenue and total revenue; all indicators and calculation instructions are retained, and detailed composition and advanced filtering are expanded as needed.
- By default, the daily subtotal only displays the date and main amount, and all columns can be switched; the export uses the filter range of the displayed results.
- Adjust the layout of cash settlement, salary preview, employee subtotal and narrow screen navigation; paid salary registration is expanded as needed, phone floating entrance reduces occlusion, keyboard focus is enhanced and dynamic effect support is reduced.

## 1.1.8 — 2026-09-09

- Solid maintenance agreement: synchronize the project document, CHANGELOG and version number every time there is a modification; it is not deployed by default, and the user is reminded when the NAS needs to be updated to take effect, and is only released after the user explicitly requests deployment.

## 1.1.7 — 2026-09-09

- The off-work reply hides the unadded highlight status; the project amount is equal to the hidden project amount when the actual receipt is received. When receivables (project amount + add-on - discount) are inconsistent with actual receipts, indicate the difference between receivables and undercharges/overcharges, excluding tips.

## 1.1.6 — 2026-09-09

- Streamlined robot shutdown reply: Hide the corresponding amount and name when there is no add-on or discount, remove the number and post-discount service fee; retain the project amount, actual receipts, tips and highlight status.

## 1.1.5 — 2026-09-09

- Work record cards, quick additions, and detail editing all use the 12-hour clock; bare hours 9–11 default AM, 12 and 1–8 default PM, and support explicit AM/PM overlay and real-time preview.
- The actual historical time period, store time zone, business day ownership and off-duty time linkage are retained; invalid time prevents saving.
- Added hour extrapolation, period coverage, invalid input, all-day display round trip and business day conversion regression tests.
- Validation: Web 99 tests, type checks, and production builds pass; version consistency, Markdown native links, and diff checks pass.

## 1.1.4 — 2026-09-09

- Fixed the problem of ignoring the start time of the text during WeChat group work: the API directly parses the clock according to the store time zone. If 1-12 o'clock in the morning or afternoon is not specified, the time that has occurred in the last 12 hours will be used. If the time period/24-hour format is specified, the last 24 hours will be used.
- Supports half o'clock, Chinese hours and full-width time; multiple times, invalid times, unsupported historical/relative time and daylight saving time ambiguity return prompts without writing accounts. Unwritten hours keep the message time.
- LangBot's onboarding reminder clearly distinguishes between start time and service duration.
- Verification: API 248 tests (including database integration) and 7 database tests passed, and LangBot 10 tests passed; API type, version consistency, document link and diff check passed.

## 1.1.3 — 2026-09-09

- Fixed the issue where the AI assistant only sends the current message: historical questions, saved replies, query results, and change previews are passed in in the same conversation order, and the tool continues to retain the history after querying.
- Financial inquiry first combines the historical analysis date, employee and payment/amount range, and then queries the back-end deterministic statistics; historical data under the original authority will not be replayed after the authority range is changed.
- Complete replies that are not saved in old logs cannot be recovered; available old questions are retained and the model is prompted to requery business data. Historical previews do not represent execution and do not replace new confirmations.
- Write the requirements for synchronizing project documents, CHANGELOG and version numbers for each modification to the root directory AGENTS.md, and update development and handoff rules.
- Verification: API type check passed; 141 API tests passed, 89 database integration tests were skipped; new session continuation, tool loop, session isolation, role change and financial inquiry regression coverage was added.

## 1.1.2 — 2026-09-09

- The AI model replies to automatically retry with a larger budget when output length limits are encountered; explicitly returns a retryable error when the build is incomplete, and no longer accepts truncated text or tool parameters.

## 1.1.1 — 2026-09-09

- The AI work record assistant can read all historical business data of the store within the scope of authority and answer cross-date statistics through deterministic financial queries.
- Historical reading supports paging, date range and employee permission isolation; work record writing still needs to generate a preview and confirm.

<a id="langbot-插件-111--2026-09-09"></a>

## LangBot plugin 1.1.1 — 2026-09-09

- Separate release of plugin fixes, compatible with API 1.1.0 / Protocol 2. The store's natural language description is used for the abbreviation of "off work" and the default payment method. The abbreviation is no longer required to include "off work" or "card"; explicit payment methods are preferred, and the amount comes from this message.
- Upgrade the old plug-in and backend to a compatible version, and fix the issue where the old plug-in loses the designated employee, causing the message sender to be queried instead of the target employee. Added a database regression test for collecting payments according to the abbreviation of a specified employee after the web page is manually started to confirm that the pending payment record of the person receiving the message will not be mistakenly sent.
- Use the actual configuration model to verify six scenarios: name, amount, zero tips, cash coverage, collection and settlement, and no default agreement.

## 1.1.0 — 2026-09-08

- Extended LangBot WeChat work record: discount/add-on addition and removal, highlight switch, editing paid records by number, mixed payment and gift card, supplementary recording, custom items, notes, deletion and recovery. Complex modifications to reuse web WorkRecordsService transactions, business day locks, version checks, audits and financial recalculations.
- The off-work amount represents the actual receipt of the service, and the original price of the project is retained to avoid mixing discounts/add-ons into the original price; after discounts, the service fee and actual receipts are returned separately.
- Added database queries filtered by business day, employee, payment status, highlight, and summary by transaction, day, and employee. The last N days include the current business day, up to 366 days, 20 items per page, covering the entire range in total; long replies are segmented by message, and the amount is formatted in integer cents.
- The management page adds WeChat identity verification and data access switches. Historical financial inquiries are only allowed after identity verification; employees are limited to themselves, managers/store owners can inquire the entire store. Unverified roles are treated as ordinary employees, rebind the identity to cancel verification, and replay the query to re-authenticate.
- The database adds a binding verified_at field and expands the robot reply to TEXT; the API must be migrated and deployed first, and then the plug-in 1.1.0 can be installed.

## 1.0.7 - 2026-09-08

- AI confirmation and web page details/payment saving are changed to atomic transactions; fix the problems of clearing some payment modifications, waiting for concurrent confirmations, and overwriting other people's modifications after conflicts.
- Complete the Kanban rows when creating, moving across days, and restoring work records; confirming/deleting/reassigning robot records on the web page will release the work occupation. Added historical migration that only repairs associated metadata.
- Strengthen robot amount, duration, deactivated members and store verification; retain natural language store descriptions, designated employee off-duty and pending payment record discount/add-on functions, and complete the processing of unchecked status.
- Financial filtering removes duplication, and the cumulative amount is kept as BigInt to a safe range for verification; cross-business day writes are locked in a fixed order, and employee subtotals are sent for idempotency verification to cover all filtering conditions.
- The send queue and audit are atomically stored in the database, and the send writeback checks the valid lease; Mac checks the qualification before sending, and the log is saved atomically. When the result is uncertain, it will not automatically change channels and resend.
- SSE continuously reviews permissions, is compatible with slow polling and delayed submission; front-end reconnection refresh, financial expired response protection, unavailable browser storage downgrade and daylight saving time input verification.
- Fixes for concurrent password overwriting, invalid login requests, unclaimed account handoff from store owners, voice Strict Mode cleanup, CSV leading whitespace formula protection and LangBot time/URL validation.
- Failed trusted logins fall back to normal logins and support pasting of numbers with +1; AI confirmation preview retains cents, uses the store time zone and correctly displays cleared fields.
- Send task cancellation/retry and audit the same transaction to avoid inconsistency between status and audit; LangBot regression testing can be run by local commands.
- Added transaction rollback, concurrency, leases, idempotency, migration and browser boundary regression testing.

## 1.0.6 - 2026-09-07

- The WeChat work record robot changes each message to be understood by the configuration model, and no longer uses fixed syntax to bypass AI; it stops explicitly when the model is not configured or the model call fails, and no uncertain accounts are submitted.
- Added a new token-protected real-time work record skill interface: providing the model with the enabled slang, project meaning, default/available duration, active employee and sender identity of the current group-bound store each time.
- Models can now map colloquial, English, abbreviations and synonyms that are not registered verbatim to the only reasonable standard vernacular and submit proof of the original text; standard vernacular, employees, projects, price files and final accounts are still verified by the Massage Note backend.

## 1.0.5 - 2026-09-07

- Bound group members can now directly use "Jessie Pin 30" to record work for the only matching current employee, and the target employee is no longer required to bind WeChat in advance; the system uses internal placeholder binding to securely track ongoing records, and the target employee will automatically take over when bound in the future.
- Fixed an issue where the actual duration of the work record master record still retains the blacklist default value when the message explicitly overrides the default duration; project snapshots, estimated end times, and actual durations now consistently use the effective price slot duration in the message.

## 1.0.4 - 2026-09-06

- WeChat group work record supports a compact statement that omits the "shanggong" prefix:`大力 90` Use the 90-minute price range of the project corresponding to the "Dali" slang,`Jessie 脚 30` A 30-minute foot massage can be started by a bound group member for Jessie who is bound to the same group.
- The idiom is still clearly mapped to the real project by the Owner/Manager, and the configured duration is retained as the default value; the explicit duration in the message can only select the existing price range of the project, and the AI only performs backup structured analysis and cannot guess the project, price, employees or duration.

## 1.0.3 - 2026-09-06

- Supplementary Synology deployment experience: the impact of Adaptive MFA on the root Task Scheduler, the exit code and verification file acceptance of the one-time database backup task, and the need to continue building and verify the actual container image after `Project.update`.
- Supplement the work record robot's no-write connection probe, the activation sequence of the backend going online first and the plug-in being bound last, and the secret protection requirements for production diagnostic output.
- Fix for missing work record tokens caused by LangBot isolation plugin process not inheriting Runtime custom environment variables; plugin 1.0.3 instead forces saving of tokens and dedicated bots through a shadowed plugin configuration, and sets an explicit client identity for outbound requests to avoid Cloudflare 1010 interception.

## 1.0.2 - 2026-09-06

- Added "work record assistant" LangBot docking: group members can write to the restricted work record interface through binding, work on, and off work instructions.
- Added store/WeChat employee binding, project slang alias, operation audit, idempotency and ongoing work record unique constraints, and all account updates are completed within a single transaction.
- Added new restricted integration keys and production deployment configurations, DeepSeek is only responsible for parsing structured intent, and the backend is responsible for identity, project, amount, permission and financial verification.
- Released LangBot plug-in 1.0.2, which supports WeChat message time, natural language slang, cash/card swipe shutdown and abnormal rollback prompts, and blocks `<think>` output.

## 1.0.1 - 2026-09-04

- Shrink automatic scheduling to daily opening ranking: The store manager or manager can generate, regenerate or manually adjust the employee rankings for the day according to the final order of full-time/part-time and the latest actual attendance.
- Remove next position, normal/roll call/store designation, skip, cross, missing position and work dispatch intention; work record, AI work record, deletion recovery and daily closing will no longer read and write the ranking status.
- Added forward migration to clean up work-by-work tables and fields, retaining actual work records, payments, member types, daily rankings and audit data; completing member type life cycle constraints and employee row write protection after daily closing.
- Fixed two denial of service vulnerabilities in production dependencies on `qs`, and added tests for history rotation, hidden attendance, permissions, idempotency, concurrency and work record decoupling.

## 1.0.0 - 2026-09-04

- Added automatic job scheduling enabled by store: supports full-time/part-time cross-day rotation, automatic ranking, next regular customer, guest roll call, store designation, cross, busy skip and accumulation of short positions.
- Today's work record table displays real-time work scheduling status and operation records; employees who are added by mistake and have no activity can be removed, and hidden employees will suspend work scheduling and retain their status after recovery.
- The work record is independently associated with the work dispatch record, and the highlight and financial meanings remain unchanged; deleting the ordinary or named work record will return one round, and the unfilled rounds will be cleared at the daily closing.
- Automatic work scheduling is turned off by default. After upgrading, you need to set full-time or part-time for service staff first, and then the store manager can turn it on and check the recent historical order.

## 0.12.48 - 2026-09-02

- The employee subtotal no longer uses the filtered salary to infer the "comprehensive share ratio", but instead directly displays the employee's current default commission; when there are different project-specific commissions, a clear prompt is made, and the long image on the web page and SMS are consistent.
- The new credit card handling fee for the store's total settlement: without highlight work record, it is calculated as 2.5% of the total of card swiping service fee and card swiping tips. Highlight work record including card swiping payment is fixed at $3 for each transaction; the total income is changed to the sum of the first four incomes to deduct the handling fee.

## 0.12.47 - 2026-09-02

- The financial summary employee subtotal is changed to a card layout, which is compatible with decimal amounts and clearly displays the calculation relationship between the service fee base, divided wages and total stage income.
- The employee subtotal hides discounts and post-discount service fees, and adds a new SMS sending entrance for the default store owner number, number editing, and sending record viewing.
- Added employee summary SMS queue, summary long image rendering and database migration, message agent synchronization supports `EMPLOYEE_SUMMARY` document type.

## 0.12.46 - 2026-09-02

- The payroll settlement page changes to an amount format accurate to cents, and decimal charges and wages are no longer rounded to whole dollars by the display layer; the underlying integer cent ledger and deterministic calculations remain unchanged.
- Move the SMS sending record next to the "SMS sending long image" button, and use a pop-up window to display the sending progress, errors, cancellation, retry and resend operations. There is also clear feedback on empty records and loading status.
- The "summary of the day" for the settlement long chart is fixed to the rightmost column of the last row of the day; when the two-column layout encounters an even number of work records, it is left blank on the left side. The three-column and four-column layouts are also automatically filled with right alignment, and a new position regression test is added.
- Record the fixed collaboration process of "update deployment": organize project documents, push Git, deploy NAS, and business acceptance is completed by the user.

## 0.12.45 - 2026-09-02

- The financial "salary settlement" no longer uses a transaction-by-transaction table: the record cards consistent with today's work record are displayed in groups by business day, and a "summary of the day" is added at the end of each day to summarize the number of transactions for the day, service fee base, cash, non-cash and total income.
- The text message settlement long picture synchronization is changed to a daily card layout; when there are too many records on the same day, the lines are automatically wrapped, and the project name, payment split and mixed payment prompts are automatically wrapped, and the content is no longer hidden with ellipses.
- For long images, a source canvas of 1080 to 1680 pixels and a layout of 2 to 4 columns will be automatically selected based on the total number of days and recording density, and a single JPEG will be generated at 32,760 pixels high and within 4 MB; a new capacity regression test of 18 transactions per day and 12 transactions per day for 31 days has been added.
- Complete real Messages acceptance using fixed local demo store and number `+1 (770) 575-0450`: a single long image goes into an existing iMessage session, and failure before the first send will not generate duplicate messages.
- Added idempotency's `pnpm demo:seed` local demo data script and development document to unify subsequent financial, salary and settlement document test data.

## 0.12.44 - 2026-08-31

- Move the three right amount columns of the long settlement chart 80 pixels to the left as a whole, shrink the canvas width from 615 pixels to 535 pixels, and continue to retain the 10 pixels right margin.

## 0.12.43 - 2026-08-31

- Crop the long settlement chart canvas from 640 pixels to 615 pixels and reduce the left and right safety margins to 10 pixels; the "Income" on the far right remains unchanged at the original abscissa.

## 0.12.42 - 2026-08-31

- Shrink the employee settlement long chart canvas from 720 pixels to 640 pixels, retain 35 pixels of safe margins on the left and right, and simultaneously compress the gaps between the date, project, and amount columns of each row.

## 0.12.41 - 2026-08-31

- Continue to tighten the spacing between the three amount columns in the long settlement chart from about 100 pixels to 85 pixels, and expand the safety margin on the right side of "This Income" to about 50 pixels.

## 0.12.40 - 2026-08-31

- Change the three amount columns of "Card Service Fee Dividends", "Card Card Tips" and "This Income" to be closely arranged with equal spacing of about 100 pixels, and reserve a safe margin of about 30 pixels for the rightmost income column.

## 0.12.39 - 2026-08-31

- The long image of employee settlement has been changed from 900 pixels to a narrow version of 720 pixels, maintaining the original font size to make the text in the mobile message bubble appear larger.
- The service fee base column is deleted in the transaction-by-transaction form and the date and time column is narrowed; the non-cash summary card and detail columns are renamed "card service fee dividends" and "card swiping tips".

## 0.12.38 - 2026-08-31

- Confirm that the employee settlement PDF will appear "Accepted" in Messages but ultimately fail with an unregistered or carrier not supported error, while the image with the same number can actually be delivered through RCS; interval settlement therefore completely removes the PDF and independent summary image, and only sends a JPEG long image.
- The long image is changed to independent continuous typesetting: employee information and three salary summary cards are kept compactly at the top, and then directly enters the unique header and all record-by-record, without cover, pagination header, page number or footer, and no splicing of old PDF pages.
- Long images automatically switch between stretched rows and compact rows according to the record amount, and are adaptively compressed within 32,760 pixels and 4 MB; regression verification can generate a single image with 999 items, and the existing session priority routing has been tested and delivered through RCS.
- Mac agent installation automatically restores workspace development dependencies after production dependencies are deployed, preventing the installation process from clearing TypeScript and test tool links.
- After a single long image is delivered, it is compatible with writing back two historical checkpoints of the old API, ensuring that the server and the Mac agent will not resend the independent summary image no matter which end is updated first.

## 0.12.37 - 2026-08-30

- The employee interval settlement transaction-by-transaction list clearly shows the actual service fee base used in the calculation, removing duplicate selected payment receipt columns and redundant instructions.
- Queue, success or failure feedback will be displayed immediately after sending the SMS summary, and the summary checkpoint sent this time will be correctly reused when the PDF is sent.
- When sending PDF, Messages tries available iMessage/RCS accounts one by one to avoid being unable to address a single account and causing the subsequent data channel to be unable to fall back.

## 0.12.36 - 2026-08-30

- Reorganize the document entry and file location, classify the current document into `docs/product`, `docs/engineering`, `docs/operations`, retain `docs/archive` as the history area, and add task search table and long product rule reading navigation.
- Separated the fixed Mac Messages agent from the general operation and maintenance manual into a separate installation and troubleshooting manual, gathering permissions, attachment staging, routing, retrying, and uninstallation instructions.
- Unified sending standards: send only one PNG for individual daily statement, send summary PNG and transaction-by-transaction PDF for employee interval settlement, and make it clear that PDF only uses iMessage or RCS.
- Custom extras are changed to true blank inputs and use placeholder prompts to avoid manually deleting the default name and amount after each creation.
- Fixed the long service fee label overlapping the amount in the English employee daily closing image, and redistributed the layout space of the English version label and value.

## 0.12.35 - 2026-08-30

- Unify the calculation of payment sources for salary settlement and financial summary: cash, credit card + gift card, all three sources calculate employee service commission and tips according to the corresponding share.
- Blended Payments shows cash, swipe and gift card splits on a transaction-by-transaction basis, with clear marking on web, CSV and employee PDFs that only selected sources are currently counted.
- The employee SMS queue status and details entry are merged into a single expandable control to reduce repeated operation areas.

## 0.12.34 - 2026-08-29

- Fixed the problem of document metadata regenerated from the same immutable snapshot being different when "resend PDF only", triggering temporary attachment conflicts; the PDF generation time is fixed from the snapshot, and the bytes are consistent for repeated renderings.
- For PDFs that have been temporarily saved in old versions, only the Messages attachments that were originally verified by the task will be reused when retrying, and files in the protected directory will not be overwritten or replaced, so that historical failed tasks can safely switch to iMessage/RCS for resending.

## 0.12.33 - 2026-08-29

- Fixed an issue where after the employee interval settlement PDF was given priority to SMS/MMS, macOS accepted the sending command but the operator asynchronously rejected the document attachment, and the page still incorrectly displayed "All Completed"; pictures continued to be given priority over text messages, and PDF was changed to use only iMessage or RCS data channels.
- The delivery log records the actual Messages service used by each settlement attachment, making it easy to distinguish "system accepted" from final delivery issues by the operator.
- A new "resend PDF only" recovery operation is added for completed or partially failed settlement records, which retains the summary completion time and original snapshot, does not send summary images repeatedly, and writes audit records.

## 0.12.32 - 2026-08-29

- Fixed an issue where the Prisma field mapping of employee interval settlement sending records was inconsistent with the `last_error` column of the database, resulting in a uniform return of 500 in the sending record list, SMS enqueue and Mac agent collection tasks.
- The employee interval settlement object is extended to all working store members. Store owners, managers and employees can generate and send interval settlement data; this data is still not written to the payroll ledger, nor does it change the boss's outstanding balance.
- Add database field mapping and store owner/manager interval settlement regression tests to prevent similar runtime listing errors from entering production again.

## 0.12.31 - 2026-08-29

- A new Owner/Manager dedicated "employee settlement area" has been added to the salary settlement tab on the financial page: generate a preview of the interval by employee, date range and cash/swipe card + gift card/all, include confirmed work records but do not write to the payroll ledger, and do not change the boss's outstanding debt.
- The interval salary follows the cash proportion apportionment definition of the individual daily statement, and the mixed payment is divided into cash and non-cash one by one; the page switches the summary structure according to the selection, and uses an internal scrolling compact table to support up to 999 transactions, and the interval is clearly required to be shortened only after the 1000th transaction.
- Added independent interval settlement SMS snapshots and queues. The Mac Messages agent first sends a beautiful summary PNG, and then sends a step-by-step PDF with automatic pagination and repeated headers and page numbers; the two attachments are written back to complete the checkpoint respectively, and the successful attachment is skipped when it fails and is retried.
- The attachment staging app is expanded to strictly verify task UUID, fixed PNG/PDF file name and file header; agent installation is changed to production dependency deployment, ensuring that the PDF runtime is installed together with the LaunchAgent.
- Today's work record and financial daily closing are unified to use the business day calendar; dates with valid work records but not closed are marked with orange dots. Owner/Manager displays them for the entire store, and employees only see their pending daily closing dates.

## 0.12.30 - 2026-08-28

- Mac Messages agent only sends one PNG for each employee's daily closing task, which is no longer followed by a repeated Chinese and English text message; the name, business day, daily closing period and corrected amount continue to be based on the picture snapshot.
- Remove the unused text body generator and add AppleScript regression assertion to ensure that the sending script only contains `send POSIX file` and does not contain the second text `send`.

## 0.12.29 - 2026-08-28

- Fixed the problem that when LaunchAgent directly executes the attachment staging binary under macOS 26, full disk access permission is attributed to the background Node, causing the root directory probe to succeed but the actual task cannot be created or read. `Messages/Attachments/MassageNote/<分片>/<任务>` problem.
- The agent instead launches the staging program in the background as an interfaceless `.app` through LaunchServices; the staging app only writes JSON that accurately corresponds to the task UUID to the agent's dedicated result directory, and the agent checks the successful result and the fixed target path before calling Messages. Diagnosis now also actually creates two levels of directories to avoid false positives caused by only testing the root directory.
- The failure still occurs before the Messages call and retains automatic retry semantics; Messages is not activated, the keyboard is not simulated, and the clipboard or photo album is not used.

## 0.12.28 - 2026-08-28

- Fixed an issue where when the macOS 26 Messages account list contained a new service type that AppleScript could not convert, the entire account enumeration was interrupted with `-10000` and the task did not actually start sending; isolate the error on a per-account basis and use only enabled services.
- The US/Canada E.164 number is still saved as `+1` in the database and audit, and is converted to a ten-digit number that has been verified on the real RCS device when handed over to Messages; the call is sent from the SMS account, and Messages completes the RCS/SMS/MMS routing with the paired iPhone, and falls back to RCS/iMessage when there is no SMS.
- Remove helpers that activate Messages, paste to the clipboard, and emulate the keyboard. A new interfaceless native attachment temporary program is added, which only writes the PNGs in the agent outbox that exactly match the task UUID into the Messages own attachment directory, and then sends them silently by AppleScript in the background; it does not read the photo album, "recently imported items" or the chat database.
- New Macs only need to give the attachment staging program "full disk access" once; Setup Diagnostics actually writes and removes the probes, explicitly stopping when permissions are not in place. The test covers macOS 26 account compatibility, ten-digit number conversion and temporary storage return path constraints, and operation and maintenance documents record permissions and troubleshooting steps.

## 0.12.27 - 2026-08-28

- Fixed an issue where the PNG was immediately deleted by the agent when Mac Messages read attachments asynchronously, causing the message to display `0 KB` and fail to be sent; the local outbox of the sent image with the save permission `0600` will be automatically cleared by the agent after 30 minutes.
- Added outbox file permissions, retention window and expiration cleanup test; operation and maintenance documentation supplemented Messages judgment method when AppleScript has been received but the attachment has not been copied.

## 0.12.26 - 2026-08-28

- Fix the AppleScript parameter entry of the Mac Messages agent: use the standard `on run argv` to receive the number, image path and text message body to avoid failure before sending due to `argv` being undefined after receiving the task.
- Add AppleScript source code and macOS compilation regression testing, fix the service logout race between `bootout` and `bootstrap` during repeated installations, and write the new Mac's Node/pnpm installation, agent token, LaunchAgent status, queue status and log troubleshooting steps into the operation and maintenance document.

## 0.12.25 - 2026-08-28

- The employee daily closing SMS queue adds expandable item-by-item details, showing the employee, number, daily closing cycle, sending type, language, status, number of attempts, time and failure reason; the store owner or manager can cancel a single task that is still queued.
- Strict E.164 verification is implemented for both batch and single-person queuing; when the Mac agent receives a task with an empty or illegal number left over from history, it will mark it as a clear failure and continue to the next one to avoid a bad task blocking the entire queue.
- Mac agent installation adds front-end diagnostics. Before deploying as LaunchAgent, first verify that Messages is logged in, iMessage/RCS/SMS services exist, and has obtained macOS automation permissions; the documentation clearly states that NAS only provides queue APIs, and the local Mac calls native Messages after receiving it through outbound HTTPS.

## 0.12.24 - 2026-08-27

- When the SMS receiving number managed by a member does not have a dedicated coverage value, it will automatically be filled in with the registered phone number of the member's associated account, making it easy to directly check or modify it.
- When "receiving individual daily statement text messages" is turned on, if the dedicated number and the registered phone number of the associated account are both empty, the front-end prevents saving and pops up a clear prompt; the server synchronously rejects the invalid status to avoid bypassing page writing.

## 0.12.23 - 2026-08-27

- Redo the individual daily statement in the order in which employees read it. Use two rows of the salary table for cash, credit card and total. Today's total income stands out independently, reducing repeated formulas and status information.
- Transaction-by-transaction work record clearly changes the employee service fee to the pre-discount service fee base; the split of cash, credit card and gift card actual receipts continues to be used as secondary payment information to avoid post-discount actual receipts being mistaken for employee service fees.
- Move the cash handover before the transaction-by-transaction work record, and remove the "Please check first" prompt area in the individual daily statement page and browser-generated images; Mac Messages agent image synchronization adopts the same definition and level.

## 0.12.22 - 2026-08-27

- Fixed the issue where `.env.nas.example` was omitted from the NAS image build context, causing the version consistency check within the image to fail; continue to exclude real `.env` files and only allow public NAS environment templates to enter the build context.
- Fixed an issue where when the Mac agent uses `sips` to convert daily closing SVG, the percentage background only covers the upper left corner, and the remaining transparent areas appear black in Messages dark mode; the background uses clear canvas size instead, and an opaque background regression check is added.
- Rearrange the individual daily statement PNG generated by the agent: The salary summary displays four dividends according to "service commission/tip earnings × cash/card/total", and today's total income continues to stand out independently.
- The one-by-one work record is changed to two lines of payment details, the cash amount is directly displayed, the card amount is displayed using a thin rounded frame, the gift card amount is explained in parentheses, and the zero amount is automatically hidden; the project, time, status and current income are arranged in partitions.

## 0.12.21 - 2026-08-27

- Added store-level Mac Messages sending agent: Individual daily statement PNGs can be queued in batches after the daily closing of the whole store. Individual daily statement pages can be reissued separately, and support iMessage, RCS and SMS/MMS forwarded via iPhone.
- Member data has been added with per-person reception switches, login number fallback, dedicated coverage numbers, and Chinese and English picture languages; sending tasks use persistent leases, idempotency deduplication, daily closing linkage cancellation, failure reporting, and auditing. The proxy token only returns plain text when generated.
- The individual daily statement adds all the work records of the target employee one by one on the day, and displays the project, add-on, status according to the start time, as well as the service fees and tips paid by cash, credit card, and gift card respectively; each transaction simultaneously displays service commission, tip earnings, and the income of this order.
- Rearrange the original large block of income cards into three rows of compact equations: cash and non-cash service commission are merged into service commission, cash and non-cash tips are merged into tip earnings, and the two are then merged into today's total income; the pending work record is clearly not included in the recognized income.
- Compress the service fee base, work record quantity, cash handover and prompt area, and let the individual daily statement PNG grow with the number of records to become a complete long picture; complete the Chinese and English copywriting, employee data isolation integration test and current documents.

## 0.12.20 - 2026-08-26

- Completely remove the application installation button, `beforeinstallprompt` processing, Web App Manifest, Service Worker registration and installation dedicated icon on the web side, so that the project no longer provides browser/PWA installation capabilities.
- Keep an independent disconnection status prompt, and actively log out the old `/sw.js` registration and clear the historical `massage-note-v*` cache when the new version is loaded to prevent accessed devices from continuing to run the old installation logic.
- Synchronize product, architecture, development, deployment, security, and release documentation, and remove PWA installation instructions from current capabilities and checks.

## 0.12.19 - 2026-08-25

- Establish a unified document entrance in `docs/README.md`, and add architectural descriptions and development guidelines that are verified with the current code, and clarify the responsibility boundaries and factual priorities of product, architecture, API, deployment, operation and maintenance, and security documents.
- Organize the root directory product requirements into the current `docs/PRODUCT.md`, correct the outdated representation of gift card balance and bilingual interface; move the pre-coding architectural plan and one-time AI development prompts into `docs/archive/` to avoid the old routing and old directory structure being mistaken for the current implementation.
- The README, AI handoff guide and NAS deployment manual are streamlined; NAS historical upgrade instructions are unified back to the Changelog, the deployment command uses `VERSION` to read the target version, and the version consistency check is expanded to cover the current document and NAS environment template.
- Fixed the API CORS method whitelist missing the `PUT` framework configuration, so that the employee default commission and project-specific commission interfaces can pass browser pre-checking under Web/API cross-origin deployment.

## 0.12.18 - 2026-08-23

- The work record details merge "only save modifications" and "save and confirm payment" into a unified "save": when the payment is completely blank, only the work record is saved. After starting to fill in the payment or tips, it is automatically verified and confirmed synchronously. The confirmed record is automatically reconfirmed when it is saved again.
- Today's work record card will display a red "!" in the lower right corner when it is confirmed that the service fee received is inconsistent with the amount receivable. When tips is 0, the payment summary will directly display the number `0`, without additional marking and no difference reminder will be triggered.
- The store project settings are changed to summary priority, and editing and classification are added as needed; the name, abbreviation, amount, time, default commission, and activation status of additional projects are arranged in a compact horizontal layout on the desktop, and mobile responsiveness, Chinese and English instructions, and regression testing are completed.

## 0.12.17 - 2026-08-22

- Stable work record time linkage database integration test: When the test runs close to the store's 22:00 deadline, it automatically avoids the 30-minute shift across business days to prevent CI from being misjudged as historical modifications due to real clock boundaries; the production business logic remains unchanged.

## 0.12.16 - 2026-08-22

- The financial summary moves the daily subtotal before the employee subtotal, changes "business day" to "date" and adds a localized week column.
- The key result is to remove the total guest payment and total employee income, and increase the "total turnover" calculated on the server side; the original "salary and cash settlement" card group is replaced by five store total accounts including store, store manager, manager, gift card and total income.
- Employee filtering has been changed from a native multi-select list to a check label that can be directly clicked. It supports all employees, multiple employees, the number of selected people and one-click clearing. It also completes Chinese, English and 390px mobile layout acceptance.

## 0.12.15 - 2026-08-22

- The "tips total" card is deleted from the store-wide summary at the top of today's work record; the store revenue formula, employee rows, and tips data in the financial page remain unchanged.

## 0.12.14 - 2026-08-22

- The daily subtotal of the financial summary deletes the number of all projects, the number of work records, the actual service fees collected, tips and total guest payments, and adds "today's turnover" to the first item after business day.
- Today's turnover is calculated by the server in integer cents as "post-discount service fee performance + gift card sales revenue - gift card write-off expenditure", and adds fields, database integration, and Chinese and English regression testing.

## 0.12.13 - 2026-08-22

- The mobile version's today/history work record cards are restored to a compact horizontal queue. All work records and new entries can be viewed by sliding left and right in the employee row, reducing the invalid white space on the right side of the full-width card; the iPad and computer layouts remain unchanged.

## 0.12.12 - 2026-08-21

- The default payment method of financial summary is changed to "all"; all store-level item quantities, total customer payments, daily subtotals, composition details and CSV export are included in gift card sales, and work records and card sales items continue to be retained.
- Unified gift card accounting standards: all cash from card sales and actual receipts from card purchases are included in the store's income, and all service fees and tips paid by customers using gift cards are written off as gift card expenses.
- Today's summary, financial summary, daily closing preview and financial AI share the formula of "service fee performance after discount + tips - total employee income + gift card sales income - gift card write-off expenditure", and supplemented with Chinese and English help, domain testing and database integration regression.

## 0.12.11 - 2026-08-21

- Work record details Add time linkage: when adjusting the start time, keep the current work duration and move the end time synchronously; when adding, removing or replacing additional items, press the add-on to configure the difference in minutes to adjust the end time synchronously.
- The server performs the same calculation when the request does not specify the submission end time, and retains the actual working time that has been manually adjusted by the user; when the main project duration and the add-on duration change at the same time, the total difference is used.
- The extra project editing rows in project management are changed to independent and reasonable column widths to avoid abnormal elongation of the amount box and too narrow abbreviation and minute boxes; medium-sized screens are automatically divided into rows, and phones continue to display in a single column.

## 0.12.10 - 2026-08-21

- Both today's work record and historical work record pages provide "daily closing" buttons for store owners and managers: daily closing is completed directly when the normal check is passed or there is only a non-blocking reminder. When there are real blocking items, it automatically jumps to the financial daily closing page of the corresponding date.
- The closed today or history page changes to display the "Cancel daily closing" button; after filling in the reason, cancel using the currently valid daily closing version, and refresh the read-only status of the work record simultaneously.

## 0.12.9 - 2026-08-21

- The system recommends that the serial number of the card selling form be changed to editable: retain the default automatic allocation, and also allow you to directly fill in a custom serial number.
- Customized numbers are checked for duplication in the same store after being normalized according to Unicode, uppercase and lowercase, and white space on the server side; historical numbers that have been soft-deletioned cannot be resold, and automatic concurrency, customization, and historical duplication regression testing are added.

## 0.12.8 - 2026-08-21

- The highlight work record card on today's page continues to use the entire yellow background and border tips, but the small star-shaped logo in the upper right corner is removed; highlight editing, financial filtering and export rules remain unchanged.

## 0.12.7 - 2026-08-21

- Today's work record card no longer displays the text "With add-on" at the bottom; when there is an add-on, a small green "+" sign is displayed in the upper right corner, side by side with the highlight, discount and pending checkout signs.

## 0.12.6 - 2026-08-21

- The manual price change record in the daily closing check is reduced to a non-blocking reminder: the quantity and entry are displayed one by one, but the daily closing can be performed directly.
- On the daily closing page, "Confirm daily closing" is disabled and the forced daily closing entry is displayed only when there are real blocking items such as pending settlement and mismatched amounts; only when manual price changes are made, a clear prompt of "does not affect normal daily closing" is displayed.

## 0.12.5 - 2026-08-21

- The read-only amounts in site-wide pages, AI financial replies, and individual daily statement images are uniformly displayed as whole dollars, without `.00` or other decimal places; the payment summary of today's card is displayed in integers simultaneously with the `off` discount label.
- The amount input box no longer automatically fills in `.00`, and the placeholder example is synchronized to an integer; the bottom layer still uses integer cents to save and calculate, and the existing real cents continue to be retained in the edit box, and the page rounding display will not overwrite the ledger.

## 0.12.4 - 2026-08-21

- The ordinary payment input of work record details is changed to branch according to the payment method: the first line is credit card service fee and tips, the second line is cash service fee and tips; the desktop and phone keep the same order, and English and accessibility labels are adapted simultaneously.
- After clicking "Remove", the automatic discount for a single work record will directly enter the pending state without popping up a secondary confirmation; the recovery entry and persistence rules remain unchanged.

## 0.12.3 - 2026-08-21

- Today's work record card's new amount-based payment summary: the card swipe amount uses a thin line frame, the cash amount remains unframed, and mixed payments are displayed as "card swipe amount in the frame + unframed cash amount"; the same rules are used for service fee actual collection and tips.
- The gift card amount retains the independent "gift card" logo, and the pending checkout and zero amount status continue to be clearly displayed; pure cash, pure card swiping, mixed, gift card and Chinese and English accessibility regression tests are added.

## 0.12.2 - 2026-08-20

- Fixed the issue where ordinary cash/card payment confirmation incorrectly submitted an empty gift card serial number, but was rejected by the server contract as a verification error; when no gift card is used, it is now allowed to omit or explicitly submit `null`.
- The latest version number of the work record details is synchronized immediately after the first stage is successfully saved; even if the subsequent payment confirmation fails, you can directly retry after correcting the payment, and no longer fall into continuous conflicts because the details version has been incremented.

## 0.12.1 - 2026-08-20

- Fixed the issue where when the work record version conflict response carries the Prisma `BigInt` amount, the JSON serialization exception is triggered again and the due 409 prompt error is changed to 500; the latest resources are now uniformly converted to JSON safe values.
- A synchronous submission lock is added to the work record details saving to avoid rapid repeated clicks and concurrent submission before the React disabled state takes effect, reducing meaningless version conflicts and repeated confirmations.

## 0.12.0 - 2026-08-20

- A new eye-catching star-shaped highlight button is added to the top of the quick work record and work record details. The highlight status is persisted with the work record and entered into audit; the home page uses a yellow background and a star-shaped prompt for the entire work record card.
- The financial summary has a new filter of "View all work records/View only highlight work records/Exclude highlight work records". Summary, composition details and CSV export share the same definition; details and exports display the highlight mark at the same time.
- Added forward migration `20260820210000_work_record_highlight`, added highlight field and store, status, business day combined index for work record, and added contract, API integration test and Chinese and English help.

## 0.11.0 - 2026-08-20

- The business day calendar on the today page is changed to load immediately after selecting the date, and the extra "View" button is removed; the financial daily closing exception record is changed to open a single work record pop-up window on the current financial page.
- A new gift card ledger is added to the financial page, which displays the date of sale, face value, discount, actual receipt, seller, payment method and multiple usage records of the same card according to the natural serial number.
- The gift card serial number is changed to automatically increment from 1001 in each store transaction and will not be reused after deletion. The old client manual serial number is retained for compatibility and concurrency prevention.
- Store settings add automatic discounts for gift card full percentages; card sales records separately store face value, discount rule snapshot, discount amount and actual receipts. The total of cash and card payments must be equal to the payable after discount.
- Added forward migration `20260820180000_gift_card_auto_serial` to complete the contract, database/API integration test, API and deployment documentation.

## 0.10.0 - 2026-08-20

- On today's page, a fixed gift card sales column is added under all employees to record the serial number, cash, card swipe and operator; the sales amount is automatically calculated from the total payment and is fully included in the store's income, and does not participate in employee sharing or cash settlement.
- Ordinary work record payment adds gift card switch, serial number, gift card service fee and tips, and financial summary, filtering, details, CSV, daily closing and personal non-cash dividends simultaneously adopt new deterministic amount definition.
- Added `gift_card_sales` data table, same-store valid serial number unique constraint, business day lock, idempotency, optimistic lock, soft deletion, auditing, and database, contract, domain and API integration tests.
- Complete the Chinese and English interface, help, product, API, deployment and AI handoff documentation of the gift card process.

## 0.9.1 - 2026-08-17

- Move the Chinese and English switching bubbles to the lower level of the business pop-up window to avoid blocking the close buttons of pop-up windows such as details and finance.
- The AI work record floating window is changed to follow the phone's `visualViewport`, and the size is restored in stages after the input method loses focus, the window and direction change, and the problem of the third-party input method staying on half the screen after being retracted is fixed.
- The AI work record assistant adds 6–60 seconds of MP4/AAC voice input; transliteration calls the built-in ASR of the MiniMax `music-cover` audio preprocessing interface, which shares the `MINIMAX_API_KEY` with text understanding, and the application does not persist the original recording.
- Fixed `deepmerge-ts` used indirectly by Prisma to `8.0.1` which has fixed recursive object stack exhaustion vulnerability, production dependency audit maintains 0 known vulnerabilities.

## 0.8.4 - 2026-08-16

- Corrected the commission priority to be "employee project exclusive → employee default → project default → store-wide default" to solve the problem of the default commission set individually by members being overwritten by the project default ratio.
- After saving the employee's default or project-specific commission, the employee's not closed current business day work record and its salary and cash distribution fields are automatically recalculated to synchronize today's summary, individual daily statement and financial amounts; settled cash is automatically rolled back for review, and closed and historical snapshots remain unchanged.
- Comprehensively review the integer cents, itemized rounding, discounts, cash/card apportionment, today's summary, individual daily statement, financial summary and salary balance links; fix the boundary situation where the four individual daily statement income dividends are not conserved when free projects have wages.

## 0.8.3 - 2026-08-16

- Member management combines member information and default commission into one save operation, writes and retains the commission history in version order; after successful saving, a clear prompt is displayed on the corresponding member card.
- Ordinary employees can still view today's work records of other employees, but other employee rows will no longer display service fees, tips, and due summaries; the original visibility range of store owners, managers, and employees themselves remains unchanged.

## 0.8.2 - 2026-08-16

- Fixed the problem that the independently rendered "with add-on" status in the English interface still displays Chinese; the combined work record card now fully displays `Add-ons`.

## 0.8.1 - 2026-08-16

- Fixed the problem in the real production work record that the store manager's customized Chinese project abbreviations such as "Big Body" and "Small Body" are still displayed in Chinese in the English interface. The historical snapshot and the current project list are uniformly displayed in English and do not overwrite the original value of the database.
- Fixed the issue where "add-on" still remains in the work record payment summary in the English interface, and added a regression test that covers the existing production project short name and combined payment summary.

## 0.8.0 - 2026-08-16

- Added Simplified Chinese/English global language selection, login, disconnection, help and all business pages can be switched at any time; Chinese is the default when there is no local preference, the choice is to retain cross-pages through cookies and local storage, and the page language tag, accessibility label and Firebase login language are updated simultaneously.
- Complete English copywriting for today's work record, details, finance, daily closing, member and project management, audit, personal information, first time setup, AI assistant and complete help content; English mode displays English instructions according to stable API error codes, and unknown errors are safely downgraded.
- The individual daily statement PNG will generate titles, dates, amounts, indicators, status, file names and sharing information in the current language; AI text/voice requests under the English interface will carry language preferences, and deterministic financial answers and model-free safe downgrades support English at the same time.
- The English interface will automatically recognize the main items, add-ons and discount names set by the store manager in Chinese, and convert them into English according to common terms used in massage shops; historical work record snapshots and AI previews also use the same translation, and the edit box still retains the original Chinese in the database.
- Added language directory and dynamic state regression testing, and completed browser checks for desktop, 390px mobile, switching, refresh persistence, and Chinese and English recovery.

## 0.7.2 - 2026-08-16

- A new "Hidden Employees" management area is added to the today page that is always visible, and employees can be restored directly. Even if the business day has been daily closed, the store owner or manager is allowed to adjust the display status of the row, and the work record and financial data remain read-only and unaffected.
- When hiding or restoring another device that has just been updated, it will automatically use the latest version and try again to reduce invalid version conflicts.
- Fixed an issue where the financial card would expand the entire page after opening 16 columns of details, resulting in incomplete display of content on the right side; the details would be changed to an independent pop-up window that limits the width of the viewport, and can be viewed horizontally in the pop-up window on both phones and desktops.
- Financial summaries are regrouped by "Key Results, Projects and Performance, Collection Structure, Payroll and Cash Settlement" and organized into descriptions and operational levels for filters, employee subtotals, daily subtotals and cumulative balances.
- Locked `nanoid` used indirectly by PostCSS to a fixed version, reverting production dependency auditing to 0 known vulnerabilities.

## 0.7.1 - 2026-08-15

- Corrected the elastic vertical centering of the "Store-wide daily closing" link button on today's page so that the text is always in the center of the button.

## 0.7.0 - 2026-08-15

- Store owners and managers can pre-create employees by filling in only their names in member management, without surnames, phone numbers or registered accounts; employees to be claimed can immediately participate in work record, commission and financial processes.
- When an employee joins with a store code after registration, the system will automatically claim the member to be registered with the same name in the store according to the account registration First Name, and retain the original member ID, work record, commission and all history.
- Automatic claiming does not trust the display name temporarily filled in the joining form; accounts with non-same names will still enter the normal approval process to prevent false claims.
- Added `store_memberships.user_id` nullable for forward database migration, permissions/contracts/database regression testing, and admin pages, help and API documentation.
- Fix a work record integration test that relies on a fixed business day so that the full regression can continue to run on subsequent dates.

## 0.6.13 - 2026-08-13

- Individual daily statement adds cash service fee dividends and cash tips dividends; cash service fee is apportioned according to the cash proportion of confirmed payments, service commission, and cash tips summarizes confirmed cash tips.
- The four dividends of cash and card swiping are unified next to today's total income, and the page is reorganized into three layers: income overview, income base and cash handover; the generated daily closing image simultaneously adopts the new structure.

## 0.6.12 - 2026-08-13

- The financial summary card removes "Boss still owes" and "Salary settlement for this period", and the related cumulative balance and salary settlement functions remain in their respective areas.
- The remaining 16 summary cards have been added with a circular "!" explanation entry; you can hover the mouse, focus on the keyboard, or click on the phone to view the explanation and calculation method of the entry. The details of the original card click composition remain unchanged.

## 0.6.11 - 2026-08-13

- Fixed an issue where after changing the work record details of the main project from 60 minutes to 90 minutes, the end of work time still uses the old value.
- When selecting a preset duration or modifying a custom project duration, the interface immediately recalculates the end time based on "start time + new duration"; the server will also perform the same calculation when the end time is not clearly submitted.

## 0.6.10 - 2026-08-13

- If ordinary employees have not yet joined the current business day table, they can click "Go to Work" from the top of today's page to add themselves; this button will not be displayed for employees with historical dates, closed and not participating in work records.
- Today's page does not provide an "off work" button, and the employee's "idle/off work time" status continues to be calculated only based on the ongoing work record time.

## 0.6.9 - 2026-08-12

- The individual daily statement page and the generated PNG remove the work record odd number and discounted service fee, and instead display the card service fee bonus and card tips bonus.
- The individual daily statement is rearranged according to "income composition" and "settlement transactions"; credit card service fee dividends are calculated based on the credit card payment ratio of confirmed work records corresponding to wages, and credit card tips dividends are summarized for confirmed credit card tips.

## 0.6.8 - 2026-08-12

- When an exception is found in the daily closing of the store, each type of exception directly lists the view button corresponding to the work record; after clicking it, it automatically switches to the correct business day and opens the details of the work record.
- Store managers and managers can directly enter the financial "daily closing" tab of the current business day from today's or historical work record pages; this entrance is only responsible for navigation and will not automatically execute daily closing.

## 0.6.7 - 2026-08-11

- Modify the definition of "cash should be submitted" in the individual daily statement: sum up the pre-discount service fee base of all confirmed projects that include cash service fees, and then calculate it at a fixed 40%.
- The individual daily statement no longer reuses the "actual cash service fee - actual salary received" formula on the cash settlement page; neither the discount nor the actual cash service fee amount received changes the 40% result of the individual daily statement.

## 0.6.6 - 2026-08-11

- The summary at the top of today's page removes "Employees Deserve" and "Pending Checkout" and instead displays the total discount and store revenue.
- Store income is calculated by the backend using "total service fees - total discounts + total tips - what employees deserve" using integer cents.

## 0.6.5 - 2026-08-11

- The cash settlement page only displays employees with work records on the selected business day; employees without work records are no longer displayed, and they do not enter one-click settlement.
- The individual daily statement page and the resulting PNG no longer show the discount amount separately, but instead show the backend deterministic calculation of the cash due.

## 0.6.4 - 2026-08-11

- The red discount label of today's work record card has been changed to a compact format such as `off5` and `off10`, and `US$` and `.00` are no longer displayed repeatedly; non-integer US dollars still retain necessary decimals to avoid distortion of the amount.
- Full amounts continue to be retained in accessibility instructions and mouse prompts, and formal amount formats for work record details and financial pages remain unchanged.

## 0.6.3 - 2026-08-11

- The work record details allow you to manually remove the Monday to Thursday automatic discount for this work record and provide a recovery entrance; this selection will be persisted and subsequent edits will not automatically add the discount back.
- A single removal only changes the discount and post-discount service fee performance borne by the store. It does not close the store's automatic discount rules, nor does it affect employee service commission.
- Supplement record-level deactivation fields, forward migration, contract and real database regression testing, and clarify the full release meaning of "update deployment".
- The local PostgreSQL/Redis test port supports environment variable overrides to avoid stopping other projects' containers for running integration tests.

## 0.6.2 - 2026-08-11

- A clear prompt will be displayed after the store settings are successfully saved, and "Saving" will be displayed during the saving process.
- Fixed the problem that the "business day deadline" time box on the phone exceeds the screen due to the native minimum width.
- The red `off` mark of today's work record also displays the total discount of the work record, and multiple discounts are combined and displayed according to the total amount.
- Change the root node of the page to a controlled scrolling container, and add touch scrolling boundary protection to prevent the phone from continuing to pull out large blanks at the bottom of the page, while retaining the normal operation of the scrollable area within the page.

## 0.6.1 - 2026-08-11

- Fixed the issue where "off-duty time" is still displayed after all pending items of employees are settled; confirmed records no longer participate in the calculation of work status, and "idle" is displayed immediately after settlement.
- The rule for selecting the latest closing time when multiple pending settlements are being processed at the same time is retained, and settled and mixed state regression tests are added.

## 0.6.0 - 2026-08-11

- A new automatic discount switch is added from Monday to Thursday in the store settings. You can set the pre-discount service fee application threshold and fixed discount amount respectively, and make interface and database constraints for the configuration.
- When creating or editing a work record, discount snapshots are automatically generated by business day and "main project + additional projects"; automatic discounts can coexist with manual discounts, will not be overlapped, and will not reduce employee service commission.
- Work record details will display automatic discounts as read-only system items, today, financial and individual daily statements continue to be summarized and marked as normal discounts; supplementary contract and real database regression testing.

## 0.5.2 - 2026-08-11

- Explicitly allow the same employee to retain multiple pending settlement records at the same time, and add real database regression testing to ensure that no errors will be reported when creating a second transaction.
- When the times of two pending work records overlap, the employee status today will continue to use the one with a later end time as the end of work time.

## 0.5.1 - 2026-08-11

- The entry for clocking in and out of get off work has been removed from today’s work record page; the employee card no longer displays the clocking in status.
- The employee card displays "idle" or "off-duty time" in real time according to the current work record time period. For overlapping work records, the latest end time shall prevail.

## 0.5.0 - 2026-08-11

- Under employee permissions, the store-wide service fee, tips, employee dues and pending checkout summary at the top of today's page are hidden. The store owner and manager interface remains unchanged.
- Employees can switch to the past business day on the today page to view their work records; the backend directly reduces the historical table query to personal row, shift, work record and personal statistics, and the history page is read-only.

## 0.4.1 - 2026-08-11

- Limit the border rebound of the root scroll container on the phone, and let the page root node always cover the dynamic viewport height to avoid exposing a large blank area when any page is pulled down.

## 0.4.0 - 2026-08-11

- Added an individual daily statement interface isolated by employee; employees can only read their own daily closing data and cannot obtain store-wide summary or other employee information. Store managers and managers can still view designated employees.
- Today's page adds an "individual daily statement" button for each viewable employee, and provides employees with an exclusive "My daily closing" interface on the financial page to display the day's income, work record, discounts, tips and service commissions in clearer cards.
- The individual daily statement can generate PNG images according to the current device screen size; phones that support file sharing can be stored in the album through the system sharing panel, and will automatically degrade to image downloads if not supported.

## 0.3.1 - 2026-08-11

- Today's work record card uses a small red `off` icon to mark the discount order, retaining the accessibility description but no longer displaying the discount text at the bottom repeatedly.
- The quick work record pop-up window locks the background scrolling, adapts to the width of the phone's viewport, and limits it to only vertical touch scrolling to prevent the entire page from drifting up, down, left, and right.
- On the PC version of today's page, the employees' service fees, tips, and due summaries have been changed to a vertical key-value layout, and the position of the widescreen assistant has been adjusted to prevent amounts from being stuck, cropped, or blocked by floating buttons.

## 0.3.0 - 2026-08-10

- The "Projects and Commission" directory layout has been redone: main, additional and discount projects have new windows at the bottom respectively, and the upper and lower order can be adjusted through atomic operations with version verification; today's work record and detail selection box use this order simultaneously.
- Fixed the problem of being blocked by the legacy shifts of the old business day after the store owner manually added to today's form; clocking in on the new business day will automatically end the legacy shifts and leave an audit, and at the same time, obvious success prompts will be displayed on both work and off work.
- Fix the problem of the entire employee table being appended repeatedly after real-time changes on today's page: use unique React keys for adjacent components and prevent concurrent old responses from overwriting and abnormal duplicate member rows from polluting the interface.
- After the work record details are successfully saved, they are immediately closed and refreshed in the background to avoid getting stuck while waiting for the entire page to be synchronized; the phone details are locked to the viewport width and are no longer dragged left or right.
- According to Firebase's official capability boundaries, joining application SMS messages are not implemented: Phone Auth SMS messages are only used for authentication verification codes, and FCM is pushed by applications/browsers rather than phone number SMS messages.

## 0.2.6 - 2026-08-10

- Correction to GHCR first public statement: The GitHub REST API does not provide an endpoint for modifying Package visibility. This must be done on the Package Settings web page and then perform anonymous pull verification.

## 0.2.5 - 2026-08-10

- The practical experience of this GitHub Actions, GHCR and Synology deployment is compiled into a replicable AI release manual, supplementing first authorization, anonymous pull, NAS security update, acceptance, debugging and rollback checkpoints.

## 0.2.4 - 2026-08-10

- GitHub CI directly migrates and tests its disposable PostgreSQL service container, no longer accidentally calling the standalone test repository preparation script that only works with native Compose.

## 0.2.3 - 2026-08-10

- `pnpm typecheck` Now generate the Prisma Client and build the internal workspace package to ensure consistent results between new clones, GitHub runner and the built machine.

## 0.2.2 - 2026-08-10

- Explicitly provide a test-only PostgreSQL URL to the clean GitHub Actions runner, fixing Prisma schema validation failing without a native `.env`.

## 0.2.1 - 2026-08-10

- After the CI test passes, the `linux/amd64` NAS image is automatically built and published to the public GHCR version, `latest` and commit tag.
- NAS Compose pulls version images from GHCR by default, no longer relying on slow local tar upload; additional instructions for pulling, upgrading, rolling back, and first-time configuration are added.
- Clear the secret boundary of the public repository: GitHub only saves the browser public configuration, and the real private key and production password only exist in the local/NAS environment file or system keychain.

## 0.2.0 - 2026-08-09

- Main projects support multiple independent duration price tiers; existing projects are automatically converted to a single tier by migration, and historical work record snapshots remain unchanged.
- Quick work record and work record details are changed to select the project and duration price respectively, and the backend rejects ambiguous writing of multi-level projects that lack duration.
- Store managers/managers can add, modify, and remove multiple duration prices within a project; first-time store setup, AI work record, and Chinese help simultaneously support the new structure.
- Added gear uniqueness, migration constraints, multi-price selection and AI process regression testing.

## 0.1.2 - 2026-08-09

- Rewrite and condense the AI handoff guide, remove one-time troubleshooting sites and expired turnover accounts, and retain architectural indexes, business invariants, consistency constraints, verification baselines, and deployment boundaries.

## 0.1.1 - 2026-08-09

- Fixed the issue where API session failure was still mistakenly reported as a verification code error after the SMS verification code was passed.
- Fixed the issue where deleted stores still appear on the personal page, and the items and AI dialogue status of the previous store remain after switching stores.
- Add the same business day transaction lock for work record, table, cash settlement and daily closing, and strengthen cash settlement optimistic lock to avoid closed data changes or repeated settlement caused by concurrent writing.
- Add personal store filtering and concurrent cash settlement regression testing, and remove SMS draft codes that are not connected to the business and will leak the text of the text message.

## 0.1.0 - 2026-08-06

- Product, repository, workspace package, container, database, cache and document names are unified into Massage note.
- Added Synology Container Manager's `linux/amd64` single image construction and deployment solution.
- Establish mandatory version iteration rules and consistency checks.

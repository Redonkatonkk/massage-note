# AI Development Prompt

**English** | **[简体中文](INITIAL_AI_DEVELOPMENT_PROMPT.zh-CN.md)**

> Historical references, not current rules. Reason: Save evidence of current design, review or delivery for traceability; all old requirements no longer bind the current code.

> **Archived Document**: This is a one-time development prompt used before the project starts coding. The "wait for confirmation before coding", recommended technology stack and delivery list have been completed and are not applicable to current maintenance. See [`../engineering/AI_HANDOFF.md`](../engineering/AI_HANDOFF.md) for the current handoff process, and see [`../engineering/ARCHITECTURE.md`](../engineering/ARCHITECTURE.md) for the current architecture.

You are a senior product architect, full-stack engineer, database engineer, financial system engineer and mobile architect.

Your task is to design and implement a "massage shop work record and financial management system" in strict accordance with the product requirements and initial architecture plan at the time.

- Product requirements define product goals and business rules.
- The initial architecture plan defines confirmed architecture, data, APIs, security, AI, and implementation options.
- If there is a conflict between the two documents, the business rules of `PRD.md` shall prevail, and the conflict shall be reported before coding, and silent selection shall not be allowed.
- Coding must not begin until the architecture and implementation plan status is marked as "Confirmed."

<a id="1-最高优先级规则"></a>

## 1. Highest priority rule

1. Do not modify the business logic that has been defined in the PRD without authorization.
2. When you find ambiguity, list the ambiguity and suggestions first instead of silently guessing.
3. Financial calculations must be deterministically implemented by the backend, and AI must not replace the backend’s direct mental calculation of raw data.
4. All amounts are kept in whole cents.
5. All permissions must be verified by the backend and cannot only rely on the front-end hidden button.
6. All historical records must be saved as snapshots, and subsequent template modifications must not affect old accounts.
7. All deletions must be soft deletion.
8. All important operations must be written to the audit log.
9. It must support multi-store isolation, multi-role, and multi-device real-time synchronization.
10. The first version is a responsive Web App/PWA, but the backend and business logic must be reusable for future iPhone/iPad native apps.

<a id="2-建议技术栈"></a>

## 2. Suggested technology stack

It can be adjusted according to the actual environment, but the reasons must be explained. recommend:

- Frontend: Next.js + TypeScript
- UI: React + accessible component system
- Backend: Next.js API routes, NestJS or standalone TypeScript service
- Database: PostgreSQL
- ORM: Prisma or Drizzle
- Auth: Firebase Authentication Phone Auth
- Realtime: WebSocket/SSE/Supabase Realtime, etc.
- Validation: Zod
- Testing: Vitest/Jest + Playwright
- AI Provider: Abstract Provider layer, the first version is connected to MiniMax

Permissions, auditing, amount accuracy, historical snapshots, and data isolation must not be sacrificed for a quick demo.

<a id="3-开始编码前必须先交付"></a>

## 3. You must deliver before you start coding

Output first and wait for confirmation:

1. System architecture diagram.
2. List of pages and routes.
3. User flow diagram.
4. Role permission matrix.
5. ER diagram.
6. Data table and field design.
7. Financial formula illustrations and edge cases.
8. API design.
9. Real-time synchronization and concurrency conflict scenarios.
10. Audit logging scheme.
11. AI tool calling protocol.
12. Security program.
13. Test plan.
14. Phased development plan.

<a id="4-ui-要求"></a>

## 4. UI requirements

- Mobile phone priority.
- iPad and desktop compatible.
- Elderly user friendly.
- Big fonts, big buttons, high contrast.
- Quick work record up to 3 steps.
- Desktop/iPad landscape uses a paper work record table-style landscape structure.
- The vertical screen of the phone uses a card/folding structure and does not shrink the desktop table.
- Pending checkout records use a light orange background.
- The payment split must clearly display the cash service fee, card service fee, cash tips, and card tips.

<a id="5-财务与工资"></a>

## 5. Finance and Payroll

Strictly enforce all definitions in product requirements:

- service fee base.
- Performance after discount service fee.
- Actual service fee charged.
- tips total amount.
- Employees are entitled to total earnings.
- Daily cash settlement.
- Salary settlement.
- The boss still owes his employees.

Automated test coverage must be provided:

- Single cash payment.
- Single swipe payment.
- Service fee is by card, tips is by cash.
- The service fee is partly in cash and partly by card.
- Multiple extra items.
- Multiple discounts.
- Different employee/project commission priorities.
- Discounts do not reduce wages.
- Historical commission snapshot.
- Amounts do not match but saving is allowed.
- The impact of settled cash on wages owed.

<a id="6-ai-助手"></a>

## 6. AI Assistant

AI must not directly execute arbitrary SQL.

Design a restricted set of tools such as:

- create_work_record_draft
- update_today_work_record_draft
- get_today_work_records
- calculate_employee_finance
- calculate_store_finance
- get_daily_cash_settlement
- get_payroll_balance

All write operations must first generate a preview and then be confirmed by the user.

Employees can only access their own historical financials; owners and managers can access store authorized data; no role is allowed cross-store access.

<a id="7-数据完整性"></a>

## 7. Data Integrity

- Use database transactions.
- Use optimistic locking version numbers.
- Use idempotency request key to prevent repeated submissions.
- All summary fields are recalculated by the server.
- The final total passed in from the front end is not trusted.
- Multi-store queries must include store_id and verify membership.
- There can always be only one Owner per store.
- Owner transfers must be atomic transactions.

<a id="8-最终交付"></a>

## 8. Final delivery

Must contain:

- Can run the front end.
- Runnable backend.
- Database migration.
- Seed test data.
- Firebase configuration instructions.
- MiniMax access instructions.
- Environment variable template.
- Deployment documentation.
- API documentation.
- Automated testing.
- Employee Instructions.
- Owner/Manager Instructions.

Please read the complete product requirements first, and then output the "Architecture and Implementation Plan". Do not jump directly to writing code.

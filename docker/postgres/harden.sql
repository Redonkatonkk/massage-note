\set ON_ERROR_STOP on

GRANT CONNECT ON DATABASE massage_note TO massage_note_app;
GRANT USAGE ON SCHEMA public TO massage_note_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO massage_note_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO massage_note_app;

-- 审计、AI 查询记录和实时事件只允许业务账号追加/读取，物理清理由维护账号执行。
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit_logs FROM massage_note_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE ai_query_logs FROM massage_note_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE domain_outbox FROM massage_note_app;

-- 第 4 周迁移：导出 token 表（POST /api/export 扣额度后发 30 分钟 token）
CREATE TABLE IF NOT EXISTS export_tokens (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  resume_id INTEGER NOT NULL,
  format TEXT NOT NULL,
  template_id TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

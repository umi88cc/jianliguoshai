-- 简历过筛 ResumePass — D1 建表（第 1 周）
-- 字段清单与说明文字逐字段对齐；金额一律存分（整数），后台按元填、前端 ×100；
-- R2 key 扁平单段命名，不带斜杠（/img/:key 只认单段 key）

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL,
  locale TEXT NOT NULL DEFAULT 'zh'
);
-- users：邮箱验证码登录（无密码）；locale 记语言偏好，与 Cookie 同步

CREATE TABLE IF NOT EXISTS resumes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  parent_id INTEGER,
  title TEXT NOT NULL DEFAULT '我的简历',
  raw_text TEXT NOT NULL,
  parsed_json TEXT,
  lang TEXT NOT NULL DEFAULT 'zh',
  r2_key TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
-- resumes：底稿与岗位版同表。parent_id 为 NULL = 底稿，指向底稿 id = 该底稿的岗位版；
-- 复制生成岗位版、防编造回滚、互译平行版都靠 parent_id 溯源，不许另建副本表。
-- r2_key 为上传原文件在 R2 的扁平 key（时间戳-用途-随机串.扩展名），正文放 D1。

CREATE TABLE IF NOT EXISTS analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resume_id INTEGER,
  jd_text TEXT,
  score_json TEXT NOT NULL,
  keywords_json TEXT,
  created_at INTEGER NOT NULL
);
-- analyses：每次评分一条；score_json 存 6 维度明细，支撑改前/改后对比。
-- 游客评分 resume_id 为 NULL，不存 raw_text（只存分数与关键词结果）。

CREATE TABLE IF NOT EXISTS credits (
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0,
  expire_at INTEGER,
  PRIMARY KEY (user_id, kind)
);
-- credits：额度账本，扣减用事务；会员到期靠 expire_at 判断。
-- kind 取 score / rewrite / export；balance 口径：次数类余额就是整数计数（几次）。

-- rate_limits：限流计数放 D1 不放 KV（KV 免费写只有 1,000 次/天）。
-- key = rate:{user或ip}:{day}，如 rate:1.2.3.4:2026-11-09；count 为当日累计次数
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

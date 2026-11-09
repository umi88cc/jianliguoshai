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

-- orders：订单表（第 2 周支付接；USDT 监听先建表，TxID 唯一防重复开通）。
-- amount 存分（整数）；method 取 wechat / alipay / paypal / usdt；status 取 pending / paid /
-- review_pending / done / cancelled / rejected；txid UNIQUE：同一笔 USDT/PayPal 交易只能开一次通。
-- amount_usdt_sun：USDT 订单的精确应付金额（单位 sun，1 USDT = 1e6 sun，含尾数如 1.9913 → 1991300），
-- 监听按它与链上 value 精确比对，一分不能差；非 USDT 订单为 NULL。
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  plan TEXT NOT NULL,
  amount INTEGER NOT NULL,
  amount_usdt_sun INTEGER,
  method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  txid TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  reviewed_by INTEGER
);

-- ============ 第 2 周：登录会话 / 验证码 / 异步任务 / 改写存档 / AI 模型配置 ============
-- sessions：邮箱验证码登录后的会话；HttpOnly Cookie 30 天；token 随机 64 位十六进制
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
-- email_codes：6 位验证码；只存 SHA-256 哈希；10 分钟有效；5 次错失效
CREATE TABLE IF NOT EXISTS email_codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
-- tasks：异步任务（改写/求职信/互译）；前端提交后轮询；cron 每分钟跑队列兜底
-- status: pending / running / done / failed；result_ref 存结果 JSON 文本
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payload TEXT NOT NULL,
  result_ref TEXT,
  error TEXT,
  retry INTEGER NOT NULL DEFAULT 0,
  credit_refunded INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
-- rewrites：改写结果存档；parent_id 溯源底稿（resumes.parent_id），一岗一版靠它
CREATE TABLE IF NOT EXISTS rewrites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  resume_id INTEGER,
  task_id INTEGER,
  type TEXT NOT NULL DEFAULT 'rewrite',
  lang TEXT NOT NULL DEFAULT 'zh',
  intensity TEXT NOT NULL DEFAULT 'standard',
  before_score INTEGER,
  after_score INTEGER,
  result_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
-- ai_models：后台 AI 模型配置（一行一个模型）
-- key_ref：Worker secret 名（如 AI_KEY_NVIDIA_SUPER_VL），优先于 key_enc；
--   博客迁移的 4 个模型先占位 key_ref，等站长补 Key 再设 secret；
-- key_enc：后台手动填的 Key，AES-GCM 加密存（v2:iv.ciphertext），绝不存明文；
-- key_hash：SHA-256（Key 互斥校验：一个 Key 不能绑两个模型）；
-- daily_limit：当日调用上限（OpenRouter 免费 50 次/天；NVIDIA 免费按 500 次/天守门）
CREATE TABLE IF NOT EXISTS ai_models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  provider TEXT NOT NULL,
  base_url TEXT NOT NULL,
  name TEXT NOT NULL,
  model TEXT NOT NULL,
  key_ref TEXT,
  key_enc TEXT,
  key_hash TEXT,
  key_last4 TEXT NOT NULL DEFAULT '****',
  key_configured INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 0,
  price_text TEXT NOT NULL DEFAULT '',
  speed_text TEXT NOT NULL DEFAULT '',
  limit_text TEXT NOT NULL DEFAULT '',
  daily_limit INTEGER NOT NULL DEFAULT 50,
  last_test_at INTEGER,
  last_test_ok INTEGER,
  fail_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
-- ai_usage：模型日用量；调用前先查，超 daily_limit 就跳过该模型走下一个
CREATE TABLE IF NOT EXISTS ai_usage (
  model_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (model_id, day)
);
-- ai_rules：规则与提示词；改一次 version+1，旧值进 ai_rule_versions，可恢复
CREATE TABLE IF NOT EXISTS ai_rules (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_rule_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_key TEXT NOT NULL,
  value TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- ---- 预置 12 行模型（第 1–4 行：博客迁移，Key 待站长补；第 5–12 行：更多免费模型，默认停用） ----
INSERT OR IGNORE INTO ai_models (id, sort_order, provider, base_url, name, model, key_ref, key_last4, key_configured, is_active, price_text, speed_text, limit_text, daily_limit, created_at, updated_at) VALUES
(1, 1, 'nvidia', 'https://integrate.api.nvidia.com/v1', 'NVIDIA Nemotron 3.5 Super VL 120B', 'nvidia/nemotron-3.5-super-vl-120b-a12b', 'AI_KEY_NVIDIA_SUPER_VL', 'Nulv', 0, 0, '免费', '约 182 tok/s', '免费层；Key 待补', 500, unixepoch() * 1000, unixepoch() * 1000),
(2, 2, 'openrouter', 'https://openrouter.ai/api/v1', 'OpenRouter Nemotron 3.5 Super VL :free', 'nvidia/nemotron-3.5-super-vl:free', 'AI_KEY_OR_SUPER_VL', 'a58d', 0, 0, '免费', '—', '20 RPM；每天 50 次', 50, unixepoch() * 1000, unixepoch() * 1000),
(3, 3, 'nvidia', 'https://integrate.api.nvidia.com/v1', 'NVIDIA Nemotron 3 Ultra 550B', 'nvidia/nemotron-3-ultra-550b-a55b', 'AI_KEY_NVIDIA_ULTRA', 'xEBx', 0, 0, '免费', '约 64 tok/s', '免费层；Key 待补', 500, unixepoch() * 1000, unixepoch() * 1000),
(4, 4, 'openrouter', 'https://openrouter.ai/api/v1', 'OpenRouter Nemotron 3 Ultra :free', 'nvidia/nemotron-3-ultra-550b-a55b:free', 'AI_KEY_OR_ULTRA', '33cf', 0, 0, '免费', '—', '20 RPM；每天 50 次', 50, unixepoch() * 1000, unixepoch() * 1000),
(5, 5, 'nvidia', 'https://integrate.api.nvidia.com/v1', 'NVIDIA Llama 3.3 70B Instruct', 'meta/llama-3.3-70b-instruct', NULL, '****', 0, 0, '免费', '—', '免费层；Key 待填', 500, unixepoch() * 1000, unixepoch() * 1000),
(6, 6, 'nvidia', 'https://integrate.api.nvidia.com/v1', 'NVIDIA Qwen3 235B', 'qwen/qwen3-235b-a22b', NULL, '****', 0, 0, '免费', '—', '免费层；Key 待填', 500, unixepoch() * 1000, unixepoch() * 1000),
(7, 7, 'nvidia', 'https://integrate.api.nvidia.com/v1', 'NVIDIA DeepSeek R1', 'deepseek-ai/deepseek-r1', NULL, '****', 0, 0, '免费', '—', '免费层；Key 待填', 500, unixepoch() * 1000, unixepoch() * 1000),
(8, 8, 'nvidia', 'https://integrate.api.nvidia.com/v1', 'NVIDIA Kimi K2 Instruct', 'moonshotai/kimi-k2-instruct', NULL, '****', 0, 0, '免费', '—', '免费层；Key 待填', 500, unixepoch() * 1000, unixepoch() * 1000),
(9, 9, 'openrouter', 'https://openrouter.ai/api/v1', 'OpenRouter DeepSeek Chat :free', 'deepseek/deepseek-chat:free', NULL, '****', 0, 0, '免费', '—', '20 RPM；每天 50 次', 50, unixepoch() * 1000, unixepoch() * 1000),
(10, 10, 'openrouter', 'https://openrouter.ai/api/v1', 'OpenRouter Qwen 2.5 7B :free', 'qwen/qwen-2.5-7b-instruct:free', NULL, '****', 0, 0, '免费', '—', '20 RPM；每天 50 次', 50, unixepoch() * 1000, unixepoch() * 1000),
(11, 11, 'openrouter', 'https://openrouter.ai/api/v1', 'OpenRouter Llama 3.3 70B :free', 'meta-llama/llama-3.3-70b-instruct:free', NULL, '****', 0, 0, '免费', '—', '20 RPM；每天 50 次', 50, unixepoch() * 1000, unixepoch() * 1000),
(12, 12, 'openrouter', 'https://openrouter.ai/api/v1', 'OpenRouter GLM 4.5 Air :free', 'z-ai/glm-4.5-air:free', NULL, '****', 0, 0, '免费', '—', '20 RPM；每天 50 次', 50, unixepoch() * 1000, unixepoch() * 1000);

-- ---- 规则与提示词默认值（规划 §3.2 / §13；后台可改，改一次版本 +1） ----
INSERT OR IGNORE INTO ai_rules (key, value, version, updated_at) VALUES
('rewrite_prompt_zh', '你是一名资深简历顾问 + 招聘官，熟悉中国互联网/金融等行业 ATS 筛选规则。任务：按目标岗位 JD，改写用户简历。铁律：1. 只使用简历原文提供的事实，不编造雇主、日期、工具、技能、数字。2. 缺失数字时写 [待补充：___]，不要猜数字。3. 每条经历用 STAR 结构、强动词开头、1-2 行、优先量化成果。4. 只在经历真实相同的前提下，使用 JD 原词；JD 要求但简历没有的，列入文末“缺口清单”，不要写进简历。5. 输出 JSON：{summary, bullets:[{original, rewritten, change_reason}], missing_keywords:[], score_tips:[]}', 1, unixepoch() * 1000),
('rewrite_prompt_en', 'You are a senior technical recruiter in the US; rewrite for Workday/Greenhouse/Lever ATS; use exact JD title in sentence one of summary; under 50 words for summary; do not invent metrics—use [X] placeholder. Iron rules: 1. Only use facts from the original resume; never invent employers, dates, tools, skills or numbers. 2. Start every bullet with a strong action verb in past tense; no pronouns; quantify every bullet if possible. 3. Use the X-Y-Z formula: Accomplished [X], as measured by [Y], by doing [Z]. 4. Do not list soft skills; demonstrate them through bullets. 5. Output JSON: {summary, bullets:[{original, rewritten, change_reason}], missing_keywords:[], score_tips:[]}', 1, unixepoch() * 1000),
('cover_prompt_zh', '你是一名资深简历顾问。任务：按目标岗位 JD 和用户简历，写一封求职信。铁律：1. 只使用简历原文提供的事实，不编造雇主、日期、数字、成果。2. 结构：称呼 + 为什么应聘这家公司这个岗位（结合 JD）+ 我最匹配的 2-3 个事实（带数字）+ 结尾请求面试。3. 300-400 字，语气真诚专业，不用“热爱/激情/抗压”等空话。4. 输出 JSON：{letter}', 1, unixepoch() * 1000),
('cover_prompt_en', 'You are a senior technical recruiter in the US. Write a cover letter from the resume and JD. Iron rules: 1. Only use facts from the resume; never invent employers, dates or numbers. 2. Structure: greeting + why this company and role + 2-3 matching facts with numbers (X-Y-Z formula) + closing asking for an interview. 3. 200-300 words, professional tone, no empty clichés. 4. Output JSON: {letter}', 1, unixepoch() * 1000),
('translate_prompt', '你是一名专业简历翻译。任务：把简历在中文与英文之间互译。铁律：1. 保持原有格式、段落与 bullet 结构。2. 事实、公司名、日期、数字一律照搬，不许改、不许猜。3. 英文用过去式强动词开头，不用 I；中文用强动词开头。4. 输出 JSON：{translated}', 1, unixepoch() * 1000),
('allow_number_edit', '0', 1, unixepoch() * 1000),
('force_star', '1', 1, unixepoch() * 1000),
('default_intensity', 'standard', 1, unixepoch() * 1000);

-- ============ 第 3 周：套餐 / 订单扩展 / 会员 / 站内通知 / PayPal 事件 ============
-- plans：套餐目录（后台可改价；金额一律存分；USDT 用 sun 精确整数；-1 = 不限）
CREATE TABLE IF NOT EXISTS plans (
  slug TEXT PRIMARY KEY,
  name_zh TEXT NOT NULL,
  name_en TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  usdt_sun INTEGER NOT NULL,
  rewrite_credits INTEGER NOT NULL,
  export_credits INTEGER NOT NULL,
  duration_days INTEGER NOT NULL DEFAULT 0,
  refill_monthly INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);
INSERT OR IGNORE INTO plans (slug, name_zh, name_en, price_cents, usdt_sun, rewrite_credits, export_credits, duration_days, refill_monthly, is_active) VALUES
('single', '单次改写', 'Single Rewrite', 990, 1990000, 1, 1, 0, 0, 1),
('monthly', '包月会员', 'Monthly', 1990, 3990000, 30, -1, 30, 0, 1),
('lifetime', '终身会员', 'Lifetime', 9900, 19990000, 50, -1, 0, 1, 1);

-- orders 扩展字段（D1 支持 ALTER TABLE ADD COLUMN；线上已建的表用迁移补）
ALTER TABLE orders ADD COLUMN order_no TEXT;
ALTER TABLE orders ADD COLUMN payer_note TEXT;
ALTER TABLE orders ADD COLUMN screenshot_key TEXT;
ALTER TABLE orders ADD COLUMN reject_reason TEXT;
ALTER TABLE orders ADD COLUMN expires_at INTEGER;
ALTER TABLE orders ADD COLUMN reviewed_at INTEGER;
ALTER TABLE orders ADD COLUMN last_reminded_at INTEGER;

-- memberships：会员记录（包月有到期日；终身不过期、每月由 cron 补满改写额度到 50）
CREATE TABLE IF NOT EXISTS memberships (
  user_id INTEGER NOT NULL,
  plan TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  expires_at INTEGER,
  last_refill_at INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  PRIMARY KEY (user_id, plan)
);

-- notifications：站内通知（开通/拒绝/到期提醒/渠道故障兜底）
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- paypal_events：PayPal Webhook 幂等表（同一事件只处理一次）
CREATE TABLE IF NOT EXISTS paypal_events (
  event_id TEXT PRIMARY KEY,
  order_id INTEGER,
  payload TEXT,
  created_at INTEGER NOT NULL
);

// 简历过筛 — AI 模型层（第 2 周，规划 §13）
// 一行一个模型；OpenAI 兼容 /chat/completions（NVIDIA / OpenRouter / DeepSeek / 通义 / Kimi / GLM
// 都是同一协议，换 base_url + model + key 就行）。
// Key 安全：
// - 博客迁移的 4 个模型用 key_ref 指向 Worker secret（如 AI_KEY_NVIDIA_SUPER_VL），只存服务器侧；
// - 后台手动填的 Key 用 AES-GCM 加密存 D1（v2:iv.ciphertext），密钥是 Worker secret AI_KEY_ENC_SECRET 的 SHA-256；
// - 前台/接口永远只给后 4 位；Key 互斥靠 SHA-256 哈希校验。
// 调用：按序号从上往下试；单次调用 45 秒超时；连续 3 次失败自动停用 + 飞书告警；
// OpenRouter 免费层每天 50 次是硬顶，调用前先查 ai_usage，超了跳过该模型。

export const AI_PROVIDER_URLS = {
nvidia: 'https://integrate.api.nvidia.com/v1',
openrouter: 'https://openrouter.ai/api/v1',
deepseek: 'https://api.deepseek.com/v1',
qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
kimi: 'https://api.moonshot.cn/v1',
glm: 'https://open.bigmodel.cn/api/paas/v4',
other: '',
};
export const AI_PROVIDER_LABELS = {
nvidia: '英伟达 NVIDIA',
openrouter: 'OpenRouter',
deepseek: 'DeepSeek',
qwen: '通义千问 Qwen',
kimi: 'Kimi / Moonshot',
glm: '智谱 GLM',
other: '其他（OpenAI 兼容）',
};

export const AI_CALL_TIMEOUT_MS = 45000; // 单次调用超时 45 秒
export const AI_AUTO_DISABLE_FAILS = 3; // 连续 3 次失败自动停用

async function sha256Hex(text) {
const data = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
return [...new Uint8Array(data)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function keyHash(plain) {
return sha256Hex(String(plain || ''));
}

function b64encode(bytes) {
let s = '';
for (const b of bytes) s += String.fromCharCode(b);
return btoa(s);
}
function b64decode(str) {
const bin = atob(str);
const out = new Uint8Array(bin.length);
for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
return out;
}

async function encKeyBytes(env) {
const secret = String(env.AI_KEY_ENC_SECRET || '').trim();
if (!secret) return null;
const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM'}, false, ['encrypt', 'decrypt']);
}

// 后台手动填的 Key：AES-GCM 加密，格式 v2:ivBase64.cipherBase64
export async function encryptModelKey(env, plain) {
const key = await encKeyBytes(env);
if (!key) return { ok: false, error: 'AI_KEY_ENC_SECRET 未配置，无法加密保存 Key'};
const iv = crypto.getRandomValues(new Uint8Array(12));
const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv}, key, new TextEncoder().encode(String(plain)));
return { ok: true, enc: `v2:${b64encode(iv)}.${b64encode(new Uint8Array(ct))}`};
}

export async function decryptModelKey(env, enc) {
if (!enc ||!String(enc).startsWith('v2:')) return null;
try {
const key = await encKeyBytes(env);
if (!key) return null;
const [ivB64, ctB64] = String(enc).slice(3).split('.');
const pt = await crypto.subtle.decrypt(
{ name: 'AES-GCM', iv: b64decode(ivB64)},
key,
b64decode(ctB64),
);
return new TextDecoder().decode(pt);
} catch {
return null;
}
}

export function maskKey(plain) {
const s = String(plain || '');
return s.length <= 4? '****': `****${s.slice(-4)}`;
}

// 取某行的可用 Key：key_ref（Worker secret）优先，否则解密 key_enc
export async function resolveModelKey(env, model) {
if (model.key_ref) {
const v = String(env[model.key_ref] || '').trim();
if (v) return { key: v, source: 'secret', configured: true};
return { key: '', source: 'secret', configured: false};
}
if (model.key_enc) {
const plain = await decryptModelKey(env, model.key_enc);
if (plain) return { key: plain, source: 'encrypted', configured: true};
return { key: '', source: 'encrypted', configured: false};
}
return { key: '', source: 'none', configured: false};
}

// 后台列表：Key 只给后 4 位 + 是否配好，绝不给完整 Key
export async function listModels(db) {
const { results} = await db.prepare(
'SELECT id, sort_order, provider, base_url, name, model, key_ref, key_last4, key_configured, is_active, price_text, speed_text, limit_text, daily_limit, last_test_at, last_test_ok, fail_count FROM ai_models ORDER BY sort_order ASC, id ASC',
).all().catch(() => ({ results: []}));
return results || [];
}

function todayStr() {
return new Date().toISOString().slice(0, 10);
}

async function usageToday(db, modelId) {
const row = await db.prepare('SELECT count FROM ai_usage WHERE model_id =? AND day =?')
.bind(modelId, todayStr()).first().catch(() => null);
return row? row.count: 0;
}

async function bumpUsage(db, modelId) {
await db.prepare(
'INSERT INTO ai_usage (model_id, day, count) VALUES (?,?, 1) ON CONFLICT(model_id, day) DO UPDATE SET count = count + 1',
).bind(modelId, todayStr()).run().catch(() => {});
}

async function markModelFail(db, env, model, reason) {
const failCount = (model.fail_count || 0) + 1;
const autoDisabled = failCount >= AI_AUTO_DISABLE_FAILS;
await db.prepare('UPDATE ai_models SET fail_count =?, is_active =?, updated_at =? WHERE id =?')
.bind(failCount, autoDisabled? 0: model.is_active, Date.now(), model.id).run().catch(() => {});
if (autoDisabled) {
console.error(`model ${model.id} (${model.model}) auto-disabled after ${failCount} consecutive failures: ${reason}`);
try {
const { sendFeishuDM} = await import('./feishu.js');
await sendFeishuDM(env, `模型连续 ${failCount} 次失败已自动停用\n模型：${model.name}\n原因：${String(reason || '').slice(0, 200)}\n请到后台 /admin/ai 检查 Key 或换模型。`);
} catch (e) { console.error('feishu alert failed', e);}
}
return autoDisabled;
}

async function markModelOk(db, model) {
await db.prepare('UPDATE ai_models SET fail_count = 0, updated_at =? WHERE id =?')
.bind(Date.now(), model.id).run().catch(() => {});
}

// 单个模型一次调用（OpenAI 兼容 chat completions；jsonMode 时要求 JSON 输出）
async function callOneModel(env, model, apiKey, messages, { jsonMode = true, maxTokens = 2500} = {}) {
const url = `${String(model.base_url || '').replace(/\/$/, '')}/chat/completions`;
const ctrl = new AbortController();
const timer = setTimeout(() => ctrl.abort(), AI_CALL_TIMEOUT_MS);
try {
const res = await fetch(url, {
method: 'POST',
signal: ctrl.signal,
headers: {
'Content-Type': 'application/json',
Authorization: `Bearer ${apiKey}`,
...(model.provider === 'openrouter'
? { 'HTTP-Referer': 'https://resume-site.dark-cake-762a.workers.dev/', 'X-Title': 'ResumePass'}
: {}),
},
body: JSON.stringify({
model: model.model,
messages,
temperature: 0.3,
max_tokens: maxTokens,
...(jsonMode? { response_format: { type: 'json_object'}}: {}),
}),
});
const data = await res.json().catch(() => ({}));
if (!res.ok) {
const msg = data?.error?.message || data?.message || `HTTP ${res.status}`;
throw new Error(`HTTP ${res.status}: ${String(msg).slice(0, 200)}`);
}
const content = data?.choices?.[0]?.message?.content || '';
if (!content) throw new Error('empty response from model');
return { ok: true, content: String(content)};
} catch (e) {
return { ok: false, error: e?.name === 'AbortError'? '调用超时（45 秒）': (e?.message || String(e))};
} finally {
clearTimeout(timer);
}
}

// 主入口：按序号从上往下试启用的模型；全部失败返回 { ok:false, error, tried: [...]}
export async function callChatModel(env, db, messages, opts = {}) {
const models = (await listModels(db)).filter((m) => m.is_active === 1);
const tried = [];
for (const model of models) {
const used = await usageToday(db, model.id);
if (used >= (model.daily_limit || 50)) {
tried.push({ model: model.model, skipped: 'daily limit reached'});
continue;
}
// 注意：listModels 刻意不返回 key_enc（不让加密 Key 经过后台列表接口），
// 这里取 Key 前必须按 id 重取整行，否则 resolveModelKey 永远拿不到 key_enc，
// 所有模型都会被跳过（key not configured），改写永远走规则兜底。
const full = await db.prepare('SELECT * FROM ai_models WHERE id =?').bind(model.id).first().catch(() => null);
const { key, configured} = await resolveModelKey(env, full || model);
if (!configured ||!key) {
tried.push({ model: model.model, skipped: 'key not configured'});
continue;
}
const r = await callOneModel(env, model, key, messages, opts);
if (r.ok) {
await markModelOk(db, model);
await bumpUsage(db, model.id);
return { ok: true, content: r.content, modelId: model.id, model: model.model, provider: model.provider};
}
tried.push({ model: model.model, error: r.error});
await markModelFail(db, env, model, r.error);
}
return { ok: false, error: '所有模型都调用失败', tried};
}

// 测试单个模型（后台“测试”按钮）：小提示词，必须通才允许启用
export async function testModel(env, db, modelId) {
const model = await db.prepare('SELECT * FROM ai_models WHERE id =?').bind(modelId).first().catch(() => null);
if (!model) return { ok: false, error: '模型不存在'};
const { key, configured} = await resolveModelKey(env, model);
if (!configured ||!key) return { ok: false, error: 'Key 未配置，先填 Key 再测试'};
const r = await callOneModel(env, model, key, [
{ role: 'user', content: 'Say exactly: OK'},
], { jsonMode: false, maxTokens: 20});
const now = Date.now();
await db.prepare('UPDATE ai_models SET last_test_at =?, last_test_ok =?, fail_count = 0, updated_at =? WHERE id =?')
.bind(now, r.ok? 1: 0, now, modelId).run().catch(() => {});
if (r.ok) return { ok: true, model: model.model, reply: r.content.slice(0, 50)};
return { ok: false, error: r.error};
}

// ---- 规则与提示词（版本化） ----
export const RULE_DEFAULTS = {
rewrite_prompt_zh: '',
rewrite_prompt_en: '',
cover_prompt_zh: '',
cover_prompt_en: '',
translate_prompt: '',
allow_number_edit: '0',
force_star: '1',
default_intensity: 'standard',
};

export async function getRules(db) {
const { results} = await db.prepare('SELECT key, value, version FROM ai_rules').all().catch(() => ({ results: []}));
const out = {...RULE_DEFAULTS};
const versions = {};
for (const r of results || []) {
out[r.key] = r.value;
versions[r.key] = r.version;
}
return { rules: out, versions};
}

export async function setRule(db, key, value) {
if (!(key in RULE_DEFAULTS)) return { ok: false, error: '未知的规则 key'};
const row = await db.prepare('SELECT version FROM ai_rules WHERE key =?').bind(key).first().catch(() => null);
const nextVersion = (row? row.version: 0) + 1;
const now = Date.now();
await db.prepare(
'INSERT INTO ai_rules (key, value, version, updated_at) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET value =?, version =?, updated_at =?',
).bind(key, value, nextVersion, now, value, nextVersion, now).run();
await db.prepare('INSERT INTO ai_rule_versions (rule_key, value, version, created_at) VALUES (?,?,?,?)')
.bind(key, value, nextVersion, now).run().catch(() => {});
return { ok: true, version: nextVersion};
}

export async function restoreRule(db, key, version) {
const row = await db.prepare('SELECT value FROM ai_rule_versions WHERE rule_key =? AND version =?')
.bind(key, version).first().catch(() => null);
if (!row) return { ok: false, error: '该版本不存在'};
return setRule(db, key, row.value);
}

export async function listRuleVersions(db, key) {
const { results} = await db.prepare(
'SELECT version, created_at FROM ai_rule_versions WHERE rule_key =? ORDER BY version DESC LIMIT 10',
).bind(key).all().catch(() => ({ results: []}));
return results || [];
}

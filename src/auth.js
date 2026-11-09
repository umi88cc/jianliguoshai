// 简历过筛 — 邮箱验证码登录 + 会话 + 站长鉴权（第 2 周）
// 登录方式：邮箱 + 6 位验证码（无密码），与规划 §5 一致；
// 验证码只存 SHA-256 哈希，10 分钟有效，5 次输错失效；
// 邮件发送：配了 RESEND_API_KEY 就发真实邮件，否则开发模式把验证码随接口返回
// （与博客 openzn 同一做法：上线前必须配 RESEND_API_KEY，否则任何人拿到验证码就能登别人号）。
// 会话：HttpOnly Cookie（session=token），30 天；站长 = 邮箱等于 Worker secret ADMIN_EMAIL。

const CODE_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
const MAX_CODE_ATTEMPTS = 5;

export function isValidEmail(email) {
return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(String(email || '').trim());
}

export function normalizeEmail(email) {
return String(email || '').trim().toLowerCase();
}

async function sha256Hex(text) {
const data = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
return [...new Uint8Array(data)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomCode() {
const n = Math.floor(100000 + Math.random() * 900000);
return String(n);
}

function randomToken() {
const bytes = new Uint8Array(32);
crypto.getRandomValues(bytes);
return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function dayString() {
return new Date().toISOString().slice(0, 10);
}

// 发验证码：同邮箱 60 秒内只能发一次；同 IP 每小时最多 10 次
export async function sendLoginCode(db, env, email, ip) {
const em = normalizeEmail(email);
if (!isValidEmail(em)) return { ok: false, error: '邮箱格式不对'};
const now = Date.now();
const hourKey = `sendcode:${ip || 'unknown'}:${new Date().toISOString().slice(0, 13)}`;
try {
const row = await db.prepare('SELECT count FROM rate_limits WHERE key =?').bind(hourKey).first();
if (row && row.count >= 10) return { ok: false, error: '发送太频繁，请 1 小时后再试'};
await db.prepare(
'INSERT INTO rate_limits (key, count, updated_at) VALUES (?, 1,?) ON CONFLICT(key) DO UPDATE SET count = count + 1, updated_at =?',
).bind(hourKey, now, now).run();
} catch (e) { console.error('sendcode rate check failed', e);}
try {
const prev = await db.prepare('SELECT created_at FROM email_codes WHERE email =?').bind(em).first();
if (prev && now - prev.created_at < 60 * 1000) return { ok: false, error: '验证码刚发过，60 秒后再试'};
} catch (e) { console.error('sendcode cooldown check failed', e);}

const code = randomCode();
const codeHash = await sha256Hex(code);
try {
await db.prepare(
'INSERT INTO email_codes (email, code_hash, attempts, created_at, expires_at) VALUES (?,?, 0,?,?) ON CONFLICT(email) DO UPDATE SET code_hash =?, attempts = 0, created_at =?, expires_at =?',
).bind(em, codeHash, now, now + CODE_TTL_MS, codeHash, now, now + CODE_TTL_MS).run();
} catch (e) {
console.error('email code store failed', e);
return { ok: false, error: '验证码保存失败，请稍后重试'};
}

// 有 Resend 就发真实邮件；没配就开发模式返回验证码（上线前必须配，见文件头注释）
const resendKey = String(env.RESEND_API_KEY || '').trim();
if (resendKey) {
try {
const from = String(env.RESEND_FROM || '简历过筛 <onboarding@resend.dev>').trim();
const res = await fetch('https://api.resend.com/emails', {
method: 'POST',
headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json'},
body: JSON.stringify({
from,
to: em,
subject: `登录验证码 ${code}`,
text: `你的登录验证码是 ${code}，10 分钟内有效。不要把验证码告诉任何人。`,
}),
});
if (!res.ok) {
const t = await res.text().catch(() => '');
console.error('resend failed', res.status, t.slice(0, 200));
return { ok: false, error: '邮件发送失败，请稍后重试'};
}
return { ok: true, sent: true};
} catch (e) {
console.error('resend error', e);
return { ok: false, error: '邮件发送失败，请稍后重试'};
}
}
return { ok: true, sent: false, devMode: true, code};
}

// 验码登录：成功则创建用户（不存在就建）+ 会话，返回 Set-Cookie 值
export async function verifyLoginCode(db, email, code) {
const em = normalizeEmail(email);
if (!isValidEmail(em)) return { ok: false, error: '邮箱格式不对'};
const c = String(code || '').trim();
if (!/^\d{6}$/.test(c)) return { ok: false, error: '验证码是 6 位数字'};
const now = Date.now();
const row = await db.prepare('SELECT * FROM email_codes WHERE email =?').bind(em).first().catch(() => null);
if (!row) return { ok: false, error: '验证码不存在或已过期，请重新获取'};
if (row.expires_at < now) {
await db.prepare('DELETE FROM email_codes WHERE email =?').bind(em).run().catch(() => {});
return { ok: false, error: '验证码已过期，请重新获取'};
}
if (row.attempts >= MAX_CODE_ATTEMPTS) {
await db.prepare('DELETE FROM email_codes WHERE email =?').bind(em).run().catch(() => {});
return { ok: false, error: '输错次数太多，验证码已失效，请重新获取'};
}
const hash = await sha256Hex(c);
if (hash!== row.code_hash) {
await db.prepare('UPDATE email_codes SET attempts = attempts + 1 WHERE email =?').bind(em).run().catch(() => {});
return { ok: false, error: '验证码不对'};
}
await db.prepare('DELETE FROM email_codes WHERE email =?').bind(em).run().catch(() => {});

let user = await db.prepare('SELECT id, email, locale FROM users WHERE email =?').bind(em).first().catch(() => null);
if (!user) {
const r = await db.prepare('INSERT INTO users (email, created_at, locale) VALUES (?,?,?)').bind(em, now, 'zh').run();
user = { id: r.meta.last_row_id, email: em, locale: 'zh'};
}
const token = randomToken();
await db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?,?,?,?)')
.bind(token, user.id, now, now + SESSION_TTL_MS).run();
return { ok: true, user: { id: user.id, email: user.email}, token};
}

export function sessionCookie(token) {
return `session=${token}; HttpOnly; Path=/; Max-Age=${30 * 24 * 3600}; SameSite=Lax; Secure`;
}

export function clearSessionCookie() {
return 'session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax; Secure';
}

function sessionTokenFromReq(req) {
const cookie = req.headers.get('Cookie') || '';
const m = cookie.match(/(?:^|;\s*)session=([0-9a-f]{64})/);
return m? m[1]: '';
}

export async function getSessionUser(db, req) {
const token = sessionTokenFromReq(req);
if (!token ||!db) return null;
try {
const row = await db.prepare(
'SELECT u.id, u.email, u.locale FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token =? AND s.expires_at >?',
).bind(token, Date.now()).first();
return row || null;
} catch (e) {
console.error('session lookup failed', e);
return null;
}
}

export async function logoutSession(db, req) {
const token = sessionTokenFromReq(req);
if (token && db) {
await db.prepare('DELETE FROM sessions WHERE token =?').bind(token).run().catch(() => {});
}
}

export function isAdmin(env, user) {
const adminEmail = String(env.ADMIN_EMAIL || '').trim().toLowerCase();
return Boolean(adminEmail && user && user.email && user.email.toLowerCase() === adminEmail);
}

// ---- 额度账本（credits 表 kind=rewrite；扣减用事务，余额不足返回 false） ----
export async function getCredits(db, userId, kind) {
const row = await db.prepare('SELECT balance, expire_at FROM credits WHERE user_id =? AND kind =?')
.bind(userId, kind).first().catch(() => null);
if (!row) return { balance: 0, expire_at: null};
if (row.expire_at && row.expire_at < Date.now()) return { balance: 0, expire_at: row.expire_at};
return { balance: row.balance, expire_at: row.expire_at};
}

export async function deductCredit(db, userId, kind, n = 1) {
const now = Date.now();
const r = await db.prepare(
'UPDATE credits SET balance = balance -? WHERE user_id =? AND kind =? AND balance >=? AND (expire_at IS NULL OR expire_at >?)',
).bind(n, userId, kind, n, now).run();
return (r.meta?.changes || 0) > 0;
}

export async function refundCredit(db, userId, kind, n = 1) {
await db.prepare(
'INSERT INTO credits (user_id, kind, balance, expire_at) VALUES (?,?,?, NULL) ON CONFLICT(user_id, kind) DO UPDATE SET balance = balance +?',
).bind(userId, kind, n, n).run().catch((e) => console.error('refund failed', e));
}

export async function grantCredits(db, userId, kind, n, expireAt = null) {
await db.prepare(
'INSERT INTO credits (user_id, kind, balance, expire_at) VALUES (?,?,?,?) ON CONFLICT(user_id, kind) DO UPDATE SET balance = balance +?, expire_at =?',
).bind(userId, kind, n, expireAt, n, expireAt).run();
}

export { dayString};

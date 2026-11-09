// 简历过筛 — 后台 AI 配置页 /admin/ai（第 2 周，规划 §13）
// 一行一个模型：序号 / 提供商（选了自动调出专属地址）/ 模型名 / 专属 Key（加密存，只显示后 4 位）/
// 启用开关 / 测试按钮；Key 互斥；测试必须通过才能启用；连续 3 次失败自动停用 + 飞书告警。
// 规则与提示词可编辑（版本化，可恢复）。站长鉴权：登录邮箱 = Worker secret ADMIN_EMAIL。
// 注意：Key 从浏览器发过来是 HTTPS 明文传输、服务端加密后才入库；绝不在页面上回显完整 Key。

const PROVIDERS = [
  ['nvidia', '英伟达 NVIDIA', 'https://integrate.api.nvidia.com/v1'],
  ['openrouter', 'OpenRouter', 'https://openrouter.ai/api/v1'],
  ['deepseek', 'DeepSeek', 'https://api.deepseek.com/v1'],
  ['qwen', '通义千问 Qwen', 'https://dashscope.aliyuncs.com/compatible-mode/v1'],
  ['kimi', 'Kimi / Moonshot', 'https://api.moonshot.cn/v1'],
  ['glm', '智谱 GLM', 'https://open.bigmodel.cn/api/paas/v4'],
  ['other', '其他（OpenAI 兼容）', ''],
];

export function adminPage() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI 模型配置 - 简历过筛后台</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--blue:#1668B4;--blue-d:#0f4f8a;--bg:#F7F8F9;--card:#fff;--text:#1a1d21;--muted:#5b6470;--line:#e3e7ec;--green:#1e7d32;--amber:#b26a00;--red:#c62828}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;background:var(--bg);color:var(--text);line-height:1.6;font-size:15px}
.wrap{max-width:1060px;margin:0 auto;padding:0 16px 48px}
header{background:#fff;border-bottom:1px solid var(--line);position:sticky;top:0;z-index:10}
.nav{max-width:1060px;margin:0 auto;padding:0 16px;height:56px;display:flex;align-items:center;gap:12px}
.brand{font-size:18px;font-weight:700;color:var(--blue)}
.nav a{color:var(--text);font-size:14px}
.nav .right{margin-left:auto;font-size:14px;color:var(--muted)}
h1{font-size:22px;margin:24px 0 4px}
.sub{color:var(--muted);font-size:14px;margin-bottom:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:20px;margin-top:16px}
.card h2{font-size:17px;margin-bottom:8px}
.hint{font-size:13px;color:var(--muted);margin-bottom:12px}
label{display:block;font-size:14px;font-weight:600;margin:12px 0 6px}
input,select,textarea{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:10px;font-size:16px;font-family:inherit;background:#fff}
textarea{min-height:120px;line-height:1.6}
input:focus,select:focus,textarea:focus{outline:2px solid var(--blue);outline-offset:1px;border-color:var(--blue)}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:10px 20px;border-radius:10px;border:0;font-size:15px;font-weight:600;cursor:pointer;background:var(--blue);color:#fff}
.btn:hover{background:var(--blue-d)}
.btn:disabled{background:#9db8d2;cursor:not-allowed}
.btn.ghost{background:#fff;color:var(--blue);border:1px solid var(--blue)}
.btn.danger{background:#fff;color:var(--red);border:1px solid var(--red)}
.btn.small{min-height:36px;padding:6px 12px;font-size:14px}
.row{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end}
.row>*{flex:1;min-width:140px}
.status{margin-top:12px;font-size:14px;min-height:22px;color:var(--muted)}
.status.err{color:var(--red)}
.status.ok{color:var(--green)}
table{width:100%;border-collapse:collapse;font-size:14px;margin-top:8px}
th,td{border-bottom:1px solid var(--line);padding:10px 6px;text-align:left;vertical-align:top}
th{color:var(--muted);font-size:13px}
.tag{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px}
.tag.on{color:var(--green);background:#eaf5ec}
.tag.off{color:var(--muted);background:#eef1f4}
.tag.warn{color:var(--amber);background:#fdf6e7}
.tag.bad{color:var(--red);background:#fdeeee}
.mono{font-family:ui-monospace,Menlo,monospace;font-size:13px;word-break:break-all}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media (max-width:640px){
  .grid2{grid-template-columns:1fr}
  table{font-size:13px}
  .card{padding:16px}
  .hide-m{display:none}
}
</style>
</head>
<body>
<header><nav class="nav"><span class="brand">简历过筛 · 后台</span><a href="/">前台首页</a><a href="/api/admin/ai/status" target="_blank">状态 JSON</a><span class="right" id="who"></span></nav></header>
<main class="wrap">
<h1>AI 模型配置</h1>
<p class="sub">一行一个模型。Key 加密存储，只显示后 4 位；一个 Key 不能绑两个模型；测试通过才能启用；连续 3 次失败自动停用并飞书告警。</p>

<section class="card" id="loginCard">
<h2>站长登录</h2>
<p class="hint">用站长邮箱收验证码登录（邮箱 = Worker secret ADMIN_EMAIL）。未配 Resend 时验证码会直接显示在下方（开发模式，上线前务必配 RESEND_API_KEY）。</p>
<div class="row">
<div><label for="email">邮箱</label><input id="email" type="email" placeholder="站长邮箱" autocomplete="email"></div>
</div>
<div class="row" style="margin-top:12px">
<button class="btn ghost" id="sendCodeBtn" type="button">发送验证码</button>
</div>
<div class="row">
<div><label for="code">验证码</label><input id="code" type="text" inputmode="numeric" maxlength="6" placeholder="6 位数字"></div>
</div>
<div class="row" style="margin-top:12px">
<button class="btn" id="loginBtn" type="button">登录</button>
<button class="btn ghost" id="logoutBtn" type="button">退出</button>
</div>
<p class="status" id="loginStatus"></p>
</section>

<section class="card" id="modelsCard" style="display:none">
<h2>模型列表（共 12 行预置）</h2>
<p class="hint">第 1–4 行是博客迁移的模型（Key 待补：把 Key 填进对应行点“保存 Key”即可）；第 5–12 行是更多免费模型，填 Key、测试通过后启用。</p>
<div style="overflow-x:auto"><table id="modelTable">
<thead><tr><th>序号</th><th>提供商</th><th>模型</th><th>Key</th><th class="hide-m">价格 / 速度 / 限速</th><th>状态</th><th>操作</th></tr></thead>
<tbody></tbody>
</table></div>
<p class="status" id="modelStatus"></p>
</section>

<section class="card" id="editCard" style="display:none">
<h2 id="editTitle">编辑模型</h2>
<div class="row">
<div><label for="fSort">序号</label><input id="fSort" type="number" min="1" max="99"></div>
<div><label for="fProvider">提供商</label><select id="fProvider"></select></div>
</div>
<div><label for="fBaseUrl">专属 API 地址</label><input id="fBaseUrl" type="text" placeholder="选提供商后自动填入，也可手动改"></div>
<div><label for="fName">显示名</label><input id="fName" type="text" placeholder="如 NVIDIA Nemotron 3.5 Super VL 120B"></div>
<div><label for="fModel">模型名（手动填）</label><input id="fModel" type="text" placeholder="如 nvidia/nemotron-3.5-super-vl-120b-a12b"></div>
<div><label for="fKey">专属 Key（手动填；留空 = 不改原 Key）</label><input id="fKey" type="password" placeholder="粘贴 Key，保存后只存加密串"></div>
<div class="grid2">
<div><label for="fPrice">价格（显示用）</label><input id="fPrice" type="text" placeholder="如 免费"></div>
<div><label for="fSpeed">速度（显示用）</label><input id="fSpeed" type="text" placeholder="如 约 182 tok/s"></div>
<div><label for="fLimit">限速（显示用）</label><input id="fLimit" type="text" placeholder="如 20 RPM；每天 50 次"></div>
<div><label for="fDaily">每日上限（次）</label><input id="fDaily" type="number" min="1" max="10000"></div>
</div>
<div class="row" style="margin-top:16px">
<button class="btn" id="saveModelBtn" type="button">保存</button>
<button class="btn ghost" id="newModelBtn" type="button">新增一行</button>
<button class="btn ghost" id="cancelEditBtn" type="button">取消</button>
</div>
<p class="status" id="editStatus"></p>
</section>

<section class="card" id="rulesCard" style="display:none">
<h2>规则与提示词</h2>
<p class="hint">改一次版本 +1，旧版本保留在历史里，可恢复。allow_number_edit=0 表示数字照搬原文（不许改）；force_star=1 表示每条 bullet 必须 STAR 结构。</p>
<div><label for="rRewriteZh">改写提示词（中文）</label><textarea id="rRewriteZh"></textarea></div>
<div><label for="rRewriteEn">改写提示词（英文）</label><textarea id="rRewriteEn"></textarea></div>
<div><label for="rCoverZh">求职信提示词（中文）</label><textarea id="rCoverZh"></textarea></div>
<div><label for="rCoverEn">求职信提示词（英文）</label><textarea id="rCoverEn"></textarea></div>
<div><label for="rTranslate">互译提示词</label><textarea id="rTranslate"></textarea></div>
<div class="row">
<div><label for="rAllowNum">允许改数字（0=不许，1=允许）</label><select id="rAllowNum"><option value="0">0 不许改数字</option><option value="1">1 允许改数字</option></select></div>
<div><label for="rForceStar">强制 STAR（0=不强制，1=强制）</label><select id="rForceStar"><option value="0">0 不强制</option><option value="1">1 强制 STAR</option></select></div>
<div><label for="rIntensity">默认改写强度</label><select id="rIntensity"><option value="conservative">保守</option><option value="standard">标准</option><option value="aggressive">激进</option></select></div>
</div>
<div class="row" style="margin-top:16px">
<button class="btn" id="saveRulesBtn" type="button">保存规则</button>
<button class="btn ghost" id="refreshRulesBtn" type="button">重新加载</button>
</div>
<p class="status" id="rulesStatus"></p>
<div id="ruleVersions" style="margin-top:12px;font-size:13px;color:var(--muted)"></div>
</section>

<section class="card" id="creditsCard" style="display:none">
<h2>额度发放（手动收款确认后用）</h2>
<p class="hint">用户微信/支付宝付款后站长核对账单，在这里按邮箱发放 rewrite 额度（1 次改写/求职信/互译 = 1 个额度）。</p>
<div class="row">
<div><label for="gEmail">用户邮箱</label><input id="gEmail" type="email" placeholder="用户注册邮箱"></div>
<div><label for="gAmount">发放数量</label><input id="gAmount" type="number" min="1" max="100" value="1"></div>
</div>
<div class="row" style="margin-top:12px"><button class="btn" id="grantBtn" type="button">发放 rewrite 额度</button></div>
<p class="status" id="grantStatus"></p>
</section>

<section class="card" id="statusCard" style="display:none">
<h2>运行状态</h2>
<div id="statusBox" style="font-size:14px"></div>
<div class="row" style="margin-top:12px"><button class="btn ghost" id="refreshStatusBtn" type="button">刷新状态</button></div>
</section>
</main>
<script>
const $ = (id) => document.getElementById(id);
const escH = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PROVIDERS = ${JSON.stringify(PROVIDERS)};
let editingId = null;
let models = [];

function setStatus(el, msg, ok) {
  el.textContent = msg;
  el.className = 'status' + (ok === true ? ' ok' : ok === false ? ' err' : '');
}
async function api(path, method, body) {
  const r = await fetch(path, { method: method || 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || ('请求失败 ' + r.status));
  return data;
}
function showAuthed(email) {
  $('who').textContent = email ? ('站长：' + email) : '';
  for (const id of ['modelsCard', 'editCard', 'rulesCard', 'creditsCard', 'statusCard']) $(id).style.display = email ? '' : 'none';
  $('loginCard').style.display = email ? 'none' : '';
}
async function checkMe() {
  try {
    const me = await api('/api/auth/me');
    if (me.user && me.isAdmin) { showAuthed(me.user.email); loadModels(); loadRules(); loadStatus(); }
    else if (me.user) { setStatus($('loginStatus'), '当前账号不是站长（邮箱与 ADMIN_EMAIL 不一致），请换站长邮箱登录。', false); showAuthed(''); }
    else showAuthed('');
  } catch (e) { showAuthed(''); }
}
$('sendCodeBtn').addEventListener('click', async () => {
  const email = $('email').value.trim();
  if (!email) { setStatus($('loginStatus'), '请先填邮箱', false); return; }
  const btn = $('sendCodeBtn'); btn.disabled = true;
  try {
    const d = await api('/api/auth/send-code', 'POST', { email });
    setStatus($('loginStatus'), d.devMode ? ('开发模式验证码：' + d.code + '（未配 Resend，上线前务必配好）') : '验证码已发到邮箱，请查收', true);
  } catch (e) { setStatus($('loginStatus'), e.message, false); }
  finally { btn.disabled = false; }
});
$('loginBtn').addEventListener('click', async () => {
  const email = $('email').value.trim();
  const code = $('code').value.trim();
  if (!email || !code) { setStatus($('loginStatus'), '请填邮箱和验证码', false); return; }
  const btn = $('loginBtn'); btn.disabled = true; btn.textContent = '登录中…';
  try {
    await api('/api/auth/verify-code', 'POST', { email, code });
    setStatus($('loginStatus'), '登录成功', true);
    checkMe();
  } catch (e) { setStatus($('loginStatus'), e.message, false); }
  finally { btn.disabled = false; btn.textContent = '登录'; }
});
$('logoutBtn').addEventListener('click', async () => {
  try { await api('/api/auth/logout', 'POST'); } catch (e) {}
  showAuthed('');
  setStatus($('loginStatus'), '已退出', true);
});

// ---- 模型列表 ----
function providerLabel(p) {
  const f = PROVIDERS.find((x) => x[0] === p);
  return f ? f[1] : p;
}
async function loadModels() {
  try {
    const d = await api('/api/admin/ai/models');
    models = d.models || [];
    const tb = document.querySelector('#modelTable tbody');
    tb.innerHTML = models.map((m) => {
      const state = m.is_active ? '<span class="tag on">已启用</span>' : '<span class="tag off">已停用</span>';
      const key = m.key_configured
        ? '<span class="tag on">已配 Key</span> <span class="mono">****' + escH(m.key_last4 || '') + '</span>'
        : '<span class="tag warn">待填 Key</span>';
      const test = m.last_test_ok === 1 ? '<span class="tag on">测试通过</span>' : m.last_test_at ? '<span class="tag bad">测试失败</span>' : '<span class="tag off">未测试</span>';
      const fail = m.fail_count > 0 ? ' <span class="tag bad">连续失败 ' + m.fail_count + ' 次</span>' : '';
      return '<tr><td>' + m.sort_order + '</td><td>' + escH(providerLabel(m.provider)) + '</td>'
        + '<td><div>' + escH(m.name) + '</div><div class="mono" style="color:var(--muted)">' + escH(m.model) + '</div></td>'
        + '<td>' + key + '<br>' + test + fail + '</td>'
        + '<td class="hide-m">' + escH(m.price_text || '') + ' / ' + escH(m.speed_text || '') + '<br><span style="color:var(--muted)">' + escH(m.limit_text || '') + '</span><br><span style="color:var(--muted)">今日已用 ' + (m.used_today || 0) + ' / ' + (m.daily_limit || 50) + ' 次</span></td>'
        + '<td>' + state + '</td>'
        + '<td style="white-space:nowrap">'
        + '<button class="btn small ghost" data-act="edit" data-id="' + m.id + '">编辑</button> '
        + '<button class="btn small ghost" data-act="test" data-id="' + m.id + '">测试</button> '
        + '<button class="btn small" data-act="toggle" data-id="' + m.id + '">' + (m.is_active ? '停用' : '启用') + '</button>'
        + '</td></tr>';
    }).join('');
    tb.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => modelAction(b.dataset.act, Number(b.dataset.id), b)));
  } catch (e) { setStatus($('modelStatus'), e.message, false); }
}
async function modelAction(act, id, btn) {
  const m = models.find((x) => x.id === id);
  if (!m) return;
  if (act === 'edit') { openEdit(m); return; }
  btn.disabled = true;
  try {
    if (act === 'test') {
      setStatus($('modelStatus'), '正在测试模型…', null);
      const d = await api('/api/admin/ai/models/' + id + '/test', 'POST');
      setStatus($('modelStatus'), d.ok ? ('测试通过：' + (d.reply || 'OK')) : ('测试失败：' + (d.error || '')), d.ok);
    } else if (act === 'toggle') {
      const d = await api('/api/admin/ai/models/' + id + '/toggle', 'POST');
      setStatus($('modelStatus'), d.ok ? (d.is_active ? '已启用' : '已停用') : ('操作失败：' + (d.error || '')), d.ok);
    }
    loadModels();
  } catch (e) { setStatus($('modelStatus'), e.message, false); }
  finally { btn.disabled = false; }
}
function fillProviders(sel) {
  $(sel).innerHTML = PROVIDERS.map((p) => '<option value="' + p[0] + '">' + escH(p[1]) + '</option>').join('');
}
fillProviders('fProvider');
$('fProvider').addEventListener('change', () => {
  const p = PROVIDERS.find((x) => x[0] === $('fProvider').value);
  if (p && p[2]) $('fBaseUrl').value = p[2];
});
function openEdit(m) {
  editingId = m ? m.id : null;
  $('editTitle').textContent = m ? ('编辑模型 #' + m.id) : '新增模型';
  $('fSort').value = m ? m.sort_order : (models.length + 1);
  $('fProvider').value = m ? m.provider : 'nvidia';
  $('fBaseUrl').value = m ? m.base_url : PROVIDERS[0][2];
  $('fName').value = m ? m.name : '';
  $('fModel').value = m ? m.model : '';
  $('fKey').value = '';
  $('fPrice').value = m ? (m.price_text || '') : '免费';
  $('fSpeed').value = m ? (m.speed_text || '') : '';
  $('fLimit').value = m ? (m.limit_text || '') : '';
  $('fDaily').value = m ? (m.daily_limit || 50) : 50;
  setStatus($('editStatus'), m && !m.key_configured ? '该行尚未配 Key：填入 Key 后点保存，保存后需点“测试”通过才能启用。' : '', null);
  $('editCard').scrollIntoView({ behavior: 'smooth' });
}
$('newModelBtn').addEventListener('click', () => openEdit(null));
$('cancelEditBtn').addEventListener('click', () => { editingId = null; setStatus($('editStatus'), '', null); });
$('saveModelBtn').addEventListener('click', async () => {
  const body = {
    id: editingId || undefined,
    sort_order: Number($('fSort').value) || 99,
    provider: $('fProvider').value,
    base_url: $('fBaseUrl').value.trim(),
    name: $('fName').value.trim(),
    model: $('fModel').value.trim(),
    key: $('fKey').value.trim() || undefined,
    price_text: $('fPrice').value.trim(),
    speed_text: $('fSpeed').value.trim(),
    limit_text: $('fLimit').value.trim(),
    daily_limit: Number($('fDaily').value) || 50,
  };
  if (!body.name || !body.model || !body.base_url) { setStatus($('editStatus'), '显示名、模型名、API 地址都要填', false); return; }
  const btn = $('saveModelBtn'); btn.disabled = true; btn.textContent = '保存中…';
  try {
    const d = await api('/api/admin/ai/models', 'POST', body);
    setStatus($('editStatus'), d.ok ? '已保存。记得点“测试”，通过后才能启用。' : ('保存失败：' + (d.error || '')), d.ok);
    $('fKey').value = '';
    loadModels();
  } catch (e) { setStatus($('editStatus'), e.message, false); }
  finally { btn.disabled = false; btn.textContent = '保存'; }
});

// ---- 规则 ----
async function loadRules() {
  try {
    const d = await api('/api/admin/ai/rules');
    const r = d.rules || {};
    $('rRewriteZh').value = r.rewrite_prompt_zh || '';
    $('rRewriteEn').value = r.rewrite_prompt_en || '';
    $('rCoverZh').value = r.cover_prompt_zh || '';
    $('rCoverEn').value = r.cover_prompt_en || '';
    $('rTranslate').value = r.translate_prompt || '';
    $('rAllowNum').value = r.allow_number_edit || '0';
    $('rForceStar').value = r.force_star || '1';
    $('rIntensity').value = r.default_intensity || 'standard';
    const v = d.versions || {};
    $('ruleVersions').textContent = '当前版本：' + Object.entries(v).map(([k, n]) => k + ' v' + n).join(' · ');
  } catch (e) { setStatus($('rulesStatus'), e.message, false); }
}
$('saveRulesBtn').addEventListener('click', async () => {
  const btn = $('saveRulesBtn'); btn.disabled = true; btn.textContent = '保存中…';
  try {
    const rules = {
      rewrite_prompt_zh: $('rRewriteZh').value,
      rewrite_prompt_en: $('rRewriteEn').value,
      cover_prompt_zh: $('rCoverZh').value,
      cover_prompt_en: $('rCoverEn').value,
      translate_prompt: $('rTranslate').value,
      allow_number_edit: $('rAllowNum').value,
      force_star: $('rForceStar').value,
      default_intensity: $('rIntensity').value,
    };
    const d = await api('/api/admin/ai/rules', 'POST', { rules });
    setStatus($('rulesStatus'), d.ok ? '规则已保存（版本 +1）。' : ('保存失败：' + (d.error || '')), d.ok);
    loadRules();
  } catch (e) { setStatus($('rulesStatus'), e.message, false); }
  finally { btn.disabled = false; btn.textContent = '保存规则'; }
});
$('refreshRulesBtn').addEventListener('click', loadRules);

// ---- 额度发放 ----
$('grantBtn').addEventListener('click', async () => {
  const email = $('gEmail').value.trim();
  const amount = Number($('gAmount').value) || 1;
  if (!email) { setStatus($('grantStatus'), '请填用户邮箱', false); return; }
  const btn = $('grantBtn'); btn.disabled = true; btn.textContent = '发放中…';
  try {
    const d = await api('/api/admin/credits/grant', 'POST', { email, kind: 'rewrite', amount });
    setStatus($('grantStatus'), d.ok ? ('已发放 ' + amount + ' 个 rewrite 额度给 ' + email + '（当前余额 ' + d.balance + '）') : ('发放失败：' + (d.error || '')), d.ok);
  } catch (e) { setStatus($('grantStatus'), e.message, false); }
  finally { btn.disabled = false; btn.textContent = '发放 rewrite 额度'; }
});

// ---- 状态 ----
async function loadStatus() {
  try {
    const d = await api('/api/admin/ai/status');
    const rows = (d.models || []).map((m) => '<div>' + escH(m.name) + '：今日 ' + m.used_today + '/' + m.daily_limit + ' 次，连续失败 ' + m.fail_count + ' 次，' + (m.is_active ? '已启用' : '已停用') + '</div>').join('');
    $('statusBox').innerHTML = '<p>待处理任务：' + (d.pendingTasks || 0) + ' 个</p><p>飞书通知：' + (d.feishuConfigured ? '已配置' : '未配置') + '</p>' + rows;
  } catch (e) { $('statusBox').textContent = '状态加载失败：' + e.message; }
}
$('refreshStatusBtn').addEventListener('click', loadStatus);

checkMe();
</script>
</body>
</html>`;
}

// 简历过筛 — 后台订单管理 /admin/orders（第 3 周，规划 §6）
// 待审核优先；详情含订单号/用户/套餐/金额/方式/单号/截图/时间；
// 确认通过才开通（AI 绝不自动通过国内订单）；拒绝要写原因；
// USDT 过期到账按 TxID 人工补开；套餐价格/额度可改；Telegram 绑定入口。
// 站长鉴权：登录邮箱 = Worker secret ADMIN_EMAIL。

export function adminOrdersPage() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>订单管理 - 简历过筛后台</title>
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
textarea{min-height:80px;line-height:1.6}
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
.kv{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--line);font-size:14px}
.kv:last-child{border-bottom:0}
@media (max-width:640px){ .card{padding:16px} table{font-size:13px} }
</style>
</head>
<body>
<header><nav class="nav"><span class="brand">简历过筛 · 后台</span><a href="/">前台首页</a><a href="/admin/ai">AI 配置</a><a href="/admin/orders">订单管理</a><span class="right" id="who"></span></nav></header>
<main class="wrap">
<h1>订单管理</h1>
<p class="sub">待审核优先。确认通过才开通——AI 绝不自动通过国内订单；USDT 自动放行保持关闭，到账先核对记录、人工确认。</p>

<section class="card" id="loginCard">
<h2>站长登录</h2>
<p class="hint">用站长邮箱收验证码登录（邮箱 = Worker secret ADMIN_EMAIL）。</p>
<div class="row"><div><label for="email">邮箱</label><input id="email" type="email" placeholder="站长邮箱" autocomplete="email"></div></div>
<div class="row" style="margin-top:12px"><button class="btn ghost" id="sendCodeBtn" type="button">发送验证码</button></div>
<div class="row"><div><label for="code">验证码</label><input id="code" type="text" inputmode="numeric" maxlength="6" placeholder="6 位数字"></div></div>
<div class="row" style="margin-top:12px"><button class="btn" id="loginBtn" type="button">登录</button><button class="btn ghost" id="logoutBtn" type="button">退出</button></div>
<p class="status" id="loginStatus"></p>
</section>

<section class="card" id="statsCard" style="display:none">
<h2>今日概况</h2>
<div id="statsBox" style="font-size:14px"></div>
</section>

<section class="card" id="listCard" style="display:none">
<h2>订单列表</h2>
<div class="row">
<div><label for="fStatus">状态筛选</label><select id="fStatus"><option value="">全部</option><option value="review_pending" selected>待审核</option><option value="pending">待付款</option><option value="done">已开通</option><option value="rejected">已拒绝</option><option value="cancelled">已取消</option></select></div>
<div><label for="fQ">按订单号搜索</label><input id="fQ" type="text" placeholder="如 RS-20261109-1234"></div>
</div>
<div class="row" style="margin-top:12px"><button class="btn" id="searchBtn" type="button">查询</button></div>
<div style="overflow-x:auto"><table id="orderTable">
<thead><tr><th>订单号</th><th>用户</th><th>套餐 / 金额</th><th>方式</th><th>状态</th><th>时间</th><th>操作</th></tr></thead>
<tbody></tbody>
</table></div>
<p class="status" id="listStatus"></p>
</section>

<section class="card" id="detailCard" style="display:none">
<h2>订单详情</h2>
<div id="detailBox"></div>
<div id="detailActions" style="margin-top:16px"></div>
<p class="status" id="detailStatus"></p>
</section>

<section class="card" id="plansCard" style="display:none">
<h2>套餐价格 / 额度（后台可改；金额按元填）</h2>
<p class="hint">改完立即生效（新订单按新价）。USDT 标价按美元 1:1（1 USDT ≈ 1 美元），填 USDT 数。</p>
<div id="plansBox"></div>
<p class="status" id="plansStatus"></p>
</section>

<section class="card" id="tgCard" style="display:none">
<h2>Telegram 通知绑定（国外 USDT 到账通知用）</h2>
<p class="hint">先在 Telegram 里给机器人 zwy886_bot 发一条 /start，再点“拉取最近对话”，选你的账号设为接收方。没绑定时 USDT 到账通知走飞书兜底。</p>
<div class="row" style="margin-top:12px"><button class="btn ghost" id="tgListBtn" type="button">拉取最近对话</button></div>
<div id="tgBox" style="margin-top:12px;font-size:14px"></div>
<p class="status" id="tgStatus"></p>
</section>

<section class="card" id="payCfgCard" style="display:none">
<h2>支付配置状态</h2>
<div id="payCfgBox" style="font-size:14px"></div>
</section>
</main>
<script>
const $ = (id) => document.getElementById(id);
const escH = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
let CUR_ORDER = null;
function showAuthed(email) {
  $('who').textContent = email ? ('站长：' + email) : '';
  for (const id of ['statsCard', 'listCard', 'detailCard', 'plansCard', 'tgCard', 'payCfgCard']) $(id).style.display = email ? '' : 'none';
  $('loginCard').style.display = email ? 'none' : '';
}
async function checkMe() {
  try {
    const me = await api('/api/auth/me');
    if (me.user && me.isAdmin) { showAuthed(me.user.email); loadStats(); loadOrders(); loadPlans(); loadPayCfg(); }
    else if (me.user) { setStatus($('loginStatus'), '当前账号不是站长，请换站长邮箱登录。', false); showAuthed(''); }
    else showAuthed('');
  } catch (e) { showAuthed(''); }
}
$('sendCodeBtn').addEventListener('click', async () => {
  const email = $('email').value.trim();
  if (!email) { setStatus($('loginStatus'), '请先填邮箱', false); return; }
  const btn = $('sendCodeBtn'); btn.disabled = true;
  try {
    const d = await api('/api/auth/send-code', 'POST', { email });
    setStatus($('loginStatus'), d.devMode ? ('开发模式验证码：' + d.code) : '验证码已发到邮箱，请查收', true);
  } catch (e) { setStatus($('loginStatus'), e.message, false); }
  finally { btn.disabled = false; }
});
$('loginBtn').addEventListener('click', async () => {
  const email = $('email').value.trim();
  const code = $('code').value.trim();
  if (!email || !code) { setStatus($('loginStatus'), '请填邮箱和验证码', false); return; }
  const btn = $('loginBtn'); btn.disabled = true; btn.textContent = '登录中…';
  try { await api('/api/auth/verify-code', 'POST', { email, code }); setStatus($('loginStatus'), '登录成功', true); checkMe(); }
  catch (e) { setStatus($('loginStatus'), e.message, false); }
  finally { btn.disabled = false; btn.textContent = '登录'; }
});
$('logoutBtn').addEventListener('click', async () => {
  try { await api('/api/auth/logout', 'POST'); } catch (e) {}
  showAuthed(''); setStatus($('loginStatus'), '已退出', true);
});
function fmtDate(ts) { if (!ts) return '—'; return new Date(ts).toISOString().slice(0, 19).replace('T', ' '); }
function statusTag(s) {
  const map = { pending: ['待付款', 'off'], review_pending: ['待审核', 'warn'], done: ['已开通', 'on'], rejected: ['已拒绝', 'bad'], cancelled: ['已取消', 'off'], paid: ['已付款', 'on'] };
  const m = map[s] || [s, 'off'];
  return '<span class="tag ' + m[1] + '">' + m[0] + '</span>';
}
async function loadStats() {
  try {
    const d = await api('/api/admin/orders/stats');
    $('statsBox').innerHTML = '<p>待审核：<b>' + d.review_pending + '</b> 单 · 今日新增订单：<b>' + d.today + '</b> 单 · 今日已开通：<b>' + d.today_done + '</b> 单 · 累计已开通：<b>' + d.total_done + '</b> 单</p>'
      + '<p style="color:var(--muted);margin-top:4px">USDT 自动放行：<b>' + (d.usdt_auto_release ? '已开启' : '关闭（手动模式）') + '</b> · PayPal：<b>' + (d.paypal_configured ? '已配置' : '未配置（不上线）') + '</b> · 飞书：<b>' + (d.feishu_configured ? '已配置' : '未配置') + '</b> · Telegram 通知：<b>' + (d.telegram_configured ? '已绑定' : '未绑定') + '</b></p>';
  } catch (e) { $('statsBox').textContent = '加载失败：' + e.message; }
}
async function loadOrders() {
  try {
    const q = new URLSearchParams({ status: $('fStatus').value, q: $('fQ').value.trim() });
    const d = await api('/api/admin/orders?' + q.toString());
    const tb = document.querySelector('#orderTable tbody');
    tb.innerHTML = (d.orders || []).map((o) => '<tr><td class="mono">' + escH(o.order_no) + '</td><td>' + escH(o.email || ('#' + o.user_id)) + '</td>'
      + '<td>' + escH(o.plan_name) + '<br><span style="color:var(--muted)">' + escH(o.amount_text) + '</span></td>'
      + '<td>' + escH(o.method) + '</td><td>' + statusTag(o.status) + '</td><td style="white-space:nowrap">' + escH(fmtDate(o.created_at)) + '</td>'
      + '<td><button class="btn small ghost" data-view="' + o.id + '">查看</button></td></tr>').join('') || '<tr><td colspan="7">没有符合条件的订单</td></tr>';
    tb.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => loadDetail(Number(b.dataset.view))));
    setStatus($('listStatus'), '共 ' + (d.orders || []).length + ' 条', true);
  } catch (e) { setStatus($('listStatus'), e.message, false); }
}
$('searchBtn').addEventListener('click', loadOrders);
async function loadDetail(id) {
  try {
    const d = await api('/api/admin/orders/' + id);
    const o = d.order;
    CUR_ORDER = o;
    $('detailCard').style.display = '';
    $('detailBox').innerHTML =
      '<div class="kv"><span>订单号</span><b class="mono">' + escH(o.order_no) + '</b></div>'
      + '<div class="kv"><span>用户</span><b>' + escH(o.email || ('#' + o.user_id)) + '</b></div>'
      + '<div class="kv"><span>套餐</span><b>' + escH(o.plan_name) + '</b></div>'
      + '<div class="kv"><span>金额</span><b>' + escH(o.amount_text) + (o.amount_usdt_text ? '（应付 ' + escH(o.amount_usdt_text) + ' USDT，含尾数）' : '') + '</b></div>'
      + '<div class="kv"><span>支付方式</span><b>' + escH(o.method) + '</b></div>'
      + '<div class="kv"><span>状态</span><b>' + statusTag(o.status) + '</b></div>'
      + '<div class="kv"><span>交易单号 / TxID</span><b class="mono">' + escH(o.txid || '未填') + '</b></div>'
      + '<div class="kv"><span>付款备注</span><b>' + escH(o.payer_note || '—') + '</b></div>'
      + '<div class="kv"><span>付款截图</span><b>' + (o.screenshot_key ? '<a href="/img/' + escH(o.screenshot_key) + '" target="_blank">查看截图</a>' : '未上传') + '</b></div>'
      + '<div class="kv"><span>下单时间</span><b>' + escH(fmtDate(o.created_at)) + '</b></div>'
      + '<div class="kv"><span>审核时间</span><b>' + escH(fmtDate(o.reviewed_at)) + '</b></div>'
      + (o.reject_reason ? '<div class="kv"><span>拒绝原因</span><b style="color:var(--red)">' + escH(o.reject_reason) + '</b></div>' : '')
      + (o.expires_at ? '<div class="kv"><span>订单有效期至</span><b>' + escH(fmtDate(o.expires_at)) + (o.expires_at < Date.now() ? '（已过期）' : '') + '</b></div>' : '');
    let acts = '';
    if (o.status === 'review_pending') {
      acts += '<button class="btn" id="approveBtn" type="button">确认通过（开通）</button> '
        + '<input id="rejectReason" type="text" placeholder="拒绝原因（必填，用户会看到）" style="max-width:320px;display:inline-block"> '
        + '<button class="btn danger" id="rejectBtn" type="button">拒绝</button>';
    }
    if (o.method === 'usdt' && o.status !== 'done' && o.status !== 'rejected') {
      acts += '<div style="margin-top:12px"><label for="manualTxid">USDT 人工补开：填 TxID（64 位），服务端查链上核对后开通</label>'
        + '<input id="manualTxid" type="text" placeholder="粘贴 64 位 TxID" class="mono"> '
        + '<button class="btn ghost" id="manualGrantBtn" type="button" style="margin-top:8px">按 TxID 补开</button></div>';
    }
    $('detailActions').innerHTML = acts;
    const ap = document.getElementById('approveBtn');
    if (ap) ap.addEventListener('click', async () => {
      ap.disabled = true; ap.textContent = '开通中…';
      try {
        const r = await api('/api/admin/orders/' + o.id + '/approve', 'POST');
        setStatus($('detailStatus'), '已开通：' + r.order_no + '（用户 ' + (r.user_email || '') + '）', true);
        loadOrders(); loadStats(); loadDetail(o.id);
      } catch (e) { setStatus($('detailStatus'), e.message, false); }
      finally { ap.disabled = false; ap.textContent = '确认通过（开通）'; }
    });
    const rj = document.getElementById('rejectBtn');
    if (rj) rj.addEventListener('click', async () => {
      const reason = document.getElementById('rejectReason').value.trim();
      if (!reason) { setStatus($('detailStatus'), '请先写拒绝原因', false); return; }
      rj.disabled = true;
      try {
        await api('/api/admin/orders/' + o.id + '/reject', 'POST', { reason });
        setStatus($('detailStatus'), '已拒绝', true);
        loadOrders(); loadStats(); loadDetail(o.id);
      } catch (e) { setStatus($('detailStatus'), e.message, false); }
      finally { rj.disabled = false; }
    });
    const mg = document.getElementById('manualGrantBtn');
    if (mg) mg.addEventListener('click', async () => {
      const txid = document.getElementById('manualTxid').value.trim();
      if (!txid) { setStatus($('detailStatus'), '请先填 TxID', false); return; }
      mg.disabled = true; mg.textContent = '链上核对中…';
      try {
        const r = await api('/api/admin/orders/' + o.id + '/manual-grant', 'POST', { txid });
        setStatus($('detailStatus'), '补开成功：' + r.order_no + '（链上确认 ' + (r.confirmations ?? '?') + ' 个）', true);
        loadOrders(); loadStats(); loadDetail(o.id);
      } catch (e) { setStatus($('detailStatus'), e.message, false); }
      finally { mg.disabled = false; mg.textContent = '按 TxID 补开'; }
    });
    $('detailCard').scrollIntoView({ behavior: 'smooth' });
  } catch (e) { setStatus($('detailStatus'), e.message, false); }
}
async function loadPlans() {
  try {
    const d = await api('/api/admin/plans');
    $('plansBox').innerHTML = (d.plans || []).map((p) => '<div class="row" style="margin-top:8px">'
      + '<div><label>' + escH(p.name_zh) + '（元）</label><input type="number" min="0" step="0.01" data-plan="' + p.slug + '" data-field="price_yuan" value="' + (p.price_cents / 100) + '"></div>'
      + '<div><label>USDT（单位：USDT）</label><input type="number" min="0" step="0.01" data-plan="' + p.slug + '" data-field="usdt" value="' + (p.usdt_sun / 1e6).toFixed(2) + '"></div>'
      + '<div><label>改写次数</label><input type="number" min="1" data-plan="' + p.slug + '" data-field="rewrite_credits" value="' + p.rewrite_credits + '"></div>'
      + '<div><label>导出次数（-1=不限）</label><input type="number" min="-1" data-plan="' + p.slug + '" data-field="export_credits" value="' + p.export_credits + '"></div>'
      + '</div>').join('')
      + '<div class="row" style="margin-top:12px"><button class="btn" id="savePlansBtn" type="button">保存套餐</button></div>';
    $('savePlansBtn').addEventListener('click', async () => {
      const btn = $('savePlansBtn'); btn.disabled = true; btn.textContent = '保存中…';
      try {
        const updates = {};
        document.querySelectorAll('#plansBox input').forEach((inp) => {
          updates[inp.dataset.plan] = updates[inp.dataset.plan] || {};
          updates[inp.dataset.plan][inp.dataset.field] = inp.value;
        });
        await api('/api/admin/plans', 'POST', { plans: updates });
        setStatus($('plansStatus'), '套餐已保存', true);
      } catch (e) { setStatus($('plansStatus'), e.message, false); }
      finally { btn.disabled = false; btn.textContent = '保存套餐'; }
    });
  } catch (e) { setStatus($('plansStatus'), e.message, false); }
}
$('tgListBtn').addEventListener('click', async () => {
  const btn = $('tgListBtn'); btn.disabled = true; btn.textContent = '拉取中…';
  try {
    const d = await api('/api/admin/telegram/chats');
    if (!d.chats.length) { $('tgBox').innerHTML = '<p>最近没有收到机器人的对话。请先在 Telegram 里给 zwy886_bot 发一条 /start，再点一次拉取。</p>'; return; }
    $('tgBox').innerHTML = d.chats.map((c) => '<div class="kv"><span>' + escH(c.title) + '（' + escH(c.type || '') + '）</span><button class="btn small ghost" data-chat="' + escH(c.chat_id) + '">设为接收方</button></div>').join('');
    document.querySelectorAll('[data-chat]').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        await api('/api/admin/telegram/owner', 'POST', { chat_id: b.dataset.chat });
        setStatus($('tgStatus'), 'Telegram 通知接收方已设置', true);
        loadStats();
      } catch (e) { setStatus($('tgStatus'), e.message, false); }
      finally { b.disabled = false; }
    }));
  } catch (e) { setStatus($('tgStatus'), e.message, false); }
  finally { btn.disabled = false; btn.textContent = '拉取最近对话'; }
});
async function loadPayCfg() {
  try {
    const d = await api('/api/admin/pay-config');
    $('payCfgBox').innerHTML = '<p>微信 / 支付宝商户码：<b>已配置（R2 二维码）</b></p>'
      + '<p>USDT：<b>' + (d.usdt_configured ? '已配置（自动放行 ' + (d.usdt_auto_release ? '已开启' : '关闭·手动模式') + '）' : '未配置') + '</b></p>'
      + '<p>PayPal：<b>' + (d.paypal_configured ? '已配置（' + escH(d.paypal_mode) + '）' : '未配置——订单页不显示 PayPal，Webhook 只记录不处理') + '</b></p>'
      + '<p>Turnstile 人机验证：<b>' + (d.turnstile_configured ? '已配置' : '未配置（下单暂不校验）') + '</b></p>'
      + '<p>Resend 邮件：<b>' + (d.resend_configured ? '已配置' : '未配置（验证码开发模式返回）') + '</b></p>';
  } catch (e) { $('payCfgBox').textContent = '加载失败：' + e.message; }
}
checkMe();
</script>
</body>
</html>`;
}

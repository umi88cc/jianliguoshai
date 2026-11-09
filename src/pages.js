// 简历过筛 ResumePass — 首页模板（中英文共用一套结构，两套词典）
// 设计规范 §1：主色钢蓝 #1668B4、近白底 #F7F8F9、圆角 10px、内容最大宽 1060px；
// 移动优先：按钮 ≥44px、输入框 ≥16px（不触发手机自动放大）；输入框与上方标题左对齐同宽。
import { I18N } from './i18n.js';

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
:root{--blue:#1668B4;--blue-d:#0f4f8a;--bg:#F7F8F9;--card:#fff;--text:#1a1d21;--muted:#5b6470;--line:#e3e7ec;--green:#1e7d32;--amber:#b26a00;--red:#c62828}
html{font-size:16px}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;background:var(--bg);color:var(--text);line-height:1.7}
a{color:var(--blue);text-decoration:none}
.wrap{max-width:1060px;margin:0 auto;padding:0 16px}
header.site{position:sticky;top:0;background:#fff;border-bottom:1px solid var(--line);z-index:10}
.nav{display:flex;align-items:center;gap:4px;height:56px;max-width:1060px;margin:0 auto;padding:0 16px}
.brand{font-size:19px;font-weight:700;color:var(--blue);margin-right:12px;white-space:nowrap}
.brand small{font-size:12px;color:var(--muted);font-weight:400;margin-left:4px}
.nav a.item{padding:8px 10px;border-radius:8px;color:var(--text);font-size:15px;white-space:nowrap}
.nav a.item:hover{background:var(--bg)}
.nav a.item.active{color:var(--blue);font-weight:600}
.nav .lang{margin-left:auto;font-size:14px;padding:8px 10px;border-radius:8px;border:1px solid var(--line);color:var(--text)}
.hero{padding:48px 0 8px;text-align:center}
.hero h1{font-size:32px;line-height:1.35;letter-spacing:-.01em}
.hero p.sub{margin:14px auto 0;max-width:640px;color:var(--muted);font-size:17px}
.hero .cta-row{margin-top:22px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap;align-items:center}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:12px 26px;border-radius:10px;border:0;font-size:16px;font-weight:600;cursor:pointer;background:var(--blue);color:#fff}
.btn:hover{background:var(--blue-d)}
.btn:disabled{background:#9db8d2;cursor:not-allowed}
.btn.ghost{background:#fff;color:var(--blue);border:1px solid var(--blue)}
.price{color:var(--muted);font-size:14px;margin-top:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:20px;margin-top:24px}
.card h2{font-size:18px;margin-bottom:6px}
.card .hint{font-size:14px;color:var(--muted);margin-bottom:12px}
label{display:block;font-size:15px;font-weight:600;margin:16px 0 8px}
textarea{width:100%;min-height:120px;padding:12px;border:1px solid var(--line);border-radius:10px;font-size:16px;line-height:1.6;font-family:inherit;resize:vertical;background:#fff}
textarea:focus{outline:2px solid var(--blue);outline-offset:1px;border-color:var(--blue)}
.tool-actions{display:flex;gap:12px;margin-top:16px;flex-wrap:wrap;align-items:center}
.tool-actions .file{font-size:14px;color:var(--muted)}
.tool-actions input[type=file]{font-size:14px;max-width:220px}
.status{margin-top:12px;font-size:14px;color:var(--muted);min-height:22px}
.result{display:none;margin-top:8px}
.result.show{display:block}
.score-head{display:flex;gap:20px;align-items:center;flex-wrap:wrap}
.score-num{width:110px;height:110px;border-radius:50%;border:6px solid var(--blue);display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0}
.score-num b{font-size:34px;line-height:1}
.score-num span{font-size:13px;color:var(--muted)}
.band{font-size:18px;font-weight:700}
.band.excellent{color:var(--green)}.band.good{color:var(--blue)}.band.weak{color:var(--red)}
.dim{margin-top:12px}
.dim-row{display:flex;align-items:center;gap:10px;margin-top:10px;font-size:14px}
.dim-row .name{width:96px;flex-shrink:0}
.dim-row .bar{flex:1;height:10px;background:#eef1f4;border-radius:5px;overflow:hidden}
.dim-row .bar i{display:block;height:100%;background:var(--blue)}
.dim-row .val{width:44px;text-align:right;font-weight:600}
.gap-tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.tag{padding:4px 10px;border-radius:999px;font-size:13px;border:1px solid}
.tag.hit{color:var(--green);border-color:var(--green);background:#eaf5ec}
.tag.part{color:var(--amber);border-color:var(--amber);background:#fdf6e7}
.tag.miss{color:var(--red);border-color:var(--red);background:#fdeeee}
.tag .t{opacity:.65;font-size:11px;margin-left:4px}
.note{font-size:13px;color:var(--muted);margin-top:10px}
.lines{margin-top:8px}
.line{border-top:1px solid var(--line);padding:10px 0;font-size:14px}
.line .txt{font-weight:600}
.line .chk{color:var(--muted);margin-top:2px}
.line .chk b{color:var(--red);font-weight:600}
.line .chk i{color:var(--green);font-style:normal}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:16px}
.step{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:20px}
.step .n{width:32px;height:32px;border-radius:50%;background:var(--blue);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;margin-bottom:10px}
.step h3{font-size:16px;margin-bottom:6px}
.step p{font-size:14px;color:var(--muted)}
.faq-item{border-top:1px solid var(--line);padding:14px 0}
.faq-item h3{font-size:16px;cursor:pointer}
.faq-item p{font-size:15px;color:var(--muted);margin-top:6px}
.qr-row{display:flex;gap:24px;justify-content:center;flex-wrap:wrap;margin-top:16px}
.qr-item{text-align:center}
.qr-item img{width:140px;height:140px;border:1px solid var(--line);border-radius:10px;background:#fff}
.qr-item p{font-size:14px;margin-top:8px}
footer.site{margin:48px 0 32px;text-align:center;color:var(--muted);font-size:13px}
@media (max-width:640px){
  .hero{padding:32px 0 4px}
  .hero h1{font-size:24px}
  .hero p.sub{font-size:15px}
  .nav a.item{padding:8px 6px;font-size:14px}
  .brand small{display:none}
  .steps{grid-template-columns:1fr}
  .card{padding:16px}
  .dim-row .name{width:84px}
}
`;

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function homePage(lang, base) {
  const t = I18N[lang];
  const other = lang === 'zh' ? 'en' : 'zh';
  const otherLabel = lang === 'zh' ? 'EN' : '中文';
  const canonical = lang === 'zh' ? `${base}/` : `${base}/en/`;
  const faqJson = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: t.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
  const siteJson = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: lang === 'zh' ? '简历过筛' : 'ResumePass',
    url: canonical,
    inLanguage: t.lang,
  };
  const crumbJson = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [{ '@type': 'ListItem', position: 1, name: t.navHome, item: canonical }],
  };
  const faqHtml = t.faq.map((f) => `<div class="faq-item"><h3>${esc(f.q)}</h3><p>${esc(f.a)}</p></div>`).join('');
  // 联系方式按语言分发：中文版只显示微信 + QQ 二维码；英文版只显示 Telegram（站长尚未提供，暂不展示）
  const contactHtml = lang === 'zh' ? `
<section class="card" style="margin-top:48px;text-align:center">
<h2>${esc(t.contactTitle)}</h2>
<p class="hint">${esc(t.contactSub)}</p>
<div class="qr-row">
<div class="qr-item"><img src="/img/wechat-consult-qr.png" alt="${esc(t.contactWechat)}" loading="lazy" width="140" height="140"><p>${esc(t.contactWechat)}</p></div>
<div class="qr-item"><img src="/img/qq-consult-qr.png" alt="${esc(t.contactQQ)}" loading="lazy" width="140" height="140"><p>${esc(t.contactQQ)}</p></div>
</div>
</section>` : '';

  return `<!DOCTYPE html>
<html lang="${t.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t.title)}</title>
<meta name="description" content="${esc(t.description)}">
<link rel="canonical" href="${canonical}">
<link rel="alternate" hreflang="zh-CN" href="${base}/">
<link rel="alternate" hreflang="en" href="${base}/en/">
<link rel="alternate" hreflang="x-default" href="${base}/">
<meta property="og:title" content="${esc(t.title)}">
<meta property="og:description" content="${esc(t.description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${canonical}">
<script type="application/ld+json">${JSON.stringify(faqJson)}</script>
<script type="application/ld+json">${JSON.stringify(siteJson)}</script>
<script type="application/ld+json">${JSON.stringify(crumbJson)}</script>
<style>${CSS}</style>
</head>
<body>
<header class="site"><nav class="nav" aria-label="main">
<a class="brand" href="${lang === 'zh' ? '/' : '/en/'}">${lang === 'zh' ? '简历过筛' : 'ResumePass'}<small>${lang === 'zh' ? 'ATS 评分' : 'ATS Score'}</small></a>
<a class="item active" href="${lang === 'zh' ? '/' : '/en/'}">${esc(t.navHome)}</a>
<a class="item" href="#tool">${esc(t.navOptimize)}</a>
<a class="item" href="#faq">${esc(t.navFaq)}</a>
<a class="lang" href="${other === 'zh' ? '/' : '/en/'}">${otherLabel}</a>
</nav></header>
<main class="wrap">
<section class="hero">
<h1>${esc(t.heroTitle)}</h1>
<p class="sub">${esc(t.heroSub)}</p>
<div class="cta-row"><a class="btn" href="#tool">${esc(t.heroCta)}</a><span style="color:var(--muted);font-size:15px">${esc(t.priceAnchor)}</span></div>
<p class="price">${esc(t.priceNote)}</p>
</section>

<section class="card" id="tool">
<h2>${esc(t.navOptimize)}</h2>
<p class="hint">${esc(t.heroSub)}</p>
<label for="resume">${esc(t.resumeLabel)}</label>
<textarea id="resume" placeholder="${esc(t.resumePh)}"></textarea>
<label for="jd">${esc(t.jdLabel)}</label>
<textarea id="jd" placeholder="${esc(t.jdPh)}" style="min-height:90px"></textarea>
<div class="tool-actions">
<button class="btn" id="scoreBtn" type="button">${esc(t.scoreBtn)}</button>
<button class="btn ghost" id="clearBtn" type="button">${esc(t.clearBtn)}</button>
<label class="file">${esc(t.uploadTxt)} <input type="file" id="fileInput" accept=".txt,text/plain"></label>
</div>
<p class="status" id="status" aria-live="polite"></p>
<div class="result" id="result"></div>
</section>

<section class="card" id="rewrite">
<h2>${esc(t.rewriteTitle)}</h2>
<p class="hint">${esc(t.rewriteHint)}</p>
<div id="loginBox">
<h3 style="font-size:16px">${esc(t.loginTitle)}</h3>
<p class="hint">${esc(t.loginHint)}</p>
<div class="tool-actions" style="margin-top:8px">
<input id="loginEmail" type="email" placeholder="${esc(t.emailPh)}" style="flex:1;min-width:200px;padding:12px;border:1px solid var(--line);border-radius:10px;font-size:16px" autocomplete="email">
<button class="btn ghost" id="sendCodeBtn" type="button">${esc(t.sendCodeBtn)}</button>
</div>
<div class="tool-actions">
<input id="loginCode" type="text" inputmode="numeric" maxlength="6" placeholder="${esc(t.codePh)}" style="flex:1;min-width:140px;padding:12px;border:1px solid var(--line);border-radius:10px;font-size:16px">
<button class="btn" id="loginBtn" type="button">${esc(t.loginBtn)}</button>
<button class="btn ghost" id="logoutBtn" type="button" style="display:none">${esc(t.logoutBtn)}</button>
</div>
<p class="status" id="loginStatus"></p>
</div>
<label for="intensity">${esc(t.intensityLabel)}</label>
<select id="intensity" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:10px;font-size:16px;background:#fff">
<option value="conservative">${esc(t.intensityConservative)}</option>
<option value="standard" selected>${esc(t.intensityStandard)}</option>
<option value="aggressive">${esc(t.intensityAggressive)}</option>
</select>
<div class="tool-actions">
<button class="btn" id="rewriteBtn" type="button">${esc(t.rewriteBtn)}</button>
<button class="btn ghost" id="coverBtn" type="button">${esc(t.coverLetterBtn)}</button>
<button class="btn ghost" id="translateBtn" type="button">${esc(t.translateBtn)}</button>
</div>
<p class="status" id="rewriteStatus" aria-live="polite"></p>
<div class="result" id="rewriteResult"></div>
</section>

<section style="margin-top:48px">
<h2 style="font-size:20px">${esc(t.howTitle)}</h2>
<div class="steps">
<div class="step"><div class="n">1</div><h3>${esc(t.how1T)}</h3><p>${esc(t.how1D)}</p></div>
<div class="step"><div class="n">2</div><h3>${esc(t.how2T)}</h3><p>${esc(t.how2D)}</p></div>
<div class="step"><div class="n">3</div><h3>${esc(t.how3T)}</h3><p>${esc(t.how3D)}</p></div>
</div>
</section>

<section class="card" id="faq" style="margin-top:48px">
<h2>${esc(t.faqTitle)}</h2>
${faqHtml}
</section>
${contactHtml}
</main>
<footer class="site"><p>${esc(t.footer)}</p></footer>
<script>
const T = ${JSON.stringify(t)};
const LANG = ${JSON.stringify(lang)};
const $ = (id) => document.getElementById(id);
const escH = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
$('fileInput').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > 200 * 1024) { $('status').textContent = '文件过大（限 200KB 的 .txt）'; return; }
  const rd = new FileReader();
  rd.onload = () => { $('resume').value = rd.result; $('status').textContent = '已读入：' + f.name; };
  rd.onerror = () => { $('status').textContent = '读取文件失败，请直接粘贴文本'; };
  rd.readAsText(f);
});
$('clearBtn').addEventListener('click', () => {
  $('resume').value = ''; $('jd').value = ''; $('result').className = 'result'; $('result').innerHTML = ''; $('status').textContent = '';
});
$('scoreBtn').addEventListener('click', async () => {
  const resume = $('resume').value.trim();
  const jd = $('jd').value.trim();
  const btn = $('scoreBtn');
  if (!resume) { $('status').textContent = T.errEmpty; return; }
  if (resume.length > 20000) { $('status').textContent = T.errTooLong; return; }
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = T.scoring;
  $('status').textContent = '正在解析简历…';
  try {
    const r = await fetch('/api/score', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resumeText: resume, jdText: jd, lang: LANG }) });
    const data = await r.json();
    if (!r.ok) {
      $('status').textContent = r.status === 429 ? T.errLimit : (data.error || T.errServer);
      return;
    }
    $('status').textContent = '';
    renderResult(data);
  } catch (e) {
    $('status').textContent = T.errServer;
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
});
function bar(name, val) {
  if (val === null || val === undefined) return '';
  return '<div class="dim-row"><span class="name">' + escH(name) + '</span><span class="bar"><i style="width:' + val + '%"></i></span><span class="val">' + val + '</span></div>';
}
function renderResult(d) {
  const bandCls = d.band === 'excellent' ? 'excellent' : d.band === 'good' ? 'good' : 'weak';
  const bandTxt = d.band === 'excellent' ? T.bandExcellent : d.band === 'good' ? T.bandGood : T.bandWeak;
  let dims = '';
  dims += bar(T.dims.d1, d.dims.d1);
  if (d.hasJD) dims += bar(T.dims.d2, d.dims.d2);
  dims += bar(T.dims.d3, d.dims.d3) + bar(T.dims.d4, d.dims.d4) + bar(T.dims.d5, d.dims.d5) + bar(T.dims.d6, d.dims.d6);
  let gaps = '';
  if (d.hasJD) {
    const tag = (g, cls) => '<span class="tag ' + cls + '">' + escH(g.term) + '<span class="t">' + (g.tier === 1 ? T.tier1 : g.tier === 2 ? T.tier2 : T.tier3) + '</span></span>';
    gaps = '<h3 style="margin-top:20px;font-size:16px">' + escH(T.gapTitle) + '</h3>'
      + '<div class="gap-tags">' + d.gaps.matched.map((g) => tag(g, 'hit')).join('') + d.gaps.partial.map((g) => tag(g, 'part')).join('') + d.gaps.missing.map((g) => tag(g, 'miss')).join('') + '</div>'
      + '<p class="note">' + escH(T.gapMatched) + ' ' + d.gaps.matched.length + ' · ' + escH(T.gapPartial) + ' ' + d.gaps.partial.length + ' · ' + escH(T.gapMissing) + ' ' + d.gaps.missing.length + '</p>';
  } else {
    gaps = '<p class="note">' + escH(T.noJDNote) + '</p>';
  }
  let lines = '';
  if (d.lineReview && d.lineReview.length) {
    lines = '<h3 style="margin-top:20px;font-size:16px">' + escH(T.lineTitle) + '</h3><div class="lines">' + d.lineReview.map((l) =>
      '<div class="line"><div class="txt">' + escH(l.text) + '</div>' + l.checks.map((c) => '<div class="chk">' + (c.ok ? '<i>✓</i> ' : '<b>✕</b> ') + escH(c.msg) + '</div>').join('') + '</div>'
    ).join('') + '</div>';
  }
  const notes = [];
  (d.notes.d1 || []).forEach((n) => notes.push(n));
  (d.notes.d3 || []).forEach((n) => notes.push(n));
  (d.notes.q || []).forEach((n) => notes.push(n));
  $('result').innerHTML =
    '<div class="score-head"><div class="score-num"><b>' + d.total + '</b><span>' + escH(T.score) + '</span></div>'
    + '<div><div class="band ' + bandCls + '">' + escH(bandTxt) + '</div><div style="color:var(--muted);font-size:14px;margin-top:4px">' + escH(T.passLine) + '</div></div></div>'
    + '<div class="dim">' + dims + '</div>'
    + (notes.length ? '<p class="note">' + notes.map(escH).join('<br>') + '</p>' : '')
    + gaps + lines
    + '<p class="note">' + escH(T.pasteNote) + '</p>';
  $('result').className = 'result show';
  $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---- 登录 + AI 改写 ----
let ME = null;
let LAST_REWRITE = null;
async function refreshMe() {
  try {
    const r = await fetch('/api/auth/me');
    const d = await r.json();
    ME = d.user || null;
    if (ME) {
      $('loginStatus').textContent = T.loggedInAs + ME.email + ' · rewrite 额度 ' + (d.credits ? d.credits.balance : 0);
      $('logoutBtn').style.display = '';
      $('loginEmail').style.display = 'none';
      $('loginCode').style.display = 'none';
      $('sendCodeBtn').style.display = 'none';
      $('loginBtn').style.display = 'none';
    } else {
      $('loginStatus').textContent = '';
      $('logoutBtn').style.display = 'none';
      $('loginEmail').style.display = '';
      $('loginCode').style.display = '';
      $('sendCodeBtn').style.display = '';
      $('loginBtn').style.display = '';
    }
  } catch (e) { /* 未登录时忽略 */ }
}
$('sendCodeBtn').addEventListener('click', async () => {
  const email = $('loginEmail').value.trim();
  if (!email) { $('loginStatus').textContent = T.emailPh; return; }
  const btn = $('sendCodeBtn'); btn.disabled = true;
  try {
    const r = await fetch('/api/auth/send-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    const d = await r.json();
    $('loginStatus').textContent = !r.ok ? (d.error || T.errServer) : (d.devMode ? ('开发模式验证码：' + d.code) : '验证码已发到邮箱，请查收');
  } catch (e) { $('loginStatus').textContent = T.errServer; }
  finally { btn.disabled = false; }
});
$('loginBtn').addEventListener('click', async () => {
  const email = $('loginEmail').value.trim();
  const code = $('loginCode').value.trim();
  if (!email || !code) { $('loginStatus').textContent = T.emailPh; return; }
  const btn = $('loginBtn'); btn.disabled = true; btn.textContent = T.loginBtn + '…';
  try {
    const r = await fetch('/api/auth/verify-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, code }) });
    const d = await r.json();
    if (!r.ok) { $('loginStatus').textContent = d.error || T.errServer; return; }
    await refreshMe();
  } catch (e) { $('loginStatus').textContent = T.errServer; }
  finally { btn.disabled = false; btn.textContent = T.loginBtn; }
});
$('logoutBtn').addEventListener('click', async () => {
  try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (e) {}
  ME = null;
  await refreshMe();
});
async function pollTask(taskId, tries) {
  for (let i = 0; i < (tries || 40); i++) {
    await new Promise((r) => setTimeout(r, 1500));
    try {
      const r = await fetch('/api/tasks/' + taskId);
      const d = await r.json();
      if (d.status === 'done') return d.result;
      if (d.status === 'failed') throw new Error(d.error || T.taskFailed);
      $('rewriteStatus').textContent = T.rewriting + ' (' + (i + 1) + ')';
    } catch (e) { if (e.message && e.message !== T.taskFailed) throw e; else throw e; }
  }
  throw new Error(T.taskFailed);
}
function renderRewrite(d) {
  LAST_REWRITE = d;
  let h = '';
  if (!d.preview) {
    const delta = (d.afterScore ?? 0) - (d.beforeScore ?? 0);
    const deltaTxt = delta >= 0 ? '+' + delta : String(delta);
    h = '<div class="score-head"><div class="score-num"><b>' + d.afterScore + '</b><span>' + escH(T.score) + '</span></div>'
      + '<div><div style="font-size:16px">' + escH(T.rewriteBefore) + ' ' + d.beforeScore + ' → ' + escH(T.rewriteAfter) + ' ' + d.afterScore
      + '（' + escH(T.rewriteDelta) + ' ' + deltaTxt + '）</div>'
      + '<div style="color:var(--muted);font-size:14px;margin-top:4px">' + escH(d.source === 'ai' ? T.rewriteSourceAi : T.rewriteSourceRules) + '</div></div></div>';
  } else {
    h = '<div style="font-size:16px;font-weight:700">' + escH(T.rewritePreview) + '</div>'
      + '<div style="color:var(--muted);font-size:14px;margin-top:4px">' + escH(d.source === 'ai' ? T.rewriteSourceAi : T.rewriteSourceRules) + '</div>';
  }
  if (d.summary) h += '<h3 style="margin-top:16px;font-size:16px">个人总结</h3><p style="font-size:15px">' + escH(d.summary) + '</p>';
  h += '<h3 style="margin-top:16px;font-size:16px">逐条改动（勾选采纳）</h3><div class="lines">'
    + d.bullets.map((b, i) => '<div class="line"><label style="display:flex;gap:8px;align-items:flex-start;font-weight:400;margin:0">'
      + '<input type="checkbox" class="rw-accept" data-i="' + i + '" ' + (b.flagged ? '' : 'checked') + ' style="margin-top:4px;width:18px;height:18px;flex:none">'
      + '<span><div class="txt" style="color:var(--muted);text-decoration:line-through">' + escH(b.original) + '</div>'
      + '<div style="margin-top:4px">' + escH(b.rewritten) + '</div>'
      + '<div class="chk" style="color:var(--muted)">' + escH(b.change_reason || '') + (b.flagged ? ' · <b style="color:var(--red)">' + escH(T.rewriteFlagged) + '</b>' : '') + '</div></span></label></div>').join('')
    + '</div>';
  if (d.missing_keywords && d.missing_keywords.length) {
    h += '<p class="note">缺口关键词（只在真实做过的地方补）：' + d.missing_keywords.map(escH).join('、') + '</p>';
  }
  if (d.score_tips && d.score_tips.length) {
    h += '<p class="note">' + d.score_tips.map(escH).join('<br>') + '</p>';
  }
  if (!d.preview) {
    h += '<div class="tool-actions"><button class="btn" id="applyBtn" type="button">' + escH(T.rewriteApply) + '</button></div><p class="status" id="applyStatus"></p>';
  } else {
    h += '<p class="note">' + escH(T.rewriteBuyNote) + '</p>';
  }
  $('rewriteResult').innerHTML = h;
  $('rewriteResult').className = 'result show';
  const applyBtn = document.getElementById('applyBtn');
  if (applyBtn) applyBtn.addEventListener('click', async () => {
    const accepted = [...document.querySelectorAll('.rw-accept:checked')].map((c) => Number(c.dataset.i));
    applyBtn.disabled = true;
    try {
      const r = await fetch('/api/rewrites/' + d.rewriteId + '/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accepted }) });
      const dd = await r.json();
      $('applyStatus').textContent = r.ok ? T.rewriteApplied : (dd.error || T.errServer);
    } catch (e) { $('applyStatus').textContent = T.errServer; }
    finally { applyBtn.disabled = false; }
  });
  $('rewriteResult').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$('rewriteBtn').addEventListener('click', async () => {
  const resume = $('resume').value.trim();
  const jd = $('jd').value.trim();
  if (!resume) { $('rewriteStatus').textContent = T.errEmpty; return; }
  if (!ME) { $('rewriteStatus').textContent = T.rewriteNeedLogin; return; }
  const btn = $('rewriteBtn'); btn.disabled = true; btn.textContent = T.rewriting;
  $('rewriteStatus').textContent = T.rewriting;
  try {
    const r = await fetch('/api/rewrite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resumeText: resume, jdText: jd, lang: LANG, intensity: $('intensity').value }) });
    const d = await r.json();
    if (!r.ok) { $('rewriteStatus').textContent = d.error || T.errServer; return; }
    if (d.preview) {
      $('rewriteStatus').textContent = T.rewritePreview;
      renderRewrite({ ...d, beforeScore: null, afterScore: null, preview: true, bullets: d.bullets, taskId: null });
      return;
    }
    $('rewriteStatus').textContent = T.rewriting;
    const result = await pollTask(d.taskId);
    $('rewriteStatus').textContent = '';
    renderRewrite(result);
  } catch (e) { $('rewriteStatus').textContent = e.message || T.errServer; }
  finally { btn.disabled = false; btn.textContent = T.rewriteBtn; }
});
$('coverBtn').addEventListener('click', async () => {
  const resume = $('resume').value.trim();
  const jd = $('jd').value.trim();
  if (!resume) { $('rewriteStatus').textContent = T.errEmpty; return; }
  if (!ME) { $('rewriteStatus').textContent = T.rewriteNeedLogin; return; }
  const btn = $('coverBtn'); btn.disabled = true; btn.textContent = T.rewriting;
  try {
    const company = prompt(T.coverLetterCompany || 'Company');
    if (company === null) return;
    const r = await fetch('/api/cover-letter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resumeText: resume, jdText: jd, company: company || '', lang: LANG }) });
    const d = await r.json();
    if (!r.ok) { $('rewriteStatus').textContent = d.error || T.errServer; return; }
    const result = await pollTask(d.taskId);
    $('rewriteStatus').textContent = '';
    $('rewriteResult').innerHTML = '<h3 style="font-size:16px">' + escH(T.coverLetterTitle) + '</h3><p style="font-size:15px;white-space:pre-wrap">' + escH(result.letter || '') + '</p>';
    $('rewriteResult').className = 'result show';
  } catch (e) { $('rewriteStatus').textContent = e.message || T.errServer; }
  finally { btn.disabled = false; btn.textContent = T.coverLetterBtn; }
});
$('translateBtn').addEventListener('click', async () => {
  const resume = $('resume').value.trim();
  if (!resume) { $('rewriteStatus').textContent = T.errEmpty; return; }
  if (!ME) { $('rewriteStatus').textContent = T.rewriteNeedLogin; return; }
  const btn = $('translateBtn'); btn.disabled = true; btn.textContent = T.rewriting;
  try {
    const r = await fetch('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: resume, lang: LANG }) });
    const d = await r.json();
    if (!r.ok) { $('rewriteStatus').textContent = d.error || T.errServer; return; }
    const result = await pollTask(d.taskId);
    $('rewriteStatus').textContent = '';
    $('rewriteResult').innerHTML = '<h3 style="font-size:16px">' + escH(T.translateBtn) + '</h3><p style="font-size:15px;white-space:pre-wrap">' + escH(result.translated || '') + '</p>';
    $('rewriteResult').className = 'result show';
  } catch (e) { $('rewriteStatus').textContent = e.message || T.errServer; }
  finally { btn.disabled = false; btn.textContent = T.translateBtn; }
});
refreshMe();
</script>
</body>
</html>`;
}

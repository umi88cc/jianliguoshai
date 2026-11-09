// 简历过筛 ResumePass — PDF/Word 导出（第 4 周，规划 §9 / §3.5 一键排版）
// 免费层约束：Worker 里跑不了无头浏览器，所以 PDF 走浏览器端 window.print()
// （打印友好页 + A4 @page 样式，用户在打印对话框里选“另存为 PDF”）；
// Word 走服务端生成的 .doc（Word 可直接打开的 HTML 格式），不引任何外部库、
// 不走海外 CDN。导出扣 1 次 export 额度（服务端 POST /api/export 扣减，
// 返回 30 分钟有效的 token，GET /export/:token 渲染；-1 = 不限不扣减）。
// 一键排版：解析简历纯文本 → 按所选模板的章节顺序重排 → 再渲染导出。

// ---------- 章节：标题文本 → 规范 key ----------
// key：summary 个人总结 / target 求职意向 / edu 教育 / work 工作经历 /
//      project 项目经历 / skills 技能 / cert 证书 / other 其他
const HEADER_TO_KEY = {
  // 中文
  个人总结: "summary",
  自我评价: "summary",
  个人评价: "summary",
  求职意向: "target",
  期望岗位: "target",
  教育背景: "edu",
  教育经历: "edu",
  工作经历: "work",
  工作经验: "work",
  实习经历: "work",
  实践经历: "work",
  项目经历: "project",
  项目经验: "project",
  科研经历: "project",
  培训经历: "other",
  校园经历: "other",
  专业技能: "skills",
  技能: "skills",
  技能特长: "skills",
  语言能力: "skills",
  语言: "skills",
  证书: "cert",
  证书与奖项: "cert",
  获奖: "cert",
  获奖经历: "cert",
  // 英文（大小写不敏感，匹配时先转小写）
  summary: "summary",
  objective: "target",
  "target role": "target",
  education: "edu",
  "work experience": "work",
  "professional experience": "work",
  experience: "work",
  internship: "work",
  projects: "project",
  project: "project",
  skills: "skills",
  "technical skills": "skills",
  languages: "skills",
  certifications: "cert",
  certification: "cert",
  awards: "cert",
};

const SECTION_TITLES = {
  zh: {
    summary: "个人总结",
    target: "求职意向",
    edu: "教育背景",
    work: "工作经历",
    project: "项目经历",
    skills: "技能",
    cert: "证书",
    other: "其他",
  },
  en: {
    summary: "Summary",
    target: "Target Role",
    edu: "Education",
    work: "Work Experience",
    project: "Projects",
    skills: "Skills",
    cert: "Certifications",
    other: "Other",
  },
};

// 各模板的章节顺序（与 templates.js 里 sample.sections 的顺序一致；
// 未列出的章节按原文顺序追加在最后）
const TEMPLATE_SECTION_ORDER = {
  "zh-classic": ["target", "edu", "work", "project", "skills", "cert"],
  "zh-modern": ["summary", "work", "project", "edu", "skills"],
  "zh-minimal": ["edu", "work", "skills"],
  "en-classic": ["target", "edu", "work", "project", "skills", "cert"],
  "en-modern": ["summary", "work", "project", "edu", "skills"],
  "en-minimal": ["edu", "work", "skills"],
};

const BULLET_RE = /^([•\-*·○●■▶►]|\d{1,2}[.、）)]|（\d+）)\s*/;
const PHONE_RE = /1[3-9]\d{9}|\(\d{3}\)\s*\d{3}[- ]\d{4}|\d{3}[- ]\d{3}[- ]\d{4}/;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

function headerKey(line) {
  const t = line.trim();
  if (HEADER_TO_KEY[t]) return HEADER_TO_KEY[t];
  const lower = t.toLowerCase();
  if (HEADER_TO_KEY[lower]) return HEADER_TO_KEY[lower];
  // “标题：” / “标题:” / “标题 ” 后缀形式
  for (const h of Object.keys(HEADER_TO_KEY)) {
    if (
      t === h + "：" ||
      t === h + ":" ||
      t.startsWith(h + " ") ||
      t.startsWith(h + "：")
    )
      return HEADER_TO_KEY[h];
    const hl = h.toLowerCase();
    if (lower === hl + ":" || lower.startsWith(hl + " "))
      return HEADER_TO_KEY[h];
  }
  return null;
}

function isBullet(line) {
  return BULLET_RE.test(line);
}

// ---------- 简历纯文本 → 结构化 ----------
// 返回 { name, contact, target, sections: [{ key, lines: [{ bullet, text }] }] }
// name：首行（≤20 字，不含邮箱/电话、不是章节标题）；contact：含邮箱或电话的行；
// target：求职意向章节的首行（去标签）；其余按章节标题切分。
export function parseResumeText(text, lang = "zh") {
  const raw = String(text || "").replace(/\r\n/g, "\n").trim();
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const out = { name: "", contact: "", target: "", sections: [] };
  if (!lines.length) return out;
  let current = null;
  const pushLine = (key, line) => {
    if (!current || current.key !== key) {
      current = { key, lines: [] };
      out.sections.push(current);
    }
    current.lines.push({
      bullet: isBullet(line),
      text: line.replace(BULLET_RE, ""),
    });
  };
  const headLines = [];
  let seenHeader = false;
  for (const line of lines) {
    const key = headerKey(line);
    if (key) {
      seenHeader = true;
      if (key === "target") {
        // 求职意向：标题后同一行可能直接带内容（“求职意向：产品经理”）
        const after = line
          .replace(/^求职意向[：:\s]*/, "")
          .replace(/^Target Role[：:\s]*/i, "")
          .replace(/^Objective[：:\s]*/i, "")
          .trim();
        if (after) out.target = after;
        current = { key: "__target__", lines: [] };
        continue;
      }
      current = { key, lines: [] };
      out.sections.push(current);
      continue;
    }
    if (current && current.key === "__target__") {
      if (!out.target) out.target = line;
      continue;
    }
    if (!seenHeader) {
      headLines.push(line);
      // 求职意向写在头部行里（如“王芳 ｜ 电话 ｜ 求职意向：运营”）
      const tm = line.match(
        /(?:求职意向|Target Role|Objective)[：:\s]*(.+)$/i,
      );
      if (tm) {
        out.target = tm[1].trim();
        continue;
      }
      if (/^(求职意向|Target Role|Objective)\s*$/i.test(line)) continue;
      const hasContact = PHONE_RE.test(line) || EMAIL_RE.test(line);
      if (!out.name && line.length <= 20 && !hasContact) {
        out.name = line.replace(/^(姓名[：:]\s*)?/, "");
        continue;
      }
      if (hasContact || line.includes("｜") || line.includes("|")) {
        out.contact = out.contact ? out.contact + " ｜ " + line : line;
        continue;
      }
      if (!out.name && line.length <= 20) {
        out.name = line;
        continue;
      }
      // 头部多余的正文行：不丢，进 other 章节
      pushLine("other", line);
      continue;
    }
    pushLine(current ? current.key : "other", line);
  }
  // 头部：姓名 + 联系方式（上面循环已就地处理，这里只补 target 的兜底）
  if (!out.target) {
    const tLine = headLines.find((l) => /求职意向|Target Role|Objective/i.test(l));
    if (tLine) {
      out.target = tLine
        .replace(/^.*?(求职意向|Target Role|Objective)[：:\s]*/i, "")
        .trim();
    }
  }
  // 去掉空章节；other 章节标题按语言给
  out.sections = out.sections.filter((s) => s.lines.length > 0);
  return out;
}

// ---------- 按模板重排章节 ----------
export function orderSectionsForTemplate(parsed, templateId, lang = "zh") {
  const order = TEMPLATE_SECTION_ORDER[templateId] || null;
  if (!order) return parsed.sections;
  const rank = new Map(order.map((k, i) => [k, i]));
  const inOrder = parsed.sections.filter((s) => rank.has(s.key));
  const rest = parsed.sections.filter((s) => !rank.has(s.key));
  inOrder.sort((a, b) => rank.get(a.key) - rank.get(b.key));
  return [...inOrder, ...rest];
}

// ---------- 渲染：结构化简历 → HTML 片段 ----------
export function escHtml(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

export function resumeBodyHtml(parsed, template, lang = "zh") {
  const t = SECTION_TITLES[lang] || SECTION_TITLES.zh;
  const accent = template?.accent || "#1668B4";
  const sections = orderSectionsForTemplate(parsed, template?.id, lang);
  let h = "";
  if (parsed.name)
    h += `<h1 class="r-name">${escHtml(parsed.name)}</h1>`;
  if (parsed.contact)
    h += `<p class="r-contact">${escHtml(parsed.contact)}</p>`;
  if (parsed.target)
    h += `<p class="r-target">${escHtml(t.target)}：${escHtml(parsed.target)}</p>`;
  for (const sec of sections) {
    const title = t[sec.key] || sec.key;
    h += `<h2 class="r-sec" style="border-color:${accent};color:${accent}">${escHtml(title)}</h2>`;
    const bullets = sec.lines.filter((l) => l.bullet);
    const texts = sec.lines.filter((l) => !l.bullet);
    for (const l of texts)
      h += `<p class="r-line">${escHtml(l.text)}</p>`;
    if (bullets.length) {
      h +=
        '<ul class="r-bullets">' +
        bullets.map((l) => `<li>${escHtml(l.text)}</li>`).join("") +
        "</ul>";
    }
  }
  return h;
}

// ---------- 文件名：姓名-目标岗位（去非法字符；拿不到就用默认名） ----------
export function fileBaseName(parsed, lang = "zh") {
  const parts = [];
  if (parsed.name) parts.push(parsed.name);
  if (parsed.target) parts.push(parsed.target);
  let base = parts.join("-") || (lang === "en" ? "resume" : "我的简历");
  base = base
    .replace(/[\\/:*?"<>|：；]/g, "-")
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || (lang === "en" ? "resume" : "我的简历");
}

const RESUME_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;color:#1a1d21;line-height:1.6;background:#fff}
.resume{max-width:760px;margin:0 auto;padding:24px 28px}
.r-name{font-size:22px;text-align:center;margin-bottom:4px}
.r-contact{font-size:13px;color:#5b6470;text-align:center;margin-bottom:2px}
.r-target{font-size:13px;color:#5b6470;text-align:center;margin-bottom:12px}
.r-sec{font-size:14px;margin:16px 0 6px;padding-bottom:3px;border-bottom:2px solid #1668B4}
.r-line{font-size:13px;margin:2px 0;white-space:pre-wrap}
.r-bullets{font-size:13px;margin:2px 0 2px 18px}
.r-bullets li{margin:2px 0}
`;

// ---------- PDF：打印友好页（A4；加载后自动调起 window.print） ----------
export function printPageHtml({ title, fileBase, bodyHtml, lang = "zh" }) {
  const printNote =
    lang === "en"
      ? "In the print dialog, choose “Save as PDF” as the destination. This page is A4-sized."
      : "在打印对话框里把目标打印机选成“另存为 PDF”即可下载。本页按 A4 排版。";
  const printBtn = lang === "en" ? "Print / Save as PDF" : "打印 / 保存为 PDF";
  return `<!DOCTYPE html>
<html lang="${lang === "en" ? "en" : "zh-CN"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(fileBase)}</title>
<style>
${RESUME_CSS}
.toolbar{max-width:760px;margin:0 auto;padding:16px 28px 0;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.toolbar button{min-height:44px;padding:10px 22px;border-radius:10px;border:0;font-size:15px;font-weight:600;cursor:pointer;background:#1668B4;color:#fff}
.toolbar p{font-size:13px;color:#5b6470}
@page{size:A4;margin:14mm 16mm}
@media print{
  .toolbar{display:none !important}
  body{background:#fff}
  .resume{max-width:none;padding:0}
  .r-name{font-size:20px}
  .r-sec{font-size:13px}
  .r-line,.r-bullets{font-size:12px}
}
</style>
</head>
<body>
<div class="toolbar"><button type="button" onclick="window.print()">${escHtml(printBtn)}</button><p>${escHtml(printNote)}</p></div>
<div class="resume">${bodyHtml}</div>
<script>window.addEventListener('load',function(){setTimeout(function(){window.print();},400);});</script>
</body>
</html>`;
}

// ---------- Word：.doc（Word 可直接打开的 HTML 格式） ----------
export function docFileHtml({ title, bodyHtml }) {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${escHtml(title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
@page WordSection1{size:595.3pt 841.9pt;margin:36pt 42pt 36pt 42pt;mso-header-margin:36pt;mso-footer-margin:36pt}
div.WordSection1{page:WordSection1}
body{font-family:"Microsoft YaHei","PingFang SC",sans-serif;color:#1a1d21;line-height:1.6}
.r-name{font-size:20pt;text-align:center;margin-bottom:4pt}
.r-contact{font-size:10pt;color:#5b6470;text-align:center;margin-bottom:2pt}
.r-target{font-size:10pt;color:#5b6470;text-align:center;margin-bottom:10pt}
.r-sec{font-size:12pt;margin:12pt 0 4pt;padding-bottom:2pt;border-bottom:2pt solid #1668B4}
.r-line{font-size:10.5pt;margin:2pt 0}
.r-bullets{font-size:10.5pt;margin:2pt 0 2pt 18pt}
.r-bullets li{margin:2pt 0}
</style>
</head>
<body><div class="WordSection1">${bodyHtml}</div></body>
</html>`;
}

// ---------- 导出 token ----------
export function newExportToken() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function isTokenValid(row, now = Date.now()) {
  return Boolean(row && row.expires_at && Number(row.expires_at) > now);
}

export const EXPORT_TOKEN_TTL_MS = 30 * 60 * 1000;

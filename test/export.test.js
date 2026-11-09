// 简历过筛 — 导出（PDF/Word）单元测试（第 4 周，规划 §9 / §3.5）
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseResumeText,
  orderSectionsForTemplate,
  resumeBodyHtml,
  fileBaseName,
  printPageHtml,
  docFileHtml,
  newExportToken,
  isTokenValid,
  escHtml,
} from "../src/export.js";

const ZH_RESUME = `张小明
138-0000-0000 ｜ zhangxiaoming@example.com ｜ 深圳
求职意向：产品经理

教育背景
深圳大学 ｜ 计算机科学与技术 ｜ 本科 ｜ 2018-2022
主修课程：数据结构、数据库；GPA：3.6/4.0

工作经历
星辰科技有限公司 ｜ 产品经理 ｜ 2022.07-至今
· 主导用户增长项目，推动日活从 2 万提升至 5 万，增长 150%
· 搭建数据看板，覆盖 3 条业务线，报表制作时间缩短 60%

技能
Axure、SQL、Python、数据分析`;

const EN_RESUME = `Alex Chen
(555) 123-4567 | alex.chen@example.com | San Francisco, CA
Target Role: Product Manager

Education
University of California, Berkeley | Computer Science | B.S. | 2018-2022

Work Experience
Nova Tech Inc. | Product Manager | Jul 2022-Present
- Led user growth initiative, increasing DAU from 20K to 50K (+150%)
- Built analytics dashboard covering 3 business lines, cutting reporting time by 60%

Skills
Axure, SQL, Python, Data Analysis`;

test("解析中文简历：姓名/联系方式/求职意向/章节/bullet", () => {
  const p = parseResumeText(ZH_RESUME, "zh");
  assert.equal(p.name, "张小明");
  assert.match(p.contact, /138-0000-0000/);
  assert.match(p.contact, /zhangxiaoming@example.com/);
  assert.equal(p.target, "产品经理");
  const keys = p.sections.map((s) => s.key);
  assert.deepEqual(keys, ["edu", "work", "skills"]);
  const work = p.sections.find((s) => s.key === "work");
  assert.equal(work.lines.length, 3);
  assert.equal(work.lines[0].bullet, false); // 公司行不是 bullet
  assert.equal(work.lines[1].bullet, true);
  assert.match(work.lines[1].text, /150%/);
});

test("解析英文简历：姓名/联系方式/目标岗位/章节/bullet", () => {
  const p = parseResumeText(EN_RESUME, "en");
  assert.equal(p.name, "Alex Chen");
  assert.match(p.contact, /alex\.chen@example\.com/);
  assert.equal(p.target, "Product Manager");
  const keys = p.sections.map((s) => s.key);
  assert.deepEqual(keys, ["edu", "work", "skills"]);
  const work = p.sections.find((s) => s.key === "work");
  assert.equal(work.lines[1].bullet, true);
  assert.match(work.lines[1].text, /\+150%/);
});

test("无章节标题的纯文本：不崩溃，全进 other", () => {
  const p = parseResumeText("李雷\n在某公司做了三年运营，带过 5 人团队。", "zh");
  assert.equal(p.name, "李雷");
  assert.equal(p.sections.length, 1);
  assert.equal(p.sections[0].key, "other");
});

test("空文本解析为空结构", () => {
  const p = parseResumeText("", "zh");
  assert.equal(p.name, "");
  assert.deepEqual(p.sections, []);
});

test("求职意向写在头部行里也能识别", () => {
  const p = parseResumeText("王芳 ｜ 13900000000 ｜ 求职意向：运营\n工作经历\n· 做过活动", "zh");
  assert.equal(p.target, "运营");
});

test("一键排版：现代模板把总结放前、教育放后", () => {
  const text = `陈晨
13800000000
个人总结
3 年运营经验，擅长用户增长。
教育背景
北京大学 ｜ 新闻学 ｜ 本科 ｜ 2019-2023
工作经历
某公司 ｜ 运营 ｜ 2023-至今
· 做过增长`;
  const p = parseResumeText(text, "zh");
  const ordered = orderSectionsForTemplate(p, "zh-modern", "zh");
  assert.deepEqual(
    ordered.map((s) => s.key),
    ["summary", "work", "edu"],
  );
  const classic = orderSectionsForTemplate(p, "zh-classic", "zh");
  assert.deepEqual(
    classic.map((s) => s.key),
    ["edu", "work", "summary"],
  );
});

test("未知模板 id 时保持原文顺序", () => {
  const p = parseResumeText(ZH_RESUME, "zh");
  const ordered = orderSectionsForTemplate(p, "no-such-template", "zh");
  assert.deepEqual(
    ordered.map((s) => s.key),
    ["edu", "work", "skills"],
  );
});

test("渲染 HTML：含姓名/章节标题/模板 accent，且转义 XSS", () => {
  const p = parseResumeText(
    `张三\n<script>alert(1)</script>\n工作经历\n· 做过 <b>大事</b>`,
    "zh",
  );
  const html = resumeBodyHtml(p, { id: "zh-modern", accent: "#1668B4" }, "zh");
  assert.match(html, /张三/);
  assert.match(html, /工作经历/);
  assert.match(html, /#1668B4/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;b&gt;大事&lt;\/b&gt;/);
});

test("文件名：姓名-目标岗位；非法字符被替换", () => {
  const p = parseResumeText(ZH_RESUME, "zh");
  assert.equal(fileBaseName(p, "zh"), "张小明-产品经理");
  const bad = parseResumeText("李四/王五\n求职意向：运营：增长", "zh");
  assert.equal(fileBaseName(bad, "zh"), "李四-王五-运营-增长");
  assert.equal(fileBaseName({ name: "", target: "" }, "zh"), "我的简历");
  assert.equal(fileBaseName({ name: "", target: "" }, "en"), "resume");
});

test("打印页：A4 @page、自动 window.print、标题为文件名", () => {
  const p = parseResumeText(ZH_RESUME, "zh");
  const body = resumeBodyHtml(p, { id: "zh-classic", accent: "#1a1d21" }, "zh");
  const page = printPageHtml({
    title: "张小明-产品经理",
    fileBase: "张小明-产品经理",
    bodyHtml: body,
    lang: "zh",
  });
  assert.match(page, /@page\s*{\s*size:\s*A4/);
  assert.match(page, /window\.print\(\)/);
  assert.match(page, /<title>张小明-产品经理<\/title>/);
  assert.match(page, /@media print/);
  assert.match(page, /张小明/);
});

test("Word .doc：含 Word 命名空间、WordSection1、转义内容", () => {
  const p = parseResumeText(ZH_RESUME, "zh");
  const body = resumeBodyHtml(p, { id: "zh-classic", accent: "#1a1d21" }, "zh");
  const doc = docFileHtml({ title: "张小明-产品经理", bodyHtml: body });
  assert.match(doc, /urn:schemas-microsoft-com:office:word/);
  assert.match(doc, /WordSection1/);
  assert.match(doc, /张小明/);
  assert.match(doc, /150%/);
});

test("导出 token：32 位 hex；过期判定", () => {
  const t = newExportToken();
  assert.match(t, /^[0-9a-f]{32}$/);
  assert.equal(isTokenValid({ expires_at: Date.now() + 1000 }), true);
  assert.equal(isTokenValid({ expires_at: Date.now() - 1000 }), false);
  assert.equal(isTokenValid(null), false);
  assert.equal(isTokenValid({}), false);
});

test("escHtml 转义全部危险字符", () => {
  assert.equal(escHtml(`<a href="x">&'`),
    "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
});

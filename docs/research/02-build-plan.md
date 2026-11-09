# AI 简历优化网站调研报告（中国个人开发者 / Cloudflare 免费层）

> 调研时间：2026-11-09（UTC+8）。面向：已有 Cloudflare Workers + D1 + KV + R2 博客、免费 AI API（NVIDIA Nemotron、OpenRouter 免费模型）的中国个人开发者。定价设想：国内 9.9 元/次、19.9 元/月、99 元终身。新增要求已并入：第 7 节项目起名、第 8 节域名、第 9 节中英文双语、第 5 节补充国内商户收款 + 国外 USDT 收款与定价换算。
> 阅读提示：凡标“厂商自称 / 未核实”的数字（如通过率 96.8%、邀约率 +120%）均为对方宣传口径，不要直接写进自己产品页。

## Summary（先看结论）

- **能做，且能先用免费层跑起来，但有两个硬天花板要先认清：**（1）Workers 免费层每请求 CPU 只有 10ms，PDF 解析/生成等重活会超限，Reactive Resume 官方文档明确说密码哈希 + PDF 生成超出免费 10ms、需 Workers Paid（$5/月起）；（2）OpenRouter `:free` 模型不是无限量：20 请求/分钟，**没买过 $10 额度每天只有 50 次，买过 $10（累计）后每天 1,000 次**。50 次/天意味着单 key 一天最多约 50 次改写——必须把**确定性 ATS 评分（不调 AI、零成本）做成免费引流入口**，把 AI 改写留给付费用户，并做排队/缓存/多 key 轮换预案。
- **最赚钱的最小闭环（先做 3 个就能上线）：① 上传简历 + 粘贴 JD → 确定性 ATS 评分 + 关键词缺口清单（免费，1 次/天）；② 付费后 AI 按 JD 改写（STAR + 量化，不编造）；③ 导出 PDF/Word + 历史记录/一岗一版。** 模板库、模拟面试、投递看板全部后置。
- **支付分三轨，不要混用：** 国内用微信/支付宝商户码（见 5.1，可复用博客手动审核流程）；国外优先 PayPal 中国个人卖家 + Paddle/Creem/Dodo 这类 Merchant of Record，**Stripe 对中国大陆个人/公司直接不可开户**，不要以 Stripe 为主方案；国外再加 **USDT（TRC-20）手动/半自动收款**（见 5.2），只面向境外用户，**不要向境内用户推、不要用法币兑换 USDT**（2026-02-06 央行等八部门文件重申虚拟货币相关业务属非法金融活动，见 5.2.5）。
- **双语不要一开始做两套站：** 同一套页面 + `zh.json/en.json` 词典，路由用 `/`（中文默认）+ `/en/`，判断优先级：用户手动选择（Cookie 最高）> `Accept-Language` > `CF-IPCountry`（仅作兜底）；英文 ATS/改写要另做一套规则和提示词，不能直接翻译中文版。
- **定价换算（按 2026-11-09 参考价 1 USDT ≈ 6.68 CNY，见 5.3）：** 9.9 元 ≈ 1.48 USDT、19.9 元 ≈ 2.98 USDT、99 元 ≈ 14.82 USDT。建议国外标价**不要直接按汇率换算**，取整为 **1.99 / 3.99 / 19.99 USDT（或美元）**，原因见 5.3。

---

## 1. 功能清单

### 1.1 核心功能（必须有）

| 功能 | 具体做什么 | 用户怎么用 | 落地要点 |
|---|---|---|---|
| 简历上传解析 | 上传 PDF / Word（.docx）/ 纯文本，抽出纯文本，再结构化为姓名、电话、邮箱、教育、工作/项目经历、技能、证书等字段 | 拖文件或粘贴文本 → 自动填表 → 用户逐项核对修改 | 见第 4 节。先做“文本抽取 + 正则/规则分段 + LLM 校验”，不要一开始追求 180+ 字段。失败时允许用户直接粘贴文本兜底 |
| JD 匹配分析 | 粘贴目标岗位 JD（或岗位链接文本），抽关键词并与简历逐条对齐：命中词（绿）/ 缺失词（红）/ 同义词（黄），输出覆盖率与缺口清单 | 粘贴 JD → 点“分析” → 看缺口清单 → 点缺失词看“建议加到哪一段” | 关键词分级见 2.3（Tier 1 必备 / Tier 2 加分 / Tier 3 高频词）。中文要做分词/同义词表（如“数据分析≈数据挖掘”不算等同，需人工表） |
| ATS 评分 | 不调 AI、用确定性规则打分（0–100）+ 分维度得分 + 每条扣分原因 + 修改建议 | 上传简历（可不贴 JD，先给通用分；贴 JD 后给定向分）→ 立即出分（<1 秒） | 见第 2 节。这是免费引流钩子，必须快、免费、可分享（“我的简历 82 分”海报） |
| AI 改写（JD 定向） | 按 JD 重写个人总结 + 每段经历 bullet：动词开头、STAR 结构、量化成果、植入 JD 关键词；输出“改动说明 + 对比视图”，用户可逐条采纳/拒绝 | 选一段或全文改写 → 等 10–30 秒 → 左右对照 → 点“采用”替换 → 再跑一次评分看涨分 | 见第 3 节。系统提示词必须锁死“只用简历已有事实，不编造数字/公司/技能”，缺数字用 `[待补充：___]` 占位 |
| 简历模板 | 3–5 套 ATS 友好模板起步（单栏、无表格、无图片、无多栏、无花哨字体），一键换肤 | 填好内容 → 点模板 → 实时预览 | 模板先做“通用 / 互联网 / 应届 / 金融”4 套。所有模板先过 ATS 解析测试：导出 PDF 再用自己的解析器读一遍，读不出的模板不上线 |
| 导出 PDF / Word | 导出 PDF（投递用）和可编辑 .docx（用户再改用）；PDF 文件名 `姓名-目标岗位-公司.pdf` | 点“导出 PDF / Word” | 见 1.3。首选浏览器端生成（`window.print()` / html2pdf），不占用 Workers CPU；.docx 用 `docx` 库在浏览器端生成 |

### 1.2 辅助功能

| 功能 | 具体做什么 | 用户怎么用 |
|---|---|---|
| 历史记录 / 一岗一版 | 每次分析/改写存一条记录：简历版本 + JD + 分数 + 改写结果；同一份底稿可复制出多个“岗位版” | “我的简历”列表 → 点开任一版本继续改 / 投不同岗位时复制一份再定向改写 |
| 会员 / 额度 | 账号（邮箱 + 验证码登录即可，别做密码）、免费额度、按次券、月会员、终身会员三种权益 | 免费：每天 1 次 ATS 评分、改写试看前 3 条；付费解锁次数/导出 |
| 支付 / 订单 | 下单 → 付款 → 回调/人工审核 → 自动开通权益；订单列表可查状态、申请退款（人工） | 见第 5 节。D1 建 `orders` 表：`id, user_id, plan, amount, method, status, txid, created_at, reviewed_by` |
| 收藏 / 复制 | 一键复制改写后文本、复制关键词清单 | 每段 bullet 右侧“复制”按钮 |
| 反馈 / 客服 | 改写不满意可点“不满意原因”（编造/太啰嗦/偏离 JD），用于调提示词 | 放在结果页底部，不做在线客服系统，先用邮箱/微信 |

### 1.3 导出技术选型（Cloudflare 免费层友好）

- **PDF：优先浏览器端。** 用同一套 HTML 模板渲染简历，`window.print()` + `@media print` 打印成 PDF，零服务器成本；或 `html2pdf.js`。不要在 Workers 免费层做服务端 PDF 生成——Reactive Resume 文档明确说 PDF 生成（WASM）超出 10ms CPU，需 Paid（$5/月，含 1,000 万请求 + 3,000 万 CPU-ms），且 Workers 内存上限 128MB。
- **Word：浏览器端 `docx` 库**（npm `docx`）把结构化简历拼成 .docx 下载；或服务端用 `mammoth` 的反向思路太重，不推荐。
- **R2 用途：** 只存用户上传的原文件（PDF/Word）和导出的文件（可选），10GB-month 免费、1M 次 Class A / 10M 次 Class B 操作/月，够用；不要把简历正文只放 R2，正文放 D1 便于检索。

---

## 2. ATS 评分怎么实现

### 2.1 ATS 到底看什么（先讲人话）

真实 ATS（如北森、Moka、用友大易；国外如 Workday、Taleo、Greenhouse、Lever）第一步不是“读懂你”，而是**解析 + 硬过滤 + 排序**：

1. **能不能解析：** 单栏、标准标题（工作经历/教育背景/技能）、常见字体、无图片文字、无表格套内容，否则直接丢字段。
2. **硬性条件：** 学历、年限、地点、证书、关键词（如“Python / CPA / 3 年以上”），缺 Tier 1 关键词常直接淘汰——有资料称约 75% 简历在大型企业 ATS 初筛被拦（不同口径差异大，不要当精确数字对外宣传）。
3. **排序：** 关键词覆盖率、技能与 JD 的重合度、量化成果比例、经历新鲜度（最近一份工作权重最高）。

### 2.2 可直接抄的确定性评分模型（不用调 AI）

参考开源 ATS Screener 的公开方法论（见 Sources），6 个维度各 0–100，加权求和，再扣“怪癖分”，最后 clamp 到 0–100：

```
总分 S = clamp(0, 100, Σ w_i × d_i + Q)
d1 格式 / d2 关键词 / d3 章节完整度 / d4 经历相关性 / d5 教育匹配 / d6 量化程度
```

**权重（直接抄一套，国内版建议值）：**

| 维度 | 权重（建议） | 参考：Workday / Taleo / Lever |
|---|---|---|
| d1 格式 | 0.15 | 0.25 / 0.20 / 0.08 |
| d2 关键词匹配 | 0.35 | 0.30 / 0.35 / 0.22 |
| d3 章节完整度 | 0.15 | 0.15 / 0.15 / 0.10 |
| d4 经历相关性 | 0.15 | 0.15 / 0.15 / 0.30 |
| d5 教育匹配 | 0.05 | 0.10 / 0.10 / 0.10 |
| d6 量化程度 | 0.15 | 0.05 / 0.05 / 0.20 |

> 为什么关键词给 0.35：Taleo 等老系统就是字面布尔匹配，关键词权重最高；现代系统（Greenhouse/Lever）更看重经历与量化，所以 d4/d6 要给到 0.15–0.20。国内北森/Moka/用友大易更接近“严格解析 + 关键词”模式，建议关键词 0.35、格式 0.15 起步，上线后按用户反馈微调，并在页面注明“本评分为本站规则模拟，非目标公司真实 ATS 分数”。

**各维度怎么算（全部是正则/计数，可在 Workers 里毫秒级跑完）：**

- **d1 格式（扣分制，100 起扣）：** 多栏布局 −15、检测到表格 −12、含图片/图形 −8、页数 >2（按字数估算，>1,500 字约 2 页）−5、总字数 <150 −10、>1,500 −3、特殊字符占比 >5% −8、全大写行 >3 −3、bullet 符号 >2 种 −2。——在 Workers 里“多栏/表格”无法从纯文本直接判断，要在**解析阶段**记录：PDF 提取时若同一 y 坐标多列、或 Word 中含 `<w:tbl>` 就打标记；纯文本粘贴则跳过此项并提示“粘贴版无法检测版式”。
- **d2 关键词：`K = min(100, (|M| + 0.8×|S|) / |J| × 100)`**，M=与 JD 关键词精确命中数，S=同义词/部分命中数（算 0.8 折），J=从 JD 抽出的去重关键词数；无 JD 时 K 按约定记 100（或不计入总分，改按其余 5 项归一化）。例：|M|=15、|S|=5、|J|=30 → 精确模式 50 分，模糊/语义模式 (15+4)/30=63.3 分。
- **d3 章节完整度：** 检查姓名、电话、邮箱、教育、工作/项目、技能 6 项，每缺一项扣分；另查日期格式是否规整（如 `2021.06–2023.08`）。
- **d4 经历相关性：** 每条 bullet 是否以动词开头（中文动词表：负责/主导/推动/优化/搭建/提升…；英文见 9.3）、是否含 JD 词、最近一份工作占比是否过低。
- **d5 教育匹配：** 有无学历、学校、专业、毕业时间；与 JD 要求的学历层次是否一致（仅作提示，不作硬淘汰）。
- **d6 量化程度：`d6 = floor(含数字的 bullet 数 / 总 bullet 数 × 100)`。** 数字指 %、金额、人数、时长、提升幅度等。10 条里 3 条有数 → 30 分；8 条 → 80 分。
- **Q 怪癖扣分（示例）：** 非标准标题 >2 个 −5；页数 >2 −8；JD 相关技能 <5 个 −10；缺 >1 个必填章节 −8。

**分数档（可直接用）：** 85–100 优秀、70–84 良好、<70 待优化；通过线建议设 70 分（严格档）/ 60 分（宽松档），并在结果页写清“≥70 再投”。

### 2.3 JD 关键词抽取（不用 AI 也能做 80 分）

1. **分词：** 中文先用轻量词典分词（见 4 节）或直接按 JD 中的名词短语抽；英文按词形还原（`managing→manage` 不必，先做小写 + 去停用词）。
2. **分级（Tier）：** Tier 1 必备（出现在“任职要求/必须/Required”段、职位标题里的词）> Tier 2 加分（“优先/加分/Preferred”）> Tier 3 高频词（在 JD 出现 ≥2 次的词）> Tier 4 职位名称变体 > Tier 5 行业词。Tier 1 缺失要标红并置顶。
3. **去停用词 + 去重 + 归一：** 去“负责、团队、沟通”等通用词；“Python / python / PYTHON”归一；“CI/CD”与“CI/CD pipeline”算同一词。
4. **进阶（可选）：** 维护一张同义词表（`JS=JavaScript、PM=项目经理、SQL=MySQL/PostgreSQL` 不等同，需分开标），不要用 AI 做语义匹配的第一版。

### 2.4 开源参考（可直接读代码抄规则）

- **ATS Screener 方法论页**（公式、权重、扣分表全公开）：https://ats.jilva.dev/docs/scoring/methodology/
- **AI Resume Suite `ats.js`**（浏览器端启发式：结构 70% + 关键词 30%，先出分再调 AI）：https://www.2hipfortheroom.com/AIresume/technical_guide.html
- **ATS Resume Optimizer Skill（Apache-2.0）**（JD 关键词六级分类法）：https://github.com/ADAM-0S/wayland-m3ta-0s/blob/HEAD/src/process/resources/skills-library/bodies/skills/career-development/ats-resume-optimizer/SKILL.md
- **ResumeAI 的 AtsScoreService（纯数学计分示例）**：`atsScore = matched/extracted × 100`，85–100 优秀 / 70–84 良好 / 0–69 待改进：https://deepwiki.com/narniavinash05/resumebuilder/6.2-ai-resume-generation-pipeline

---

## 3. JD 定向改写怎么做

### 3.1 原则（写进系统提示词，缺一不可）

1. **不编造：** 只用简历已有事实重组、换词、排序；不新增雇主、日期、工具、数字。缺数字用 `[待补充：___]`，不要让模型“合理推测”。
2. **动词开头 + STAR/CAR：** 每条 bullet 用强动词开头（主导/搭建/推动/优化/落地…），结构为 情境-任务-行动-结果，控制在 1–2 行。
3. **量化优先：** 能量化的必须量化（时间/金钱/人数/体量/质量/% 提升）；实在没有数字，用范围/规模代替（“覆盖 3 个业务线”比“负责多条业务线”好）。
4. **镜像 JD 用词，但只在真实相同处：** JD 写“用户增长”，简历写过拉新就可换词；没做过的不许硬贴。
5. **一次只改一段：** 全文一次性改写最容易编造；按“总结 → 每段经历 → 技能”分步改，每步让用户确认。

### 3.2 可直接抄的提示词模板（中文版，系统提示词 + 用户提示词）

**系统提示词（固定不变）：**

```
你是一名资深简历顾问 + 招聘官，熟悉中国互联网/金融等行业 ATS 筛选规则。
任务：按目标岗位 JD，改写用户简历。铁律：
1. 只使用简历原文提供的事实，不编造雇主、日期、工具、技能、数字。
2. 缺失数字时写 [待补充：___]，不要猜数字。
3. 每条经历用 STAR 结构、强动词开头、1-2 行、优先量化成果。
4. 只在经历真实相同的前提下，使用 JD 原词；JD 要求但简历没有的，列入文末“缺口清单”，不要写进简历。
5. 输出 JSON：{summary, bullets:[{original, rewritten, change_reason}], missing_keywords:[], score_tips:[]}
```

**用户提示词（每次调用拼装）：**

```
【目标岗位】{岗位名}
【JD 全文】{粘贴 JD}
【我的简历全文】{粘贴解析后文本}
【要求】
1. 先列出 JD 中最重要的 5 个关键词，指出简历缺失/弱化的词及原因。
2. 重写最相关的 3 条经历，每条给 2 个版本（保守版/进取版），保留原有数字不变。
3. 标出与目标岗位明显无关的 bullet，建议删除或下移。
4. 最后给一段 60-80 字个人总结，首句放目标岗位 exact 名称，不用“热爱/激情/抗压”等空话。
```

**英文版提示词差异（见 9.3）：** 英文要加 `Past tense for previous roles, present tense for current role; no pronouns (no "I"); one page if <10 years; X-Y-Z formula: Accomplished [X], as measured by [Y], by doing [Z]`。

### 3.3 公开最佳实践来源

- CVBranch《ChatGPT Prompts for Resume Tailoring》（含“每条提示词末尾加 Ground Rules：只用简历事实、不编造、标 [VERIFY]”）：https://www.cvbranch.com/guides/chatgpt-resume-tailoring-prompts/
- ShashiWorks《How to Use ChatGPT for Your Job Hunt》（三步法：找 5 个缺失关键词 → 重写 3 条最相关 bullet → 标无关 bullet）：https://www.shashiworks.com/chatgpt-job-hunt.html
- GitHub 开源 ATS 改写提示词（2026 ATS 全景：Workday/Greenhouse/Lever 等，含加权公式与“语义+精确”双匹配）：https://github.com/hferello/ai/blob/HEAD/ats/resume-improvement-prompt.md
- Alloquy《25+ Resume Prompts》（Jobscan 实测：把 exact 职位名 + 排序关键词放对位置可提分约 24 分）：https://alloquy.app/blog/resume-prompts

### 3.4 改写效果的“验收标准”（上线前自测）

- 改写后 ATS 定向分至少 +10 分，否则提示词要调；
- 逐条抽查：模型新增的数字/工具是否能在原文找到出处，找不到即判不合格；
- 同一份简历连跑 3 次，核心事实（公司、时间、数字）必须一致，波动只应在措辞。

---

## 4. 简历解析技术（Cloudflare Workers 轻量方案）

### 4.1 总路线：浏览器端先抽文本，Workers 只做结构化

**不要把重型 PDF 库塞进 Workers 免费层。** 推荐分工：

| 步骤 | 在哪里跑 | 用什么 |
|---|---|---|
| PDF 文本抽取 | **浏览器端优先**（`pdf.js` / `unpdf`）或 Workers 内 `unpdf`（serverless 版 pdf.js） | `unpdf`：专为 serverless 优化的 pdf.js 构建，去掉了 Node API 和 Web Worker 依赖，`getDocumentProxy() + extractText({mergePages:true})`。注意：大 PDF 仍可能超 10ms CPU，>2MB 文件建议浏览器端解析 |
| Word（.docx）文本抽取 | 浏览器端或 Workers 内 `mammoth` | `mammoth.extractRawText({buffer})`，直接读 docx 内 XML，轻量、无原生依赖 |
| 纯文本 / 粘贴 | 直接收文本 | 不解析文件 |
| 结构化（姓名/经历/技能/教育） | Workers 内：**正则 + 规则分段（免费、即时）→ 再调一次 LLM 做校验/补全（仅付费链路）** | 正则：手机号、邮箱、日期 `20xx.xx`、标题行（工作经历/教育背景/项目经历/技能）；分段后按空行/日期切块 |
| 旧 .doc（非 .docx） | 不支持，提示用户转 .docx 或粘贴文本 | .doc 是二进制格式，轻量方案处理不了，直接拒绝比解析错好 |

参考实现：开源 `smart-resume-analyzer` 的路由就是按 MIME 分发（PDF 用 `pdf2json`、docx 用 `mammoth`），但 `pdf2json` 依赖 Node 原生模块，**不适合 Workers**，要换成 `unpdf`。Reactive Resume 在 Cloudflare 上的部署也证明：PDF 导出用 WASM、图片不做服务端压缩、Workers 内存 128MB——大文件要限流（建议单文件 ≤5MB、≤3 页）。

### 4.2 字段抽取规则（可直接写代码）

- **姓名：** 第一行、2–4 个汉字且非常用词；或 `姓名：XXX`。
- **联系方式：** 手机号正则 `1[3-9]\d{9}`、邮箱正则、城市（“北京/上海/深圳…”词表）。
- **教育：** 匹配学校名（词表/“大学/学院”）+ 学历（本科/硕士/博士/专科）+ 时间段 + 专业。
- **经历：** 按“公司名 + 时间段”切块，每块内按 bullet（`• / - / 1.`）切条；公司名常在行首且含“科技/有限公司/集团”。
- **技能：** “技能/技术栈”段按 `、/，/ / /` 切词，再与技能词表（Python/Java/SQL/Excel…）交集去重。
- **量化：** 数字 + 单位（%、万、元、人、天）直接标出，供 d6 计分。
- **置信度：** 每个字段给 `confidence`（规则命中=高，LLM 补全=中，猜测=低），低置信字段在前端标黄让用户改。

### 4.3 Workers 免费层注意事项

- Workers 免费层：**10 万请求/天、10ms CPU/请求、128MB 内存、3MB 压缩脚本**；D1 免费：500 万行读/天、10 万行写/天、5GB；KV：10 万读/天、1,000 写/天；R2：10GB-month、100 万 Class A / 1,000 万 Class B/月。静态资源请求不计入 10 万次。
- 解析是 CPU 密集型：**纯文本 + 正则可以在 10ms 内跑完；PDF 解析大概率超**。对策：① 默认浏览器端解析，Workers 只收文本；② 实在要在 Workers 解析，先限文件大小，超限返回“请用浏览器端解析”；③ 有收入后升级 Paid（$5/月，CPU 30 秒/请求）。
- 中文分词：不要在 Workers 里塞大词典；JD 关键词抽取先用“按标点/空格切 + 技能词表匹配 + 高频词统计”顶上去，等有量再上 `jieba-wasm` 之类轻量方案。

---

## 5. 变现与支付（中国个人开发者）

### 5.1 国内：微信支付 + 支付宝——个人收款 vs 商户收款，及复用博客手动流程

**先分清三档（不要混为一谈）：**

| 方式 | 申请条件 | 费率 | 到账 | 能否自动回调 | 适合阶段 |
|---|---|---|---|---|---|
| **个人收款码**（微信/支付宝个人收钱码） | 有微信/支付宝账号即可，0 门槛 | 0（余额/储蓄卡；信用卡/花呗一般不支持） | 实时到账个人余额 | ❌ 无 API、无回调，只能人工对账 | 只能做 0–1 冷启动测试，**不能作为正式商业收款**（个人码禁用于经营收款、有风控/限额风险） |
| **个人经营收款码 / 小微商户** | 身份证 + 银行卡，通过微信/支付宝 App 或服务商申请；无需营业执照 | **0.38%–0.6%**（小微/餐饮零售可谈到 0.38%，通用 0.6%） | **T+1 / D+1**（次日到银行卡） | ❌ 仍无网站 API，只能人工对账 | **上线首选**：你已有商户码，大概率就是这一档 |
| **微信支付商户号（Native/JSAPI）+ 支付宝当面付/电脑网站支付** | 微信：商户号 + **需关联一个通过微信认证的服务号/小程序（认证费 300 元/年）**，再在商户平台开通 Native 支付（PC 网站扫码）、配 API 证书/密钥；支付宝：企业/个体户/个人账号均可签约当面付，需经营场所照片（店铺招牌+内景）、店铺名、地址，材料不全则单笔 ≤2,000 元、单日 ≤20,000 元 | **微信 0.6%（虚拟类 1%）；支付宝当面付 0.6%**（单笔四舍五入到分） | 微信 T+1；支付宝：签约未满 90 日或连续交易未满 30 日为次日结算，之后实时到支付宝余额 | ✅ 有官方 API + 回调，可全自动开通 | 有稳定单量后升级，省人工 |

**费率算账（按你的定价）：** 9.9 元 × 0.6% ≈ 0.06 元/笔；19.9 元 ≈ 0.12 元；99 元 ≈ 0.59 元。费率几乎可忽略，**真正成本是 300 元/年认证费 + 人工审核时间**。

**复用博客“扫码付款 → 通知站长 → 手动审核开通”流程（可直接抄，D1 表复用）：**

```
1. 用户在简历站选套餐 → 生成订单（D1 orders：id/plan/amount/method/status=pending）
   → 展示对应商户码（微信码 / 支付宝码二选一）+ 订单号（让用户付款时备注订单号后 4 位）
2. 用户扫码付 exact 金额 → 在页面点“我已付款” → 填：付款方式 + 付款人昵称/订单号 + 上传付款截图（可选，存 R2）
3. 站长在博客已有后台看到待审核订单 → 核对微信/支付宝账单（金额 + 时间 ±10 分钟 + 备注号）
   → 点“通过”→ D1 把用户权益写成 credits / membership（复用博客会员表，加 plan 字段即可）
   → 点“驳回”→ 填原因，用户前台可见
4. 防重放/防冒领：同一订单号只能通过一次；金额必须 exact（9.90/19.90/99.00），少 1 分钱也不通过；
   截图只作辅助，不以截图为准，以账单为准。
```

**从手动升级到自动的最小改动（不用重写）：** 保持同一张 `orders` 表和同一套审核后台，只把第 1 步的静态商户码换成**微信 Native 支付动态码**（Worker 调统一下单接口拿 `code_url` 生成二维码，2 小时有效）+ **支付宝当面付 dynamic 订单**，回调（Worker `/api/pay/notify` 验签后）自动把订单置为 paid 并开通权益；手动审核页保留作“异常订单”兜底。密钥（商户 API 证书/私钥）放 `wrangler secret`，绝不放前端。

**国内定价三档利弊：**

| 档 | 利 | 弊 | 建议 |
|---|---|---|---|
| 9.9 元/次 | 决策成本极低，适合冲动购买、拉新；可作“1 次改写 + 1 次导出”体验装 | 客单价低，人工审核成本占比高；用户用完即走，无复购 | 限 1 次改写 + 导出 1 次，**不含**月内无限次 |
| 19.9 元/月 | 有续费想象空间，适合求职季（1–3 个月集中投递） | 需处理续费/到期提醒/自动扣款（手动流程下续费=再下一单），流失率高 | 到期前 3 天站内提醒；月会员=30 天内改写 30 次 + 导出不限 |
| 99 元终身 | 一次回血快，用户决策“一劳永逸”；和竞品终身价（超级简历终身 99–128 元、知页永久 28–39.9 元）同一区间，用户有锚点 | 终身=无限负债（AI 成本随用随增），若免费 key 限流会被终身用户挤爆 | **必须限流**：终身=每月 50 次改写 + 导出不限，并在购买页写明；不要写“无限次” |

### 5.2 国外：USDT 支付（只面向境外用户）

#### 5.2.1 最简单可靠的做法（推荐顺序）

**阶段一（上线即用，0 接入成本）：固定钱包地址 + 用户提交 TxID 人工确认——复用博客手动流程。**

```
1. 订单页（/en/）：选套餐 → 生成订单号（如 USDT-20261109-XXXX）→ 展示：
   - 网络：USDT-TRC20（Tron，只做这一个网络，别同时上 ERC-20/BEP-20）
   - 收款地址：T开头的 TRC-20 地址（单独开一个业务钱包，别用个人储蓄钱包）
   - 金额：exact USDT 数（如 1.99）+ 15 分钟有效期 + 订单号
   - 二维码（地址 + 金额）
2. 用户用钱包（Trust Wallet / TronLink 等）转账 → 回来填 TxID（64 位十六进制哈希）→ 点“我已付款”
3. 站长/Worker 核对（见 5.2.3）→ 通过后开通权益；和国内手动流程共用同一张 orders 表 + 同一个审核后台，
   只加两个字段：method='usdt'，txid（UNIQUE，防重复提交）。
```

**阶段二（有量后半自动）：Worker 轮询 TronGrid 自动确认。** 用户提交 TxID 后，Worker 调 TronGrid 读链上记录（见 5.2.3），通过即自动开通，不用等人工；人工审核页只处理异常单。

**阶段三（再往后）：现成 USDT 支付网关。** 对比见下表，**先别急着接**——网关要 KYC/KYB、费率、且有的在 2026-10-19 更新条款后排除部分地区，个人小站先用阶段一/二跑通再说。

| 网关 | 费率（2026-10 公开价） | 托管 | KYC | 备注 |
|---|---|---|---|---|
| NOWPayments | 0.5%（同币种）/ 1%（需兑换）；多币种/固定汇率 1.5% | 非托管（到你钱包） | 加密-only 可选 KYC，法币结算需 KYC | 350+ 币种，支持 TRC-20/BEP-20/ERC-20；2026-10-19 条款更新后排除欧盟/英国/美国/阿联酋/俄罗斯居民 |
| Plisio | 0.5% | 非托管 | 加密-only 不要求 | 支持 TRC-20/ERC-20/BEP-20/TON |
| Payfjord | 0.25%（仅成功单收费） | 非托管（到你钱包） | 未强制 | 20 条链，TRC-20/BEP-20/ERC-20 等，回调 + 手动对账 |
| Aurpay | 0.8% | 非托管 | 提现前需 KYB | ERC-20/TRC-20/BEP-20 |
| BTCPay Server | 0%（自托管，服务器约 $10–70/月） | 自托管 | 无（自己跑软件） | 最自由但要自己运维，不适合首版 |
| CoinPayments V2 | 0.5%（币）/ 1%（代币/稳定币） | 托管（ pooled 钱包） | 需 KYB | 老牌但有合规争议记录，谨慎 |
| Cryptomus | 新用户 2%，可谈到 0.4% | 托管 | 强制 KYC | 8 条链含 TRC-20 |
| LuvoPay / NowCrypto | 未公开统一价，按单询价 | 非托管 | 轻 | 卖点是“TxID 粘贴即验”，适合小站参考其交互 |

#### 5.2.2 只做 TRC-20，别贪多

- **网络：Tron TRC-20。** 区块 3 秒、手续费约 $0.5 左右（付 TRX）、确认约 1 分钟；ERC-20 手续费高、到账慢，BEP-20 用户少。页面、订单、邮件**每处都要写清 “USDT on Tron (TRC-20)”**，只写 “USDT” 是最常见的丢币原因。
- **合约地址（Tron 主网 USDT，写死校验用）：** `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`。**只认合约地址，不认代币符号/名称**（假币会冒用 “USDT” 名字）。
- **地址格式：** TRC-20 地址以 `T` 开头；不要把 ERC-20 地址（`0x…`）和 TRC-20 地址混用。一个网络一个地址。
- **先小额测试：** 正式收款前，自己先转 1 USDT 测试全流程（生成订单 → 转账 → 提交 TxID → 核对 → 开通），再公布地址。

#### 5.2.3 Cloudflare Workers 上最简单的 USDT 确认流程（可直接抄）

**手动核对（阶段一，人工 1 分钟）：** 把用户提交的 TxID 粘贴到 https://tronscan.org/#/transaction/{TxID}，核对 4 项：① `contractRet: SUCCESS`；② 收款地址 = 你的地址；③ 金额 = 订单金额（USDT 6 位小数，1.99 USDT = `1990000`）；④ 合约 = 上述 TR7N… 地址。4 项全对才通过。

**半自动核对（阶段二，Worker 代码思路，不用 tronweb、只用 fetch）：**

```js
// Worker 环境变量（wrangler secret）：WALLET=你的TRC-20地址，TRONGRID_KEY=TronGrid API Key（免费申请，放 header TRON-PRO-API-KEY）
// D1 orders 表：txid TEXT UNIQUE（防同一 TxID 重复开通）
const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
// 1) 用户提交 TxID → 先查 D1 是否已用过该 TxID
// 2) 调 TronGrid：GET https://api.trongrid.io/v1/accounts/{WALLET}/transactions/trc20
//    ?only_to=true&only_confirmed=true&min_timestamp={订单创建时间戳}
//    （注意：该接口不返回 per-tx 的 confirmed 字段，不要写 if(tx.confirmed!==true)——
//     一定用 only_confirmed=true 查询参数过滤，否则所有付款都会被误拒）
// 3) 在返回里找 transaction_id === 用户提交的 TxID，且：
//    token_info.address === USDT_CONTRACT 且 to === WALLET 且 value === 订单金额×1e6
// 4) 再调 POST https://api.trongrid.io/wallet/gettransactionbyid 查 ret[0].contractRet==='SUCCESS'，
//    且当前块高 - 交易块高 >= 19（约 1 分钟，TRC-20 建议 19 个确认）
// 5) 全部通过 → D1 订单置 paid + 开通权益（同一事务内写，防止并发重复开通）；
//    不通过 → 返回“未检测到 / 金额不符 / 未确认”，让用户等 1 分钟再点“重新查询”。
// 轮询：用户在支付页点“查询状态”时触发（不要用 Cron 高频轮询，免费层 Cron 只有 5 个/账号）；
//       或前端每 15 秒调一次状态接口，最多 15 分钟后订单过期。
```

**防骗清单（缺一不可）：**

| 骗术/失误 | 对策 |
|---|---|
| 假 USDT（同名代币） | 只认合约地址 TR7N…，不认名称 |
| 截图 P 图 / 假 TxID | 不认截图，只认链上 TxID 查询结果；截图仅作辅助 |
| 同一 TxID 重复开通两个订单 | D1 `txid UNIQUE` + 开通时先查后写 |
| 金额少付（如付 1.90 冒充 1.99） | 精确比对 `value`（微单位），差 1 分也不通过 |
| 错链（ERC-20 发到 TRC-20 地址） | 页面大字写清网络 + 地址，错链资金可能永久丢失，**不承诺找回** |
| 刚广播未确认就开通 | 必须 `only_confirmed=true` + ≥19 确认；未确认只显示“待确认” |
| 黑名单/冻结地址 | Tether 可冻结地址（2025 年 BlockSec 统计 4,163 个地址、$12.6 亿 USDT 被冻结，Tron 占 3,506 个）；收款前不要收来路不明的大额转账，定期把 USDT 转到冷钱包 |
| 私钥泄露 | **私钥永远不上服务器、不进 Worker、不进代码仓库**；Worker 只存收款地址（公开信息）+ TronGrid 读接口 Key |

#### 5.2.4 汇率、确认时间、到账

- **汇率：** USDT 锚定美元，1 USDT ≈ 1.00 USD（2026-11-08 约 0.999 USD），波动通常 <0.1%/天，**不需要像法币那样锁汇**；但页面标价要写“按付款时 USDT 金额为准”，不要写人民币价再实时换算（避免用户付 1.48、你收 1.47 的扯皮）。
- **确认时间：** Tron 出块 3 秒，19 个确认约 1 分钟；加上用户钱包广播到上链，通常 1–3 分钟到账可查。订单有效期设 **30 分钟**，超时未付订单自动过期（用户可重新下单）。
- **到账：** USDT 直接到你的钱包，**没有 T+1，没有提现费**（只有链上手续费由付款方付）；你要用法币时再自行合规处理（见 5.2.5），不要在站内提供“USDT 换人民币”服务。

#### 5.2.5 ⚠️ 合规红线（必读，不是法律建议）

- 中国人民银行等十部门 2021 年《关于进一步防范和处置虚拟货币交易炒作风险的通知》（银发〔2021〕237 号）及 **2026-02-06 央行等八部门《关于进一步防范和处置虚拟货币等相关风险的通知》** 明确：**虚拟货币相关业务活动属于非法金融活动**——在境内开展法币与虚拟货币兑换、币币兑换、作为中央对手方买卖虚拟货币、为虚拟货币交易提供信息中介和定价服务、代币发行融资等，**一律严格禁止**；企业/个体户登记名称和经营范围不得含“虚拟货币/虚拟资产/加密货币/稳定币/RWA”等字样。
- 对个人开发者的实际含义：**USDT 收款只面向境外用户、只收境外订单**；不要在中文站/中文社媒宣传 USDT 支付，不要向境内用户提供 USDT 换人民币、代收付、OTC 兑换；不要把 USDT 收入通过 OTC 换成人民币提到银行卡（有冻卡风险）；收入记账、税务问题请咨询专业律师/会计，本报告不构成法律建议。
- 如果未来想完全合规化，境外收款应走 PayPal / Paddle 等持牌渠道（见 9.4），USDT 只作为“境外用户可选的补充通道”。

### 5.3 定价换算：9.9 / 19.9 / 99 元 → USDT 是多少？国外定价要不要不同？

**参考汇率（2026-11-09，公开行情，非报价）：** 1 USDT = 6.6798 CNY（MigraPay，2026-11-09 00:07 UTC）、CoinPaprika 1 USDT = 6.67 CNY（2026-11-08）。取 **1 USDT ≈ 6.68 CNY** 计算：

| 国内档 | 人民币 | 按 6.68 换算 | 建议国外标价（取整+心理价） | 备注 |
|---|---|---|---|---|
| 按次 | 9.9 元 | **1.48 USDT** | **1.99 USDT** | 直接标 1.48 又碎又难记；1.99 是海外常见心理价 |
| 包月 | 19.9 元 | **2.98 USDT** | **3.99 USDT** | 同上；月费 3.99 美元在海外工具站是低价档 |
| 终身 | 99 元 | **14.82 USDT** | **19.99 USDT** | 终身档最该加价：海外用户付费意愿更高，且终身=长期成本 |

**结论：国外定价应该不同，理由：**

1. **购买力不同：** 海外用户对 $1.99–$19.99 的工具订阅接受度远高于国内 9.9–99 元；按汇率直换会把自己定成“廉价工具”，反而让人怀疑质量。
2. **成本不同：** 国外支付有网关费（PayPal 4.4%+$0.30、Paddle 5%+$0.50、USDT 网关 0.25%–1%），1.48 USDT 一单 PayPal 要扣约 $0.37，净得 $1.11，太薄；定 1.99 USDT 可部分覆盖。
3. **建议做法：** 国内站显示人民币价（9.9/19.9/99），英文站显示 **$1.99 / $3.99 / $19.99**（USDT 按 1:1 美元计价，PayPal/卡按美元计价），**不要在英文站同时挂人民币价**；USDT 标价用 USDT 计价、美元标价用 USD 计价，两者数值相同即可（因 1 USDT≈1 USD）。
4. **汇率波动处理：** USDT 标价固定为上述取整数，不随汇率浮动；每月初看一眼 1 USDT 对 CNY 是否偏离 6.68 超过 5%，再决定是否调价，不要每天调。

### 5.4 防刷（免费 key 有次数限制，必须做）

- **分层限流：** 未登录：每天 1 次 ATS 评分（IP + Cookie 双限）；登录免费用户：每天 3 次评分、改写仅试看；付费按套餐次数。
- **技术实现：** KV 做计数器（`rate:{user}:{day}`，TTL 24h）+ D1 做额度账本（`credits` 表，扣减用事务）；Workers 免费 KV 写只有 1,000 次/天，**计数器放 D1 更稳**，KV 只放热点缓存。
- **OpenRouter 侧：** 单 key 50 次/天是硬顶——**第一天就花 $10 买额度把上限提到 1,000 次/天**（累计购买，不消耗余额也能提额）；再准备 2 个备用 key（不同账号）轮换；AI 调用前先查 D1 剩余额度，超了直接返回“今日免费额度已用完”，不要让请求打到 OpenRouter 再 429。
- **防机器人：** 注册/下单加 Cloudflare Turnstile（免费）、同一 IP 1 分钟 >10 次请求直接 429、改写接口必须登录 + 校验订单。

---

## 6. 同类产品参考（2026 中国市场）

| 产品 | 定位 | 核心功能 | 定价（2026-11-09 查到的公开价，来源不一，见备注） | 可借鉴 | 口碑/短板 |
|---|---|---|---|---|---|
| **超级简历 WonderCV**（wondercv.com） | 老牌 ATS 标准排版工具，3,000 万+ 用户 | 5,000+ 模板（号称 ATS 解析测试过）、AI 初评打分、JD 关键词匹配、中英双语、多端同步、加密链接投递 | 多个来源不一致：CSDN 横评 7 天 ¥25 / 月 ¥29 / 半年 ¥136 / 年 ¥198；IT 之家 月 18–29 元 / 终身 99–128 元；另一来源 月卡 ¥59 / 年卡 ¥198。**以官网为准** | 模板量 + ATS 测试背书 + 多端同步；“模板即卖点”的打法 | AI 优化偏模板填充式，深层改写/量化弱；免费版导出带水印、AI 核心收费 |
| **AI 简历姬**（resumemakeroffer.com） | 以 JD 为中心的全流程求职工作台 | JD 关键词逐条对齐、匹配度评分、覆盖率+缺口清单、STAR 量化改写、一岗一版、模拟面试、投递看板 | 7 天 ¥25 / 月 ¥29（多来源一致） | **最值得抄的对手**：关键词覆盖图 + 缺口清单 + “从 42 分到 91 分看得见”的涨分叙事；明确适配北森/Moka/用友大易 | 自称“ATS 通过率 96.8%”为厂商口径，未见第三方验证；部分横评文疑似软文，要辩证看 |
| **知页简历**（牛客旗下） | 模板 + 排版工具，设计优先 | 1,500+ 模板、500 个范文一键导入、自动排版、手机端体验好、基础诊断打分 | App Store 中国区：1 个月 ¥18–19.9、永久 ¥28–29.9、7 天 ¥12、永久+点评 ¥119；另有来源称月 25 元起、年 99 元起、1v1 辅导 199 元起 | 模板审美 + 范文库 + 移动端；低价永久会员拉新 | AI 能力基础，**无 JD 关键词映射、无匹配度评分、无 ATS 通过率校验**（多篇横评一致结论） |
| **100分简历** | AI 在线简历编辑，主打“提升面试邀约率” | AI 生成（9 步向导 3 分钟出稿）、AI 解析（180+ 字段）、对话式内容生成、AI 优化（发展连续性评估、行业赛道推荐、模拟面试、薪酬谈判） | 未查到统一公开价，以官网为准 | 四大 AI 模块联动 + 按 24 行业/300+ 岗位/6 阶段细分模板 | 自称“邀约率平均 +120%”为厂商口径；功能多但学习成本高 |
| **职徒简历 / 全民简历** | 校园/通用模板工具 | 模板 + 基础优化 | 低价档为主 | 校园场景切入 | AI 深度弱 |

**给你的借鉴清单（按优先级）：**

1. 抄 AI 简历姬的“JD 缺口清单 + 涨分前后对比”，这是用户最愿意截图分享的点。
2. 抄超级简历的“模板都过 ATS 解析测试”这句话（但你自己要真测）。
3. 别抄知页的“只做模板”路线——你没有 1,500 套模板的产能，**差异化在“JD 定向改写 + 确定性评分”**。
4. 定价锚点：你的 9.9/19.9/99 元**低于**超级简历年卡 198 元、**等于**其终身价下限，**高于**知页永久 28–39.9 元——要在页面讲清“你买的是改写 + 评分，不是模板”，否则用户会拿你和知页比价。

---

## 7. 项目起名（中文名，8 个）

> 避让说明：已避开现有品牌——超级简历、知页、100分简历、AI简历姬、职徒简历、全民简历、求职方舟。以下名字**未查商标、未查域名是否被注册**，定名前请在商标局官网 + 域名注册商核对（见第 8 节末）。

| # | 名字 | 结构 | 为什么好（一句话） |
|---|---|---|---|
| 1 | **简历过筛** | 简历 + 动词 | 直接点出核心卖点 ATS 过筛，用户 3 秒听懂“这站是帮我过机器筛的”，搜索词“简历过筛/ATS”天然匹配 |
| 2 | **智改简历** | 智（AI）+ 动词 + 简历 | “智能改写”的缩写，动词感强，像一句口号；比“AI简历”更有动作感，适合做 Slogan“简历不会写，智改一下” |
| 3 | **简历通关** | 简历 + 结果词 | “通关”是求职者的终极诉求（过筛→面试→Offer），比“优化”更有结果感，好记且适合做涨分海报 |
| 4 | **简历狙击手** | 简历 + 角色词 | “一岗一版、精准打击”的形象化表达，突出 JD 定向（不是海投），年轻用户喜欢，适合做 IP/公众号人格 |
| 5 | **职场敲门砖** | 职场 + 比喻 | 简历就是敲门砖，比喻人人懂、不用解释，适合做品牌故事；缺点是稍长、域名难配（见第 8 节） |
| 6 | **简历加分** | 简历 + 结果词 | 最直白的价值主张（“用了就加分”），朗朗上口，适合投放广告语“简历加分，面试加倍” |
| 7 | **AI简历官** | AI + 简历 + 角色词 | “官”给人专业、权威感（像“面试官”的对仗），暗示 AI 像招聘官一样审简历，适合 ATS 评分场景 |
| 8 | **求职简历铺** | 求职 + 简历 + 店铺词 | 带“铺”有手艺人/小店感，适合个人开发者人设（不是大公司，是认真打磨的手艺铺），亲和力强 |

**首选推荐：简历过筛（主）+ 智改简历（副标题/功能名）。** 理由：① “过筛”是你区别于模板站的最大差异点；② 两个名字可组合使用——品牌叫“简历过筛”，功能页叫“智改简历”，不浪费；③ 拼音 `jianliguosai / zhigaijianli` 都不拗口。次选：简历通关（如果想走更积极的结果感路线）。

---

## 8. 域名建议（10 个，未查是否被注册）

> 规则：优先 `.com`（全球通用、Cloudflare 上最好接、国外用户信任度高），其次 `.cn`（国内用户信任、但需实名 + ICP 备案才能在国内正常访问，见 9.5 备注）。**以下域名均未查询是否已被注册，仅给创意方向，申请时以注册商实时查询为准。** 词根：`jianli`（简历）、`resume`、`cv`、`zhi`（职/智）、`ai`、`offer`、`guosai`（过筛）。

| # | 域名 | 建议后缀 | 含义 / 为什么好 |
|---|---|---|---|
| 1 | `jianliguosai.com` | .com 首选，.cn 备选 | 简历过筛全拼，直白、SEO 友好（搜“简历过筛”直接命中），15 字母稍长但无歧义 |
| 2 | `zhigaijianli.com` | .com | 智改简历全拼，和第 7 节第 2 名对应，适合做品牌主域 |
| 3 | `jianliai.com` | .com | 简历 + AI，最短的中文品牌组合之一（8 字母），好记、好念，适合口头传播 |
| 4 | `aijianli.com` | .com | AI + 简历，和上一个镜像，两个都可备选，先到先得 |
| 5 | `jianlitongguan.com` | .com | 简历通关全拼，和“简历通关”品牌对应，适合做涨分/面试主题站 |
| 6 | `jianlijiafen.com` | .com / .cn | 简历加分全拼，价值主张直接写进域名，适合投放落地页 |
| 7 | `cvguosai.com` | .com | CV + 过筛，中英混合短域名（8 字母），国内外用户都看得懂，适合双语站主域 |
| 8 | `resumepass.com` | .com | Resume + Pass（通过），纯英文、全球通用，和英文品牌名 ResumePass 对应（见 9.5） |
| 9 | `zhijianli.com` | .com / .cn | “职简历”/“智简历”双关（zhi 既是职也是智），9 字母短，好记 |
| 10 | `offerjianli.com` | .com | Offer + 简历，结果导向（目标就是拿 Offer），适合做求职全流程品牌 |

**选域名三原则：** ① 先抢 `.com`，再补 `.cn`（同一名字两个后缀都拿下，防止被抢注）；② 宁可长一点也要拼写无歧义（`jianli` 不要缩写成 `jl`，没人记得住）；③ 定名前做三件事：注册商查是否可注册、商标局查是否已被注册、搜一下是否已有同名站。

---

## 9. 双语（中英文）支持

### 9.1 怎么判断用户是国内还是国外（推荐方案）

**推荐优先级（按可靠性从高到低）：手动选择（Cookie）> 浏览器语言（`Accept-Language`）> IP 归属地（`CF-IPCountry`）> 默认中文。**

| 信号 | 怎么拿（Cloudflare Workers） | 可靠性 | 注意 |
|---|---|---|---|
| 手动切换 | 页面右上角“中文 / EN”按钮，点后写 Cookie `locale=zh\|en`（1 年），下次直接读 Cookie | ★★★★★ 最高 | **必须有**，且切换后要跳到同一页面的另一语言版（如 `/pricing` ↔ `/en/pricing`），不要跳回首页 |
| 浏览器语言 | `request.headers.get('Accept-Language')`，解析 `zh-CN,zh;q=0.9,en;q=0.8` 取最高权重的支持语言 | ★★★★ | 比 IP 准：人在国外但浏览器是中文的，大概率是中国用户；反之亦然 |
| IP 归属地 | Workers 免费自带：`request.cf.country` 或请求头 `CF-IPCountry`（两位国家码，如 `CN/US/GB`），零延迟、无需调外部 API | ★★★ | **只能作兜底，不能作唯一依据**：人在瑞士可能说法语/德语/意大利语，在美国的华人也可能要中文；VPN 会误判 |
| 默认 | 以上都没有 → 中文（因为你的基本盘是国内用户） | — | 英文站默认语言是英文的站点才默认英文，你的站默认中文 |

**Workers 里最简单可靠的做法（伪代码，10 行）：**

```js
// 只在访问根路径 / 或无语言前缀时做一次判断；/en/xxx 直接返回英文，不再判断
const cookie = request.headers.get('Cookie') || '';
if (cookie.includes('locale=en')) return redirect('/en' + path);
if (cookie.includes('locale=zh')) return redirect(path); // 中文在根路径
const al = request.headers.get('Accept-Language') || '';
if (al.startsWith('en') || al.includes('en-US')) return redirect('/en' + path);
const country = request.cf?.country || request.headers.get('CF-IPCountry');
if (country && country !== 'CN' && country !== 'HK' && country !== 'TW' && country !== 'MO')
  return redirect('/en' + path);
return fetch中文版; // 默认中文
// 关键：只对 / 做 302 跳转（不要 301，方便用户改主意）；/en/xxx 和 /xxx 本身不跳转；
// 爬虫（Googlebot）不要按 IP 跳转，否则 hreflang 会乱。
```

**不要做的事：** ❌ 只按 IP 强制跳转且不给手动切换（海外华人会被误伤）；❌ 用 `?lang=en` 查询参数做语言区分（SEO 差，见 9.2）；❌ 对每个请求都 `Vary: Accept-Language`（缓存会爆炸成几百个版本，正确做法是只把语言前缀放进缓存键）。

### 9.2 页面结构：同一套页面自动切换文案，还是 `/en/` 单独一套？

**推荐：同一套页面 + 两套词典 + `/en/` 子目录（不要做两套独立站）。**

| 方案 | 做法 | 优点 | 缺点 | 结论 |
|---|---|---|---|---|
| A. 同一套页面 + 词典切换（推荐） | 一套 HTML/组件，文案全抽到 `zh.json / en.json`（如 `{"cta":"开始优化","cta_en":"Optimize My Resume"}`），路由 `/` 中文、`/en/` 英文，Worker 按路径选词典渲染 | 只维护一套逻辑/样式，改功能不用改两遍；SEO 友好（两个 URL 各自被收录） | 翻译要人工校对，不能机翻直出 | **首选**，个人开发者唯一可持续的做法 |
| B. `/en/` 单独一套英文页面 | 英文站另写一套 HTML | 可针对海外用户完全定制 | 维护量 ×2，改一个按钮要改两处，很快烂尾 | 不推荐 |
| C. 同一 URL、前端 JS 按语言换文案 | 一个 URL，JS 读 `navigator.language` 再替换文本 | 最省事 | SEO 灾难（搜索引擎只看到一种语言）、首屏闪烁、分享链接无法指定语言 | 不要用 |

**SEO 必须做的 3 件事：**

```html
<!-- 每页 <head> 里放 hreflang，互相指向、必须成对出现，缺一不可 -->
<link rel="alternate" hreflang="zh-CN" href="https://你的域名/pricing" />
<link rel="alternate" hreflang="en" href="https://你的域名/en/pricing" />
<link rel="alternate" hreflang="x-default" href="https://你的域名/pricing" />
<!-- html 标签：中文页 <html lang="zh-CN">，英文页 <html lang="en"> -->
<!-- 每个语言版有自己的 canonical（指向自己），sitemap 分 zh/en 两份 -->
```

子目录（`/en/`）比子域名（`en.你的域名`）好：共享主域权重、Google 官方推荐、Cloudflare 上不用多配 DNS。不要用 ccTLD（如另买 `.us` 域名）做英文站，权重从零开始。

**翻译范围（按优先级）：** ① 首页/定价/支付页（必须全翻）；② 工具页按钮/提示/报错（必须全翻）；③ ATS 评分的“修改建议”文案（必须按语言出，不能中文建议配英文简历）；④ 博客文章（先不翻，等有量再挑 3–5 篇翻）；⑤ 法律/隐私条款（英文版要重写，不能机翻）。

### 9.3 AI 改写和 ATS 评分要不要支持英文简历/英文 JD？提示词和评分规则有什么不同？

**要支持，但要当成“第二套规则 + 第二套提示词”做，不能直接翻译中文版。** 原因：中英文简历的规范、ATS 平台、关键词形态都不同。

| 维度 | 中文简历/JD | 英文简历/JD | 落地差异 |
|---|---|---|---|
| **ATS 平台** | 北森、Moka、用友大易（严格解析 + 关键词） | Workday、Taleo、Greenhouse、Lever、iCIMS、Ashby（现代系统加语义匹配） | 评分权重不同：英文版 d2 关键词可降到 0.30，d4 经历/d6 量化提到 0.20–0.30（Lever 经历权重 0.30、量化 0.20） |
| **关键词形态** | 中文词（数据分析、用户增长），需分词 + 同义词表 | 英文词需小写 + 词形还原（`managing→manage`），缩写与全称算同一词（`PM=Project Manager`） | 英文关键词抽取先做 `lowercase + 去停用词 + 取 JD 高频词 Top 20` 即可，比中文简单 |
| **评分公式** | 见 2.2（6 维度加权） | 同一套公式，但现代英文 ATS 是加权组合：`score = α·cosine(embedding_resume, embedding_jd) + β·BM25(resume, jd_keywords) + γ·skill_overlap + δ·硬过滤（年限/地点/授权） − ε·负面特征（频繁跳槽/空档）`——确定性版先做 BM25/关键词部分，语义部分留给 LLM 打分 | 英文版要多算一项：**技能位置权重**（技能在标题/总结/技能区顶部的得分高于埋在第三份工作第四条 bullet 里） |
| **格式** | 1–2 页均可，照片/年龄/性别常见 | **1 页为主（<10 年经验），超过 10–12 年才 2 页；不要照片、不要年龄/性别/婚姻状况**；单栏、标准标题（`Experience / Education / Skills`） | 英文模板要去掉照片栏，页数扣分更严（>2 页直接扣） |
| **Bullet 写法** | 动词开头 + STAR，中文动词（主导/推动/优化） | **每条以强动词过去式开头（之前的工作）/现在式（现职），不用 “I”**；公式 X-Y-Z：`Accomplished [X], as measured by [Y], by doing [Z]`；动词库：`Led / Spearheaded / Architected / Streamlined / Generated / Delivered`，弱动词（`helped / worked on / responsible for`）要扣分 | 英文提示词要加：`Start every bullet with a strong action verb in past tense; no pronouns; quantify every bullet if possible` |
| **量化** | %、金额、人数都算 | 同上，但英文更看重 **$ 金额、% 提升、规模（users/revenue）** 三类；量化 bullet 的面试邀约率被多家资料称高约 40%（厂商/经验口径，仅作参考） | d6 算法相同（`含数字 bullet / 总 bullet`） |
| **软技能** | “沟通能力强/抗压”可写在自我评价 | **英文 ATS/招聘官对自评软技能打折很厉害**（`leadership / communication / teamwork` 单列是减分项），要通过 bullet 证明，不要单列 | 英文提示词加：`Do not list soft skills; demonstrate them through bullets` |
| **提示词差异** | 见 3.2 | 系统提示词加：`You are a senior technical recruiter in the US; rewrite for Workday/Greenhouse/Lever ATS; use exact JD title in sentence one of summary; under 50 words for summary; do not invent metrics—use [X] placeholder` | 两套提示词分开存（`prompt_zh` / `prompt_en`），按简历语言自动选，不要混用 |
| **语言检测** | — | 上传后先检测简历语言（中文字符占比 >30% → 中文；否则英文），再选评分权重 + 提示词；JD 语言与简历语言不一致时提示用户（“简历是中文、JD 是英文，是否翻译 JD？”） | 检测用字符统计即可，不用调 AI |

**上线顺序：** 中文版先跑通 → 英文版只做“ATS 评分 + 改写”两个功能（模板先复用同一套单栏模板，换英文标题即可）→ 英文博客/营销后置。

### 9.4 国外用户付费怎么解决（Stripe / PayPal 是否适合个人开发者）

**先说结论：Stripe 很好接，但对你不可用；PayPal + Merchant of Record（MoR）才是你的主方案；USDT 是补充（见 5.2）。**

| 渠道 | 中国大陆个人能否开户 | 费率（2026-10 公开价） | Cloudflare 上好不好接 | 结论 |
|---|---|---|---|---|
| **Stripe** | ❌ **不能**。Stripe 支持国家名单不含中国大陆；中国大陆个人/公司都开不了户。变通：注册美国公司（Stripe Atlas 约 $500 起）或香港公司再开 Stripe 户，成本高、维护重 | 美国 2.9% + $0.30/笔，国际卡 +1.5%，货币转换 +1%，订阅 Billing +0.7% | ✅ 非常好接（见下） | **技术上最成熟，但资格上不可用**，不要作为首选；只有当你未来注册了境外公司才考虑 |
| **PayPal（中国个人卖家）** | ✅ **能**。2026-01 起 PayPal 中国开放个人卖家注册，无需营业执照，凭身份证实名（18 岁以上）+ 银行卡即可；注册 PayPal.cn 并接受跨境协议 | 境外付款 **4.40% + $0.30/笔**；提现到国内银行卡：$20 起提，0.5%（至 2026 年底，标准 1.0%）+ 6% 增值税；美元电汇 $35/笔 | ✅ 好接：PayPal Checkout JS SDK 前端 + Worker 验单 | **国外收款首选**：覆盖 200+ 国家，用户信任度最高 |
| **Paddle（MoR）** | ✅ 能，个人/个体户可开，中国不在不支持名单，人民币电汇收款 | **5% + $0.50/笔**（全包，含税） | ✅ 好接：Checkout 链接 + Webhook | 适合订阅制，税由 Paddle 代缴，省心但费率高 |
| **Creem（MoR）** | ✅ 能，支持中国大陆，个人可通过支付宝收款（单笔 ≤5 万元、每年 30–60 万元） | **3.9% + $0.40/笔**，无国际附加费 | ✅ 好接 | 费率最低的一档 MoR，但 2026-10 有社区反馈“8 月后不再推荐”，开户前要再核实最新口碑 |
| **Dodo Payments（MoR）** | ✅ 能，2026-03-23 起中国在接受名单，身份证 + 自拍（Persona）验证 | **4% + $0.40/笔**，国际 +1.5%，订阅 +0.5% | ✅ 好接 | 费率居中，支持订阅/按量计费 |
| **Lemon Squeezy** | ⚠️ 不清（只通过 PayPal 向大陆卖家付款） | 5% + $0.50，国际/PayPal/订阅各 +1.5%/+1.5%/+0.5% | ✅ | 2026-01-28 CEO 称支持放缓、团队转向 Stripe Managed Payments，**新站慎选** |
| **USDT** | 见 5.2（只面向境外用户） | 网关 0.25%–1%，手动 0% | ✅ 见 5.2.3 | 补充通道，适合 crypto 用户 |

**MoR 是什么（为什么对你重要）：** Merchant of Record 是“法律上的卖家”——它替你收钱、代缴全球销售税/VAT、处理退款/拒付，你只管收 payout。个人开发者没有境外公司、搞不定各国税务时，MoR 是唯一合规省事的路；代价是费率比 Stripe 高约 2 个点。

**Stripe 在 Cloudflare 上怎么接（供未来有境外公司时参考，技术本身很成熟）：**

```
1. 用户点订阅 → Worker POST /api/stripe/checkout（调 Stripe API 创建 Checkout Session，
   mode=subscription 或 payment，带 price_id + 用户邮箱 + metadata{user_id, plan}）
   → 返回 Checkout URL → 跳转到 Stripe 托管支付页（你不用碰卡号，无 PCI 负担）
2. 用户付完 → Stripe 发 Webhook 到 Worker POST /api/stripe/webhook
   → Worker 必须用 Stripe.webhooks.constructEventAsync() + SubtleCryptoProvider 验签
     （Workers 是 V8 隔离环境，没有 Node crypto，不能用同步 constructEvent()）
   → 处理 checkout.session.completed / customer.subscription.updated / deleted
     → 写 D1/KV 开通权益（Stripe 是账单事实来源，KV 只是缓存）
3. 密钥放 wrangler secret（STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET），不要放前端；
   Webhook 要 5 秒内回 200，否则 Stripe 会重试；处理要幂等（同一 event_id 只处理一次）。
```

**国外定价（接 5.3）：** 英文站标 **$1.99 / $3.99 / $19.99**（按次/包月/终身），PayPal/卡按美元收，USDT 按 1:1 收同等数额 USDT。不要在英文站挂人民币价。

### 9.5 英文品牌名 + 域名（3–5 个，和中文名分开列，未查注册）

> 原则：纯英文、≤2 个词、能拼读、能注册 `.com`。以下名字**未查商标、未查域名是否被注册**，仅给创意方向。

| # | 英文品牌名 | 对应域名创意 | 含义 / 为什么好 |
|---|---|---|---|
| 1 | **ResumePass** | `resumepass.com`（首选 .com） | Resume + Pass（通过），直接对应 ATS 过筛卖点，全球用户 3 秒懂；和中文“简历过筛”同义，可做中英品牌对 |
| 2 | **HireScore** | `hirescore.com` | Hire + Score（招聘分），突出“评分”功能，适合 ATS 打分入口；短、好记 |
| 3 | **TailorCV** | `tailorcv.com` | Tailor（量身定制）+ CV，突出 JD 定向改写；动词感强，适合 Slogan “Tailor your CV to every job” |
| 4 | **OfferReady** | `offerready.com` | Offer + Ready（为 Offer 做好准备），结果导向，积极、好记，适合做求职全流程品牌 |
| 5 | **SnapResume** | `snapresume.com` | Snap（咔嚓一下）+ Resume，突出“快”（1 分钟出分、30 秒改写），年轻化，适合社交传播 |

**中英品牌搭配建议：** 中文主品牌“简历过筛” + 英文主品牌 **ResumePass**（同义对译，域名 `jianliguosai.com` + `resumepass.com` 可并行，或主域用一个、另一个跳转）；如果只想维护一个域名，选 `cvguosai.com`（第 8 节第 7 个，中英混合，国内外都看得懂）。

**ICP 备注（域名与备案）：** `.com` 和 `.cn` 域名本身全球都能解析；但**在中国大陆境内提供网站服务需要 ICP 备案**（信息类用 ICP 备案、经营性收费服务用 ICP 许可证），备案一般 4–8 周、首页要展示备案号；Cloudflare 中国网络（China Network）还要求企业版 + ICP + 京东云内容审核。个人开发者常见做法：先用 Cloudflare 全球网络（非中国节点）+ `.com` 跑起来，国内访问速度可接受，等有收入再办备案/上中国节点——不要一开始就被备案卡住上线。

---

## 推荐的功能优先级排序（先做哪 3 个就能上线赚钱）

| 优先级 | 功能 | 为什么先做 | 收费点 |
|---|---|---|---|
| **P0（第 1 周上线）** | **① ATS 确定性评分 + JD 关键词缺口清单**（免费 1 次/天，不调 AI） | 零 AI 成本、毫秒出分、最容易传播（“测测你的简历能打几分”）；是所有付费的入口 | 免费引流；超过 1 次后引导付费 |
| **P0（第 1–2 周）** | **② AI 按 JD 改写（STAR + 量化）+ 改前/改后评分对比** | 用户愿意为“涨分看得见”付钱；一次改写只调 1 次 AI，成本可控（OpenRouter 免费额度内） | **9.9 元/次**（1 次改写 + 导出 1 次） |
| **P0（第 2 周）** | **③ 导出 PDF/Word + 历史记录（一岗一版）+ 支付开通** | 没有导出，用户改完也带不走；没有历史，用户不会复购；没有支付，前面都白做 | **19.9 元/月、99 元终身**（月/终身含导出不限 + 每月改写次数） |
| P1（第 3–4 周） | 简历模板（4 套 ATS 友好模板）+ 手动/自动支付回调（微信 Native + 支付宝当面付） | 模板是加分项不是必需项；支付先手动跑通再自动化 | 模板解锁放进月/终身会员 |
| P1（第 4 周） | 英文版（`/en/` + 英文评分/改写）+ PayPal/USDT 收款 | 有 P0 再扩英文，边际成本低 | $1.99 / $3.99 / $19.99 |
| P2（以后） | 模拟面试、投递看板、薪酬谈判、1v1 辅导 | 这些是 AI 简历姬/100分简历的后半程功能，等有付费用户再做 | 单独收费或放进高阶会员 |

**一句话：先让用户免费测分、付费改写、导出带走——跑通“测分→改写→导出→付费”闭环，再谈模板和面试。**

---

## Could not verify / Open questions

1. **竞品定价不一致：** 超级简历月卡有 ¥29、¥59 两种说法，年卡 ¥198 相对一致；知页月费有 ¥18、¥19.9、¥25 三种说法。以上均引自第三方横评/App Store 列表，**未逐一打开官网核实**，写定价对比时请以各官网实时价为准。
2. **厂商自称数字未验证：** AI 简历姬“ATS 通过率 96.8%”、100分简历“面试邀约率 +120%”、各家“75% 简历被 ATS 淘汰”均为厂商/经验口径，无第三方审计，不要直接引用为事实。
3. **名字与域名均未核查：** 第 7–9 节所有中文名、英文名、域名**均未查商标局、未查注册商是否可注册**，仅为创意方向；定名前必须核对。
4. **支付政策会变：** 微信/支付宝费率以商户后台签约价为准（行业不同费率不同）；PayPal/Paddle/Creem/Dodo 对中国大陆个人的开户政策、费率以各官网 2026-11-09 之后版本为准；USDT 相关政策以 2026-02-06 八部门文件及后续文件为准，本报告不构成法律建议。
5. **OpenRouter 免费名单轮换快：** 2026-10-27 的免费名单以 Nemotron 3/3.5 系列为主，但名单每几周就换，**上线前务必调一次 `openrouter.ai/api/v1/models` 核对 `:free` 名单**，不要硬编码单一模型 ID；建议用 `openrouter/free` 路由器做兜底。
6. **Workers 免费层实测缺口：** `unpdf` 在 Workers 免费层解析大 PDF 是否超 10ms CPU，取决于文件大小，未做实测；建议先做浏览器端解析兜底。
7. **.cn 域名与 ICP：** 本报告未核实你现有博客的备案主体是否能复用到新域名；新域名如需在国内合规经营，需另行确认备案流程。

## Sources

- ATS 方法论（公式/权重/扣分表，verified live 2026-11-09）：https://ats.jilva.dev/docs/scoring/methodology/
- ATS Resume Optimizer Skill（Apache-2.0，JD 六级分类）：https://github.com/ADAM-0S/wayland-m3ta-0s/blob/HEAD/src/process/resources/skills-library/bodies/skills/career-development/ats-resume-optimizer/SKILL.md
- AI Resume Suite 技术指南（`ats.js` 结构 70% + 关键词 30%）：https://www.2hipfortheroom.com/AIresume/technical_guide.html
- ResumeAI ATS 计分（纯数学）：https://deepwiki.com/narniavinash05/resumebuilder/6.2-ai-resume-generation-pipeline
- Reactive Resume on Cloudflare（PDF 需 Paid、R2/Durable Objects）：https://docs.rxresu.me/self-hosting/cloudflare
- unpdf on Cloudflare Workers：https://deepwiki.com/unjs/unpdf/4.1-cloudflare-workers
- Workers 免费层限额（100k 请求/天、10ms CPU）：https://convika.com/compare/cloudflare-workers-free-plan/
- OpenRouter 免费限额（20 RPM、50/1,000 RPD）：https://pinggy.io/blog/free_ai_model_apis_unlimited_tokens_openrouter/ ；https://klymentiev.com/blog/openrouter-free-tier ；https://www.developersdigest.tech/models/free-api/openrouter
- 提示词模板：https://www.cvbranch.com/guides/chatgpt-resume-tailoring-prompts/ ；https://www.shashiworks.com/chatgpt-job-hunt.html ；https://alloquy.app/blog/resume-prompts ；https://github.com/hferello/ai/blob/HEAD/ats/resume-improvement-prompt.md
- 竞品横评：https://aicoding.csdn.net/6a687792662f9a54cb9536c7.html ；https://www.ithome.com/1/004/863.htm ；https://feizhuke.com/sites/chaojijianli-wondercv.html ；https://www.resumemakeroffer.com/page/ats_checker ；https://apps.apple.com/cn/app/%E7%9F%A5%E9%A1%B5%E7%AE%80%E5%8E%86-%E5%88%B6%E4%BD%9C%E6%B1%82%E8%81%8C%E7%AE%80%E5%8E%86%E6%A8%A1%E6%9D%BFapp/id1191748979?mt=8 ；https://www.cnblogs.com/hr-resuem/p/21428356
- 国内支付：小金商户助手 https://jinshuju.net/guides/indie-hacker-payment-solution-jsj ；微信小微 0.38–0.6% https://jinshuju.net/guides/personal-payment-tools-comparison-jsj ；支付宝当面付 0.6% https://opendocs.alipay.com/open/194/105072 ；微信 Native 支付（需认证服务号/小程序 300 元/年）https://mdnice.com/writing/97a7048b0b604130a13a53bd9271df48 ；微信商户结算 T+1 https://m.pcwap.net/h-nd-3201.html
- 双语/国际化：Cloudflare Workers 地理路由 https://d96e35ee.10-efx.pages.dev/30251203rf03/ ；缓存与语言协商 https://www.headless-cms-integration.com/data-fetching-caching-strategies/content-delivery-network-routing-logic/ ；i18n 子目录 + hreflang https://github.com/pageweave/builder/blob/HEAD/src/engine/resources/skills/pageweave-i18n/SKILL.md ；https://www.weglot.com/guides/website-internationalization ；https://www.kukalaya.com/blog/multi-language-websites-technical-guide-to-internationalization
- 国外支付：大陆个人收款平台对比 https://jasonzhu.ai/en/go-global/payments ；https://getpaidatlas.com/country/china ；https://jasonzhu.ai/en/blog/choose-payment-platform-2026 ；Stripe on Workers（SubtleCrypto 验签）https://github.com/chanmeng666/library-os/blob/HEAD/docs/stripe-cloudflare-integration.md ；https://github.com/justbuildstuff-dev/fitness-app/issues/515
- USDT：接受 USDT 指南 https://www.helm.business/guides/how-to-accept-usdt-payments-business ；TronGrid TRC-20 查询 https://developers.TRON.network/docs/get-trc20-transaction-history ；自托管 USDT 方案（含 only_confirmed 坑）https://github.com/tiklabari-cpu/miracle-skills/blob/HEAD/skills/usdt-trc20-payments/SKILL.md ；网关对比 https://aurpay.net/aurspace/nowpayments-alternatives-compared-2026/ ；USDT 汇率 1 USDT=6.6798 CNY（2026-11-09）https://www.migrapay.com/exchange-rate/usdt-to-cny ；CoinPaprika 6.67 CNY https://coinpaprika.com/converter/cny-chinese-yuan/usdt-tether/1
- 虚拟货币合规：2026-02-06 八部门通知 https://www.csrc.gov.cn/c100028/c7614318/content.shtml ；2021 924 通知 https://jr.sz.gov.cn/sjrb/ztzl/yshjzck/tzgg/content/post_11140529.html
- ICP 备案：https://developers.cloudflare.com/china-network/concepts/icp/
- 本地笔记：`notes/source-ats-methodology.md`、`notes/source-cloudflare-openrouter.md`、`notes/source-competitors-payment.md`、`notes/source-bilingual-payments.md`

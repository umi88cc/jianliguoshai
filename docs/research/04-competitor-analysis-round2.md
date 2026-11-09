# 第二轮 AI 简历工具竞品分析（不重复第一轮 12 个）

**目标：** 中国个人开发者，做中英文双语 AI 简历优化站（JD 定向改写 + ATS 评分），跑在 Cloudflare 免费层 + 免费 AI Key。
**第一轮已分析、勿重复：** 超级简历、AI 简历姬、知页、100分简历、简历本、乔布简历、Resume.io、Novoresume、Rezi、Kickresume、Teal、Jobscan。
**研究时间：** 2026-11-09。定价为多源交叉核对，仍以官网结账页为准；价格冲突处已标注。
**核验方式：** `verified live` = 研究浏览器 / browser_open 当日打开官网核实；`index` = 网页搜索多源交叉，未逐一打开官网。FlowCV 定价、五百丁首页、52cv 首页、CVMaker 定价页、Magic Resume（知遇）GitHub README 为当日 live 核验。

## Summary（先说结论）

- **本轮最值得抄的不是“更多模板”，而是三类第一轮 12 个里没有或很弱的东西：**（1）**可解释的评分**——Resume Worded 的逐行扣分、职徒的 200+ 因子、VMock 的 Impact/Presentation/Competencies 三维度、Enhancv 的 27 项检查；（2）**“AI 提建议、用户逐条采纳”的交互**——Magic Resume（知遇）Polaris 的 diff 提案 + 防编造检查，这是对 JD 定向改写最友好的形态，也最省 token；（3）**简历之外的留存钩子**——VisualCV 的成就日记 Career Journal、猎聘的 30 天投递诊断、智联职悟空的长期记忆 + Offer 对比、ResumeNerd 的“浏览职位时一键补技能”。
- **不要抄的坑（简单提一句）：** Zety / ResumeGenius / MyPerfectResume / ResumeNerd / CVMaker 的“免费建、TXT 才能下 / PDF 要 $2.95 试用后自动续 $23.95/4 周”模式——转化靠误导续费，投诉重灾区，个人开发者口碑成本极高；Enhancv 双栏花哨模板的 ATS 解析风险；VMock 的视频眼神分析、DeepHire 的自动投递、猎聘/Boss 的薪资大数据——免费层做不了或有合规/反爬风险。
- **Cloudflare 免费层 + 免费 AI Key 的总判断：** 前 8 项可直接抄或轻度简化（纯前端规则 + 结构化 LLM 输出 + 每日限额 + 缓存）；模拟面试（文字版）、技能缺口、Offer 对比、成就日记、在线简历链接可简化抄；视频面试分析、实时薪资数据库、自动投递、LinkedIn 官方导入、40K 技能 taxonomy 抄不了。

---

## Findings

### 中国产品

#### 锤子简历 — 100chui.com
- **独特好功能：** 1000+ 模板（30+ 行业）、智能排版引擎（自动对齐、统一字号间距、模块拖拽、所见即所得）；AI 诊断按内容完整性 / 关键词匹配度 / 数据量化程度评分；AI 面试模拟（多源称 V2.8 新增）；证件照制作；HR 定制 1v1 服务。
- **怎么做 / 体验：** 选模板 → 填内容 → 自动排版 → AI 诊断给分和关键词建议 → 一键导出 PDF/Word/PNG；多端同步（PC/小程序/H5）。
- **定价：** 基础模板 + 基础 AI 诊断免费；免费可建 3 份、AI 诊断仅 1 次体验。付费口径冲突：月会员约 ¥15.9（不含 AI 诊断）、尊享版 ¥29.9 买一送一、终身 ¥49.9；另有来源称 ¥29/月或 ¥99/年。人工优化单次 ¥159（应届生）起，10 年以上 ¥349。
- **缺点：** 下载 / 打印 / 投递都要会员；AI 出稿被多家横评评为“中庸”，复杂经历仍需手改；ATS 适配官方未明确背书，投大厂前需自验。
- 来源：https://www.100chui.com/ ；https://aicoding.csdn.net/6a6872cb10ee7a33f2935e58.html ；https://www.douban.com/note/830296243/ — `index`

#### 五百丁 — 500d.me
- **独特好功能：** **本地简历导入最全**：支持 PDF / Word / WPS / Markdown / Pages（≤10MB，PDF ≤10 页）自动提取个人信息、工作、项目、教育并填入模板，招聘站 HTML 也可导；**求职管理**：自动记录各公司岗位投递状态（投递 / 面试 / 入职 / 归档），进度一目了然；**作品集嵌入**：简历内嵌作品链接，设计 / 开发 / 文案岗可直接展示作品；5000+ 内容范例、2748 个岗位范例、90 种风格（时尚 / 创意 / 简洁 / 经典）；AI 诊断免费不限次数（多家测评）；社交主页、语言能力、校园活动模块。
- **怎么做 / 体验：** 选模板 → 填内容或上传旧简历自动解析 → 一键换模板（最近一份简历内容自动带入新模板）→ 投递后在求职管理里改状态。
- **定价：** 免费建 3 份、在线投递 10 份；高级会员约 ¥29.9–38/年、终身 ¥39.9–48（App 内购：高级 ¥38、终身 ¥48），终身可建 100 份、Word 模板 30 套/天；Word 模板单买 ¥9.9–15.9；**PDF 下载要会员**。
- **缺点：** AI 弱，多源称“无专门 AI 简历功能”、ATS 仅部分适配；模板要逐个付费或开会员；导出是付费墙。
- 来源：https://www.500d.me/ — `verified live`（2026-11-09 打开首页）；https://www.500d.me/newcvresume/edit/ ；https://www.nowcoder.com/discuss/355730267078709248 — `index`

#### 实习僧简历 — resume.shixiseng.com
- **独特好功能：** **浏览器插件“AI 简历填充”**：在实习僧完善在线简历后，一键把信息精准填充到企业校招官网，填充率自称超 80%，投递后插件自动识别并记录投递、汇总归档到实习僧，简历更新后插件同步更新；加密传输、不存储不截留。定位是实习 / 校招，模板简洁、更新快。
- **怎么做 / 体验：** 实习僧内做一份在线简历 → 装插件 → 打开企业校招官网点填充 → 投递自动被追踪归档。
- **定价：** 求职者基础免费 + 付费（AI 知见核验 2026-08-26）；**未找到独立简历会员价**，见“Could not verify”。
- **缺点：** 简历本身不是独立 AI 工具——无 AI 诊断 / 评分 / JD 改写的可靠证据；强绑定实习僧岗位库，社招弱；功能浅。
- 来源：https://resume.shixiseng.com/ ；https://resume.shixiseng.com/extension_tools — `index`

#### Boss 直聘简历工具 / DeepHire — deephire.cn
- **独特好功能：** **DeepHire（2026 年 3 月内测，BOSS 自研南北阁大模型，全链路 AI Agent）**：求职者端按目标 JD 润色简历、量化成果、突出匹配关键词、语法 + 排版检查（自称润色后评分 +30%）；**7×24 自动投递**（每天推荐 10–20 岗、自动投递并同步状态）；**智能匹配**（语义理解 + 多维画像 + 双向匹配，自称准确率 85%+）；岗位咨询、薪资查询、职业规划、AI 代聊 / 约面；HR 端 AI 生成 JD、智能筛选、代聊邀约、数据看板。
- **怎么做 / 体验：** BOSS 账号登录 DeepHire 网页端 → 我的简历点 AI 润色 → 开自动投递开关、设求职意向 → AI 每天推岗自动投，等 BOSS 开聊。
- **定价：** 求职者端核心功能免费（官网说法，内测期免费）；企业端付费。
- **缺点：** 内测、封闭生态（数据不出 BOSS）；宣传数字（+30%、85%、效率 10 倍）无独立验证；自动投递有海投质量 / 账号风险争议，个人站抄自动投递还有反爬与平台 ToS 风险。
- 来源：https://www.deephire.cn/ ；https://www.bosszhiping.com.cn/download.html ；https://web.fly63.com/nav/5018 — `index`

#### 智联招聘简历 / 职悟空 — wukong.zhaopin.com、ai.zhaopin.com
- **独特好功能：** **职悟空（2026-07-18 WAIC 发布）五大环节全流程**：个人画像（对话梳理经历与职业价值观）→ 简历定制（AI 诊断 + 岗位定制）→ 岗位匹配（智联 30 年真实岗位库，不编造岗位）→ 模拟面试（按目标岗定制题、调回答框架）→ **Offer 分析**（薪资 / 发展前景 / 工作环境多维对比）；**业内首个职业生涯长期记忆系统**：跨会话持续记录职业经历、成长轨迹、偏好，越用越懂你，关键节点主动提醒（投递窗口快关、计划未完成、无反馈）；智联求职 AI 另有 JD 适配（提炼关键词和能力证据）、投递计划（主攻 / 冲刺 / 保底分层）。
- **怎么做 / 体验：** 网页 / 小程序、游客模式，不用下 App；先对话建画像，再定向改简历，换方向时云端简历可直接调用修改。
- **定价：** 职悟空现阶段**完全免费**；智联 App 内另有 AI 简历、简历诊断，专家 1v1 简历优化 ¥388–888（按年限）、人工简历诊断 ¥199（5 年内）/¥299（5 年以上）。
- **缺点：** 聚焦应届生 / 1–3 年新人，资深适配差；与智联绑定、数据生态封闭；免费期后分层付费未定；中文场景为主。
- 来源：https://ai.zhaopin.com/ ；https://www.ithome.com/1/004/228.htm ；https://www.ithome.com/1/004/863.htm — `index`

#### 前程无忧简历 — 51job
- **独特好功能：** 求职者端 AI 简历优化、AI 职位匹配、AI 面试辅导；**七维人才分析报告**（硬性资质 / 工作内容 / 项目经验 / 行业背景 / 团队协作 / 职业稳定性 / 求职意向）；HR 端反向可抄的思路：**AI 初筛“简历匹配分层”**、**AI 淘金“简历推荐分级”**（自称省 40% 筛选时间）、**人才雷达** 7×24 扫描人才库、新简历激活即推送 HR、AI 生成职位描述（JD 写准了匹配误差才小）。
- **怎么做 / 体验：** App 内简历工具 + AI 优化按次卡使用；HR 侧是分层 / 分级标签 + 亮点提炼，不是只给一个总分。
- **定价（App 内购，CN）：** AI 简历 10 次卡 ¥39.80、VIP 30 天 ¥68、SVIP 90 天 ¥188、简历模板月卡 ¥18、谁看过我的简历 ¥28/3 个月。
- **缺点：** C 端简历只是招聘平台附庸，模板 / AI 深度不突出；按次卡 + 多档会员叠加，计费复杂；HR 端功能求职者用不上。
- 来源：https://apps.apple.com/us/app/%E5%89%8D%E7%A8%8B%E6%97%A0%E5%BF%A751job-%E6%B1%82%E8%81%8C%E6%8B%9B%E8%81%98%E6%89%BE%E5%B7%A5%E4%BD%9C/id415443644 ；https://news.zol.com.cn/1033/10332083.html — `index`

#### 拉勾简历 — lagou.com
- **独特好功能：** 没有独立 AI 简历工具，但有三点值得抄的**平台机制**：**投递实时反馈**（投递状态全程可查）；**简历处理率公示**（每家公司的简历处理率 %，求职者可避开不处理简历的公司）；**招聘者活跃时间 / 回复率展示** + 面试评价；**限制每日投递次数**（做任务 / 每日奖励提升上限，防海投、逼精准投递）；互联网垂直、技术栈筛选。
- **定价：** 求职者免费为主；App 订阅“三倍曝光连续包月 ¥163/月”是曝光类增值，非简历 AI。
- **缺点：** 无 AI 诊断 / 改写 / JD 定向的可靠证据；岗位偏互联网一线、中高端；被拒不告知原因、僵尸岗位下线慢（用户反馈）。
- 来源：搜索多源，未找到独立 AI 简历页 — `index`，见“Could not verify”

#### 猎聘简历 — liepin.com
- **独特好功能：** **免费“简历投递诊断”AI**：基于过去 30 天投递数据生成诊断（投了多少、获多少面试邀约、改进建议）；**求职经纪人** 30 天 ¥598（规划投递方向、筛高匹配岗、代投）；**面试教练** 30 天标准 ¥598 / 高端 ¥798（1v1 陪伴、视频模拟面试、面试跟踪复盘）；**求职顾问** 30 天 ¥3888（职业定位 + 投递策略 + 全流程复盘）；职场咨询 30 分钟 ¥199 / 90 分钟 ¥499；简历顾问 1v1 ¥398（1–5 年）/¥498/¥698/¥898（15 年以上），英文 ¥898；HR 端反向：简历快读 40 秒读 100 份、AI 智能邀约单次触达 1500 人。
- **定价：** 基础求职免费，上述服务按项 / 按 30 天周期收费。
- **缺点：** 中高端定位，应届 / 低薪用户性价比低；好服务全是人工高价；AI 应用相对保守（2025 年评估）。
- 来源：https://www.woshipm.com/pd/5538770.html ；https://blog.csdn.net/a1235824/article/details/149961288 — `index`

#### 简历魔法 — ⚠️ 两个同名不同产品，必须拆开
**A. 知遇 / Magic Resume（magic-resume.cn，GitHub Magic-Resume/Magic-Resume）——本轮最值得抄的开源实现**
- **独特好功能：** **Polaris AI 助手：AI 就地提修改建议，你逐条决定采纳或跳过**——每处修改以 diff 形式出现在画布上并附理由，采纳前什么都不保存；**三种模式**：共创（提修改）/ 计划（只给方案、不改动）/ 问答（完全看不到简历，后端强制边界，不只靠提示词）；缺关键信息时弹出结构化表单并暂停，刷新 / 重启后可续跑；**防编造检查**：每份修改提案与原始材料比对，标出原文找不到的雇主、日期、证书或数字；**自带 Key**：任何 OpenAI 兼容接口（DeepSeek / 豆包 / Gemini / Claude 等），Key 在浏览器加密保存；**数据本地优先**：简历存浏览器 IndexedDB，免注册，不用 AI 则内容不离浏览器；导入 PDF / Word / 图片 / Markdown / 纯文本，扫描件走视觉模型；20 套 ATS 友好模板；版本历史快照回滚；分享链接（查看 / 评论 / 编辑权限）；MCP 服务；六种工作模式：创建 / 优化 / 分析 / 翻译 / 面试 / 导出。
- **怎么做 / 体验：** 左侧编辑、中间实时预览打印效果、右侧调模板版式；AI 提案像代码 review 一样逐条过。
- **定价：** 开源版 MIT 免费；托管版 magic-resume.cn 免费额度 + 付费计划（README 未列价）。
- **缺点：** 自部署有门槛（Docker / Node 22+ / pnpm）；agent 无账号体系，公开部署前要自加鉴权。
- 来源：https://github.com/Magic-Resume/Magic-Resume/blob/master/README.zh-CN.md — `verified live`（2026-11-09 打开，20 套模板、Polaris、IndexedDB、防编造等均见 README 原文）

**B. 魔方简历 / AI 魔术简历（magic-resume.cmdragon.cn）**
- **独特好功能：** 可视化拖拽编辑、**自动一页排版**（智能调字号间距适配一页 A4）、拖拽排序模块、12 主题色 + 自定义、暗色模式、AI 润色**对比查看前后**、AI 语法检查、多格式导出（HTML / Markdown / 图片）、**AI 创建行业专属模板**（按行业自动设计样式布局）、**AI 个人网站**（简历自动生成个人站，可在线发布或导出静态 HTML）、AI 模拟面试 2.0、AI 关键词优化、AI 求职信。
- **定价：** 体验版 ¥1/天、月 ¥16.9、季 ¥39.9、年 ¥89.9；VIP 解锁全部功能。
- **缺点：** 与 A 同名易混淆；“完全免费”宣传与 VIP 墙矛盾（不同来源口径不一）；功能多但深度未知。
- 来源：https://magic-resume.cmdragon.cn/app/dashboard/vip ；https://tools.cmdragon.cn/zh/apps/magic-resume — `index`

#### 职徒简历 — 52cv.com
- **独特好功能：** **200+ 因子分析模型打分**（内容完整性 / 关键词覆盖率 / 量化程度 / 排版清晰度 / 语法错误等，修改要点一目了然，可多次迭代提分）；**一键排版**：自动一页、自动倒叙经历、全局字体 / 字号 / 行距 / 颜色 / 日期格式切换；**中英互译 10 秒**，自称准确率 98%、排版高度一致、可合并导出中英文；AI 智能改写（选中段落，基于同岗位高频词生成多风格版本供选）；AI 优化（检测表述短板、填充关键词、生成个人总结 / 项目描述）；**AI 面试押题**（按简历 + JD 生成专属题库）+ **AI 模拟面试**（中英双语实时互动、逐题反馈报告）；**AI 职业规划 + 测评**（多模型 + 就业数据趋势，可用于职业规划大赛）；智能邮件 / 求职信（简历一键插入邮件正文、个性化名片）；1 万+ 模板（风格 / 内容 / 高校模板）、500 强 HR 审核案例；求职社区 / 面经 / 题库 / 导师 1v1。
- **怎么做 / 体验：** 官网首页即突出“一键排版 全局调整 / 中英智能翻译 / 专业评测 AI 优化 / 智能邮件求职信”四块；面试模块分“专属定制 / 海量真题 / 仿真人实时互动 / 面试反馈报告”四步。
- **定价：** 基础免费、基础模板 + 3 次 AI 评测；导出 PDF 免费版带水印（多源）；会员 App 内购 1 月 $2.99 / 3 月 $4.99 / 1 年 $11.99 / 终身 $12.99（美元区），国内有约 ¥35/月说法；官网宣传“免费导出”，口径不一。
- **缺点：** 免费导出带水印、AI 评测限 3 次；模板多但质量参差；导师 / 课程增值推销重。
- 来源：https://www.52cv.com/ — `verified live`（2026-11-09 打开首页）；https://wedoingai.com/article/zhitu-review-2026 ；https://ai.fly63.com/52cv — `index`

### 国外产品

#### Enhancv — enhancv.com
- **独特好功能：** **个性化板块**：Most Proud Of（最自豪的事）/ My Life Philosophy（人生信条）/ Strengths / My Time / Day of My Life / Books / Interests，讲职业故事而非罗列经历；拖拽编辑、20+ 板块、预制内容块；内容分析器实时反馈可读性 / 长度 / 动词强度；AI 改写 bullet、生成总结 / 技能、动词建议、按 JD 生成待办清单；**Tailor 一键定制 + 13 点 ATS 检查**；**Resume Checker 27 项检查分 7 组**（ATS 要素 / 内容 / 格式等，自称基于数百 ATS 信号）；导入 PDF / DOCX / LinkedIn URL；求职板 + 追踪器 + 翻译 + 面试准备；专家人工审阅 $99/24h。
- **怎么做 / 体验：** 拖拽排版、加“最自豪”这类板块讲故事；Checker 给分项报告而非单一总分。
- **定价：** 免费 7 天、全模板、限 12 个 section 条目、带品牌水印。付费口径冲突大：官网 schema 为 Pro 月 $39 / 季 $69 / 半年 $99（$16.50/月起）；另有来源称 $19.99/月、$44.97/季、$65.94/半年。写“约 $17–39/月，地区 / 促销价差大”。
- **缺点：** 月付最贵之一；双栏模板 ATS 风险（自称解析率 99%/内部测试 96.73%，独立审计称双栏模板在 Workday 等 5 系统中仅 1 个干净解析）；AI 文案被评通用；免费基本不可用；有来源称月付不可退款。
- 来源：https://www.applyeze.com/blog/enhancv-review ；https://enhancv.com/blog/resume-highlights/ ；https://www.hrlens.io/articles/who-is-enhancv-for-honest-verdict-2026 — `index`

#### Zety — zety.com
- **独特好功能：** **按职位拉取的预写短语库**：输入职位，基于 10 年+ 简历数据 + OpenAI 给出经审核的成就型 bullet，一键添加；18 模板（另有 200+ 口径，含变体）；Smart Apply 技术；ATS Checker（30+ 问题检查 + Fix My Resume）；即时职位匹配（按简历技能推岗）；**Bold.pro 免费在线职业档案**（可被招聘者发现）；7 语言。
- **定价：** 免费建、仅 TXT 下载；14 天试用 $1.95–2.70，**自动续 $25.95/4 周**（年约 $311）；年付 $71.40（$5.95/月）。Trustpilot 4.2/5（12000+ 评）。
- **缺点：** 试用自动续费是最大槽点；无内置 ATS 分数可视化（有来源称无）；创意模板解析丢约 30% 内容；AI 通用、不针对具体 JD。
- 来源：https://enhancv.com/blog/zety-review/ ；https://owlapply.com/en/blog/zety-review — `index`

#### ResumeGenius — resumegenius.com
- **独特好功能：** **Sage 助手**：边填边 flag 弱 bullet、推荐热门技能、起草总结；**三问向导先定模板**（经验 / 教育 / 毕业）；AI 基于真实岗位画像数据给成就建议（非纯 LLM 自由发挥）；32–40 模板、18+ 配色；**数百岗位专属简历 / 求职信范例库**（内容资产）；免费版含 AI 总结生成器 + ATS Checker + 求职信 builder（求职信可免费导出 PDF/Word，简历不行）；美国职位板；AI 模拟面试 6–36 场（高阶套餐）。
- **定价：** 免费建、简历仅 TXT 下载；14 天试用 $2.95，自动续 $23.95/4 周（年约 $311）；年付 $95.40（$7.95/月）；14 天退款保证。Trustpilot 4.5/5（42000+ 评）。
- **缺点：** 同 Zety 系试用续费陷阱；模板传统保守；高阶 AI 在付费后；月付价各地说法 $23.95–29.95 不一。
- 来源：https://cvgenius.com/blog/cv-help/resume-genius-review ；https://owlapply.com/en/blog/resume-genius-review — `index`

#### MyPerfectResume — myperfectresume.com
- **独特好功能：** 与 Zety / ResumeGenius 同属 Bold LLC，功能高度同源，差异点：向导式 onboarding 被多家评为同类最顺；三种格式（年表 / 组合 / 职能型）+ 联邦模板；ResumeCheck / Smart Apply 检查（免费可见 ATS 分数，具体反馈要付费）；求职信、面试准备工具、Bold.pro 档案、职业发展网络研讨会。
- **定价：** 与 ResumeGenius 几乎相同：免费 TXT；$2.95/14 天试用 → $23.95/4 周；年付 $95.40。
- **缺点：** 与姊妹品牌同质化严重；无 JD 定向 ATS 匹配分（有对比称无）；分数“wobbly”（有评测称改个标题分数会莫名掉）；试用续费投诉（BBB）。
- 来源：https://www.whatallsay.com/myperfectresume-review/ ；http://enhancv.com/blog/myperfectresume-review/ — `index`

#### VisualCV — visualcv.com
- **独特好功能：** **在线简历托管链接 + 浏览 / 下载分析**（谁看了、看了多久、何时看，同类大厂唯一主打此功能）；**个人职业网站 / 作品集**（嵌入视频 / 图片 / 项目链接 / 推荐信）；**Career Journal 成就日记**：时间线记录成就 / 大赢、置顶、上传图片文档、可邮件回复直接记、邮件定时提醒（日 / 周 / 月）、标签搜索；LinkedIn 导入；9 语言；30+ 模板；多版本简历并行（针对不同求职方向）；高管人工写作 $899/3 天。
- **怎么做 / 体验：** 建一份简历 → 发链接给招聘者 → 后台看打开 / 下载统计，判断哪个版本有回音；平时随手记成就，写简历时直接调用。
- **定价：** 免费 1 份简历、PDF 带水印、Career Journal 试用；Pro 月 $24、季 $16/月（$48/季）、年 $9–9.08/月（$109/年），30 天退款。
- **缺点：** 免费水印 = 不可投递；**无 JD 定向改写（多源确认，任何档位都没有）**；分析只在对方打开链接时有效，附件 PDF 无追踪；Pro 功能多被锁。
- 来源：https://www.resumup.com/review-visualcv ；https://demostack.net/visualcv-review/ ；http://www.visualcv.com/blog/introducing-the-visualcv-career-journal/ — `index`

#### CVMaker — cvmaker.uk
- **独特好功能：** 20+ 模板 + 配套求职信模板、100% 可扫描（自称）、AI 写作辅助、求职追踪器（Job Tracker）、职位搜索、专家代写服务；英国 / 欧洲市场强。
- **定价（live）：** Basic £0（建 CV + 求职信、20+ 模板、AI 辅助）；Pro **£21.99/月，7 天试用 £2.95 后自动续**；下载 PDF 必须 Pro。
- **缺点：** 下载付费墙；试用自动续费投诉（Trustpilot 有“£1 后收 £20/22”投诉）；功能与 Zety 系同质、AI 深度一般。
- 来源：https://www.cvmaker.uk/pricing — `verified live`（2026-11-09 打开）

#### FlowCV — flowcv.com
- **独特好功能：** **“诚实免费”是最大卖点**：免费 1 份简历 + 1 封求职信、全部 50+ 模板、全部设计控制、无水印、无限 PDF 下载、无需信用卡；导入 PDF / DOCX / 图片 / 粘贴文本（免费 3 次导入）；看板式 Job Tracker（Pro）；学生 25% 折扣；WIRED 评“Best Free Resume Builder”。
- **定价（live）：** Free $0；Pro 年付 $5/月（$60/年，省 74%）、月付 $19（index 多源）、季付约 $15/月；14 天退款。
- **缺点：** 免费仅 1 份（多版本要付费）；**无任何档位的 JD 定向改写**（多源确认）；无 ATS 分数；仅 PDF 导出（无 Word）。
- 来源：https://flowcv.com/pricing — `verified live`（2026-11-09 研究浏览器打开，Free $0 / Pro 年付 $5/月已见页面原文）

#### Resume Worded — resumeworded.com
- **独特好功能（不是 builder，是反馈工具，第一轮 12 个里没有这种纯评分形态）：** **Score My Resume：30+ 检查（高级约 40 项）、0–100 分、逐行点评**（每条 bullet 为何弱、扣分原因）；**ATS 解析模拟**（按解析器视角展示提取文本）；**Targeted Resume / Smart Target**：粘贴 JD 得相关性分，<80 表示缺关键技能、缺失关键词清单；**LinkedIn Review** 逐节评分（对标顶尖档案）；**AutoFix** 一键按评分重写并导出 PDF/Word；250+ 真实优秀简历 bullet 样本库、100+ Word 模板。
- **怎么做 / 体验：** 上传 PDF/DOCX → 秒出总分 + 分项 + 逐行意见 → 粘贴 JD 看缺哪些词 → AutoFix 重写。
- **定价：** 免费可得分数 + headline 发现；Pro 月 $49、季 $33/月（$99/季）、年 $19/月（$229/年）；“无限”上限 250 次/月；首次购买不退款（条款）。
- **缺点：** 只读文本不读版式（双栏排版丢分测不出）；分数是自家量表非雇主标准；月付贵；75% off 倒计时促销套路；英语简历限 2MB。
- 来源：https://owlapply.com/en/blog/resume-worded-review ；https://www.applyeze.com/blog/resume-worded-review ；https://www.lumyhired.com/blog/resume-worded-alternatives-2026 — `index`

#### VMock — vmock.com
- **独特好功能：** B2B2C（卖给大学 / MBA / 雇主，学生免费）。**SMART Resume：100+ 参数评分**（语言 / 技能 / 呈现），**Impact / Presentation / Competencies 三大维度**、0–100 分、80+ 为绿区、可对标同专业样本 benchmark；**SMART Skills Engine：40K+ 技能 taxonomy NLP 映射**、技能缺口 + 推荐课程；**Career Fit**：画像 vs 岗位特征、行动计划补缺口；Aspire LinkedIn 优化；**SMART Pitch：视频电梯演讲 / 模拟面试，计算机视觉分析眼神 / 肢体语言 / 语调 / 音高 + 内容**；SMART Wall of Jobs 按匹配度排序职位流；每学年 10–20 次提交上限（昆士兰大学：10 次）。
- **定价：** 无公开个人价、无自助注册；机构询价（有第三方称个人约 $19.95，口径不明）；大学采购例：华盛顿大学 $115,763/3 校区。
- **缺点：** 个人买不到；提交次数少；只评通用质量、不针对具体 JD；视频分析在免费层无法实现。
- 来源：https://aitools.fyi/vmock-dashboard ；https://employability.uq.edu.au/get-the-edge/faculty-programs/bel/vmock-resume-tool — `index`

#### Skillroads — skillroads.com
- **独特好功能：** **AI Robo：5 分钟问卷 → 自动生成简历**（零基础用户不用面对空白页）；**Smart Resume Review：21 项常见问题检查、ATS 就绪评分**（PDF/DOC/DOCX ≤5MB）；求职信生成器（从简历抽关键能力）；Fortune 500 职位匹配；信息图模板；人工代写 $100 起（简历 + 求职信 $140、+LinkedIn $215，14 天内 3 次免费修改）；职业测试 / 教练。
- **定价：** 免费 1 模板 + 水印；Starter $4.95/月（全模板、无水印、限 1 页）、Pro $9.95/月（多页 + 求职信）、Premium $14.95/月（+ 职位匹配 + LinkedIn builder）；另有来源称约 $12.95/月、14 天退款 + 60 天面试保证（宣传）。
- **缺点：** 问卷生成常不准（评测称不能准确反映技能）；信息图模板 ATS 难解析；定价口径乱；人工代写贵。
- 来源：https://aitools.fyi/skillroads ；https://brianvanderwaal.com/best-ai-resume-builder/ — `index`

#### Hloom — hloom.com
- **独特好功能：** 本质是**模板库而非 AI 工具**：400+ Word / Google Docs 模板（另有 200+ 口径）、求职信 / 推荐信模板、按职位给预写短语 / 职责 / 成就、填表向导、拼写检查、写作提示；可下载 Word/Google Docs 直接编辑。
- **定价：** 模板本身免费下载为主；builder 下载 PDF 要 $1.95/14 天（有来源）；付费约 $9/月（对比来源）。
- **缺点：** AI 极弱（无 JD 定制、无 ATS 评分、无职位搜索、无面试）；免费下载限 TXT（有来源）；模板多但同质；与第一轮 Resume.io 等重叠度高。
- 来源：https://www.careerstanding.com/vs/hloom — `index`

#### ResumeNerd — resumenerd.com
- **独特好功能：** **JobNerd / Job-Fit Meter：边浏览职位流边看匹配百分比，JD 里缺的技能可一键添加到简历**；**ResumeScore AI 评分满分 1000 分制**，逐项改进清单；按职位预写 bullet、AI 关键词匹配 JD；薪资谈判信模板；向导式分步 builder。
- **定价：** 免费建、**下载 / 打印 / 保存全锁**；14 天试用 $2.75 → 自动续 $23.75/月；年付 $99.95。
- **缺点：** 导出即付费墙（同类最严之一）；求职信是套模板非 AI 生成（Zapier 实测）；自动续费投诉多；与 Zety 系同质。
- 来源：https://resufit.com/blog/resumenerd-pricing-is-resumenerd-free-detailed-guide-to-free-vs-paid-features/ ；https://zapier.com/blog/best-resume-builder/ — `index`

### 其他发现的同类产品（不在任务清单，但值得提一句）
- **SmartCV smartcv.cc**（V2EX 作者自荐）：25+ 模板、JD 定制、ATS 11 项检查免费免注册、**Chrome 插件一键把简历填进 BOSS / 猎聘 / 51job / LinkedIn / Indeed / Lever / Greenhouse 申请表**、投递看板；免费 3 份简历 / 月 10 次 AI / 5 次 PDF 导出，付费 $4.9/$9.9/月。来源：https://hk.v2ex.com/t/1248200 — `index`
- **Interactive-CV**：可对话 / 语音的互动简历（面试官可直接问简历），Pro $19/月；**CareerStanding / Skillenai**：技能缺口 + 薪资基准 + 市场情报持续跟踪，而非一次性评分；Huntr / JobStep / GotHired / ResuFit：JD 改写 + 追踪 + 模拟面试组合，$11.95–40/月。来源见 notes/foreign-01.md。

---

## 第二轮值得抄的好功能清单（按优先级）

> 可实现性定义：**能直接抄** = 纯前端 / 确定性规则 / 免费层额度内可做；**要简化** = 需砍掉重资产部分（人工、视频、实时数据库、官方 API）后才能做；**抄不了** = 免费层 + 免费 AI Key 基本做不了，或合规 / 反爬风险高。
> 免费 AI Key 的前提假设：用免费额度模型（如 Gemini 免费层 / DeepSeek 免费 / OpenRouter 免费模型）走 Workers fetch，必须做**每日每用户限额 + 结果缓存 + 结构化 JSON 输出**，否则 token 成本失控。

| # | 好功能（来源） | 为什么值得抄 | 抄时注意什么 | Cloudflare 免费层 + 免费 AI Key |
|---|---|---|---|---|
| P0-1 | **可解释的逐行 ATS 评分**：Resume Worded 30+ 检查 + 逐行扣分解释；职徒 200+ 因子；Enhancv 27 项检查；VMock Impact/Presentation/Competencies 三维度 | 第一轮的 ATS 评分多是黑盒总分；逐行解释是用户最愿意分享 / 复访的理由，也是 JD 改写的入口。 | 先做确定性规则（长度、量化数字、动词、重复、缺失字段、日期格式、关键词覆盖），再用 LLM 只做“解释 + 改写建议”；分数要标明是“本站量表”，别冒充雇主 ATS 分；每次改动后即时重算。 | **能直接抄**（规则层纯前端/Workers；LLM 只做解释，token 小；缓存同一简历+JD 的评分结果） |
| P0-2 | **Polaris 式 diff 逐条采纳 + 防编造检查**（Magic Resume/知遇） | 比“一键全文重写”可信得多：用户看得见改了什么、为什么改，不怕 AI 编经历；也是 JD 定向改写最省 token 的形态（只改有问题的行）。 | 提案必须是结构化 patch（行级 diff + 理由 + 引用原文依据），未采纳不保存；防编造：凡提案含原文没有的公司/日期/证书/数字要标红拦截；提供“计划模式”（只给方案不改）降低用户戒心。 | **能直接抄**（Workers 调免费模型出 JSON patch，前端渲染 diff；防编造用规则比对 + LLM 自检） |
| P0-3 | **JD 缺口清单 + 一键采纳改写**：Resume Worded Targeted（<80 警示 + 缺失关键词清单）；ResumeNerd Job-Fit（一键把 JD 缺的技能加进简历） | 这就是本站核心卖点“JD 定向改写”的最短路径：先给清单（免费、确定性），再对每条给“一键改写/加入”按钮（付费点）。 | 关键词要分“必须 / 加分 / 别硬塞”，缺失技能要让用户确认“我真有”才能加，防造假；改写后要回写进评分重算，形成闭环。 | **能直接抄**（关键词抽取可用规则 + TF-IDF/embedding 免费层；改写走 LLM，按条计次限额） |
| P0-4 | **FlowCV 式诚实免费**：1 份简历 + 1 封求职信、全部模板、无水印、无限 PDF 下载、无需信用卡 | 与 Zety 系“免费建、TXT 才能下”形成口碑反差；个人站靠口碑和复访，免费 PDF 是获客成本最低的信任状。 | 免费额度要写死在页面上（1 份、不限下载），别学试用自动续费；多版本 / 无限 AI 次数再收费；PDF 用浏览器打印 / 前端生成，别把导出放付费墙。 | **能直接抄**（Pages 静态 + 前端 PDF，无服务端成本） |
| P0-5 | **职徒式一键排版**：自动一页、自动倒叙、全局字体/字号/行距/颜色/日期格式切换；魔方简历自动一页排版 | 中国用户最痛的不是写不出来，是“排版调一小时”；这是零 AI 成本、高感知价值的功能。 | 自动一页要有“溢出提示 + 建议删哪段”，别悄悄缩小字到看不清；倒叙/日期格式切换要全局一致；保留手动微调入口。 | **能直接抄**（纯前端 CSS/布局计算） |
| P0-6 | **10 秒中英互译、排版一致、可合并导出**（职徒，自称 98%） | 本站是中英文双语站，这是刚需中的刚需；比“分别做两份简历”省一半时间。 | 翻译要按字段/行对齐，别整段重排；专有名词（公司/学校/证书）建术语表不翻错；翻译后仍要过 ATS 检查（英文版关键词不同）；合并导出做成一个 PDF 双语对照或中+英两页。 | **能直接抄**（LLM 翻译按字段批量，缓存；术语表静态 JSON） |
| P1-7 | **Enhancv 个性化板块**：Most Proud Of / My Life Philosophy / Strengths / My Time / Day of My Life | 零成本差异化：第一轮 12 个多是标准板块；讲故事的板块适合转行 / 应届 / 创意岗，也利于 SEO（模板页可单独做）。 | 默认折叠、标明“可选”，别让所有用户都填；ATS 模式下自动弱化/移到第二页；给示例句，别留空白。 | **能直接抄**（纯前端板块 + 静态示例） |
| P1-8 | **预写短语库 / 岗位范例库**：Zety 按职位拉短语、ResumeGenius 数百岗位范例、五百丁 5000+ 范例/2748 岗位 | 解决空白页恐惧，比纯 LLM 生成更稳、更省 token；也是 SEO 内容资产（每个岗位一个着陆页）。 | 先做 20–50 个热门岗位（开发/产品/运营/财务/人力等），每岗位 10–20 条成就型 bullet + 技能词；短语要标注“改数字再用”；别一次做 5000 条，质量先于数量。 | **能直接抄**（静态 JSON，先人工/LLM 批量生成一次，后续缓存） |
| P1-9 | **成就日记 Career Journal**（VisualCV）：时间线记成就、置顶、标签、邮件提醒 | 简历是“用时才想起来写”，日记是留存钩子：用户平时记一句，找工作时一键生成 bullet；竞品少有。 | 先做本地时间线（日期/事件/数字/标签/置顶），一键把条目转成简历 bullet；提醒先做站内/浏览器提醒，别一上来做邮件系统。 | **要简化**（本地 IndexedDB/D1 存条目可直接抄；邮件提醒在免费层要砍或用极少量触发） |
| P1-10 | **投递看板 + 30 天投递诊断**（猎聘免费投递诊断 + 五百丁求职管理 + FlowCV Job Tracker） | 投递后才是用户最焦虑的阶段；看板（投递/面试/Offer/归档）+ 诊断（投了多少、面试转化率、建议）能把一次性工具变成求职全程工具。 | 看板先做手动记录（公司/岗位/日期/状态/备注），别一上来做自动抓取；诊断用看板数据算转化率 + 规则建议（如“投递多、面试少 → 简历问题；面试多、Offer 少 → 面试问题”），别假装有平台大数据。 | **能直接抄**（看板+诊断规则纯前端/D1；自动同步投递状态抄不了） |
| P1-11 | **Offer 对比 + 职业画像长期记忆**（智联职悟空：Offer 多维对比、长期记忆、主动提醒；VMock Career Fit） | 帮用户做决策，比只做简历更能留住人；记忆让“越用越懂你”。 | Offer 对比先做手动输入表（薪资/期权/地点/发展/工作强度打分加权），别编造市场薪资；长期记忆先做本地画像（目标岗/技能/偏好），换方向时可调用修改；主动提醒先做站内提示。 | **要简化**（对比表+本地画像能直接抄；跨会话长期记忆需登录+D1/KV，可做但要控制存储；实时薪资数据库抄不了） |
| P1-12 | **求职信 / 邮件一键插入正文 + 个性化名片**（职徒智能邮件） | 投递的最后一公里：很多用户简历做好了，邮件不知道怎么写；一键生成邮件正文可直接复制投递。 | 求职信按 JD 生成三段式（为什么我/为什么这家/下一步），别写空话；邮件模板给 3–5 个场景；名片信息从简历自动带。 | **能直接抄**（LLM 按模板生成，token 小） |
| P1-13 | **在线简历链接 + 浏览统计**（VisualCV）+ 个人网站（魔方简历 AI 个人网站） | 发链接比发附件更适合内推/社群场景；“谁看了”是最强的回访理由。 | 先做 Pages 静态托管链接（每份简历一个 slug）+ 基础计数（Workers KV 记打开次数，不记身份）；别一上来做“谁看了、看了多久”的身份追踪（隐私 + 免费层成本）。 | **要简化**（静态链接+计数能抄；精确到人的追踪抄不了/不建议做） |
| P2-14 | **文字版 AI 模拟面试 + 逐题反馈报告**（职徒 AI 面试押题/模拟、智联模拟面试） | 面试是简历之后的自然延伸；按简历+JD 生成专属题库、逐题解析，比通用题库价值高。 | 先做文字问答（一次一题、用户打字回答、AI 按 STAR/结构/关键词给反馈 + 改进版答案）；别做实时语音/视频；题库要分行为/技术/业务三类。 | **要简化**（文字版可抄，token 按题计次；语音/视频/眼神分析抄不了） |
| P2-15 | **技能缺口 + 学习路径**（VMock Skills Engine 40K taxonomy、Skillroads 职业测试、职徒 AI 职业规划） | 用户想知道“差什么、补什么”；缺口清单本身就是 JD 改写的另一面。 | 先做 JD 技能缺口清单（有/无/待证明三档）+ 静态学习资源链接（官方文档/免费课程），别自建 40K 技能库、别编造课程推荐。 | **要简化**（缺口清单能抄；40K taxonomy、个性化课程推荐抄不了） |
| P2-16 | **LinkedIn Review 式档案评分**（Resume Worded / VMock Aspire）+ **Sage 式边写边提示**（ResumeGenius） | LinkedIn 是外企求职的第二份简历；边写边提示比事后评分体验好。 | LinkedIn 先做“粘贴文本评分”（标题/简介/经历/技能逐节打分），别做官方导入（无 API 权限）；Sage 提示先做规则提示（弱动词、无数字、过长 bullet），LLM 只做改写建议。 | **要简化**（粘贴文本评分+规则提示能抄；LinkedIn 官方导入抄不了） |
| P2-17 | **多格式导入解析**（五百丁 PDF/Word/WPS/Markdown/Pages、Magic Resume 扫描件） | 降低迁移成本：用户已有简历，上传即用，不用重填。 | 先做 PDF（pdf.js 前端解析）+ Word（mammoth）+ 粘贴文本/Markdown；扫描件 OCR、Pages 格式先不做；解析后要让用户逐字段确认，别直接覆盖。 | **要简化**（PDF/Word/文本能抄；图片 OCR、Pages 抄不了/成本高） |
| — | **不建议抄（简单提一句）** | 薪资大数据/薪资热力图（无授权数据源、爬取有风险）、自动投递/代聊（反爬 + 平台 ToS）、视频面试眼神分析（VMock，需计算机视觉 + 机构license）、人工 1v1 简历优化/面试教练（猎聘 ¥598–3888、智联 ¥388–888，重人力）、Zety 系试用自动续费、Enhancv 双栏花哨模板 | — | **抄不了** |

---

## Could not verify / open questions

- **拉勾：** 未找到独立 AI 简历工具或其定价；只确认了投递反馈、简历处理率、投递次数限制等平台机制。拉勾简历 AI 功能可能不存在或藏在 App 内。
- **实习僧简历定价：** 只确认“免费+付费”，未找到独立简历会员价；插件填充率 80% 为官方自称。
- **Boss DeepHire：** 内测期免费、求职者核心功能免费为官网说法；具体免费额度、是否会转付费未公布；“评分+30%、匹配 85%”为官方宣传，无独立验证。
- **价格冲突（已在正文标注区间）：** 锤子简历（¥15.9/月 vs ¥29/月 vs ¥99/年）、Enhancv（$39/月 vs $19.99/月）、Skillroads（$4.95–14.95/月 vs 约 $12.95/月）、职徒（免费导出 vs 带水印）、Hloom（模板免费 vs builder 下载 $1.95/14 天）。均以官网结账页为准。
- **简历魔法同名混淆：** “简历魔法/Magic Resume”至少对应两个独立产品（知遇开源版 magic-resume.cn 与魔方简历 magic-resume.cmdragon.cn），定价与功能不可混用；任务清单未指明是哪一个，本报告两者都列了。
- **未逐一 live 打开：** 除 FlowCV、五百丁、52cv、CVMaker、Magic Resume GitHub 外，其余产品以搜索多源交叉为准，未登录实测（按规则不登录、不付费）；AI 功能的实际效果（如诊断准确率、改写质量）未实测。

## Sources

- 锤子简历：https://www.100chui.com/ ；https://aicoding.csdn.net/6a6872cb10ee7a33f2935e58.html ；https://www.douban.com/note/830296243/
- 五百丁：https://www.500d.me/ （verified live 2026-11-09）；https://www.500d.me/newcvresume/edit/ ；https://www.nowcoder.com/discuss/355730267078709248
- 实习僧：https://resume.shixiseng.com/ ；https://resume.shixiseng.com/extension_tools
- Boss/DeepHire：https://www.deephire.cn/ ；https://www.bosszhiping.com.cn/download.html ；https://web.fly63.com/nav/5018
- 智联/职悟空：https://ai.zhaopin.com/ ；https://www.ithome.com/1/004/228.htm ；https://www.ithome.com/1/004/863.htm
- 前程无忧：https://apps.apple.com/us/app/%E5%89%8D%E7%A8%8B%E6%97%A0%E5%BF%A751job-%E6%B1%82%E8%81%8C%E6%8B%9B%E8%81%98%E6%89%BE%E5%B7%A5%E4%BD%9C/id415443644 ；https://news.zol.com.cn/1033/10332083.html
- 拉勾/猎聘：https://www.woshipm.com/pd/5538770.html ；https://blog.csdn.net/a1235824/article/details/149961288 ；https://www.woshipm.com/evaluating/926604.html
- 简历魔法 A 知遇：https://github.com/Magic-Resume/Magic-Resume/blob/master/README.zh-CN.md （verified live 2026-11-09）；B 魔方：https://magic-resume.cmdragon.cn/app/dashboard/vip ；https://tools.cmdragon.cn/zh/apps/magic-resume
- 职徒：https://www.52cv.com/ （verified live 2026-11-09）；https://wedoingai.com/article/zhitu-review-2026 ；https://ai.fly63.com/52cv
- Enhancv：https://www.applyeze.com/blog/enhancv-review ；https://enhancv.com/blog/resume-highlights/ ；https://www.hrlens.io/articles/who-is-enhancv-for-honest-verdict-2026
- Zety：https://enhancv.com/blog/zety-review/ ；https://owlapply.com/en/blog/zety-review
- ResumeGenius：https://cvgenius.com/blog/cv-help/resume-genius-review ；https://owlapply.com/en/blog/resume-genius-review ；https://www.careerkit.me/blog/resume-genius-review
- MyPerfectResume：https://www.whatallsay.com/myperfectresume-review/ ；http://enhancv.com/blog/myperfectresume-review/ ；https://www.resume-score-checker.com/en/myperfectresume-review
- VisualCV：https://www.resumup.com/review-visualcv ；https://demostack.net/visualcv-review/ ；http://www.visualcv.com/blog/introducing-the-visualcv-career-journal/ ；https://www.visualcv.com/career-journal/
- CVMaker：https://www.cvmaker.uk/pricing （verified live 2026-11-09）
- FlowCV：https://flowcv.com/pricing （verified live 2026-11-09，研究浏览器打开）；https://www.tealhq.com/post/flowcv-reviews
- Resume Worded：https://owlapply.com/en/blog/resume-worded-review ；https://www.applyeze.com/blog/resume-worded-review ；https://www.lumyhired.com/blog/resume-worded-alternatives-2026
- VMock：https://aitools.fyi/vmock-dashboard ；https://employability.uq.edu.au/get-the-edge/faculty-programs/bel/vmock-resume-tool ；https://skillsyncer.com/vmock-alternatives
- Skillroads：https://aitools.fyi/skillroads ；https://brianvanderwaal.com/best-ai-resume-builder/
- Hloom：https://www.careerstanding.com/vs/hloom
- ResumeNerd：https://resufit.com/blog/resumenerd-pricing-is-resumenerd-free-detailed-guide-to-free-vs-paid-features/ ；https://zapier.com/blog/best-resume-builder/ ；https://www.tealhq.com/post/teal-vs-resumenerd
- 其他发现：https://hk.v2ex.com/t/1248200 （SmartCV）；https://www.interactive-cv.com/en/pricing
- 工作笔记：notes/china-01.md、notes/foreign-01.md（每产品来源与定价冲突细节）

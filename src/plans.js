// 简历过筛 — 套餐目录（第 3 周，规划 §5.1 / §5.3）
// 金额一律存分（整数）；USDT 金额用 sun 精确整数（1 USDT = 1e6 sun）。
// 定价：国内 9.9 / 19.9 / 99 元；国外 1.99 / 3.99 / 19.99 USDT（取整心理价，不按汇率直换）。
// 一次性付费，到期不自动续费；虚拟资源类服务，一经开通一般不支持退款。
// 权益：单次 = 1 次改写 + 1 次导出；包月 = 30 天内改写 30 次 + 导出不限；终身 = 每月改写 50 次 + 导出不限。
// 导出不限用 -1 表示（见 auth.js deductCredit：-1 不扣减）。

export const PLANS = {
  single: {
    slug: "single",
    name_zh: "单次改写",
    name_en: "Single Rewrite",
    price_cents: 990,
    usdt_sun: 1990000, // 1.99 USDT（下单时再加尾数区分同价订单）
    rewrite_credits: 1,
    export_credits: 1,
    duration_days: 0, // 0 = 不设到期日（单次额度不过期）
    refill_monthly: 0,
    desc_zh: "1 次改写（含求职信/互译任选其一）+ 1 次导出",
    desc_en: "1 rewrite (rewrite / cover letter / translation) + 1 export",
  },
  monthly: {
    slug: "monthly",
    name_zh: "包月会员",
    name_en: "Monthly",
    price_cents: 1990,
    usdt_sun: 3990000, // 3.99 USDT
    rewrite_credits: 30,
    export_credits: -1, // 不限
    duration_days: 30,
    refill_monthly: 0,
    desc_zh: "30 天内改写 30 次 + 导出不限",
    desc_en: "30 rewrites in 30 days + unlimited exports",
  },
  lifetime: {
    slug: "lifetime",
    name_zh: "终身会员",
    name_en: "Lifetime",
    price_cents: 9900,
    usdt_sun: 19990000, // 19.99 USDT
    rewrite_credits: 50, // 每月 50 次（cron 每月补满到 50，不滚存）
    export_credits: -1, // 不限
    duration_days: 0, // 终身不过期
    refill_monthly: 1,
    desc_zh: "每月改写 50 次 + 导出不限，终身有效",
    desc_en: "50 rewrites every month + unlimited exports, forever",
  },
};

export const PLAN_SLUGS = Object.keys(PLANS);

export function getPlan(slug) {
  return PLANS[String(slug || "").trim()] || null;
}

// 人民币分 → 显示元（¥9.9）
export function formatCny(cents) {
  return "¥" + (Number(cents) / 100).toFixed(2).replace(/\.00$/, "");
}

// sun → USDT 文本（1991300 → 1.9913）
export function formatUsdt(sun) {
  return (Number(sun) / 1e6).toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

// USDT 应付金额（带尾数区分同价订单）：基础价 + 随机 100–9999 sun（0.0001–0.009999 USDT）。
// 尾数只用于区分订单，金额本身仍精确到 sun；返回前由调用方校验与待付订单不重。
export function usdtPayableSun(plan, usedSunSet) {
  const base = plan.usdt_sun;
  for (let i = 0; i < 10; i += 1) {
    const tail = 100 + Math.floor(Math.random() * 9900);
    const sun = base + tail;
    if (!usedSunSet || !usedSunSet.has(sun)) return sun;
  }
  return base + 100 + Math.floor(Math.random() * 9900);
}

// 订单号：RS-YYYYMMDD-XXXX（4 位随机数字）
export function newOrderNo() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = String(Math.floor(1000 + Math.random() * 9000));
  return `RS-${ymd}-${rand}`;
}

// 订单状态文案（中英）
export const ORDER_STATUS = {
  pending: { zh: "待付款", en: "Awaiting payment" },
  review_pending: { zh: "待审核", en: "Under review" },
  paid: { zh: "已付款", en: "Paid" },
  done: { zh: "已开通", en: "Activated" },
  cancelled: { zh: "已取消", en: "Cancelled" },
  rejected: { zh: "已拒绝", en: "Rejected" },
  expired: { zh: "已过期", en: "Expired" },
};

export function statusLabel(status, lang) {
  const s = ORDER_STATUS[status] || ORDER_STATUS.pending;
  return lang === "en" ? s.en : s.zh;
}

// 支付方式文案
export const PAY_METHODS = {
  wechat: { zh: "微信支付", en: "WeChat Pay" },
  alipay: { zh: "支付宝", en: "Alipay" },
  usdt: { zh: "USDT（TRC-20）", en: "USDT (TRC-20)" },
  paypal: { zh: "PayPal", en: "PayPal" },
};

export function methodLabel(method, lang) {
  const m = PAY_METHODS[method] || PAY_METHODS.wechat;
  return lang === "en" ? m.en : m.zh;
}

// 按语言决定可用的支付方式（合规红线）：
// 中文（国内）只显示微信 / 支付宝；英文（国外）只显示 USDT / PayPal。
// USDT 绝不向国内用户展示，不做 USDT↔人民币兑换。
export function methodsForLang(lang) {
  return lang === "en" ? ["usdt", "paypal"] : ["wechat", "alipay"];
}

export function methodAllowedForLang(method, lang) {
  return methodsForLang(lang).includes(method);
}

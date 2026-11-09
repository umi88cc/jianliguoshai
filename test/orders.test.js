import test from "node:test";
import assert from "node:assert/strict";
import {
  PLANS,
  getPlan,
  formatCny,
  formatUsdt,
  usdtPayableSun,
  newOrderNo,
  methodsForLang,
  methodAllowedForLang,
  statusLabel,
} from "../src/plans.js";
import { verifyTurnstile, paypalConfigured } from "../src/orders.js";
import { templatesForLang, getTemplate } from "../src/templates.js";

test("plans: amounts are in cents / sun, no float money", () => {
  assert.equal(PLANS.single.price_cents, 990);
  assert.equal(PLANS.monthly.price_cents, 1990);
  assert.equal(PLANS.lifetime.price_cents, 9900);
  assert.equal(PLANS.single.usdt_sun, 1990000);
  assert.equal(PLANS.monthly.usdt_sun, 3990000);
  assert.equal(PLANS.lifetime.usdt_sun, 19990000);
  assert.equal(PLANS.monthly.export_credits, -1); // 不限
  assert.equal(PLANS.lifetime.refill_monthly, 1);
  assert.equal(PLANS.monthly.duration_days, 30);
  assert.equal(PLANS.lifetime.duration_days, 0);
  assert.equal(getPlan("nope"), null);
});

test("formatCny / formatUsdt are exact", () => {
  assert.equal(formatCny(990), "¥9.90");
  assert.equal(formatCny(1990), "¥19.90");
  assert.equal(formatCny(9900), "¥99");
  assert.equal(formatUsdt(1991300), "1.9913");
  assert.equal(formatUsdt(1990000), "1.99");
  assert.equal(formatUsdt(19990000), "19.99");
});

test("usdt tail amount: base + 100..9999 sun, never collides with used set", () => {
  const used = new Set([1990000 + 1300]);
  for (let i = 0; i < 50; i += 1) {
    const sun = usdtPayableSun(PLANS.single, used);
    assert.ok(sun > 1990000 && sun <= 1999999, `sun=${sun}`);
    assert.ok(!used.has(sun));
    used.add(sun);
  }
  // 尾数金额换算回 USDT 是 4 位小数
  assert.equal(formatUsdt(1991300), "1.9913");
});

test("order number format RS-YYYYMMDD-XXXX", () => {
  for (let i = 0; i < 20; i += 1) {
    const no = newOrderNo();
    assert.match(no, /^RS-\d{8}-\d{4}$/);
  }
  const a = newOrderNo();
  const b = newOrderNo();
  assert.notEqual(a, b);
});

test("payment methods are gated by language (compliance red line)", () => {
  // 中文只显示微信/支付宝，绝不展示 USDT
  assert.deepEqual(methodsForLang("zh"), ["wechat", "alipay"]);
  assert.equal(methodAllowedForLang("usdt", "zh"), false);
  assert.equal(methodAllowedForLang("paypal", "zh"), false);
  assert.equal(methodAllowedForLang("wechat", "zh"), true);
  // 英文只显示 USDT / PayPal
  assert.deepEqual(methodsForLang("en"), ["usdt", "paypal"]);
  assert.equal(methodAllowedForLang("wechat", "en"), false);
  assert.equal(methodAllowedForLang("usdt", "en"), true);
});

test("status labels are bilingual", () => {
  assert.equal(statusLabel("review_pending", "zh"), "待审核");
  assert.equal(statusLabel("review_pending", "en"), "Under review");
  assert.equal(statusLabel("done", "zh"), "已开通");
  assert.equal(statusLabel("rejected", "en"), "Rejected");
});

test("turnstile: unconfigured skips verification (does not block orders)", async () => {
  const r = await verifyTurnstile({}, "", "1.2.3.4");
  assert.equal(r.ok, true);
  assert.equal(r.skipped, true);
});

test("paypal: unconfigured means not configured", () => {
  assert.equal(paypalConfigured({}), false);
  assert.equal(paypalConfigured({ PAYPAL_CLIENT_ID: "x" }), false);
  assert.equal(
    paypalConfigured({ PAYPAL_CLIENT_ID: "x", PAYPAL_SECRET: "y" }),
    true,
  );
});

test("templates: 6 total, 3 per language, each has a skeleton", () => {
  assert.equal(templatesForLang("zh").length, 3);
  assert.equal(templatesForLang("en").length, 3);
  for (const t of templatesForLang("zh").concat(templatesForLang("en"))) {
    assert.ok(t.skeleton.length > 50, t.id);
    assert.ok(t.sample.name, t.id);
    assert.ok(t.sample.sections.length >= 2, t.id);
    assert.equal(getTemplate(t.id).id, t.id);
  }
  assert.equal(getTemplate("nope"), null);
});

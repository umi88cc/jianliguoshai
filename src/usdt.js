// USDT（TRC-20）收款监听 — 规划 §6 流程一
// 收款地址只存 Worker secret（USDT_RECEIVE_ADDRESS），代码里绝不硬编码；
// HMAC 共享密钥只存 secret（USDT_HMAC_SECRET），机器人调站内接口时签名，站内验签。
// 冷启动默认手动模式：USDT_AUTO_RELEASE 未开启时，监听只核对并记录，不自动开通，
// 等站长确认后再开自动放行。
import { createHmac, timingSafeEqual } from 'node:crypto';

export const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'; // 官方 USDT 合约，只认它，不认代币名字
export const USDT_NETWORK = 'TRC-20';
export const USDT_POLL_SECONDS = 60; // 机器人/定时任务每 60 秒查一次 TronGrid
export const USDT_MIN_CONFIRMATIONS = 19; // ≥19 个确认才算到账
export const USDT_SIGN_WINDOW_MS = 5 * 60 * 1000; // HMAC 签名 5 分钟时间窗
export const TRONGRID_API = 'https://api.trongrid.io';

// 金额尾数：1.99 → 1.9913 这类带尾数的精确金额，单位 USDT；链上 value 按 6 位小数换算
export function usdtToSun(amountUsdt) {
  return Math.round(Number(amountUsdt) * 1e6);
}

export function sunToUsdt(valueSun) {
  return Number(valueSun) / 1e6;
}

// ---- HMAC-SHA256 签名（机器人 → 站内接口），防伪造回调骗开通 ----
// 签名内容：timestamp + '\n' + nonce + '\n' + body
export function signUsdtCallback(secret, timestamp, nonce, body) {
  return createHmac('sha256', secret).update(`${timestamp}\n${nonce}\n${body}`).digest('hex');
}

export async function verifyUsdtSignature(env, signature, timestamp, nonce, body) {
  if (!env.USDT_HMAC_SECRET) return { ok: false, reason: 'hmac secret not configured' };
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > USDT_SIGN_WINDOW_MS) {
    return { ok: false, reason: 'signature expired' };
  }
  if (!signature || !nonce || !/^[a-zA-Z0-9_-]{8,64}$/.test(nonce)) {
    return { ok: false, reason: 'bad signature params' };
  }
  const expected = signUsdtCallback(env.USDT_HMAC_SECRET, String(ts), nonce, body);
  let ok = false;
  try {
    ok = expected.length === signature.length
      && timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch { ok = false; }
  if (!ok) return { ok: false, reason: 'signature mismatch' };
  // nonce 去重：同一 nonce 10 分钟内只接受一次（防重放）
  try {
    const key = `usdt-nonce:${nonce}`;
    const seen = await env.KV.get(key);
    if (seen) return { ok: false, reason: 'nonce replay' };
    await env.KV.put(key, '1', { expirationTtl: 600 });
  } catch (e) {
    console.error('nonce store failed', e);
    return { ok: false, reason: 'nonce store failed' };
  }
  return { ok: true };
}

// ---- TronGrid 查询：最近转入本地址的 TRC-20 交易 ----
export async function fetchUsdtTransfers(env, { sinceMs = Date.now() - 24 * 3600 * 1000, limit = 20 } = {}) {
  const address = env.USDT_RECEIVE_ADDRESS;
  if (!address) return { ok: false, reason: 'usdt address not configured', transfers: [] };
  const url = `${TRONGRID_API}/v1/accounts/${address}/transactions/trc20`
    + `?only_to=true&only_confirmed=true&limit=${limit}&min_timestamp=${sinceMs}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return { ok: false, reason: `trongrid http ${res.status}`, transfers: [] };
  const data = await res.json();
  return { ok: true, transfers: Array.isArray(data.data) ? data.data : [] };
}

// 单笔交易确认数：查链上交易详情取 blockNumber，对比当前块高
export async function confirmationsOf(txid) {
  const [infoRes, blockRes] = await Promise.all([
    fetch(`${TRONGRID_API}/wallet/gettransactioninfobyid`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: txid }),
    }),
    fetch(`${TRONGRID_API}/wallet/getnowblock`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    }),
  ]);
  if (!infoRes.ok || !blockRes.ok) return -1;
  const info = await infoRes.json();
  const block = await blockRes.json();
  const txBlock = info.blockNumber;
  const curBlock = block?.block_header?.raw_data?.number;
  if (typeof txBlock !== 'number' || typeof curBlock !== 'number') return -1;
  return curBlock - txBlock;
}

// 核对一笔 TRC-20 转入：合约必须是官方 USDT、金额精确一致、确认数达标
export async function verifyUsdtTransfer(env, tx, expectedSun) {
  const tokenAddr = tx?.token_info?.address;
  if (tokenAddr !== USDT_CONTRACT) return { ok: false, reason: 'wrong token contract' };
  if (tx.to !== env.USDT_RECEIVE_ADDRESS) return { ok: false, reason: 'wrong recipient' };
  if (Number(tx.value) !== Number(expectedSun)) return { ok: false, reason: 'amount mismatch' };
  const conf = await confirmationsOf(tx.transaction_id);
  if (conf < USDT_MIN_CONFIRMATIONS) return { ok: false, reason: 'not enough confirmations', confirmations: conf };
  return { ok: true, confirmations: conf };
}

// ---- 定时监听：每分钟跑一次（wrangler.toml [triggers] crons） ----
// 手动模式（默认，USDT_AUTO_RELEASE 未设为 '1'）：只核对并记录，不自动开通。
// 自动放行只在站长确认后把 USDT_AUTO_RELEASE 设为 '1' 才生效。
export async function pollUsdtPayments(env) {
  const address = env.USDT_RECEIVE_ADDRESS;
  if (!address) {
    console.log('usdt poll skipped: address not configured');
    return { ok: false, reason: 'address not configured' };
  }
  const autoRelease = env.USDT_AUTO_RELEASE === '1';
  const { ok, reason, transfers } = await fetchUsdtTransfers(env, {});
  if (!ok) {
    console.error('usdt poll failed', reason);
    return { ok: false, reason };
  }
  let matched = 0;
  let processed = 0;
  for (const tx of transfers) {
    if (tx?.token_info?.address !== USDT_CONTRACT) continue; // 只认官方 USDT，假币直接跳过
    matched += 1;
    // TxID 唯一：已处理过的交易不再重复处理（orders 表 txid UNIQUE 兜底）
    try {
      const used = await env.DB.prepare('SELECT id FROM orders WHERE txid = ?').bind(tx.transaction_id).first();
      if (used) continue;
    } catch (e) {
      // orders 表尚未建好（第 2 周）时，只记录不处理
      console.log('usdt match (no orders table yet)', tx.transaction_id, tx.value);
      processed += 1;
      continue;
    }
    // 有 orders 表时：按金额精确匹配待支付订单；手动模式只记录，自动模式才开通
    try {
      const order = await env.DB.prepare(
        "SELECT id, user_id, plan, amount, status FROM orders WHERE method = 'usdt' AND status = 'pending'",
      ).all();
      const expected = (order.results || []).find((o) => Number(o.amount_usdt_sun) === Number(tx.value));
      if (!expected) {
        console.log('usdt transfer without matching order', tx.transaction_id, tx.value);
        continue;
      }
      const conf = await confirmationsOf(tx.transaction_id);
      if (conf < USDT_MIN_CONFIRMATIONS) {
        console.log('usdt transfer waiting confirmations', tx.transaction_id, conf);
        continue;
      }
      if (!autoRelease) {
        console.log('usdt matched, manual mode: awaiting owner review', tx.transaction_id, expected.id);
        continue;
      }
      await env.DB.prepare(
        "UPDATE orders SET status = 'paid', txid = ? WHERE id = ? AND status = 'pending'",
      ).bind(tx.transaction_id, expected.id).run();
      processed += 1;
    } catch (e) {
      console.error('usdt match processing failed', tx.transaction_id, e);
    }
  }
  return { ok: true, checked: transfers.length, usdtMatched: matched, processed, autoRelease };
}

// ---- 订单页 USDT 收款展示块（第 2 周订单页直接引用） ----
// 地址从 secret 读，不硬编码；金额带尾数区分同价订单；大字警示只走 TRC-20、金额一分不能差。
export function usdtPayBlock(env, amountText) {
  const address = env.USDT_RECEIVE_ADDRESS || '';
  return `<div class="usdt-pay">
  <p class="usdt-warn">⚠️ 只走 TRC-20 网络，金额一分不能差；转错链或少付可能永久丢失，不承诺找回。</p>
  <p>收款地址（TRC-20）：<code>${address}</code> <button data-copy="${address}">复制地址</button></p>
  <p>应付金额：<strong>${amountText} USDT</strong>（已含订单尾数，请按显示金额精确转账）</p>
  <p>订单 30 分钟内有效；到账约需 1 分钟 + 19 个确认。过期后转账的，凭交易哈希联系站长人工开通，不自动到账、不退款。</p>
</div>`;
}

export function usdtPayInfo(env) {
  return {
    network: USDT_NETWORK,
    contract: USDT_CONTRACT,
    address: env.USDT_RECEIVE_ADDRESS || '',
    minConfirmations: USDT_MIN_CONFIRMATIONS,
    warning: '只走 TRC-20 网络，金额一分不能差；转错链或少付可能永久丢失，不承诺找回。',
  };
}

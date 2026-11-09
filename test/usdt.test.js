import test from 'node:test';
import assert from 'node:assert/strict';
import {
  USDT_CONTRACT,
  USDT_MIN_CONFIRMATIONS,
  USDT_POLL_SECONDS,
  signUsdtCallback,
  sunToUsdt,
  usdtPayBlock,
  usdtPayInfo,
  usdtToSun,
  verifyUsdtSignature,
} from '../src/usdt.js';

function fakeEnv() {
  const store = new Map();
  return {
    USDT_RECEIVE_ADDRESS: 'TTestAddressForUnitTestOnly0000000001',
    USDT_HMAC_SECRET: 'test-hmac-secret-do-not-use-in-prod',
    KV: {
      get: async (k) => (store.has(k) ? store.get(k) : null),
      put: async (k, v) => { store.set(k, v); },
    },
  };
}

test('usdt contract is the official one', () => {
  assert.equal(USDT_CONTRACT, 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t');
  assert.equal(USDT_MIN_CONFIRMATIONS, 19);
  assert.equal(USDT_POLL_SECONDS, 60);
});

test('amount conversion with tail digits is exact', () => {
  assert.equal(usdtToSun('1.9913'), 1991300);
  assert.equal(usdtToSun('19.99'), 19990000);
  assert.equal(sunToUsdt(1991300), 1.9913);
});

test('hmac sign/verify roundtrip works, replay and expiry rejected', async () => {
  const env = fakeEnv();
  const ts = String(Date.now());
  const nonce = 'test-nonce-1234';
  const body = '{"txid":"abc"}';
  const sig = signUsdtCallback(env.USDT_HMAC_SECRET, ts, nonce, body);
  assert.equal((await verifyUsdtSignature(env, sig, ts, nonce, body)).ok, true);
  // 同一 nonce 第二次是重放，拒绝
  assert.equal((await verifyUsdtSignature(env, sig, ts, nonce, body)).ok, false);
  // 篡改 body 签名对不上
  assert.equal((await verifyUsdtSignature(env, sig, ts, 'other-nonce-5678', '{"txid":"xyz"}')).ok, false);
  // 过期签名拒绝
  const oldTs = String(Date.now() - 10 * 60 * 1000);
  const oldSig = signUsdtCallback(env.USDT_HMAC_SECRET, oldTs, 'old-nonce-9999', body);
  assert.equal((await verifyUsdtSignature(env, oldSig, oldTs, 'old-nonce-9999', body)).ok, false);
});

test('pay block shows address from env and the TRC-20 warning', () => {
  const env = fakeEnv();
  const block = usdtPayBlock(env, '1.9913');
  assert.match(block, /TTestAddressForUnitTestOnly0000000001/);
  assert.match(block, /只走 TRC-20 网络，金额一分不能差/);
  assert.match(block, /1\.9913 USDT/);
  const info = usdtPayInfo(env);
  assert.equal(info.network, 'TRC-20');
  assert.equal(info.contract, USDT_CONTRACT);
  assert.equal(info.minConfirmations, 19);
});

test('pay info without configured address returns empty address, not a crash', () => {
  const info = usdtPayInfo({});
  assert.equal(info.address, '');
});

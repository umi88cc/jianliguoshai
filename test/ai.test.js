import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_CALL_TIMEOUT_MS,
  encryptModelKey,
  decryptModelKey,
  keyHash,
  maskKey,
  resolveModelKey,
  callChatModel,
  getRules,
} from '../src/ai.js';

function fakeDb() {
  const stmt = {
    bind: () => stmt,
    all: async () => ({ results: [] }),
    first: async () => null,
    run: async () => ({ meta: { changes: 0 } }),
  };
  return { prepare: () => stmt };
}

test('call timeout is 45s', () => {
  assert.equal(AI_CALL_TIMEOUT_MS, 45000);
});

test('key encrypt/decrypt roundtrip (AES-GCM v2)', async () => {
  const env = { AI_KEY_ENC_SECRET: 'test-enc-secret-do-not-use-in-prod' };
  const plain = 'nvapi-test-key-1234567890abcdef';
  const enc = await encryptModelKey(env, plain);
  assert.equal(enc.ok, true);
  assert.match(enc.enc, /^v2:/);
  const back = await decryptModelKey(env, enc.enc);
  assert.equal(back, plain);
  // 换密钥解不开
  const wrong = await decryptModelKey({ AI_KEY_ENC_SECRET: 'other-secret' }, enc.enc);
  assert.equal(wrong, null);
  // 没配密钥加密失败
  const noSecret = await encryptModelKey({}, plain);
  assert.equal(noSecret.ok, false);
});

test('keyHash is stable and distinct per key', async () => {
  const a = await keyHash('nvapi-key-one');
  const b = await keyHash('nvapi-key-one');
  const c = await keyHash('nvapi-key-two');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(a.length, 64);
});

test('maskKey shows only last 4', () => {
  assert.equal(maskKey('nvapi-abcdef1234'), '****1234');
  assert.equal(maskKey('ab'), '****');
});

test('resolveModelKey prefers Worker secret (key_ref)', async () => {
  const env = { AI_KEY_NVIDIA_SUPER_VL: 'nvapi-secret-value' };
  const r = await resolveModelKey(env, { key_ref: 'AI_KEY_NVIDIA_SUPER_VL', key_enc: null });
  assert.equal(r.configured, true);
  assert.equal(r.key, 'nvapi-secret-value');
  assert.equal(r.source, 'secret');
  // secret 未设 → 未配置
  const r2 = await resolveModelKey({}, { key_ref: 'AI_KEY_NVIDIA_SUPER_VL', key_enc: null });
  assert.equal(r2.configured, false);
});

test('resolveModelKey decrypts key_enc when no key_ref', async () => {
  const env = { AI_KEY_ENC_SECRET: 'test-enc-secret-do-not-use-in-prod' };
  const enc = await encryptModelKey(env, 'sk-or-v1-testkey');
  const r = await resolveModelKey(env, { key_ref: null, key_enc: enc.enc });
  assert.equal(r.configured, true);
  assert.equal(r.key, 'sk-or-v1-testkey');
  assert.equal(r.source, 'encrypted');
});

test('callChatModel with no enabled models fails closed', async () => {
  const env = {};
  const db = fakeDb();
  const r = await callChatModel(env, db, [{ role: 'user', content: 'hi' }]);
  assert.equal(r.ok, false);
  assert.equal(r.tried.length, 0);
});

test('getRules returns defaults when table is empty', async () => {
  const db = fakeDb();
  const { rules } = await getRules(db);
  assert.equal(rules.allow_number_edit, '0');
  assert.equal(rules.force_star, '1');
  assert.equal(rules.default_intensity, 'standard');
  assert.equal(rules.rewrite_prompt_zh, '');
});

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

// 回归测试：listModels 刻意不返回 key_enc（不让加密 Key 经过后台列表接口），
// callChatModel 必须按 id 重取整行才能解出 Key；否则所有模型都会被跳过，改写永远走规则兜底。
test('callChatModel resolves key_enc even though listModels omits it', async () => {
  const env = { AI_KEY_ENC_SECRET: 'test-enc-secret-do-not-use-in-prod' };
  const enc = await encryptModelKey(env, 'sk-or-v1-regression-test-key');
  assert.equal(enc.ok, true);
  const rowWithoutKeyEnc = {
    id: 4, sort_order: 1, provider: 'openrouter', base_url: 'https://openrouter.ai/api/v1',
    name: 'OpenRouter Nemotron 3 Ultra :free', model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    key_ref: null, key_last4: 'test', key_configured: 1, is_active: 1,
    price_text: '免费', speed_text: '—', limit_text: '', daily_limit: 50,
    last_test_at: null, last_test_ok: 1, fail_count: 0,
  };
  const fullRow = { ...rowWithoutKeyEnc, key_enc: enc.enc, key_hash: await keyHash('sk-or-v1-regression-test-key') };
  const db = {
    prepare: (sql) => {
      const stmt = {
        bind: () => stmt,
        all: async () => {
          if (String(sql).includes('FROM ai_models ORDER BY')) return { results: [rowWithoutKeyEnc] };
          return { results: [] };
        },
        first: async () => {
          if (String(sql).includes('SELECT * FROM ai_models WHERE id')) return fullRow;
          return null; // ai_usage: 当日 0 次
        },
        run: async () => ({ meta: { changes: 1 } }),
      };
      return stmt;
    },
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: '{"self_intro": "hi"}' } }] }),
  });
  try {
    const r = await callChatModel(env, db, [{ role: 'user', content: 'hi' }], { jsonMode: false });
    assert.equal(r.ok, true);
    assert.equal(r.model, 'nvidia/nemotron-3-ultra-550b-a55b:free');
  } finally {
    globalThis.fetch = realFetch;
  }
});

// 飞书应用机器人通知 — 规划 §6（国内付款通知，AI 只通知、不确认）
// 三项配置只存 Worker secret（FEISHU_APP_ID / FEISHU_APP_SECRET / FEISHU_RECEIVE_ID），
// 代码里绝不硬编码；后台「基本设置 → 通知设置」只显示是否配好（见 getFeishuConfig），
// 值由站长在 wrangler secret 侧管理，后台不回显、不改值。
//
// 接收方说明（实测结论，勿改）：FEISHU_RECEIVE_ID 存的是站长与机器人私聊的
// 会话 chat_id（oc_ 开头），发送时 receive_id_type 必须用 chat_id。
// open_id 是按应用隔离的：同一个人在不同应用下的 open_id 不一样，
// 拿别的 app 视角的 open_id 来发会报 99992361（open_id cross app），已实测证实。
// 如需改用 open_id，必须用本应用自己的 token 调 contact/v3/users/batch_get_id
// 按手机号/邮箱查出本应用视角的 open_id，且应用须开通 contact:user.id:readonly 权限。

const FEISHU_API = 'https://open.feishu.cn/open-apis';

// 后台「基本设置 → 通知设置」的状态位：只返回是否配好 + 脱敏标识，绝不返回完整值。
export function getFeishuConfig(env) {
const appId = String(env.FEISHU_APP_ID || '').trim();
const appSecret = String(env.FEISHU_APP_SECRET || '').trim();
const receiveId = String(env.FEISHU_RECEIVE_ID || '').trim();
return {
configured: Boolean(appId && appSecret && receiveId),
// App ID 本身不是密钥，只露前 4 位供后台核对是哪个应用；Secret 与接收方 ID 一律不回显。
appIdMasked: appId? appId.slice(0, 4) + '…': '',
receiveIdSet: Boolean(receiveId),
};
}

// 取应用 token（app_access_token；发消息用它即可，已实测通过）。
async function getFeishuAppToken(env) {
const appId = String(env.FEISHU_APP_ID || '').trim();
const appSecret = String(env.FEISHU_APP_SECRET || '').trim();
if (!appId ||!appSecret) return { ok: false, error: 'feishu not configured'};
const res = await fetch(`${FEISHU_API}/auth/v3/app_access_token/internal`, {
method: 'POST',
headers: { 'Content-Type': 'application/json; charset=utf-8'},
body: JSON.stringify({ app_id: appId, app_secret: appSecret}),
});
const data = await res.json().catch(() => ({}));
if (!res.ok || data.code!== 0 ||!data.app_access_token) {
return { ok: false, error: `feishu token failed (${data.code || res.status}): ${data.msg || 'check app id/secret'}`};
}
return { ok: true, token: data.app_access_token};
}

// 给站长发私信（text 类型；第 2 周订单通知升级为 interactive 卡片时再换 msg_type）。
// 返回 { ok, messageId} 或 { ok:false, error}；token 只在函数内使用，不记日志。
export async function sendFeishuDM(env, text) {
const receiveId = String(env.FEISHU_RECEIVE_ID || '').trim();
if (!receiveId) return { ok: false, error: 'feishu receive id not configured'};
const t = await getFeishuAppToken(env);
if (!t.ok) return t;
try {
const res = await fetch(`${FEISHU_API}/im/v1/messages?receive_id_type=chat_id`, {
method: 'POST',
headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${t.token}`},
body: JSON.stringify({
receive_id: receiveId,
msg_type: 'text',
content: JSON.stringify({ text: String(text || '').slice(0, 1000)}),
}),
});
const data = await res.json().catch(() => ({}));
if (!res.ok || data.code!== 0) {
return { ok: false, error: `feishu send failed (${data.code || res.status}): ${data.msg || 'unknown'}`};
}
return { ok: true, messageId: data.data?.message_id || ''};
} catch (e) {
return { ok: false, error: `feishu send failed: ${e?.message || e}`};
}
}

// 国内订单“我已付款”通知（规划 §6 流程二第 5 步）：只喊站长来确认，绝不自动开通。
export async function sendFeishuOrderNotice(env, { orderNo, username, plan, amount, method, txid}) {
const lines = [
'新订单待确认',
`订单号：${orderNo || '-'}`,
`用户：${username || '-'}`,
`套餐：${plan || '-'}`,
`金额：${amount || '-'}`,
`方式：${method || '-'}`,
`交易单号：${txid || '-'}`,
'请在后台核对账单后点「确认通过」。',
];
return sendFeishuDM(env, lines.join('\n'));
}

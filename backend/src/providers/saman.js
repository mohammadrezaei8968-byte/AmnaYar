const crypto = require('crypto');

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name}_NOT_CONFIGURED`);
  return value;
}

async function postJson(url, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.SAMAN_TIMEOUT_MS || 15000));
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error(`SAMAN_INVALID_JSON_${response.status}`); }
    if (!response.ok) throw new Error(`SAMAN_HTTP_${response.status}`);
    return data;
  } finally { clearTimeout(timer); }
}

function pick(obj, keys, fallback = undefined) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return fallback;
}

function initPayment({terminalId, amountRial, orderId, callbackUrl, phone}) {
  const txnKey = crypto.randomInt(100000000, 2147483647);
  const payload = {
    Action: 'token',
    TerminalId: terminalId,
    RedirectUrl: callbackUrl,
    TxnRandomSessionKey: txnKey,
    ResNum: orderId,
    Amount: amountRial,
    ...(phone ? {CellNumber: phone} : {})
  };
  return postJson(process.env.SAMAN_TOKEN_URL || 'https://sep.shaparak.ir/onlinepg/onlinepg', payload)
    .then(data => {
      const token = pick(data, ['Token','token','tokenValue']);
      const code = pick(data, ['Status','status','statusCode','ResCode','resCode']);
      if (!token) throw new Error(`SAMAN_TOKEN_FAILED_${code ?? 'UNKNOWN'}`);
      return {token: String(token), txnKey};
    });
}

async function verifyPayment({terminalId, txnKey, refNum}) {
  const payload = {
    RefNum: String(refNum),
    TerminalId: terminalId,
    TxnRandomSessionKey: Number(txnKey),
    IgnoreNationalcode: true
  };
  const url = process.env.SAMAN_VERIFY_URL || 'https://sep.shaparak.ir/verifyTxnRandomSessionkey/ipg/VerifyTransaction';
  const data = await postJson(url, payload);
  const code = pick(data, ['ResultCode','resultCode','Status','status','ResCode','resCode']);
  const successRaw = pick(data, ['Success','success','IsSuccess','isSuccess']);
  const success = successRaw === true || successRaw === 'true' || Number(successRaw) === 1 || Number(code) === 0;
  const rrn = pick(data, ['RRN','rrn','ReferenceNumber','referenceNumber','RefNum','refNum']);
  const amount = pick(data, ['Amount','amount']);
  return {success, code, rrn: rrn ? String(rrn) : null, amount: amount == null ? null : Number(amount), raw: data};
}

module.exports = {initPayment, verifyPayment};

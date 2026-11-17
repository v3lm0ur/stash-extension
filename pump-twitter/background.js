// background.js — фоновый воркер.
// Описание токена: сначала пробуем API pump.fun, если не вышло — берём
// метаданные прямо из блокчейна Solana (публичный RPC) и JSON по ссылке uri
// (IPFS). Второй путь не зависит от того, как pump.fun поменяет свой API.
// Контент-скрипт запрашивает через sendMessage({type:'PUMP_COIN', mint}).

const cache = new Map();
const pending = new Map();
const translationCache = new Map();

async function fetchT(url, opts = {}, ms = 6000) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(to);
  }
}

// ---------- 1. API pump.fun ----------
const PUMP_URLS = [
  (m) => 'https://frontend-api-v3.pump.fun/coins/' + m + '?sync=false',
  (m) => 'https://frontend-api-v3.pump.fun/coins-v2/' + m,
];

async function fromPumpApi(mint) {
  for (const make of PUMP_URLS) {
    try {
      const r = await fetchT(make(encodeURIComponent(mint)), { headers: { accept: 'application/json' } }, 4000);
      if (!r.ok) continue;
      let j = await r.json();
      if (j && j.data && typeof j.data === 'object') j = j.data;
      if (j && (j.description || j.name)) {
        return {
          name: j.name || '',
          symbol: j.symbol || '',
          description: j.description || '',
          image: j.image_uri || j.image || '',
          twitter: j.twitter || '',
        };
      }
    } catch (e) { /* пробуем дальше */ }
  }
  return null;
}

// ---------- 2. Блокчейн Solana ----------
const RPCS = ['https://solana-rpc.publicnode.com', 'https://api.mainnet-beta.solana.com'];
const METADATA_PROGRAM = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';

async function rpc(method, params) {
  for (const url of RPCS) {
    try {
      const r = await fetchT(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      if (!r.ok) continue;
      const j = await r.json();
      if (j.error) continue;
      return j.result;
    } catch (e) { /* следующий RPC */ }
  }
  throw new Error('rpc');
}

// base58
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58decode(s) {
  let n = 0n;
  for (const c of s) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error('b58');
    n = n * 58n + BigInt(i);
  }
  const out = [];
  while (n > 0n) { out.push(Number(n & 255n)); n >>= 8n; }
  for (const c of s) { if (c === '1') out.push(0); else break; }
  return Uint8Array.from(out.reverse());
}
function b58encode(bytes) {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) + BigInt(b);
  let s = '';
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b === 0) s = '1' + s; else break; }
  return s;
}

// Проверка "точка на кривой ed25519" — нужна для вычисления PDA
const P = 2n ** 255n - 19n;
function modpow(b, e) {
  let r = 1n; b %= P;
  while (e > 0n) { if (e & 1n) r = (r * b) % P; b = (b * b) % P; e >>= 1n; }
  return r;
}
const D = ((P - 121665n) * modpow(121666n, P - 2n)) % P;
function onCurve(bytes) {
  let y = 0n;
  for (let i = 31; i >= 0; i--) y = (y << 8n) + BigInt(bytes[i]);
  const sign = y >> 255n;
  y &= (1n << 255n) - 1n;
  if (y >= P) return false;
  const y2 = (y * y) % P;
  const u = (y2 - 1n + P) % P;
  const v = (D * y2 + 1n) % P;
  const x2 = (u * modpow(v, P - 2n)) % P;
  if (x2 === 0n) return sign === 0n;
  return modpow(x2, (P - 1n) / 2n) === 1n;
}

const enc = new TextEncoder();
async function findPda(seeds, programId) {
  const tail = [...programId, ...enc.encode('ProgramDerivedAddress')];
  const base = seeds.flatMap((s) => [...s]);
  for (let bump = 255; bump >= 0; bump--) {
    const buf = Uint8Array.from([...base, bump, ...tail]);
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
    if (!onCurve(h)) return h;
  }
  throw new Error('pda');
}

function b64bytes(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// Аккаунт Metaplex Metadata: key(1) + updateAuthority(32) + mint(32) + name, symbol, uri (borsh-строки)
function parseMetaplex(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dec = new TextDecoder();
  let o = 1 + 32 + 32;
  const str = () => {
    const len = dv.getUint32(o, true); o += 4;
    const s = dec.decode(bytes.subarray(o, o + len)); o += len;
    return s.replace(/\0+$/g, '').trim();
  };
  const name = str(), symbol = str(), uri = str();
  return { name, symbol, uri };
}

async function onchainMeta(mint) {
  // Новые токены (Token-2022): метаданные лежат прямо в аккаунте mint
  const acc = await rpc('getAccountInfo', [mint, { encoding: 'jsonParsed' }]);
  const exts = acc && acc.value && acc.value.data && acc.value.data.parsed &&
    acc.value.data.parsed.info && acc.value.data.parsed.info.extensions;
  if (Array.isArray(exts)) {
    const tm = exts.find((e) => e.extension === 'tokenMetadata');
    if (tm && tm.state && tm.state.uri) {
      return { name: tm.state.name || '', symbol: tm.state.symbol || '', uri: tm.state.uri };
    }
  }
  // Классические токены: отдельный аккаунт Metaplex Metadata
  const prog = b58decode(METADATA_PROGRAM);
  const pda = await findPda([enc.encode('metadata'), prog, b58decode(mint)], prog);
  const meta = await rpc('getAccountInfo', [b58encode(pda), { encoding: 'base64' }]);
  const data = meta && meta.value && meta.value.data;
  if (!data || !data[0]) return null;
  return parseMetaplex(b64bytes(data[0]));
}

// ipfs://… → https-шлюз; плюс запасные шлюзы, если первый не ответил
const IPFS_GATEWAYS = ['https://ipfs.io/ipfs/', 'https://cloudflare-ipfs.com/ipfs/', 'https://gateway.pinata.cloud/ipfs/'];
function uriCandidates(uri) {
  const m = uri.match(/^ipfs:\/\/(?:ipfs\/)?(.+)$/) || uri.match(/\/ipfs\/(.+)$/);
  if (!m) return [uri];
  const tail = m[1];
  const list = uri.startsWith('http') ? [uri] : [];
  for (const g of IPFS_GATEWAYS) if (!list.includes(g + tail)) list.push(g + tail);
  return list;
}

async function fromChain(mint) {
  const meta = await onchainMeta(mint);
  if (!meta) return null;
  let j = {};
  if (meta.uri) {
    for (const u of uriCandidates(meta.uri)) {
      try {
        const r = await fetchT(u, { headers: { accept: 'application/json' } }, 5000);
        if (!r.ok) continue;
        j = await r.json();
        break;
      } catch (e) { /* следующий шлюз */ }
    }
  }
  return {
    name: j.name || meta.name || '',
    symbol: j.symbol || meta.symbol || '',
    description: j.description || '',
    image: j.image || '',
    twitter: j.twitter || '',
  };
}

async function getCoin(mint) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) return { error: 'mint' };
  if (cache.has(mint)) return cache.get(mint);
  if (pending.has(mint)) return pending.get(mint);
  const job = (async () => {
    let data = await fromPumpApi(mint);
    if (!data) {
      try { data = await fromChain(mint); } catch (e) { data = null; }
    }
    if (!data) return { error: 'fetch' };
    if (cache.size > 800) cache.clear();
    cache.set(mint, data);
    return data;
  })();
  pending.set(mint, job);
  try { return await job; }
  finally { pending.delete(mint); }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'PUMP_COIN' && msg.mint) {
    getCoin(msg.mint).then(sendResponse);
    return true; // async response
  }
  if (msg && msg.type === 'TRANSLATE' && typeof msg.text === 'string') {
    translateText(msg.text, msg.to || 'ru').then(sendResponse);
    return true;
  }
});


async function translateText(text, target) {
  const source = String(text || '').trim();
  if (!source) return { error: 'empty' };
  if (source.length > 5000) return { error: 'too_long' };
  const lang = target === 'en' ? 'en' : 'ru';
  const key = lang + '|' + source;
  if (translationCache.has(key)) return translationCache.get(key);
  try {
    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' +
      encodeURIComponent(lang) + '&dt=t&q=' + encodeURIComponent(source);
    const response = await fetchT(url, { headers: { accept: 'application/json' } }, 9000);
    if (!response.ok) return { error: response.status };
    const json = await response.json();
    const translated = (json[0] || []).map(segment => segment?.[0] || '').join('');
    if (!translated) return { error: 'empty_result' };
    const result = { text: translated, source: json[2] || '' };
    if (translationCache.size > 500) translationCache.clear();
    translationCache.set(key, result);
    return result;
  } catch (error) {
    return { error: 'fetch' };
  }
}

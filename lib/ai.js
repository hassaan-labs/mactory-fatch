'use strict';

const AI_KEY = process.env.OPENAI_API_KEY || '';
const AI_MODEL = process.env.OPENAI_MODEL || 'gpt-6-luna';
const MAX_BRIEF = 1600;
const buckets = new Map();
const WINDOW_MS = 60_000;
const LIMIT = 12;

const briefSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    product: { type: 'string' },
    category: { type: 'string', enum: ['metal', 'plastic', 'packaging', 'wood', 'textile', 'other', ''] },
    materials: { type: 'array', items: { type: 'string' } },
    quantity: { type: 'integer' },
    locationState: { type: 'string' },
    processes: { type: 'array', items: { type: 'string' } },
    keywords: { type: 'array', items: { type: 'string' } },
    standards: { type: 'array', items: { type: 'string' } },
    questions: { type: 'array', items: { type: 'string' } }
  },
  required: ['product', 'category', 'materials', 'quantity', 'locationState', 'processes', 'keywords', 'standards', 'questions']
};

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.end(JSON.stringify(data));
}
function bodyObject(req) {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) return req.body;
  if (typeof req.body === 'string') {
    try { const value = JSON.parse(req.body); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
    catch { return {}; }
  }
  return {};
}
function text(value, max = 180) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function strings(value, maxItems = 8, maxLen = 60) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(x => typeof x === 'string').map(x => x.trim().slice(0, maxLen)).filter(Boolean))].slice(0, maxItems);
}
function validateBrief(raw) {
  const categories = new Set(['metal', 'plastic', 'packaging', 'wood', 'textile', 'other', '']);
  const n = Number(raw.quantity);
  return {
    product: text(raw.product),
    category: categories.has(raw.category) ? raw.category : '',
    materials: strings(raw.materials),
    quantity: Number.isSafeInteger(n) && n > 0 && n < 1_000_000_000 ? n : 0,
    locationState: text(raw.locationState, 60),
    processes: strings(raw.processes), keywords: strings(raw.keywords, 12),
    standards: strings(raw.standards), questions: strings(raw.questions, 4, 180)
  };
}
function outputText(payload) {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  const pieces = [];
  for (const item of (payload.output || [])) {
    for (const content of (item.content || [])) if (content.type === 'output_text' && typeof content.text === 'string') pieces.push(content.text);
  }
  return pieces.join('\n').trim();
}
function rateAllowed(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const recent = (buckets.get(ip) || []).filter(ts => now - ts < WINDOW_MS);
  if (recent.length >= LIMIT) { buckets.set(ip, recent); return false; }
  recent.push(now); buckets.set(ip, recent);
  if (buckets.size > 1000) for (const [key, times] of buckets) if (!times.length || now - times[times.length - 1] > WINDOW_MS) buckets.delete(key);
  return true;
}
async function callOpenAI(payload, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${AI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`Provider status ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timeout); }
}
async function handleParse(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return sendJson(res, 405, { available: false, reason: 'Use POST.' }); }
  if (!rateAllowed(req)) return sendJson(res, 429, { available: false, reason: 'Too many requests. Please wait before trying again.' });
  const brief = text(bodyObject(req).brief, MAX_BRIEF);
  if (brief.length < 8) return sendJson(res, 400, { available: false, reason: 'Describe the product and requirements in at least 8 characters.' });
  if (!AI_KEY) return sendJson(res, 200, { available: false, reason: 'AI API key is not configured. Your directory remains empty; nothing has been matched to a factory.' });
  try {
    const data = await callOpenAI({
      model: AI_MODEL, max_output_tokens: 650, store: false,
      text: { format: { type: 'json_schema', name: 'manufacturing_brief', strict: true, schema: briefSchema } },
      input: [
        { role: 'system', content: [{ type: 'input_text', text: 'Extract only facts stated or clearly implied by the buyer brief into the JSON schema. Do not recommend or name suppliers, invent specifications, quantity, budget, standards, location or certifications. If absent, use empty strings/arrays, quantity 0, and concise questions. This only structures the brief: no factory is registered in the current directory and no matching to suppliers is performed.' }] },
        { role: 'user', content: [{ type: 'input_text', text: JSON.stringify({ brief }) }] }
      ]
    }, 18_000);
    const output = outputText(data);
    if (!output) throw new Error('No structured content');
    return sendJson(res, 200, { available: true, brief: validateBrief(JSON.parse(output)), provider: 'OpenAI Responses API', model: AI_MODEL, note: 'Brief extraction only; this does not match or verify a supplier.' });
  } catch (error) {
    console.error(`[MACTORY AI brief] ${error.name === 'AbortError' ? 'timeout' : 'provider/parse failure'}`);
    return sendJson(res, 200, { available: false, reason: 'AI service unavailable. You can still write the brief manually; no factory has been matched.' });
  }
}
async function handleResearch(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return sendJson(res, 405, { available: false, reason: 'Use POST.' }); }
  if (!rateAllowed(req)) return sendJson(res, 429, { available: false, reason: 'Too many requests. Please wait before trying again.' });
  const brief = text(bodyObject(req).brief, MAX_BRIEF);
  if (brief.length < 8) return sendJson(res, 400, { available: false, reason: 'Describe the product, process or material in at least 8 characters.' });
  if (!AI_KEY) return sendJson(res, 200, { available: false, reason: 'AI API key is not configured. Research public supplier leads is unavailable.' });
  try {
    const data = await callOpenAI({
      model: AI_MODEL, max_output_tokens: 1050, store: false,
      tools: [{ type: 'web_search', search_context_size: 'low' }], tool_choice: 'required',
      include: ['web_search_call.action.sources'],
      input: [
        { role: 'system', content: [{ type: 'input_text', text: 'Use web search to find up to 3 real manufacturer candidate leads in India relevant to the brief. Prefer companies’ own websites and official government/issuer sources. Cite factual claims with source links. Never invent the company, address, capabilities, capacity, MOQ, pricing, lead time, registration or certificates. Do not claim a supplier is verified just because a website exists. Clearly label all results as preliminary public-source research leads, not registered platform members and not verified suppliers. Report unknown facts as unknown. If evidence is weak, omit the candidate or say so. The MACTORY FATCH member directory is currently empty; do not say the candidates are registered on it.' }] },
        { role: 'user', content: [{ type: 'input_text', text: JSON.stringify({ sourcing_brief: brief, country: 'India', max_candidates: 3 }) }] }
      ]
    }, 30_000);
    const answer = outputText(data);
    if (!answer) throw new Error('No research text');
    const sources = new Map();
    const addSource = (url, title = '') => {
      if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return;
      try { const u = new URL(url); if (!sources.has(u.href)) sources.set(u.href, { url: u.href, title: text(title, 160) || u.hostname }); } catch {}
    };
    for (const item of data.output || []) {
      if (item.type === 'web_search_call') for (const source of item.action?.sources || []) addSource(source.url, source.title);
      for (const content of item.content || []) for (const ann of content.annotations || []) if (ann.type === 'url_citation') addSource(ann.url || ann.url_citation?.url, ann.title || ann.url_citation?.title);
    }
    return sendJson(res, 200, { available: true, answer: answer.slice(0, 8000), sources: [...sources.values()].slice(0, 10), model: AI_MODEL, warning: 'Preliminary public-source research only. These leads are not registered members or verified suppliers.' });
  } catch (error) {
    console.error(`[MACTORY AI research] ${error.name === 'AbortError' ? 'timeout' : 'provider/research failure'}`);
    return sendJson(res, 200, { available: false, reason: 'Public-source research failed. Try later or use the official manual lookup portals.' });
  }
}
module.exports = { handleParse, handleResearch };

'use strict';

// Lightweight standard-library server for the MACTORY FATCH demo.
// AI keys stay on the server. Government record checks are intentionally not
// faked: supplier validation must use official portals or an authorized provider.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const publicSeo = require('./lib/public-seo');

const ROOT = __dirname;
function loadLocalEnv() {
  const envFile = path.join(ROOT, '.env');
  if (!fs.existsSync(envFile)) return;
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('='); if (idx < 1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('\"') && value.endsWith('\"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (key && !process.env[key]) process.env[key] = value;
  }
}
loadLocalEnv();
const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || '127.0.0.1';
const AI_KEY = process.env.OPENAI_API_KEY || '';
const AI_MODEL = process.env.OPENAI_MODEL || 'gpt-6-luna';
const MAX_BODY = 6000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 20;
const requestBuckets = new Map();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8'
};

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

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  });
  res.end(body);
}
function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:;");
}
function allowedRate(req) {
  const ip = (req.socket.remoteAddress || 'local').replace(/^::ffff:/, '');
  const now = Date.now();
  const prev = requestBuckets.get(ip) || [];
  const recent = prev.filter(t => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) { requestBuckets.set(ip, recent); return false; }
  recent.push(now); requestBuckets.set(ip, recent);
  if (requestBuckets.size > 1000) {
    for (const [k, v] of requestBuckets) if (!v.length || now - v[v.length - 1] > RATE_WINDOW_MS) requestBuckets.delete(k);
  }
  return true;
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = ''; let bytes = 0;
    req.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > MAX_BODY) { reject(Object.assign(new Error('Request too large'), { status: 413 })); req.destroy(); return; }
      body += chunk.toString('utf8');
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject(Object.assign(new Error('Invalid JSON body'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}
function text(v, max = 180) { return typeof v === 'string' ? v.trim().slice(0, max) : ''; }
function strings(v, maxItems = 8, maxLen = 60) {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter(x => typeof x === 'string').map(x => x.trim().slice(0, maxLen)).filter(Boolean))].slice(0, maxItems);
}
function validateBrief(raw) {
  const categories = new Set(['metal', 'plastic', 'packaging', 'wood', 'textile', 'other', '']);
  const n = Number(raw.quantity);
  const quantity = Number.isSafeInteger(n) && n > 0 && n < 1_000_000_000 ? n : 0;
  return {
    product: text(raw.product),
    category: categories.has(raw.category) ? raw.category : '',
    materials: strings(raw.materials), quantity,
    locationState: text(raw.locationState, 60), processes: strings(raw.processes),
    keywords: strings(raw.keywords, 12), standards: strings(raw.standards), questions: strings(raw.questions, 4, 180)
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
async function parseWithAI(brief) {
  const payload = {
    model: AI_MODEL,
    max_output_tokens: 700,
    store: false,
    text: { format: { type: 'json_schema', name: 'manufacturing_brief', strict: true, schema: briefSchema } },
    input: [
      { role: 'system', content: [{ type: 'input_text', text:
        'You are MACTORY FATCH, a manufacturing sourcing assistant. Extract only buyer requirements from the supplied product brief. Do not recommend or name actual suppliers, invent manufacturer information, estimate supplier capabilities, claim government verification, or invent dimensions, quantity, budget, standards, locations, or certifications. Convert ordinary wording and common manufacturing synonyms to structured fields. Use empty strings and arrays for absent details, quantity 0 if not stated, and include concise clarifying questions for important missing requirements. Category must be one of metal, plastic, packaging, wood, textile, other, or empty string. Keywords must be useful product/process/material words grounded in the buyer text. This output is only a search specification; matching is performed separately against the site catalogue.' }] },
      { role: 'user', content: [{ type: 'input_text', text: JSON.stringify({ brief: text(brief, 1600) }) }] }
    ]
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 22_000);
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${AI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`AI service status ${response.status}`);
    const data = await response.json();
    const out = outputText(data);
    if (!out) throw new Error('AI service returned no text');
    return validateBrief(JSON.parse(out));
  } finally { clearTimeout(timer); }
}


async function researchSuppliersWithAI(brief) {
  const payload = {
    model: AI_MODEL,
    max_output_tokens: 1050,
    store: false,
    tools: [{ type: 'web_search', search_context_size: 'low' }],
    tool_choice: 'required',
    include: ['web_search_call.action.sources'],
    input: [
      { role: 'system', content: [{ type: 'input_text', text:
        'You are a cautious sourcing research assistant for an Indian manufacturing marketplace. Use web search now. Find up to 3 real manufacturer candidates relevant to the buyer brief. Prefer companies’ own websites for stated processes/products and official government/issuer sources for legal registrations/certification information. For each candidate, give legal/trade name as shown by sources, location, the specific evidence that it manufactures the relevant product/process, source-backed official website if available, and what remains unverified. Cite every factual company claim with web citations. Never invent a company, address, GST status, certification, factory capacity, MOQ, price, lead time or customer review. If evidence is weak, say so or omit the candidate. Do not label any supplier “verified” merely because a website exists or because it appears in search results. State clearly that this is preliminary web research, not supplier due diligence or a government verification. Prefer official company websites, official government registries and certification issuer websites over generic listicles. If the brief is too vague, give the most useful candidate leads and ask concise clarifying questions.' }] },
      { role: 'user', content: [{ type: 'input_text', text: JSON.stringify({ sourcing_brief: text(brief, 1600), country: 'India', requested_candidates: 3 }) }] }
    ]
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35_000);
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${AI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`AI web research status ${response.status}`);
    const data = await response.json();
    const answer = outputText(data);
    if (!answer) throw new Error('AI web research returned no text');
    const found = new Map();
    const addSource = (url, title = '') => {
      if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return;
      try { const u = new URL(url); if (!found.has(u.href)) found.set(u.href, { url: u.href, title: text(title, 180) || u.hostname }); } catch {}
    };
    for (const item of (data.output || [])) {
      if (item.type === 'web_search_call') {
        for (const source of (item.action?.sources || [])) addSource(source.url, source.title);
      }
      for (const content of (item.content || [])) {
        for (const ann of (content.annotations || [])) {
          if (ann.type === 'url_citation') addSource(ann.url || ann.url_citation?.url, ann.title || ann.url_citation?.title);
        }
      }
    }
    return { answer: answer.slice(0, 12000), sources: [...found.values()].slice(0, 12) };
  } finally { clearTimeout(timer); }
}

const server = http.createServer(async (req, res) => {
  setSecurityHeaders(res);
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const verificationStore = require('./verification-store.cjs');
  if (url.pathname === '/api/factories' && req.method === 'GET') {
    try { return sendJson(res, 200, { factories: await verificationStore.listPublicFactories() }); }
    catch (err) { return sendJson(res, err.status || 500, { error: err.status === 503 ? err.message : 'Could not load approved manufacturers.' }); }
  }
  if (url.pathname === '/api/registrations' && req.method === 'POST') {
    if (!process.env.ADMIN_TOKEN || !process.env.DATA_RETENTION_HMAC_KEY) return sendJson(res, 503, { error: 'Registration intake is disabled until ADMIN_TOKEN, DATA_RETENTION_HMAC_KEY and the private review queue are configured.' });
    if (!allowedRate(req)) return sendJson(res, 429, { error: 'Too many submissions. Please wait and try again.' });
    let body; try { body = await readJson(req); } catch (err) { return sendJson(res, err.status || 400, { error: err.message || 'Invalid request.' }); }
    try {
      const rawPayload = body.payload || body;
      const schemaErrors = verificationStore.validateTypedPayload(rawPayload);
      if (schemaErrors.length) return sendJson(res, 400, { error: 'Some fields do not match the required data types or allowed values.', details: schemaErrors });
      const payload = verificationStore.cleanPayload(rawPayload);
      if (body.attestation !== true || body.privacyConsent !== true) return sendJson(res, 400, { error: 'The accuracy attestation and privacy consent are required. Public listing consent is optional.' });
      await verificationStore.purgeExpiredSubmissions();
      const existing = await verificationStore.listSubmissions();
      const fingerprint = verificationStore.registrationFingerprint(payload.regType,payload.regNumber);
      if (existing.some(x => (x.registration_fingerprint || x.screening?.registrationFingerprint || ((x.registration_number || x.payload?.regNumber) ? verificationStore.registrationFingerprint(x.payload?.regType || payload.regType, x.registration_number || x.payload?.regNumber) : '')) === fingerprint && x.status !== 'rejected')) return sendJson(res, 409, { error: 'This registration number already has an active submission.' });
      const screening = verificationStore.screenSubmission(payload, existing);
      const record = await verificationStore.createSubmission(payload, screening, body.publicListingConsent === true, body.rfqContactConsent === true);
      return sendJson(res, 201, { ok: true, reference: record.reference, status: record.status, screening: { engine: record.screening.engine, flags: record.screening.flags, flagCount: record.screening.flagCount, highestSeverity: record.screening.highestSeverity, decision: record.screening.decision, note: record.screening.note }, message: 'Submission received and placed in pending review. No public listing or verified badge has been created.' });
    } catch (err) { return sendJson(res, err.status || 500, { error: err.status === 503 ? err.message : 'Could not save submission. Check server configuration and try again.' }); }
  }
  if (url.pathname === '/api/maintenance/retention') {
    if (req.method !== 'GET' && req.method !== 'POST') { res.setHeader('Allow','GET, POST'); return sendJson(res,405,{error:'Method not allowed.'}); }
    const secret=process.env.CRON_SECRET;
    if(!secret)return sendJson(res,503,{error:'Retention cleanup is disabled until CRON_SECRET is configured.'});
    if(req.headers.authorization!==`Bearer ${secret}`)return sendJson(res,401,{error:'Unauthorized.'});
    try{return sendJson(res,200,{ok:true,deleted:await verificationStore.purgeExpiredSubmissions(),ranAt:new Date().toISOString()});}
    catch{return sendJson(res,500,{error:'Retention cleanup failed.'});}
  }
  if (url.pathname === '/api/admin/session') {
    const secure = process.env.VERCEL === '1' || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
    const origin = req.headers.origin;
    if (origin) { try { if (new URL(origin).host !== String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim()) return sendJson(res,403,{error:'Cross-origin admin requests are not allowed.'}); } catch { return sendJson(res,403,{error:'Invalid request origin.'}); } }
    if (req.method === 'POST') {
      if (!allowedRate(req)) return sendJson(res,429,{error:'Too many sign-in attempts. Wait a minute and try again.'});
      let body; try { body = await readJson(req); } catch (err) { return sendJson(res, err.status || 400, {error:err.message||'Invalid request.'}); }
      const totpSecret=String(process.env.ADMIN_TOTP_SECRET||'');
      if (totpSecret && !require('./lib/totp.cjs').verifyTotp(totpSecret,String(body.totpCode||''))) return sendJson(res,401,{error:'Invalid or expired authenticator code.'});
      const cookie = verificationStore.createAdminSessionCookie(String(body.token || ''),secure);
      if (!cookie) return sendJson(res,401,{error:'Invalid administrator credential.'});
      res.setHeader('Set-Cookie',cookie);return sendJson(res,200,{ok:true,expiresInSeconds:1800});
    }
    if (req.method === 'DELETE') { res.setHeader('Set-Cookie',verificationStore.clearAdminSessionCookie(secure));return sendJson(res,200,{ok:true}); }
    res.setHeader('Allow','POST, DELETE');return sendJson(res,405,{error:'Method not allowed.'});
  }
  if (url.pathname === '/api/admin/registrations') {
    if (!process.env.ADMIN_TOKEN) return sendJson(res, 503, { error: 'ADMIN_TOKEN is not configured in .env.' });
    if (!verificationStore.isAdmin(req)) return sendJson(res, 401, { error: 'Admin authentication required.' });
    try {
      if (req.method === 'GET') { await verificationStore.purgeExpiredSubmissions(); return sendJson(res, 200, { submissions: (await verificationStore.listSubmissions()).map(verificationStore.adminView) }); }
      if (req.method === 'DELETE') {
        let body; try { body = await readJson(req); } catch (err) { return sendJson(res, err.status || 400, { error: err.message || 'Invalid request.' }); }
        if (!body.id) return sendJson(res,400,{error:'Submission ID is required.'});
        return sendJson(res,200,await verificationStore.deleteSubmission(body.id));
      }
      if (req.method === 'PATCH') {
        let body; try { body = await readJson(req); } catch (err) { return sendJson(res, err.status || 400, { error: err.message || 'Invalid request.' }); }
        const { id, status, manualChecksComplete } = body; const note = String(body.adminNote || '').trim().slice(0, 2000);
        if (!id || !['pending','needs_more_info','approved','rejected'].includes(status)) return sendJson(res, 400, { error: 'Invalid submission ID or status.' });
        if (status === 'approved' && (manualChecksComplete !== true || note.length < 30)) return sendJson(res, 400, { error: 'Approval requires confirmed manual checks and at least 30 characters of evidence/review notes.' });
        if (status === 'approved' && !(await verificationStore.listSubmissions()).some(x => x.id === id)) return sendJson(res, 404, { error: 'Submission not found.' });
        if (status === 'rejected' && note.length < 10) return sendJson(res, 400, { error: 'Add a clear reason before rejecting.' });
        return sendJson(res, 200, { ok: true, submission: verificationStore.adminView(await verificationStore.updateSubmission(id, status, note)) });
      }
      res.setHeader('Allow', 'GET, PATCH, DELETE'); return sendJson(res, 405, { error: 'Method not allowed.' });
    } catch (err) { return sendJson(res, err.status || 500, { error: err.status === 503 ? err.message : 'Could not process admin request.' }); }
  }
  if (req.method === 'GET' && url.pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, aiConfigured: Boolean(AI_KEY), aiModel: AI_KEY ? AI_MODEL : null, aiMode: AI_KEY ? 'server-side AI available' : 'offline parser only', webResearchConfigured: Boolean(AI_KEY), verificationMode: 'rules-based triage and mandatory human review; no automated government verification API configured', registrationConfigured: Boolean(process.env.ADMIN_TOKEN && process.env.DATA_RETENTION_HMAC_KEY && (verificationStore.useSupabase() || !process.env.VERCEL)), retentionConfigured: Boolean(process.env.DATA_RETENTION_HMAC_KEY), scheduledRetentionConfigured: Boolean(process.env.CRON_SECRET), storageMode: verificationStore.useSupabase() ? 'supabase' : (process.env.VERCEL ? 'unconfigured' : 'local-json') });
  }
  if (req.method === 'POST' && url.pathname === '/api/ai/parse-brief') {
    if (!allowedRate(req)) return sendJson(res, 429, { available: false, reason: 'Too many requests. Please wait a minute.' });
    let input;
    try { input = await readJson(req); }
    catch (err) { return sendJson(res, err.status || 400, { available: false, reason: err.message || 'Invalid request.' }); }
    const brief = text(input && typeof input === 'object' && !Array.isArray(input) ? input.brief : '', 1600);
    if (brief.length < 8) return sendJson(res, 400, { available: false, reason: 'Describe the product and requirements in at least 8 characters.' });
    if (!AI_KEY) return sendJson(res, 200, { available: false, reason: 'AI key not configured; use offline parsing.' });
    try {
      const extracted = await parseWithAI(brief);
      return sendJson(res, 200, { available: true, brief: extracted, provider: 'OpenAI Responses API', model: AI_MODEL });
    } catch (err) {
      // Do not log user-submitted briefs or secrets. Client falls back to offline extraction.
      console.error(`[AI parse brief] ${err.name === 'AbortError' ? 'timeout' : 'provider/parse error'}`);
      return sendJson(res, 200, { available: false, reason: 'AI service unavailable; offline parsing was used.' });
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/ai/research-suppliers') {
    if (!allowedRate(req)) return sendJson(res, 429, { available: false, reason: 'Too many requests. Please wait a minute.' });
    let input;
    try { input = await readJson(req); }
    catch (err) { return sendJson(res, err.status || 400, { available: false, reason: err.message || 'Invalid request.' }); }
    const brief = text(input && typeof input === 'object' && !Array.isArray(input) ? input.brief : '', 1600);
    if (brief.length < 8) return sendJson(res, 400, { available: false, reason: 'Describe the product, process or material in at least 8 characters.' });
    if (!AI_KEY) return sendJson(res, 200, { available: false, reason: 'AI API key not configured. Web research is unavailable; use official lookup portals manually.' });
    try {
      const research = await researchSuppliersWithAI(brief);
      return sendJson(res, 200, { available: true, ...research, model: AI_MODEL, warning: 'Web research is preliminary and does not verify the identity, factory, capabilities or certificates of any supplier.' });
    } catch (err) {
      console.error(`[AI supplier research] ${err.name === 'AbortError' ? 'timeout' : 'provider/research error'}`);
      return sendJson(res, 200, { available: false, reason: 'AI web research failed or returned no sourced output. Try again later or use manual official-source checks.' });
    }
  }
  const apiRouteMap={
    '/api/rfqs':'./api/rfqs.js',
    '/api/rfqs/status':'./api/rfqs/status.js',
    '/api/rfqs/respond':'./api/rfqs/respond.js',
    '/api/admin/rfqs':'./api/admin/rfqs.js'
  };
  if (apiRouteMap[url.pathname]) {
    try {
      if (['POST','PATCH','DELETE'].includes(req.method)) req.body=await readJson(req);
      else req.body={};
      req.query=Object.fromEntries(url.searchParams.entries());
      let statusCode=200;
      const apiRes={setHeader:(k,v)=>res.setHeader(k,v),status(code){statusCode=code;return this;},json(body){return sendJson(res,statusCode,body);}};
      return await require(apiRouteMap[url.pathname])(req,apiRes);
    } catch(err) { return sendJson(res,err.status||400,{error:err.message||'Invalid API request.'}); }
  }
  if (url.pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'API route not found.' });

  if (req.method === 'GET' && (url.pathname === '/robots.txt' || url.pathname === '/sitemap.xml' || url.pathname.startsWith('/category/') || url.pathname.startsWith('/factory/'))) {
    try {
      if (url.pathname === '/robots.txt') {
        const body = publicSeo.renderRobots(req);
        res.writeHead(200, {'Content-Type':'text/plain; charset=utf-8','Cache-Control':'public, max-age=3600'});
        return res.end(body);
      }
      if (url.pathname === '/sitemap.xml') {
        const body = await publicSeo.renderSitemap(req);
        res.writeHead(200, {'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=300'});
        return res.end(body);
      }
      const rawSlug = url.pathname.split('/').filter(Boolean)[1] || '';
      const slug = decodeURIComponent(rawSlug);
      const out = url.pathname.startsWith('/category/') ? await publicSeo.renderCategory(slug, req) : await publicSeo.renderFactory(slug, req);
      res.writeHead(out.status, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'});
      return res.end(out.html);
    } catch (err) {
      res.writeHead(503, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
      return res.end('<!doctype html><title>Directory temporarily unavailable</title><h1>Directory temporarily unavailable</h1><p>Please try again shortly.</p>');
    }
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end('Method not allowed'); }

  if (req.method === 'GET' && (url.pathname === '/customer' || url.pathname === '/factoryowner' || url.pathname === '/categories')) {
    const alias = {'/customer':'buyers.html','/factoryowner':'manufacturers.html','/categories':'categories.html'}[url.pathname];
    url.pathname = '/' + alias;
  }
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end('Bad request'); }
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.resolve(ROOT, `.${pathname}`);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Not found'); }
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Cache-Control': path.extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=3600' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`MACTORY FATCH running at http://${HOST}:${PORT}`);
  console.log(`AI brief extraction: ${AI_KEY ? `configured (${AI_MODEL})` : 'not configured; offline fallback active'}`);
  console.log('Supplier verification: not automated; use official source links and authorized checks.');
});

'use strict';
const crypto = require('node:crypto');
const TABLE = 'factory_rfqs';
function cfg(){return {url:String(process.env.SUPABASE_URL||'').replace(/\/$/,''),key:process.env.SUPABASE_SERVICE_ROLE_KEY||''};}
function configured(){const c=cfg();return !!(c.url&&c.key);}
async function db(path, options={}){
 const c=cfg(); if(!c.url||!c.key)throw Object.assign(new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'),{status:503});
 const r=await fetch(`${c.url}/rest/v1/${path}`,{...options,headers:{apikey:c.key,Authorization:`Bearer ${c.key}`,'Content-Type':'application/json',Prefer:'return=representation',...(options.headers||{})}});
 const raw=await r.text();let data;try{data=raw?JSON.parse(raw):null}catch{data=raw};if(!r.ok)throw Object.assign(new Error(data?.message||'Database request failed.'),{status:r.status});return data;
}
function hash(s){return crypto.createHash('sha256').update(String(s)).digest('hex');}
function secret(){return process.env.RFQ_TOKEN_SECRET||'';}
function makeToken(purpose,id,days){if(!secret())throw Object.assign(new Error('RFQ_TOKEN_SECRET is not configured.'),{status:503});const payload=Buffer.from(JSON.stringify({purpose,id,exp:Date.now()+days*86400000,jti:crypto.randomBytes(24).toString('hex')})).toString('base64url');const sig=crypto.createHmac('sha256',secret()).update(payload).digest('base64url');return `${payload}.${sig}`;}
function readToken(token,purpose){if(!secret()||typeof token!=='string')return null;const parts=token.split('.');if(parts.length!==2)return null;const expected=crypto.createHmac('sha256',secret()).update(parts[0]).digest('base64url');const a=Buffer.from(parts[1]),b=Buffer.from(expected);if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;try{const p=JSON.parse(Buffer.from(parts[0],'base64url').toString());return p.purpose===purpose&&p.exp>Date.now()&&typeof p.id==='string'?p:null;}catch{return null;}}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function sendEmail({to,subject,html,text}){
 if(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM)throw Object.assign(new Error('Email delivery is not configured. Set RESEND_API_KEY and EMAIL_FROM.'),{status:503});
 const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.EMAIL_FROM,to:[to],subject,html,text})});
 const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(d.message||'Email provider rejected the message.'),{status:502});return d;
}
async function getRfq(id){const rows=await db(`${TABLE}?id=eq.${encodeURIComponent(id)}&select=*`);return rows?.[0]||null;}
async function patchRfq(id,patch){const rows=await db(`${TABLE}?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({...patch,updated_at:new Date().toISOString()})});return rows?.[0]||null;}
async function insertRfq(row){const rows=await db(TABLE,{method:'POST',body:JSON.stringify(row)});return rows?.[0]||row;}

async function consumeRateLimit(scope, req, limit=5, windowSeconds=900){
 const rateSecret=process.env.RATE_LIMIT_HMAC_KEY||'';if(rateSecret.length<32)throw Object.assign(new Error('RATE_LIMIT_HMAC_KEY must be configured before accepting RFQs.'),{status:503});
 const ip=String(req.headers['x-real-ip']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();
 const key=crypto.createHmac('sha256',rateSecret).update(`${scope}:${ip}`).digest('hex');
 const start=Math.floor(Date.now()/1000/windowSeconds)*windowSeconds;
 let result;try{result=await db('rpc/consume_rate_limit',{method:'POST',body:JSON.stringify({p_bucket_key:`${scope}:${key}`,p_window_start:new Date(start*1000).toISOString(),p_limit:limit,p_window_seconds:windowSeconds})});}catch{throw Object.assign(new Error('Shared rate-limit service is unavailable. Run the updated Supabase SQL schema and verify server credentials.'),{status:503});}
 if(typeof result!=='boolean')throw Object.assign(new Error('Shared rate-limit service returned an invalid response.'),{status:503});
 return result;
}
async function purgeExpiredRfqs(){if(!configured())return 0;try{const cutoffRate=new Date(Date.now()-2*86400000).toISOString();await db(`api_rate_limits?window_start=lt.${encodeURIComponent(cutoffRate)}`,{method:'DELETE',headers:{Prefer:'return=minimal'}});}catch{}const days=Math.max(90,Math.min(730,Number(process.env.RFQ_RETENTION_DAYS||365)));const cutoff=new Date(Date.now()-days*86400000).toISOString();const rows=await db(`${TABLE}?created_at=lt.${encodeURIComponent(cutoff)}&select=id`,{method:'DELETE',headers:{Prefer:'return=representation'}});return Array.isArray(rows)?rows.length:0;}
async function sendFactoryNotification(row, factory, responseToken){
 const base=String(process.env.SITE_URL||'').replace(/\/$/,'');if(!base)throw Object.assign(new Error('SITE_URL is not configured.'),{status:503});
 const link=`${base}/respond.html#token=${encodeURIComponent(responseToken)}`;
 const subject=`New manufacturing enquiry ${row.reference} — ${String(row.product||'').replace(/[\r\n]+/g,' ').slice(0,180)}`;
 const html=`<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#18372f"><h2>New manufacturing enquiry</h2><p>You have received an RFQ through MACTORY FATCH.</p><p><b>Reference:</b> ${escapeHtml(row.reference)}<br><b>Product:</b> ${escapeHtml(row.product)}<br><b>Quantity:</b> ${Number(row.quantity).toLocaleString()}<br><b>Material:</b> ${escapeHtml(row.material)}<br><b>Buyer:</b> ${escapeHtml(row.buyer_name)} (${escapeHtml(row.buyer_email)})</p><p><b>Specifications</b><br>${escapeHtml(row.specifications).replace(/\n/g,'<br>')}</p>${row.budget?`<p><b>Budget:</b> ${escapeHtml(row.budget)}</p>`:''}${row.delivery_date?`<p><b>Required delivery:</b> ${escapeHtml(row.delivery_date)}</p>`:''}${row.notes?`<p><b>Additional notes:</b><br>${escapeHtml(row.notes).replace(/\n/g,'<br>')}</p>`:''}<p><a href="${link}" style="display:inline-block;background:#18372f;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none">Respond to this enquiry</a></p><p style="font-size:12px;color:#666">This secure response link expires in 14 days. If you did not opt in to RFQ notifications or believe this is an error, contact MACTORY FATCH support.</p></div>`;
 const text=`New MACTORY FATCH enquiry ${row.reference}\nProduct: ${row.product}\nQuantity: ${row.quantity}\nMaterial: ${row.material}\nBuyer: ${row.buyer_name} (${row.buyer_email})\nSpecifications: ${row.specifications}\n${row.notes?`Notes: ${row.notes}\n`:''}Respond securely: ${link}`;
 return sendEmail({to:factory.email,subject,html,text});
}
async function sendBuyerReceipt(row, statusToken){
 const base=String(process.env.SITE_URL||'').replace(/\/$/,'');const link=`${base}/rfq-status.html#token=${encodeURIComponent(statusToken)}`;
 return sendEmail({to:row.buyer_email,subject:`Your MACTORY FATCH enquiry ${row.reference} was submitted`,html:`<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#18372f"><h2>Enquiry submitted</h2><p>Your enquiry <b>${escapeHtml(row.reference)}</b> has been saved. The selected factory has been notified if email delivery succeeded.</p><p><b>Product:</b> ${escapeHtml(row.product)}<br><b>Quantity:</b> ${Number(row.quantity).toLocaleString()}</p><p><a href="${link}">Track this enquiry and view the factory response</a></p><p style="font-size:12px;color:#666">Keep this private link safe. Anyone with it may view this enquiry's status and response.</p></div>`,text:`Your enquiry ${row.reference} was saved. Track status and response here: ${link}`});
}
module.exports={configured,db,hash,makeToken,readToken,sendEmail,getRfq,patchRfq,insertRfq,consumeRateLimit,purgeExpiredRfqs,sendFactoryNotification,sendBuyerReceipt};

'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = __dirname;
const TAXONOMY = require('./assets/manufacturing-taxonomy.json');
const CATEGORY_NAMES = new Set(TAXONOMY.map(c=>c.name));
const LOCAL_DB = path.join(ROOT, 'data', 'registrations.json');
const TABLE = 'manufacturer_submissions';
function normalize(s){return String(s||'').trim();}
// Explicit typed intake schema: server-side validation is authoritative; browser checks are only UX.
const FIELD_SCHEMA={
 legalName:{type:'string',required:true,max:150}, entityType:{type:'enum',required:true,values:['Private limited company','Public limited company','LLP','Registered partnership','Sole proprietorship','Producer company / cooperative','Other']},
 regType:{type:'enum',required:true,values:['CIN','LLPIN','FIRM','LICENSE','UDYAM','GSTIN','SHOP','COOP']}, regNumber:{type:'string',required:true,max:60},
 gstin:{type:'string',max:15}, udyam:{type:'string',max:30},
 factoryCity:{type:'string',required:true,max:100}, factoryState:{type:'string',required:true,max:100}, website:{type:'url',max:200}, contactName:{type:'string',required:true,max:120},
 role:{type:'string',required:true,max:80}, email:{type:'email',required:true,max:180}, phone:{type:'phone',required:true,max:22},
 productCategory:{type:'string',required:true,max:120}, productCategories:{type:'array',maxItems:30}, productSubcategories:{type:'string',max:700},
 productName:{type:'string',required:true,max:180}, products:{type:'string',max:700}, materials:{type:'string',max:500}, industriesServed:{type:'string',max:500}, capabilityKeywords:{type:'string',max:500}, moq:{type:'integer',required:true,min:1,max:100000000}, processes:{type:'string',required:true,max:1600}, capacity:{type:'string',max:160}, certifications:{type:'string',max:500}, notes:{type:'string',max:1200}
};
function validateTypedPayload(input){
 const errors=[]; if(!input||typeof input!=='object'||Array.isArray(input))return ['Submission must be a JSON object.'];
 for(const [key,rule] of Object.entries(FIELD_SCHEMA)){
  const value=input[key]; const blank=value===undefined||value===null||(typeof value==='string'&&!value.trim());
  if(rule.required&&blank){errors.push(`${key} is required.`);continue;} if(blank)continue;
  if(rule.type==='string'&&typeof value!=='string')errors.push(`${key} must be text.`);
  if(rule.type==='string'&&typeof value==='string'&&value.length>rule.max)errors.push(`${key} exceeds ${rule.max} characters.`);
  if(rule.type==='enum'&&(typeof value!=='string'||!rule.values.includes(value)))errors.push(`${key} must be one of the allowed options.`);
  if(rule.type==='integer'&&(!Number.isSafeInteger(Number(value))||String(value).trim()===''||Number(value)<rule.min||Number(value)>rule.max))errors.push(`${key} must be a whole number between ${rule.min} and ${rule.max}.`);
  if(rule.type==='email'&&(typeof value!=='string'||value.length>rule.max||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)))errors.push(`${key} must be a valid email address.`);
  if(rule.type==='phone'&&(typeof value!=='string'||value.length>rule.max||!/^[+0-9() .-]{8,22}$/.test(value)))errors.push(`${key} must be a valid phone number.`);
  if(rule.type==='url'&&(typeof value!=='string'||value.length>rule.max||(()=>{try{const u=new URL(value);return u.protocol!=='https:'||!u.hostname.includes('.')}catch{return true}})()))errors.push(`${key} must be a valid HTTPS URL, or left blank.`);
 }
 if(input.productCategories!==undefined){if(!Array.isArray(input.productCategories)||input.productCategories.length<1||input.productCategories.length>30)errors.push('productCategories must contain between 1 and 30 categories.');else{const unique=new Set();for(const c of input.productCategories){if(typeof c!=='string'||!CATEGORY_NAMES.has(c))errors.push('productCategories contains an unknown manufacturing category.');if(unique.has(c))errors.push('productCategories must not contain duplicates.');unique.add(c);}}}
 if(input.productCategory!==undefined&&typeof input.productCategory==='string'&&!CATEGORY_NAMES.has(input.productCategory))errors.push('productCategory must be a known manufacturing category.');
 const entity=input.entityType, reg=input.regType;
 const allowedByEntity={
  'Private limited company':['CIN'],'Public limited company':['CIN'],'LLP':['LLPIN'],
  'Registered partnership':['FIRM','LICENSE'],'Sole proprietorship':['UDYAM','GSTIN','SHOP','LICENSE'],
  'Producer company / cooperative':['CIN','COOP','LICENSE'],'Other':['LICENSE']
 };
 if(entity&&reg&&allowedByEntity[entity]&&!allowedByEntity[entity].includes(reg))errors.push('Registration type does not match the selected legal entity type.');
 return errors;
}
function cleanPayload(input){
  const allowed=['legalName','entityType','regType','regNumber','gstin','udyam','factoryCity','factoryState','website','contactName','role','email','phone','productCategory','productCategories','productSubcategories','productName','products','materials','industriesServed','capabilityKeywords','moq','processes','capacity','certifications','notes'];
  const out={}; for(const k of allowed){let v=input?.[k]; if(typeof v==='string')v=v.trim().slice(0, ({notes:1200,processes:1600,products:700,productSubcategories:700,materials:500,industriesServed:500,capabilityKeywords:500,productCategory:120})[k]||600); else if(k==='moq'&&v!==undefined)v=String(v); else if(k==='productCategories'&&Array.isArray(v))v=v.slice(0,30).filter(x=>typeof x==='string'&&CATEGORY_NAMES.has(x)); if(v!==undefined)out[k]=v;}
  if(out.moq!==undefined&&String(out.moq).trim()!=='')out.moq=Number(out.moq);
  out.legalName=normalize(out.legalName); out.regNumber=normalize(out.regNumber).toUpperCase(); out.email=normalize(out.email).toLowerCase(); out.gstin=normalize(out.gstin).toUpperCase(); out.udyam=normalize(out.udyam).toUpperCase();
  return out;
}
function screenSubmission(p, existing=[]){
  const flags=[]; const required=['legalName','entityType','regType','regNumber','factoryCity','factoryState','contactName','role','email','phone','productCategory','productName','moq','processes'];
  const missing=required.filter(k=>!normalize(p[k])); if(missing.length)flags.push({code:'missing_fields',severity:'high',message:`Missing required fields: ${missing.join(', ')}`});
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email||''))flags.push({code:'email_format',severity:'medium',message:'Business email format needs review.'});
  if(!/^\+?[0-9() .-]{8,22}$/.test(p.phone||''))flags.push({code:'phone_format',severity:'medium',message:'Business phone format needs review.'});
  if(!Number.isSafeInteger(Number(p.moq))||Number(p.moq)<1)flags.push({code:'moq_invalid',severity:'high',message:'Minimum order quantity must be a positive whole number.'});
  if(p.regType==='CIN'&&!/^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/.test(p.regNumber||''))flags.push({code:'cin_format',severity:'high',message:'CIN does not match the expected format; verify against MCA.'});
  if(p.regType==='LLPIN'&&!/^[A-Z]{3}-?[0-9]{4}$/.test(p.regNumber||''))flags.push({code:'llpin_format',severity:'high',message:'LLPIN does not match the expected format; verify against MCA.'});
  if(p.regType==='GSTIN'&&!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(p.regNumber||''))flags.push({code:'gstin_format',severity:'high',message:'Registration GSTIN format appears invalid.'});
  if(p.gstin&&!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(p.gstin))flags.push({code:'optional_gstin_format',severity:'medium',message:'Optional GSTIN format appears invalid.'});
  if(p.udyam&&!/^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/.test(p.udyam))flags.push({code:'udyam_format',severity:'medium',message:'Udyam identifier format appears invalid.'});
  if(p.website&&!/^https:\/\//i.test(p.website))flags.push({code:'website_https',severity:'low',message:'Website should use a valid HTTPS URL.'});
  if(/\b(test company|example ltd|fake|placeholder|none|n\/a|asdf)\b/i.test([p.legalName,p.productName,p.processes,p.address].join(' ')))flags.push({code:'placeholder_language',severity:'medium',message:'Some submitted fields contain placeholder-like wording; ask applicant to clarify.'});
  if((p.certifications||'').trim())flags.push({code:'certifications_unchecked',severity:'medium',message:'Claimed certifications require evidence and issuer validation.'});
  const currentFingerprint=registrationFingerprint(p.regType,p.regNumber); const dup=existing.find(x=>(fingerprintForRow(x)===currentFingerprint) && (x.status||'')!=='rejected');
  if(dup)flags.push({code:'duplicate_registration',severity:'high',message:'This registration identifier has already been submitted. Check for duplicate or conflicting applications.'});
  const rank={low:1,medium:2,high:3}; flags.sort((a,b)=>rank[b.severity]-rank[a.severity]);
  return {engine:'deterministic-rules-v1',ranAt:new Date().toISOString(),flags,flagCount:flags.length,highestSeverity:flags[0]?.severity||'none',decision:'pending_human_review',note:'Rules check completeness and formats only. It does not verify government records, identity, ownership, or factory capability.'};
}
function supabaseConfig(){return {url:(process.env.SUPABASE_URL||'').replace(/\/$/,''),key:process.env.SUPABASE_SERVICE_ROLE_KEY||''};}
function registrationFingerprint(regType, regNumber){
 const secret=process.env.DATA_RETENTION_HMAC_KEY||process.env.ADMIN_TOKEN||'';
 if(!secret)throw Object.assign(new Error('DATA_RETENTION_HMAC_KEY or ADMIN_TOKEN must be configured before accepting registrations.'),{status:503});
 return crypto.createHmac('sha256',secret).update(`${String(regType||'').toUpperCase()}:${String(regNumber||'').trim().toUpperCase()}`).digest('hex');
}
function fingerprintForRow(row){
 return row?.registration_fingerprint || row?.screening?.registrationFingerprint || (row?.registration_number ? registrationFingerprint(row.payload?.regType,row.registration_number) : (row?.payload?.regNumber ? registrationFingerprint(row.payload?.regType,row.payload.regNumber) : ''));
}
const PUBLIC_FIELDS=['legalName','productCategory','productCategories','productSubcategories','productName','products','materials','industriesServed','capabilityKeywords','factoryCity','factoryState','website','moq','processes','capacity','certifications'];
function publicPayload(payload){
 const out={}; for(const key of PUBLIC_FIELDS){if(payload && payload[key]!==undefined && payload[key]!==null)out[key]=payload[key];}
 return out;
}
function sanitizeReviewEvidence(note){
 let s=String(note||'').slice(0,2000);
 s=s.replace(/https?:\/\/[^\s)]+/gi,raw=>{try{const u=new URL(raw);return u.protocol+'//'+u.host+u.pathname;}catch{return '[url removed]';}});
 s=s.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[email removed]');
 s=s.replace(/\+?\d[\d ().-]{7,}\d/g,'[number removed]');
 s=s.replace(/\b(?:UDYAM-[A-Z]{2}-\d{2}-\d{7}|[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]|[A-Z]{3}-?\d{4})\b/gi,'[identifier removed]');
 s=s.replace(/\b[A-Z0-9]{12,}\b/gi,'[long identifier removed]');
 return s.trim().slice(0,1000);
}
function scrubForDecision(row,status,adminNote){
 const screening=row.screening||{};
 const fingerprint=fingerprintForRow(row);
 const safeScreening={
  engine:screening.engine||'deterministic-rules-v1',
  ranAt:screening.ranAt||row.created_at,
  flags:Array.isArray(screening.flags)?screening.flags.map(f=>({code:String(f.code||'').slice(0,80),severity:String(f.severity||'').slice(0,20),message:String(f.message||'').slice(0,300)})):[],
  flagCount:Number(screening.flagCount||0),
  highestSeverity:String(screening.highestSeverity||'none'),
  decision:'human_review_completed',
  reviewEvidence:sanitizeReviewEvidence(adminNote),
 };
 const consent=row.public_listing_consent===true;
 const approvedPublic=status==='approved' && consent;
 return {
  ...row,
  status,
  legal_name:approvedPublic?(row.payload?.legalName||row.legal_name||''):'',
  registration_number:'',
  registration_fingerprint:status==='approved'?fingerprint:null,
  payload:approvedPublic?publicPayload(row.payload||{}):{},
  screening:safeScreening,
  admin_note:'',
  public_listing_consent:status==='rejected'?false:consent,
  rfq_contact_consent:status==='rejected'?false:(row.rfq_contact_consent===true),
  factory_contact_email:approvedPublic && row.rfq_contact_consent===true ? String(row.payload?.email||row.factory_contact_email||'').toLowerCase() : '',
  updated_at:new Date().toISOString(),
  reviewed_at:new Date().toISOString()
 };
}
const PENDING_RETENTION_DAYS=Math.max(30,Math.min(365,Number(process.env.PENDING_RETENTION_DAYS||90)));
const REJECTED_RETENTION_DAYS=Math.max(7,Math.min(180,Number(process.env.REJECTED_RETENTION_DAYS||30)));
async function purgeExpiredSubmissions(){
 ensureStorage();
 const rows=useSupabase()?await sb(`${TABLE}?select=id,status,created_at,updated_at`):localRead();
 const now=Date.now(); const expired=rows.filter(row=>{
  const status=row.status;
  const stamp=Date.parse(status==='rejected'?(row.updated_at||row.reviewed_at||row.created_at):(row.created_at||''));
  if(!Number.isFinite(stamp))return false;
  const ageDays=(now-stamp)/86400000;
  if(status==='pending')return ageDays>PENDING_RETENTION_DAYS;
  if(status==='needs_more_info')return ageDays>PENDING_RETENTION_DAYS;
  if(status==='rejected')return ageDays>REJECTED_RETENTION_DAYS;
  return false;
 });
 if(!expired.length)return 0;
 if(useSupabase()){
  for(const row of expired)await sb(`${TABLE}?id=eq.${encodeURIComponent(row.id)}`,{method:'DELETE',headers:{Prefer:'return=minimal'}});
 }else{
  const ids=new Set(expired.map(r=>r.id));localWrite(rows.filter(r=>!ids.has(r.id)));
 }
 return expired.length;
}
async function sb(pathname, options={}){
 const {url,key}=supabaseConfig(); if(!url||!key)throw Object.assign(new Error('Persistent database is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or use the local server.'),{status:503});
 const r=await fetch(`${url}/rest/v1/${pathname}`,{...options,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'return=representation',...(options.headers||{})}});
 const txt=await r.text(); let body; try{body=txt?JSON.parse(txt):null}catch{body=txt}; if(!r.ok)throw Object.assign(new Error(typeof body==='string'?body:(body?.message||'Database request failed.')),{status:r.status}); return body;
}
function localRead(){try{return JSON.parse(fs.readFileSync(LOCAL_DB,'utf8'))}catch{return []}}
function localWrite(rows){fs.mkdirSync(path.dirname(LOCAL_DB),{recursive:true});const tmp=LOCAL_DB+'.tmp';fs.writeFileSync(tmp,JSON.stringify(rows,null,2),{mode:0o600});fs.renameSync(tmp,LOCAL_DB);}
function useSupabase(){const c=supabaseConfig();return !!(c.url&&c.key)}
function ensureStorage(){if(process.env.VERCEL&&!useSupabase())throw Object.assign(new Error('Persistent storage is not configured for Vercel. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY and run sql/supabase-schema.sql.'),{status:503});}
async function listSubmissions(options={}){ensureStorage();if(options.purge===true)await purgeExpiredSubmissions();if(useSupabase())return await sb(`${TABLE}?select=*&order=created_at.desc`);return localRead().sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));}
async function createSubmission(payload, screening, publicListingConsent, rfqContactConsent=false){
 ensureStorage();
 const fingerprint=registrationFingerprint(payload.regType,payload.regNumber);
 const record={id:crypto.randomUUID(),reference:'MF-'+crypto.randomBytes(4).toString('hex').toUpperCase(),legal_name:payload.legalName,registration_number:payload.regNumber,registration_fingerprint:fingerprint,status:'pending',public_listing_consent:publicListingConsent===true,rfq_contact_consent:rfqContactConsent===true,factory_contact_email:'',payload,screening,admin_note:'',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),reviewed_at:null};
 if(useSupabase()){const rows=await sb(TABLE,{method:'POST',body:JSON.stringify(record)});return Array.isArray(rows)?rows[0]:record;}
 const rows=localRead();rows.push(record);localWrite(rows);return record;
}
async function listPublicFactories(){const rows=await listSubmissions();return rows.filter(x=>x.status==='approved'&&x.public_listing_consent===true).map(x=>{const p=x.payload||{};return {id:x.id,legalName:p.legalName,productCategory:p.productCategory,productCategories:Array.isArray(p.productCategories)&&p.productCategories.length?p.productCategories:[p.productCategory].filter(Boolean),productSubcategories:p.productSubcategories||'',productName:p.productName,products:p.products||'',materials:p.materials||'',industriesServed:p.industriesServed||'',capabilityKeywords:p.capabilityKeywords||'',factoryCity:p.factoryCity,factoryState:p.factoryState,website:p.website||'',moq:p.moq,processes:p.processes,capacity:p.capacity||'',certifications:p.certifications||'',canReceiveInquiries:x.rfq_contact_consent===true&&Boolean(x.factory_contact_email),verifiedAt:x.reviewed_at||x.updated_at,reference:x.reference};});}
async function getRfqRecipient(factoryId){
 const rows=await listSubmissions();
 const row=rows.find(x=>x.id===factoryId && x.status==='approved' && x.public_listing_consent===true && x.rfq_contact_consent===true && String(x.factory_contact_email||'').includes('@'));
 if(!row)return null;
 return {id:row.id,email:row.factory_contact_email,legalName:row.payload?.legalName||row.legal_name||'Approved supplier',city:row.payload?.factoryCity||'',state:row.payload?.factoryState||'',productCategory:row.payload?.productCategory||'',productName:row.payload?.productName||''};
}
async function updateSubmission(id, status, adminNote){
 ensureStorage();
 const all=await listSubmissions();
 const current=all.find(x=>x.id===id);
 if(!current)throw Object.assign(new Error('Submission not found.'),{status:404});
 const next=(status==='approved'||status==='rejected')?scrubForDecision(current,status,adminNote):{...current,status,admin_note:String(adminNote||'').trim().slice(0,2000),updated_at:new Date().toISOString(),reviewed_at:null};
 if(useSupabase()){const rows=await sb(`${TABLE}?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(next)});if(!rows?.length)throw Object.assign(new Error('Submission not found.'),{status:404});return rows[0];}
 const rows=localRead();const i=rows.findIndex(x=>x.id===id);if(i<0)throw Object.assign(new Error('Submission not found.'),{status:404});rows[i]=next;localWrite(rows);return rows[i];
}

async function deleteSubmission(id){
 ensureStorage();
 if(useSupabase()){
  const rows=await sb(`${TABLE}?id=eq.${encodeURIComponent(id)}`,{method:'DELETE',headers:{Prefer:'return=representation'}});
  if(!rows?.length)throw Object.assign(new Error('Submission not found.'),{status:404});
  return {ok:true,id};
 }
 const rows=localRead();const next=rows.filter(x=>x.id!==id);
 if(next.length===rows.length)throw Object.assign(new Error('Submission not found.'),{status:404});
 localWrite(next);return {ok:true,id};
}

function adminView(row){
 if(!row)return row;
 const screening={...(row.screening||{})};delete screening.registrationFingerprint;
 const out={...row,screening};delete out.registration_fingerprint;delete out.factory_contact_email;return out;
}
function parseCookies(req){const out={};for(const part of String(req.headers.cookie||'').split(';')){const i=part.indexOf('=');if(i>0)out[part.slice(0,i).trim()]=part.slice(i+1).trim();}return out;}
function createAdminSessionCookie(adminToken,secure=true){
 if(!tokenMatches(adminToken,process.env.ADMIN_TOKEN))return null;
 const payload=Buffer.from(JSON.stringify({exp:Date.now()+30*60*1000,nonce:crypto.randomBytes(12).toString('hex')})).toString('base64url');
 const sig=crypto.createHmac('sha256',process.env.ADMIN_TOKEN).update(payload).digest('base64url');
 return `mf_admin_session=${payload}.${sig}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=1800${secure?'; Secure':''}`;
}
function clearAdminSessionCookie(secure=true){return `mf_admin_session=; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=0${secure?'; Secure':''}`;}
function isAdmin(req){
 const token=process.env.ADMIN_TOKEN;if(!token)return false;
 const cookie=parseCookies(req).mf_admin_session||'';const parts=cookie.split('.');
 if(parts.length!==2)return false;
 const expected=crypto.createHmac('sha256',token).update(parts[0]).digest('base64url');
 if(!tokenMatches(parts[1],expected))return false;
 try{const payload=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));return Number(payload.exp)>Date.now();}catch{return false;}
}
function tokenMatches(a,b){if(!a||!b)return false;const aa=Buffer.from(String(a)),bb=Buffer.from(String(b));return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);}
module.exports={FIELD_SCHEMA,validateTypedPayload,cleanPayload,screenSubmission,listSubmissions,listPublicFactories,createSubmission,getRfqRecipient,updateSubmission,deleteSubmission,tokenMatches,isAdmin,useSupabase,registrationFingerprint,purgeExpiredSubmissions,createAdminSessionCookie,clearAdminSessionCookie,adminView};

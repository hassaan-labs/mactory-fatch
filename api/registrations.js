'use strict';
const store = require('../verification-store.cjs');
const buckets = new Map();
function rateLimited(req){const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();const now=Date.now();const recent=(buckets.get(ip)||[]).filter(t=>now-t<10*60*1000);if(recent.length>=5){buckets.set(ip,recent);return true;}recent.push(now);buckets.set(ip,recent);return false;}
module.exports = async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed.'});}
  if(rateLimited(req))return res.status(429).json({error:'Too many registration attempts. Wait 10 minutes before trying again.'});
  if(!process.env.ADMIN_TOKEN||!process.env.DATA_RETENTION_HMAC_KEY)return res.status(503).json({error:'Registration intake is disabled until the operator configures the private admin token and data-retention fingerprint secret.'});
  try{
    const body=req.body||{}; const raw=body.payload||body;
    const schemaErrors=store.validateTypedPayload(raw);
    if(schemaErrors.length)return res.status(400).json({error:'Some fields do not match the required data types or allowed values.',details:schemaErrors});
    const p=store.cleanPayload(raw);
    if(body.attestation!==true||body.privacyConsent!==true)return res.status(400).json({error:'The accuracy attestation and privacy consent are required. Public listing consent is optional.'});
    await store.purgeExpiredSubmissions();
    const existing=await store.listSubmissions();
    const fingerprint=store.registrationFingerprint(p.regType,p.regNumber);
    const duplicate=existing.some(x=>(x.registration_fingerprint||x.screening?.registrationFingerprint||((x.registration_number||x.payload?.regNumber)?store.registrationFingerprint(x.payload?.regType||p.regType,x.registration_number||x.payload?.regNumber):''))===fingerprint && x.status!=='rejected');
    if(duplicate)return res.status(409).json({error:'This registration number already has an active submission. Contact support if you believe this is a mistake.'});
    const screening=store.screenSubmission(p,existing);
    const record=await store.createSubmission(p,screening,body.publicListingConsent===true,body.rfqContactConsent===true);
    return res.status(201).json({ok:true,reference:record.reference,status:record.status,screening:{engine:record.screening.engine,flags:record.screening.flags,flagCount:record.screening.flagCount,highestSeverity:record.screening.highestSeverity,decision:record.screening.decision,note:record.screening.note},message:'Submission received and placed in pending review. No public listing or verified badge has been created.'});
  }catch(e){return res.status(e.status||500).json({error:e.status===503?e.message:'Could not save the submission. Check the database configuration and try again.'});}
};

'use strict';
const store=require('../../verification-store.cjs');
const attempts=new Map();
const {verifyTotp}=require('../../lib/totp.cjs');
function limited(req){const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();const now=Date.now();const a=(attempts.get(ip)||[]).filter(t=>now-t<10*60*1000);if(a.length>=8){attempts.set(ip,a);return true;}a.push(now);attempts.set(ip,a);return false;}
function secure(req){return process.env.VERCEL==='1'||String(req.headers['x-forwarded-proto']||'').split(',')[0].trim()==='https';}
function sameOrigin(req){const origin=req.headers.origin;if(!origin)return true;try{const u=new URL(origin);const host=String(req.headers['x-forwarded-host']||req.headers.host||'').split(',')[0].trim();return u.host===host;}catch{return false;}}
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Vary','Cookie');
 if(!sameOrigin(req))return res.status(403).json({error:'Cross-origin admin requests are not allowed.'});
 if(req.method==='POST'){
  if(limited(req))return res.status(429).json({error:'Too many sign-in attempts. Wait 10 minutes and try again.'});
  const token=String(req.body?.token||'');
  const totpSecret=String(process.env.ADMIN_TOTP_SECRET||'');
  if(process.env.VERCEL==='1'&&!totpSecret)return res.status(503).json({error:'Admin MFA is not configured. Set ADMIN_TOTP_SECRET before enabling the production admin console.'});
  if(totpSecret&&!verifyTotp(totpSecret,String(req.body?.totpCode||'')))return res.status(401).json({error:'Invalid or expired authenticator code.'});
  const cookie=store.createAdminSessionCookie(token,secure(req));
  if(!cookie)return res.status(401).json({error:'Invalid administrator credential.'});
  res.setHeader('Set-Cookie',cookie);
  return res.status(200).json({ok:true,expiresInSeconds:1800});
 }
 if(req.method==='DELETE'){
  res.setHeader('Set-Cookie',store.clearAdminSessionCookie(secure(req)));
  return res.status(200).json({ok:true});
 }
 res.setHeader('Allow','POST, DELETE');return res.status(405).json({error:'Method not allowed.'});
};

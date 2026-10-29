'use strict';
const store=require('../../verification-store.cjs');
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 const origin=req.headers.origin;
 if(origin){try{const u=new URL(origin);const host=String(req.headers['x-forwarded-host']||req.headers.host||'').split(',')[0].trim();if(u.host!==host)return res.status(403).json({error:'Cross-origin admin requests are not allowed.'});}catch{return res.status(403).json({error:'Invalid request origin.'});}}
 if(!process.env.ADMIN_TOKEN)return res.status(503).json({error:'ADMIN_TOKEN is not configured.'});
 if(!store.isAdmin(req))return res.status(401).json({error:'Admin authentication required.'});
 try{
  if(req.method==='GET'){await store.purgeExpiredSubmissions();return res.status(200).json({submissions:(await store.listSubmissions()).map(store.adminView)});}
  if(req.method==='DELETE'){
   const {id}=req.body||{};
   if(!id)return res.status(400).json({error:'Submission ID is required.'});
   return res.status(200).json(await store.deleteSubmission(id));
  }
  if(req.method==='PATCH'){
   const {id,status,adminNote,manualChecksComplete}=req.body||{};
   if(!id||!['pending','needs_more_info','approved','rejected'].includes(status))return res.status(400).json({error:'Invalid submission ID or status.'});
   const note=String(adminNote||'').trim().slice(0,2000);
   if(status==='approved'&&(manualChecksComplete!==true||note.length<30))return res.status(400).json({error:'To approve, confirm manual checks and record at least 30 characters of evidence/review notes.'});
   if(status==='approved'&&!(await store.listSubmissions()).some(x=>x.id===id))return res.status(404).json({error:'Submission not found.'});
   if(status==='rejected'&&note.length<10)return res.status(400).json({error:'Add a clear reason before rejecting.'});
   const row=await store.updateSubmission(id,status,note);return res.status(200).json({ok:true,submission:store.adminView(row)});
  }
  res.setHeader('Allow','GET, PATCH, DELETE');return res.status(405).json({error:'Method not allowed.'});
 }catch(e){return res.status(e.status||500).json({error:e.status===503?e.message:'Could not process admin request.'});}
};

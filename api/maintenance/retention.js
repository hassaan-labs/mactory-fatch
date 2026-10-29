'use strict';
const store=require('../../verification-store.cjs');
const rfqService=require('../../lib/rfq-service.cjs');
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'&&req.method!=='POST'){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Method not allowed.'});}
 const secret=process.env.CRON_SECRET;
 if(!secret)return res.status(503).json({error:'Retention cron is disabled until CRON_SECRET is configured.'});
 const auth=String(req.headers.authorization||'');
 if(auth!==`Bearer ${secret}`)return res.status(401).json({error:'Unauthorized.'});
 try{const deletedSubmissions=await store.purgeExpiredSubmissions();const deletedRfqs=await rfqService.purgeExpiredRfqs();return res.status(200).json({ok:true,deletedSubmissions,deletedRfqs,ranAt:new Date().toISOString()});}
 catch(e){return res.status(e.status||500).json({error:'Retention cleanup failed.'});}
};

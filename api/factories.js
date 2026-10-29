'use strict';
const store=require('../verification-store.cjs');
module.exports=async function handler(req,res){res.setHeader('Cache-Control','public, s-maxage=60, stale-while-revalidate=300');if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed.'});}try{return res.status(200).json({factories:await store.listPublicFactories()});}catch(e){return res.status(e.status||500).json({error:e.status===503?e.message:'Could not load approved manufacturers.'});}};

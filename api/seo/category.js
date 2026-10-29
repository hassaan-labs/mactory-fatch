'use strict';
const seo=require('../../lib/public-seo');
module.exports=async function(req,res){res.setHeader('Cache-Control','public, s-maxage=300, stale-while-revalidate=1800');try{const out=await seo.renderCategory(String(req.query.slug||''),req);res.setHeader('Content-Type','text/html; charset=utf-8');return res.status(out.status).send(out.html);}catch(e){res.setHeader('Content-Type','text/html; charset=utf-8');return res.status(503).send('<!doctype html><title>Directory temporarily unavailable</title><h1>Directory temporarily unavailable</h1><p>Please try again shortly.</p>');}};

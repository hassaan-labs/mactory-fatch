'use strict';
const seo=require('../../lib/public-seo');
module.exports=async function(req,res){res.setHeader('Content-Type','application/xml; charset=utf-8');res.setHeader('Cache-Control','public, s-maxage=300, stale-while-revalidate=1800');try{return res.status(200).send(await seo.renderSitemap(req));}catch(e){return res.status(503).send('<?xml version="1.0"?><error>Sitemap temporarily unavailable</error>');}};

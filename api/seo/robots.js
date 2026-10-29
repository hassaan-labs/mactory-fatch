'use strict';
const seo=require('../../lib/public-seo');
module.exports=function(req,res){res.setHeader('Content-Type','text/plain; charset=utf-8');res.setHeader('Cache-Control','public, s-maxage=3600');return res.status(200).send(seo.renderRobots(req));};

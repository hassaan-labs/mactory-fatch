'use strict';
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed.'});}
 const supabaseConfigured=Boolean(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY);
 const adminConfigured=Boolean(process.env.ADMIN_TOKEN);
 const adminMfaConfigured=Boolean(process.env.ADMIN_TOTP_SECRET);
 const retentionConfigured=Boolean(process.env.DATA_RETENTION_HMAC_KEY);
 const cronConfigured=Boolean(process.env.CRON_SECRET);
 const registrationConfigured=Boolean(adminConfigured&&retentionConfigured&&supabaseConfigured);
 const rfqConfigured=Boolean(supabaseConfigured&&process.env.RFQ_TOKEN_SECRET&&process.env.RESEND_API_KEY&&process.env.EMAIL_FROM&&process.env.SITE_URL&&String(process.env.RATE_LIMIT_HMAC_KEY||'').length>=32);
 return res.status(200).json({
  ok:true,
  storageMode:supabaseConfigured?'supabase':'unconfigured',
  registrationConfigured,
  rfqConfigured,
  rateLimitConfigured:String(process.env.RATE_LIMIT_HMAC_KEY||'').length>=32,
  emailConfigured:Boolean(process.env.RESEND_API_KEY&&process.env.EMAIL_FROM),
  adminConfigured,
  adminMfaConfigured,
  retentionConfigured,
  scheduledRetentionConfigured:cronConfigured,
  aiConfigured:Boolean(process.env.OPENAI_API_KEY),
  aiModel:process.env.OPENAI_API_KEY?(process.env.OPENAI_MODEL||'configured-model'):null,
  verificationMode:'rules-based triage and mandatory human review; no automatic government registry verification'
 });
};

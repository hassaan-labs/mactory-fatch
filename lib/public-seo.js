'use strict';
const store = require('../verification-store.cjs');

const TAXONOMY = require('../assets/manufacturing-taxonomy.json');
const LEGACY_DESCRIPTIONS = new Map([
  ['food-beverages','Food and beverage manufacturing. Confirm food-safety licences, facility scope, shelf life and packaging requirements.'],
  ['beauty-skincare-cosmetics','Private-label and contract manufacturing for skincare, cosmetics, perfumes and personal-care products. Confirm formulations, minimum batches, testing and regulatory responsibilities.'],
  ['plastic-products','Injection moulding, extrusion, blow moulding and other plastic processes. Share resin, part drawings, tooling needs and expected volumes.'],
  ['metal-products-components','Metal fabricators and component manufacturers. Compare cutting, forming, welding, machining, finishing and quality capabilities.'],
  ['paper-stationery-books','Printers and manufacturers for stationery, notebooks, books and paper products. Specify paper stock, sizes, binding, finishes and quantities.']
]);
const CATEGORIES = TAXONOMY.map(c=>({name:c.name,slug:c.slug,title:`${c.name} manufacturing`,description:LEGACY_DESCRIPTIONS.get(c.slug)||c.description}));

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function slugify(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90).replace(/-+$/,'');
}
function factorySlug(factory) {
  return [slugify(factory.legalName), slugify(factory.factoryCity), slugify(factory.reference)].filter(Boolean).join('-');
}
function siteBase(req) {
  const configured = String(process.env.SITE_URL || '').trim().replace(/\/+$/,'');
  if (configured && /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(configured)) return configured;
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost:8000').split(',')[0].trim();
  const proto = String(req.headers['x-forwarded-proto'] || (host.startsWith('localhost') ? 'http' : 'https')).split(',')[0].trim();
  if (!/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) return 'https://mactoryfatch.com';
  return `${proto}://${host}`;
}
function pageHead({title,description,path,req,robots='index,follow',image='/assets/hero-factory.jpg',jsonLd=null}) {
  const base = siteBase(req);
  const canonical = `${base}${path}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#18372f"><meta name="description" content="${esc(description)}"><meta name="robots" content="${esc(robots)}"><link rel="canonical" href="${esc(canonical)}"><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/site.css"><title>${esc(title)}</title><meta property="og:type" content="website"><meta property="og:site_name" content="MACTORY FATCH"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(canonical)}"><meta property="og:image" content="${esc(base+image)}"><meta name="twitter:card" content="summary_large_image">${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g,'\\u003c')}</script>` : ''}</head>`;
}
function shell({title,description,path,req,content,robots='index,follow',jsonLd=null}) {
  return `${pageHead({title,description,path,req,robots,jsonLd})}<body><header class="site-header"><div class="container nav-wrap"><a class="brand" href="/" aria-label="MACTORY FATCH home"><span class="brand-name">MACTORY FATCH</span><span class="brand-tag">Manufacturing connected</span></a><nav class="nav-links" aria-label="Main navigation"><a href="/">Home</a><a href="/customer">For buyers</a><a href="/factoryowner">For factories</a><a href="/categories">Categories</a></nav><div class="nav-actions"><a class="button button-quiet" href="/workspace.html">My workspace</a><a class="button button-primary" href="/customer#buyerBrief">Submit a requirement ↗</a></div><button class="menu-toggle" id="menuToggle" aria-label="Open navigation" aria-expanded="false">☰</button></div><nav class="mobile-menu" id="mobileMenu" aria-label="Mobile navigation"><a href="/">Home</a><a href="/customer">For buyers</a><a href="/factoryowner">For factories</a><a href="/categories">Categories</a></nav></header><main>${content}</main><footer class="site-footer"><div class="container"><div class="footer-top"><div class="footer-brand"><a class="brand" href="/"><span class="brand-name">MACTORY FATCH</span><span class="brand-tag">Manufacturing connected</span></a><p class="footer-description">A clearer way to discover manufacturing capabilities and organize sourcing conversations.</p></div><div class="footer-links"><div class="footer-col"><strong>Explore</strong><a href="/categories">Browse categories</a><a href="/customer">Find manufacturers</a><a href="/factoryowner">For factory owners</a></div><div class="footer-col"><strong>Company</strong><a href="/about.html">About</a><a href="/contact.html">Contact</a><a href="/terms.html">Terms</a></div><div class="footer-col"><strong>Policies</strong><a href="/privacy.html">Privacy</a><a href="/contact.html#report">Report an issue</a></div></div></div><div class="footer-bottom"><span>© ${new Date().getUTCFullYear()} MACTORY FATCH.</span><span>Factory listings are published only after approval and publication consent. Buyers should independently assess supplier suitability.</span></div></div></footer><script>document.getElementById('menuToggle')?.addEventListener('click',()=>{const m=document.getElementById('mobileMenu');const b=document.getElementById('menuToggle');const open=m.classList.toggle('is-open');b.setAttribute('aria-expanded',String(open));});</script></body></html>`;
}
function categoryCards() {
  return CATEGORIES.map(c => `<a class="category-seo-card" href="/category/${c.slug}"><span class="category-seo-name">${esc(c.name)}</span><span class="category-seo-description">${esc(c.description)}</span><span class="link-button">Explore category →</span></a>`).join('');
}
function factoryCard(f) {
  return `<article class="factory-card"><div class="factory-body"><div class="factory-title-row"><div><h2 class="factory-title">${esc(f.legalName)}</h2><p class="factory-location">${esc([f.factoryCity,f.factoryState].filter(Boolean).join(', '))}</p></div><span class="pill">Approved listing</span></div><div class="tag-row">${[...(Array.isArray(f.productCategories)?f.productCategories:[f.productCategory]),f.productSubcategories,f.productName,f.materials].filter(Boolean).slice(0,7).map(v=>`<span class="tag">${esc(v)}</span>`).join('')}</div><p class="muted small">${esc(f.processes || 'Capabilities not specified.')}</p><div class="factory-meta"><div><span class="meta-label">Minimum order</span><span class="meta-value">${esc(f.moq || 'Ask supplier')}</span></div><div><span class="meta-label">Monthly capacity</span><span class="meta-value">${esc(f.capacity || 'Ask supplier')}</span></div></div><div class="factory-actions"><span class="small muted">Public listing approved</span><a class="link-button" href="/factory/${factorySlug(f)}">View factory profile →</a></div></div></article>`;
}
async function getFactories() { return await store.listPublicFactories(); }
function categoryForSlug(slug) { return CATEGORIES.find(c => c.slug === slug); }
async function renderCategory(slug, req) {
  const category = categoryForSlug(slug);
  if (!category) return {status:404,html:shell({title:'Category not found | MACTORY FATCH',description:'This manufacturing category could not be found.',path:`/category/${slugify(slug)}`,req,robots:'noindex,follow',content:'<section class="section"><div class="container"><h1>Category not found</h1><p>This category URL is not recognised.</p><a class="button button-primary" href="/categories">Browse all categories</a></div></section>'})};
  let factories = [];
  try { factories = await getFactories(); } catch (_) {}
  const matches = factories.filter(f => f.productCategory === category.name || (Array.isArray(f.productCategories)&&f.productCategories.includes(category.name)));
  const robots = matches.length ? 'index,follow' : 'noindex,follow';
  const description = `${category.description} Browse approved public factory profiles on MACTORY FATCH or submit a manufacturing requirement for sourcing assistance.`;
  const list = matches.length ? `<div class="factory-grid">${matches.map(factoryCard).join('')}</div>` : `<div class="empty-state"><strong>No approved public listings in this category yet.</strong><p>We do not invent supplier names or publish pending applications. If you need a manufacturer in this category, submit your requirement and MACTORY FATCH can help organise sourcing research.</p><div class="form-actions"><a class="button button-primary" href="/customer#buyerBrief">Submit a sourcing requirement →</a><a class="button button-outline" href="/factoryowner#register">Register a factory →</a></div></div>`;
  const related = CATEGORIES.filter(c=>c.slug!==slug).slice(0,10).map(c=>`<a class="tag" href="/category/${c.slug}">${esc(c.name)}</a>`).join(' ');
  const jsonLd = {'@context':'https://schema.org','@type':'CollectionPage','name':category.title,'description':description,'url':`${siteBase(req)}/category/${category.slug}`,'isPartOf':{'@type':'WebSite','name':'MACTORY FATCH','url':siteBase(req)},'mainEntity':{'@type':'ItemList','numberOfItems':matches.length,'itemListElement':matches.map((f,i)=>({'@type':'ListItem','position':i+1,'url':`${siteBase(req)}/factory/${factorySlug(f)}`,'name':f.legalName}))}};
  const content = `<section class="page-hero"><div class="container"><div class="breadcrumb"><a href="/">Home</a> / <a href="/categories">Categories</a> / ${esc(category.name)}</div><p class="eyebrow">Manufacturing category</p><h1>${esc(category.title)}</h1><p class="lead">${esc(category.description)}</p><p class="section-intro">Compare published factory capabilities, review the details that matter for your order and request quotations when you are ready.</p><div class="hero-actions"><a class="button button-primary" href="/customer#buyerBrief">Submit a manufacturing requirement →</a><a class="button button-outline" href="/categories">Browse all categories</a></div></div></section><section class="section"><div class="container"><div class="section-head"><div><p class="section-kicker">Public directory</p><h2>${matches.length} approved ${matches.length===1?'factory':'factories'} listed</h2><p class="section-intro">${matches.length ? 'Listings shown here have been approved for public display. Confirm fit, certifications and commercial terms directly before placing an order.' : 'The public directory is currently building this category. No factory profiles are fabricated or inferred.'}</p></div></div>${list}</div></section><section class="section-tight"><div class="container"><h2>What to include in your manufacturing brief</h2><div class="how-grid"><article class="how-step"><h3>Specifications</h3><p>Drawings, dimensions, materials, tolerances, finish and applicable standards.</p></article><article class="how-step"><h3>Order requirements</h3><p>Quantity, target delivery date, repeat-order expectations and delivery location.</p></article><article class="how-step"><h3>Quality and compliance</h3><p>Required tests, certificates and documentation. Verify claims independently.</p></article></div><h3>Explore related categories</h3><div class="tag-row">${related}</div></div></section>`;
  return {status:200,html:shell({title:`${category.title} | MACTORY FATCH`,description,path:`/category/${category.slug}`,req,robots,jsonLd,content})};
}
async function renderFactory(slug, req) {
  let factories = [];
  try { factories = await getFactories(); } catch (_) {}
  const factory = factories.find(f => factorySlug(f) === slug);
  if (!factory) return {status:404,html:shell({title:'Factory profile unavailable | MACTORY FATCH',description:'This factory profile is not currently available in the public directory.',path:`/factory/${slugify(slug)}`,req,robots:'noindex,follow',content:'<section class="section"><div class="container"><div class="breadcrumb"><a href="/">Home</a> / <a href="/customer">Factory directory</a> / Profile unavailable</div><h1>Factory profile unavailable</h1><div class="empty-state"><strong>This factory is not currently listed publicly.</strong><p>It may not have been approved for publication, may have been removed, or the link may be incorrect. MACTORY FATCH does not expose pending applications.</p><a class="button button-primary" href="/customer">Browse the directory</a></div></div></section>'})};
  const factoryCategories = Array.isArray(factory.productCategories)&&factory.productCategories.length ? factory.productCategories : [factory.productCategory];
  const category = CATEGORIES.find(c=>c.name===factoryCategories[0]) || categoryForSlug(slugify(factory.productCategory)) || CATEGORIES.find(c=>c.name===factory.productCategory);
  const title = `${factory.legalName} | ${factory.productCategory} | MACTORY FATCH`;
  const description = `${factory.legalName} in ${[factory.factoryCity,factory.factoryState].filter(Boolean).join(', ')}. Publicly approved profile for ${factory.productName}, with declared manufacturing processes and order details. Contact the supplier to confirm current capabilities.`;
  const props = [
    ['Product / capability',factory.productName],
    ['Categories',factoryCategories.join(', ')],
    ['Specific products / subcategories',factory.productSubcategories],
    ['Products / components',factory.products || factory.productName],
    ['Materials processed',factory.materials],
    ['Industries served',factory.industriesServed],
    ['Capabilities',factory.capabilityKeywords],
    ['Location',[factory.factoryCity,factory.factoryState].filter(Boolean).join(', ')],
    ['Manufacturing processes',factory.processes],
    ['Minimum order quantity',factory.moq],
    ['Declared capacity',factory.capacity],
    ['Declared certifications',factory.certifications],
    ['Website',factory.website]
  ].filter(x=>String(x[1]||'').trim());
  const propRows = props.map(([k,v])=>`<div class="factory-detail-row"><dt>${esc(k)}</dt><dd>${k==='Website' && /^https:\/\/[^\s]+$/i.test(String(v)) ? `<a href="${esc(v)}" rel="nofollow noopener noreferrer" target="_blank">${esc(v)}</a>` : esc(v)}</dd></div>`).join('');
  const jsonLd = {'@context':'https://schema.org','@type':'Organization','name':factory.legalName,'url':`${siteBase(req)}/factory/${factorySlug(factory)}`,'description':description,'address':{'@type':'PostalAddress','addressLocality':factory.factoryCity,'addressRegion':factory.factoryState,'addressCountry':'IN'},'knowsAbout':[...factoryCategories,factory.productName,factory.materials,factory.industriesServed,factory.capabilityKeywords,...String(factory.processes||'').split(/[,;\n]/).map(s=>s.trim()).filter(Boolean).slice(0,8)].filter(Boolean)};
  const content = `<section class="page-hero"><div class="container"><div class="breadcrumb"><a href="/">Home</a> / <a href="/customer">Factory directory</a> / <a href="/category/${category ? category.slug : 'other-not-listed'}">${esc(factory.productCategory)}</a> / ${esc(factory.legalName)}</div><p class="eyebrow">Public factory profile</p><h1>${esc(factory.legalName)}</h1><p class="lead">${esc([factory.factoryCity,factory.factoryState].filter(Boolean).join(', '))} · ${esc(factoryCategories.join(' · '))}</p><div class="badges"><span class="pill">Approved public listing</span><span class="pill">${esc(factory.productName)}</span></div><p class="section-intro">This profile contains information supplied during onboarding and approved for public display. Confirm specifications, capacity, certificates and commercial terms directly with the supplier.</p><div class="hero-actions"><a class="button button-primary" href="/customer#buyerBrief">Request sourcing assistance →</a><a class="button button-outline" href="/category/${category ? category.slug : 'other-not-listed'}">More in this category</a></div></div></section><section class="section"><div class="container"><div class="factory-detail-layout"><div><p class="section-kicker">Supplier information</p><h2>Capabilities and order details</h2><dl class="factory-detail-list">${propRows}</dl></div><aside class="notice"><strong>Before placing an order</strong><p>Contact the factory to confirm current capacity, sample availability, lead time, pricing, quality controls and delivery terms.</p><p>Any declared certifications or capabilities should be independently checked for your intended use.</p><a href="/customer#buyerBrief" class="button button-primary">Need help finding a supplier? →</a></aside></div></div></section>`;
  return {status:200,html:shell({title,description,path:`/factory/${factorySlug(factory)}`,req,robots:'index,follow',jsonLd,content})};
}
async function renderSitemap(req) {
  let factories = [];
  try { factories = await getFactories(); } catch (_) {}
  const base = siteBase(req);
  const staticPaths = ['/', '/customer', '/factoryowner', '/categories', '/about.html', '/contact.html', '/privacy.html', '/terms.html'];
  const entries = staticPaths.map(p=>`<url><loc>${esc(base+p)}</loc></url>`);
  for (const category of CATEGORIES) {
    if (factories.some(f=>f.productCategory===category.name || (Array.isArray(f.productCategories)&&f.productCategories.includes(category.name)))) entries.push(`<url><loc>${esc(base+'/category/'+category.slug)}</loc></url>`);
  }
  for (const factory of factories) {
    entries.push(`<url><loc>${esc(base+'/factory/'+factorySlug(factory))}</loc>${factory.verifiedAt ? `<lastmod>${new Date(factory.verifiedAt).toISOString().slice(0,10)}</lastmod>` : ''}</url>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join('')}</urlset>`;
}
function renderRobots(req) {
  const base = siteBase(req);
  return `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin.html\nDisallow: /workspace.html\nSitemap: ${base}/sitemap.xml\n`;
}
module.exports = {CATEGORIES, esc, slugify, factorySlug, siteBase, getFactories, renderCategory, renderFactory, renderSitemap, renderRobots, categoryCards};

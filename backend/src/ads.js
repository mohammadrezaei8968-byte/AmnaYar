// AmnaYar advertising / direct sponsorship module
module.exports = function registerAds({app, db, ownerAuth, now, crypto}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS advertisers(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contact_name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      website TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'lead',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ad_leads(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand_name TEXT NOT NULL,
      contact_name TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      website TEXT NOT NULL DEFAULT '',
      placement TEXT NOT NULL DEFAULT 'leader',
      budget_toman INTEGER NOT NULL DEFAULT 0,
      message TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ad_leads_status ON ad_leads(status,created_at);
    CREATE TABLE IF NOT EXISTS ad_campaigns(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      advertiser_id INTEGER,
      name TEXT NOT NULL,
      placement TEXT NOT NULL,
      format TEXT NOT NULL DEFAULT 'banner',
      creative_url TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      destination_url TEXT NOT NULL DEFAULT '',
      headline TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      cta TEXT NOT NULL DEFAULT 'مشاهده',
      pricing_model TEXT NOT NULL DEFAULT 'flat',
      price_toman INTEGER NOT NULL DEFAULT 0,
      start_at TEXT,
      end_at TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ad_events(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      placement TEXT,
      ip_hash TEXT,
      user_agent TEXT,
      referer TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ad_campaign_status ON ad_campaigns(status,placement,start_at,end_at);
    CREATE INDEX IF NOT EXISTS idx_ad_events_campaign ON ad_events(campaign_id,event_type);
  `);

  const activeCampaign = (placement) => db.prepare(`
    SELECT c.*, a.name advertiser_name
    FROM ad_campaigns c LEFT JOIN advertisers a ON a.id=c.advertiser_id
    WHERE c.placement=? AND c.status='active'
      AND (c.start_at IS NULL OR c.start_at<=?)
      AND (c.end_at IS NULL OR c.end_at>=?)
    ORDER BY c.id DESC LIMIT 1
  `).get(placement, now(), now());

  const logEvent = (req, campaignId, type, placement) => {
    const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'').split(',')[0].trim();
    const hash=crypto.createHash('sha256').update(ip+'|'+String(process.env.AD_EVENT_SALT||'amnayar')).digest('hex');
    db.prepare('INSERT INTO ad_events(campaign_id,event_type,placement,ip_hash,user_agent,referer,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(campaignId,type,placement,hash,String(req.headers['user-agent']||'').slice(0,500),String(req.headers.referer||'').slice(0,500),now());
  };

  app.post('/api/ads/leads',(req,res)=>{
    const b=req.body||{}, brand=String(b.brand_name||'').trim();
    const phone=String(b.phone||'').trim(), email=String(b.email||'').trim();
    if(!brand || (!phone && !email)) return res.status(400).json({error:'نام برند و حداقل یک راه ارتباطی الزامی است'});
    const t=now();
    const r=db.prepare('INSERT INTO ad_leads(brand_name,contact_name,phone,email,website,placement,budget_toman,message,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(brand,String(b.contact_name||''),phone,email,String(b.website||''),String(b.placement||'leader'),Number(b.budget_toman||0),String(b.message||''),'new',t);
    res.json({ok:true,id:r.lastInsertRowid});
  });

  app.get('/api/ads', (req,res)=>{
    const placement=String(req.query.placement||'leader').trim().slice(0,60);
    const c=activeCampaign(placement);
    if(!c) return res.json({active:false,placement});
    res.json({active:true,placement,campaign:{id:c.id,format:c.format,image_url:c.image_url,destination_url:c.destination_url,headline:c.headline,body:c.body,cta:c.cta,advertiser_name:c.advertiser_name||''}});
  });

  app.post('/api/ads/:id/impression',(req,res)=>{
    const id=Number(req.params.id); const c=db.prepare("SELECT id,placement FROM ad_campaigns WHERE id=? AND status='active'").get(id);
    if(!c)return res.status(404).json({error:'ad_not_found'});
    logEvent(req,id,'impression',c.placement); res.json({ok:true});
  });

  app.get('/api/ads/:id/click',(req,res)=>{
    const id=Number(req.params.id); const c=db.prepare("SELECT id,placement,destination_url FROM ad_campaigns WHERE id=? AND status='active'").get(id);
    if(!c||!/^https?:\/\//i.test(c.destination_url))return res.status(404).send('تبلیغ پیدا نشد');
    logEvent(req,id,'click',c.placement); res.redirect(c.destination_url);
  });

  app.get('/api/owner/ads/overview',ownerAuth,(req,res)=>{
    const campaigns=db.prepare(`
      SELECT c.*,a.name advertiser_name,
        COALESCE((SELECT COUNT(*) FROM ad_events e WHERE e.campaign_id=c.id AND e.event_type='impression'),0) impressions,
        COALESCE((SELECT COUNT(*) FROM ad_events e WHERE e.campaign_id=c.id AND e.event_type='click'),0) clicks
      FROM ad_campaigns c LEFT JOIN advertisers a ON a.id=c.advertiser_id ORDER BY c.id DESC
    `).all().map(x=>({...x,ctr:x.impressions?Number((x.clicks*100/x.impressions).toFixed(2)):0}));
    const advertisers=db.prepare('SELECT * FROM advertisers ORDER BY id DESC').all();
    const leads=db.prepare('SELECT * FROM ad_leads ORDER BY id DESC LIMIT 100').all();
    const totals=db.prepare("SELECT COUNT(*) campaigns,COALESCE(SUM(CASE WHEN status='active' THEN 1 ELSE 0 END),0) active_campaigns FROM ad_campaigns").get();
    const events=db.prepare("SELECT event_type,COUNT(*) count FROM ad_events GROUP BY event_type").all();
    res.json({campaigns,advertisers,leads,totals,events});
  });

  app.post('/api/owner/ads/advertisers',ownerAuth,(req,res)=>{
    const b=req.body||{}, name=String(b.name||'').trim();
    if(!name)return res.status(400).json({error:'نام تبلیغ‌دهنده الزامی است'});
    const t=now(); const r=db.prepare('INSERT INTO advertisers(name,contact_name,email,phone,website,notes,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(name,String(b.contact_name||''),String(b.email||''),String(b.phone||''),String(b.website||''),String(b.notes||''),String(b.status||'lead'),t,t);
    res.json({ok:true,id:r.lastInsertRowid});
  });

  app.patch('/api/owner/ads/advertisers/:id',ownerAuth,(req,res)=>{
    const id=Number(req.params.id), old=db.prepare('SELECT * FROM advertisers WHERE id=?').get(id);
    if(!old)return res.status(404).json({error:'advertiser_not_found'});
    const b=req.body||{}; db.prepare('UPDATE advertisers SET name=?,contact_name=?,email=?,phone=?,website=?,notes=?,status=?,updated_at=? WHERE id=?')
      .run(String(b.name??old.name),String(b.contact_name??old.contact_name),String(b.email??old.email),String(b.phone??old.phone),String(b.website??old.website),String(b.notes??old.notes),String(b.status??old.status),now(),id);
    res.json({ok:true});
  });

  app.post('/api/owner/ads/campaigns',ownerAuth,(req,res)=>{
    const b=req.body||{}, name=String(b.name||'').trim(), placement=String(b.placement||'leader').trim();
    if(!name||!placement)return res.status(400).json({error:'نام کمپین و جایگاه الزامی است'});
    const t=now(); const r=db.prepare(`INSERT INTO ad_campaigns(advertiser_id,name,placement,format,creative_url,image_url,destination_url,headline,body,cta,pricing_model,price_toman,start_at,end_at,status,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      b.advertiser_id?Number(b.advertiser_id):null,name,placement,String(b.format||'banner'),String(b.creative_url||''),String(b.image_url||''),String(b.destination_url||''),String(b.headline||''),String(b.body||''),String(b.cta||'مشاهده'),String(b.pricing_model||'flat'),Number(b.price_toman||0),b.start_at||null,b.end_at||null,String(b.status||'draft'),t,t);
    res.json({ok:true,id:r.lastInsertRowid});
  });

  app.patch('/api/owner/ads/campaigns/:id',ownerAuth,(req,res)=>{
    const id=Number(req.params.id), old=db.prepare('SELECT * FROM ad_campaigns WHERE id=?').get(id);
    if(!old)return res.status(404).json({error:'campaign_not_found'});
    const b=req.body||{}; const vals=[
      b.advertiser_id===undefined?old.advertiser_id:(b.advertiser_id?Number(b.advertiser_id):null),
      String(b.name??old.name),String(b.placement??old.placement),String(b.format??old.format),String(b.creative_url??old.creative_url),String(b.image_url??old.image_url),String(b.destination_url??old.destination_url),String(b.headline??old.headline),String(b.body??old.body),String(b.cta??old.cta),String(b.pricing_model??old.pricing_model),Number(b.price_toman??old.price_toman),b.start_at===undefined?old.start_at:(b.start_at||null),b.end_at===undefined?old.end_at:(b.end_at||null),String(b.status??old.status),now(),id
    ];
    db.prepare(`UPDATE ad_campaigns SET advertiser_id=?,name=?,placement=?,format=?,creative_url=?,image_url=?,destination_url=?,headline=?,body=?,cta=?,pricing_model=?,price_toman=?,start_at=?,end_at=?,status=?,updated_at=? WHERE id=?`).run(...vals);
    res.json({ok:true});
  });

  app.delete('/api/owner/ads/campaigns/:id',ownerAuth,(req,res)=>{
    const id=Number(req.params.id); db.prepare('DELETE FROM ad_events WHERE campaign_id=?').run(id); db.prepare('DELETE FROM ad_campaigns WHERE id=?').run(id); res.json({ok:true});
  });
};
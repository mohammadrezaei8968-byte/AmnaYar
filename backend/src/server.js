const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const Database = require("better-sqlite3");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const {initPayment: samanInit, verifyPayment: samanVerify} = require("./providers/saman");
const rateLimit = require("express-rate-limit");

const app = express();
app.set("trust proxy", 1);
const NODE_ENV = process.env.NODE_ENV || "development";
if (NODE_ENV === "production") app.use((req,res,next)=>{ if (req.secure || req.headers["x-forwarded-proto"] === "https") return next(); return res.status(400).json({error:"https_required"}); });
app.use(helmet());
const configuredOrigins = (process.env.CORS_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean);
const allowedOrigins = [...new Set([
  "https://amnayar.ir",
  "https://www.amnayar.ir",
  ...configuredOrigins
])];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("cors_origin_not_allowed"));
  },
  credentials: true,
  methods: ["GET","HEAD","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization","X-Device-Key","X-Request-ID"],
  exposedHeaders: ["X-Request-ID"]
}));
app.use(express.json({limit:"2mb"}));
app.use((req,res,next)=>{ req.requestId=crypto.randomUUID(); res.setHeader("X-Request-ID",req.requestId); next(); });
app.use("/api/", rateLimit({windowMs:60*1000,max:120,standardHeaders:true,legacyHeaders:false}));
app.use("/api/auth/", rateLimit({windowMs:15*60*1000,max:30,standardHeaders:true,legacyHeaders:false}));

const PORT = Number(process.env.PORT || 8080);
const SECRET = process.env.JWT_SECRET || "";
const APP_VERSION = "5.16.0";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "";
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || "";
if (!SECRET || SECRET.length < 32) { if (NODE_ENV === "production") throw new Error("JWT_SECRET must be at least 32 characters in production"); console.warn("WARNING: set JWT_SECRET to a random secret of at least 32 characters."); }
if (!ADMIN_PASSWORD_HASH) { if (NODE_ENV === "production") throw new Error("ADMIN_PASSWORD_HASH is required in production"); console.warn("WARNING: set ADMIN_PASSWORD_HASH (bcrypt) for production admin login."); }
const db = new Database(process.env.DB_FILE || "amnayar.db");
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT, public_id TEXT UNIQUE NOT NULL, username TEXT UNIQUE, email TEXT UNIQUE, password_hash TEXT, credits INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS verifications(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, type TEXT NOT NULL, input_masked TEXT NOT NULL, result TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS packages(id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, credits INTEGER NOT NULL, price_toman INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS purchases(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, package_id INTEGER, amount_toman INTEGER NOT NULL, store TEXT NOT NULL DEFAULT 'direct', order_id TEXT UNIQUE NOT NULL, status TEXT NOT NULL, provider_ref TEXT, paid_at TEXT, created_at TEXT NOT NULL, gateway_token TEXT, gateway_txn_key INTEGER, checkout_token_hash TEXT);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS devices(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, device_key TEXT NOT NULL, channel TEXT NOT NULL, app_version TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, UNIQUE(user_id,device_key));
CREATE TABLE IF NOT EXISTS audit_logs(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, action TEXT NOT NULL, request_id TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS payment_events(id INTEGER PRIMARY KEY AUTOINCREMENT, provider TEXT NOT NULL, event_id TEXT UNIQUE NOT NULL, order_id TEXT, raw_hash TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sales_channels(id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, title TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, purchase_enabled INTEGER NOT NULL DEFAULT 1, app_download_enabled INTEGER NOT NULL DEFAULT 1, webhook_enabled INTEGER NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS login_logs(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, identifier TEXT, username TEXT, email TEXT, success INTEGER NOT NULL DEFAULT 0, ip TEXT, user_agent TEXT, request_id TEXT, created_at TEXT NOT NULL);
`);

// Lightweight migrations for existing databases.
const userCols = db.prepare("PRAGMA table_info(users)").all().map(x => x.name);
if (!userCols.includes("email")) db.exec("ALTER TABLE users ADD COLUMN email TEXT");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL");

const cols = db.prepare("PRAGMA table_info(purchases)").all().map(x => x.name);
if (!cols.includes("store")) db.exec("ALTER TABLE purchases ADD COLUMN store TEXT NOT NULL DEFAULT 'direct'");
if (!cols.includes("order_id")) { db.exec("ALTER TABLE purchases ADD COLUMN order_id TEXT"); db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_purchases_order_id ON purchases(order_id)"); }
if (!cols.includes("provider_ref")) db.exec("ALTER TABLE purchases ADD COLUMN provider_ref TEXT");
if (!cols.includes("paid_at")) db.exec("ALTER TABLE purchases ADD COLUMN paid_at TEXT");
if (!cols.includes("gateway_token")) db.exec("ALTER TABLE purchases ADD COLUMN gateway_token TEXT");
if (!cols.includes("gateway_txn_key")) db.exec("ALTER TABLE purchases ADD COLUMN gateway_txn_key INTEGER");
if (!cols.includes("checkout_token_hash")) db.exec("ALTER TABLE purchases ADD COLUMN checkout_token_hash TEXT");

// Multi-channel distribution defaults. The manager can enable/disable channels from admin.
const defaultChannels = [
  ["bazaar","کافه‌بازار",1,1,1,0,"اتصال پرداخت/خرید با اطلاعات حساب توسعه‌دهنده انجام شود."],
  ["myket","مایکت",1,1,1,0,"اتصال پرداخت/خرید با اطلاعات حساب توسعه‌دهنده انجام شود."],
  ["google-play","Google Play",0,0,0,0,"فعلاً غیرفعال؛ توزیع فعلی بدون Google Play انجام می‌شود."],
  ["direct","فروش مستقیم",1,1,1,1,"درگاه مستقیم و وب‌سایت مدیر."],
  ["b2b","فروش سازمانی",1,1,0,1,"فروش با قرارداد/لایسنس سازمانی."],
];
if (!db.prepare("SELECT id FROM sales_channels LIMIT 1").get()) {
  const stmt = db.prepare("INSERT INTO sales_channels(code,title,enabled,purchase_enabled,app_download_enabled,webhook_enabled,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)");
  const t=now(); for (const c of defaultChannels) stmt.run(...c,t,t);
}

// ============================================================
// COMMERCIAL CREDIT PACKAGES
// قیمت‌ها قطعی هستند و همیشه در Startup اصلاح می‌شوند.
// ============================================================

const packageDefaults = [
  {
    credits: 100,
    price_toman: 100000,
    title: "بسته 100 اعتبار"
  },
  {
    credits: 500,
    price_toman: 500000,
    title: "بسته 500 اعتبار"
  },
  {
    credits: 1000,
    price_toman: 1000000,
    title: "بسته 1000 اعتبار"
  }
];

const insertPackage = db.prepare(`
  INSERT INTO packages (
    title,
    credits,
    price_toman,
    active
  )
  VALUES (?, ?, ?, 1)
`);

const repairPackage = db.prepare(`
  UPDATE packages
  SET
    title = ?,
    price_toman = ?,
    active = 1
  WHERE credits = ?
`);

for (const pkg of packageDefaults) {
  const existing = db.prepare(`
    SELECT id
    FROM packages
    WHERE credits = ?
    LIMIT 1
  `).get(pkg.credits);

  if (!existing) {
    insertPackage.run(
      pkg.title,
      pkg.credits,
      pkg.price_toman
    );
  } else {
    // حتی اگر قیمت قبلی غیرصفر ولی اشتباه باشد،
    // قیمت صحیح دوباره اعمال می‌شود.
    repairPackage.run(
      pkg.title,
      pkg.price_toman,
      pkg.credits
    );
  }
}

function now(){ return new Date().toISOString(); }
function deviceDigest(value){ return crypto.createHmac("sha256", SECRET).update(String(value)).digest("hex"); }
function audit(userId, action, requestId){ db.prepare("INSERT INTO audit_logs(user_id,action,request_id,created_at) VALUES(?,?,?,?)").run(userId||null,action,requestId||null,now()); }
function sign(user, deviceDigestValue=null){
  const payload={uid:user.id, pid:user.public_id};
  if(deviceDigestValue) payload.did=deviceDigestValue;
  return jwt.sign(payload, SECRET, {expiresIn:"30d"});
}
function auth(req,res,next){
  try {
    const h=req.headers.authorization||"";
    const token=jwt.verify(h.startsWith("Bearer ")?h.slice(7):"",SECRET);
    const u=db.prepare("SELECT id,public_id,active FROM users WHERE id=?").get(token.uid);
    if(!u || !u.active) return res.status(401).json({error:"account_inactive"});
    if(token.did){
      const raw=String(req.headers["x-device-key"]||"");
      if(!raw || deviceDigest(raw)!==token.did) return res.status(401).json({error:"device_not_authorized"});
      const d=db.prepare("SELECT id FROM devices WHERE user_id=? AND device_key=? AND active=1").get(u.id,token.did);
      if(!d) return res.status(401).json({error:"device_not_authorized"});
    }
    req.user=token; next();
  } catch { res.status(401).json({error:"unauthorized"}); }
}
function adminAuth(req,res,next){ try { const h=req.headers.authorization||""; const x=jwt.verify(h.startsWith("Bearer ")?h.slice(7):"",SECRET); if(x.admin!==true) throw 0; req.admin=x; next(); } catch { res.status(401).json({error:"admin_unauthorized"}); } }
function normalizeDigits(s){return String(s||"").replace(/[۰-۹]/g,c=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(c))).replace(/[٠-٩]/g,c=>String("٠١٢٣٤٥٦٧٨٩".indexOf(c)));}
function validCard(s){ s=normalizeDigits(s).replace(/\D/g,""); if(s.length!==16 || /^(\d)\1+$/.test(s)) return false; let sum=0; for(let i=0;i<16;i++){let n=+s[i];if(i%2===0){n*=2;if(n>9)n-=9;}sum+=n;} return sum%10===0; }
function validNationalId(s){ s=normalizeDigits(s).replace(/\D/g,""); if(s.length!==10 || /^(\d)\1+$/.test(s)) return false; let sum=0;for(let i=0;i<9;i++)sum+=(+s[i])*(10-i);const r=sum%11,c=+s[9];return r<2?c===r:c===11-r; }
function validIban(s){ s=normalizeDigits(s).toUpperCase().replace(/\s/g,""); if(!/^IR\d{24}$/.test(s)) return false; const x=s.slice(4)+"1827"+s.slice(2,4); let rem=0; for(const c of x) rem=(rem*10+(+c))%97; return rem===1; }
const cardBins={"603799":"بانک ملی ایران","589210":"بانک سپه","627648":"بانک توسعه صادرات","627961":"بانک صنعت و معدن","603770":"بانک کشاورزی","628023":"بانک مسکن","627760":"پست بانک ایران","502229":"بانک پاسارگاد","610433":"بانک ملت","603769":"بانک صادرات ایران","627353":"بانک تجارت","627412":"بانک اقتصاد نوین","622106":"بانک پارسیان","621986":"بانک سامان","639346":"بانک سینا","639607":"بانک سرمایه","502806":"بانک شهر","504172":"بانک رسالت","505785":"بانک ایران زمین"};
const ibanCodes={"010":"بانک مرکزی","011":"بانک صنعت و معدن","012":"بانک ملت","013":"بانک رفاه کارگران","014":"بانک مسکن","015":"بانک سپه","016":"بانک کشاورزی","017":"بانک ملی ایران","018":"بانک تجارت","019":"بانک صادرات ایران","020":"بانک توسعه صادرات","021":"پست بانک ایران","022":"بانک توسعه تعاون","055":"بانک اقتصاد نوین","056":"بانک سامان","057":"بانک پاسارگاد","058":"بانک سرمایه","059":"بانک سینا","060":"بانک شهر","062":"بانک آینده","064":"بانک گردشگری","066":"بانک دی","069":"بانک ایران زمین"};
function mask(s){s=String(s||"");return s.length>8?s.slice(0,4)+"****"+s.slice(-4):"****";}
function spend(req,type,input,result){return db.transaction(()=>{const u=db.prepare("SELECT * FROM users WHERE id=? AND active=1").get(req.user.uid);if(!u)throw new Error("inactive");if(u.credits<1)return null;const changed=db.prepare("UPDATE users SET credits=credits-1 WHERE id=? AND credits>0").run(u.id);if(!changed.changes)return null;db.prepare("INSERT INTO verifications(user_id,type,input_masked,result,created_at) VALUES(?,?,?,?,?)").run(u.id,type,mask(input),result,now());return u.credits-1;})();}
function addCreditsForPaidPurchase(purchaseId, providerRef){return db.transaction(()=>{const row=db.prepare("SELECT * FROM purchases WHERE id=?").get(purchaseId);if(!row)throw new Error("purchase_not_found");if(row.status==="paid")return {already:true,credits:0};const p=db.prepare("SELECT credits FROM packages WHERE id=?").get(row.package_id);if(!p)throw new Error("package_not_found");const changed=db.prepare("UPDATE purchases SET status='paid',provider_ref=?,paid_at=? WHERE id=? AND status='pending'").run(providerRef||null,now(),purchaseId);if(!changed.changes)return {already:true,credits:0};db.prepare("UPDATE users SET credits=credits+? WHERE id=?").run(p.credits,row.user_id);return {already:false,credits:p.credits};})();}


// ============================================================
// LIVE MARKET DATA
// قیمت‌ها مستقیماً روی سرور از منبع عمومی TGJU خوانده می‌شوند.
// کش کوتاه‌مدت فقط برای جلوگیری از فشار روی منبع است و داده ساختگی تولید نمی‌شود.
// ============================================================
const MARKET_CACHE={data:null,at:0};
const MARKET_TTL_MS=60*1000;
const MARKET_HEADERS={"User-Agent":"Mozilla/5.0 (compatible; AmnaYar/market; +https://amnayar.ir)","Accept":"text/html,application/xhtml+xml"};
function marketNumber(v){
  const s=String(v??"").replace(/[۰-۹]/g,c=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(c))).replace(/[٠-٩]/g,c=>String("٠١٢٣٤٥٦٧٨٩".indexOf(c))).replace(/,/g,"").replace(/\s/g,"");
  const n=Number(s.replace(/[^0-9.\-]/g,"")); return Number.isFinite(n)?n:null;
}
async function fetchMarketProfile(slug){
  const r=await fetch(`https://www.tgju.org/profile/${slug}`,{headers:MARKET_HEADERS,signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw new Error(`market_${slug}_${r.status}`);
  const html=await r.text();
  const priceMatch=html.match(/data-price=["']([0-9۰-۹٠-٩,.]+)["']/i)||html.match(/itemprop=["']price["'][^>]*>\s*([0-9۰-۹٠-٩,.]+)/i);
  if(!priceMatch)throw new Error(`market_${slug}_price_missing`);
  const rial=marketNumber(priceMatch[1]); if(rial===null)throw new Error(`market_${slug}_price_invalid`);
  const changeMatch=html.match(/data-change=["']([^"']+)["']/i)||html.match(/data-percent=["']([^"']+)["']/i);
  return {rial,change:changeMatch?marketNumber(changeMatch[1]):null};
}
async function buildMarketSnapshot(){
  const specs=[["gold18","طلای ۱۸ عیار","geram18","gold"],["coin","سکه امامی","sekee","coin"],["usd","دلار آمریکا","price_dollar_rl","currency"],["eur","یورو","price_eur","currency"],["aed","درهم امارات","price_aed","currency"],["ounce","اونس طلا","ons","global"]];
  const out={items:{},source:"TGJU",fetchedAt:new Date().toISOString(),warnings:[]};
  const rows=await Promise.all(specs.map(async([key,title,slug,group])=>{try{const x=await fetchMarketProfile(slug);return [key,{key,title,group,price_rial:x.rial,price_toman:Math.round(x.rial/10),change_percent:x.change,unit:group==="global"?"دلار":"تومان",source:"TGJU"}]}catch(e){out.warnings.push(key+"_unavailable");return [key,null]}}));
  for(const [key,value] of rows)if(value)out.items[key]=value;
  try{
    const cg=await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether&vs_currencies=usd&include_24hr_change=true",{headers:{Accept:"application/json"},signal:AbortSignal.timeout(10000)});
    if(cg.ok){const coins=await cg.json(),usd=out.items.usd?.price_toman;
      if(usd)for(const [id,key,title] of [["bitcoin","btc","بیت‌کوین"],["ethereum","eth","اتریوم"],["tether","usdt","تتر"]]){const x=coins[id];if(!x?.usd)continue;out.items[key]={key,title,group:"crypto",price_toman:Math.round(x.usd*usd),change_percent:Number.isFinite(Number(x.usd_24h_change))?Number(x.usd_24h_change):null,unit:"تومان",source:"CoinGecko + TGJU",usd_price:x.usd}}
    }else out.warnings.push("crypto_unavailable");
  }catch(e){out.warnings.push("crypto_unavailable")}
  if(!Object.keys(out.items).length)throw new Error("market_sources_unavailable");
  return out;
}
app.get("/api/market",async(req,res)=>{
  try{
    const force=String(req.query.refresh||"")==="1";
    if(!force&&MARKET_CACHE.data&&Date.now()-MARKET_CACHE.at<MARKET_TTL_MS)return res.json({...MARKET_CACHE.data,cached:true});
    const data=await buildMarketSnapshot(); MARKET_CACHE.data=data; MARKET_CACHE.at=Date.now();
    res.setHeader("Cache-Control","no-store"); res.json({...data,cached:false});
  }catch(e){
    console.error("market_snapshot",e);
    if(MARKET_CACHE.data)return res.json({...MARKET_CACHE.data,cached:true,stale:true});
    res.status(503).json({error:"market_unavailable",message:"قیمت بازار از منبع زنده دریافت نشد؛ داده ساختگی نمایش داده نمی‌شود."});
  }
});

app.get("/api/app/version",(req,res)=>res.json({version:APP_VERSION,channel:String(req.query.channel||"direct"),url:process.env.APP_DOWNLOAD_URL||"",notes:"امنا یار با طراحی بانکی جدید و اتصال سرویس استعلام بانکی"}));
app.get("/api/health",(req,res)=>res.json({ok:true,service:"amnayar",version:APP_VERSION,environment:NODE_ENV,max_active_devices:Number(process.env.MAX_ACTIVE_DEVICES||2),timestamp:now()}));
app.get("/api/app/config",(req,res)=>res.json({name:"امنا یار",version:APP_VERSION,minSupportedVersion:process.env.MIN_SUPPORTED_APP_VERSION||"5.0.0",apiBase:"https://api.amnayar.ir/api",support:{email:"mohammad.rezaei8968@gmail.com"},channels:db.prepare("SELECT code,title,enabled,app_download_enabled FROM sales_channels WHERE enabled=1 ORDER BY id").all()}));
app.post("/api/auth/register",(req,res)=>{const email=String(req.body.email||"").trim().toLowerCase();const username=String(req.body.username||"").trim().toLowerCase();const password=String(req.body.password||"");if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!/^[a-z0-9_.-]{3,40}$/.test(username)||password.length<8)return res.status(400).json({error:"ایمیل، نام کاربری یا رمز عبور نامعتبر است"});if(db.prepare("SELECT id FROM users WHERE username=?").get(username))return res.status(409).json({error:"این نام کاربری قبلاً ثبت شده است"});if(db.prepare("SELECT id FROM users WHERE email=?").get(email))return res.status(409).json({error:"این ایمیل قبلاً ثبت شده است"});const publicId=crypto.randomUUID();const hash=bcrypt.hashSync(password,12);const initial=2; const info=db.prepare("INSERT INTO users(public_id,username,email,password_hash,credits,created_at) VALUES(?,?,?,?,?,?)").run(publicId,username,email,hash,initial,now());const user=db.prepare("SELECT * FROM users WHERE id=?").get(info.lastInsertRowid);res.json({token:sign(user),user:{public_id:user.public_id,username:user.username,email:user.email,credits:user.credits}});});
app.post("/api/auth/login",(req,res)=>{
  const identifier=String(req.body.identifier??req.body.username??req.body.email??"").trim().toLowerCase();
  const u=db.prepare("SELECT * FROM users WHERE username=? OR email=? LIMIT 1").get(identifier,identifier);
  const success=!!u && !!u.active && bcrypt.compareSync(String(req.body.password||""),u.password_hash);
  db.prepare("INSERT INTO login_logs(user_id,identifier,username,email,success,ip,user_agent,request_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
    .run(u?.id||null,identifier,u?.username||null,u?.email||null,success?1:0,String(req.ip||""),String(req.get("user-agent")||"").slice(0,500),req.requestId,now());
  if(!success)return res.status(401).json({error:"اطلاعات ورود نادرست است"});
  audit(u.id,"login_success",req.requestId);
  res.json({token:sign(u),user:{public_id:u.public_id,username:u.username,email:u.email||null,credits:u.credits}});
});
app.get("/api/me",auth,(req,res)=>{const u=db.prepare("SELECT public_id,username,credits,active,created_at FROM users WHERE id=?").get(req.user.uid);if(!u)return res.status(404).json({error:"user_not_found"});res.json(u);});
app.post("/api/device/register",auth,(req,res)=>{const deviceKey=String(req.body.deviceKey||"").trim();if(deviceKey.length<16||deviceKey.length>200)return res.status(400).json({error:"device_key_invalid"});const channel=String(req.body.channel||"other").slice(0,30);const appVersion=String(req.body.appVersion||"").slice(0,40);const count=db.prepare("SELECT COUNT(*) c FROM devices WHERE user_id=? AND active=1").get(req.user.uid).c;const digest=deviceDigest(deviceKey);
const exists=db.prepare("SELECT id FROM devices WHERE user_id=? AND device_key=?").get(req.user.uid,digest);const max=Number(process.env.MAX_ACTIVE_DEVICES||2);if(!exists&&count>=max)return res.status(409).json({error:"device_limit_reached"});db.prepare("INSERT INTO devices(user_id,device_key,channel,app_version,created_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id,device_key) DO UPDATE SET channel=excluded.channel,app_version=excluded.app_version,active=1").run(req.user.uid,digest,channel,appVersion,now());
audit(req.user.uid,"device_register",req.requestId);const u=db.prepare("SELECT id,public_id FROM users WHERE id=?").get(req.user.uid);res.json({ok:true,token:sign(u,digest)});});
app.post("/api/integrity/google",auth,(req,res)=>{if(process.env.GOOGLE_PLAY_INTEGRITY_ENABLED!=="true")return res.status(503).json({error:"google_play_integrity_not_configured"});const token=String(req.body.token||"");if(!token)return res.status(400).json({error:"integrity_token_required"});res.status(501).json({error:"google_integrity_server_verifier_required",message:"Configure Google Play Integrity server credentials before enforcing verdicts."});});

async function bankApiIrRequest(service, body){
  const token=String(process.env.BANK_API_IR_TOKEN||"").trim();
  if(!token) throw Object.assign(new Error("bank_provider_not_configured"),{code:"bank_provider_not_configured"});
  const base=String(process.env.BANK_API_IR_BASE_URL||"https://s.api.ir/api/sw1").replace(/\/$/,"");
  const url=base+"/"+String(service).replace(/^\//,"");
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),Number(process.env.BANK_PROVIDER_TIMEOUT_MS||12000));
  try{
    const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json","Authorization":"Bearer "+token},body:JSON.stringify(body),signal:controller.signal});
    const text=await r.text(); let json=null; try{json=JSON.parse(text);}catch{}
    if(!r.ok || !json || json.success===false) throw Object.assign(new Error((json&&json.message)||"bank_provider_error"),{code:"bank_provider_error",status:r.status,provider:json});
    return json;
  }finally{clearTimeout(timer);}
}
function providerData(x){return x&&x.data?x.data:{};}
function ownerNameFromData(d){return String(d.name||d.ownerName||d.fullName||[d.firstName,d.lastName].filter(Boolean).join(" ")||"").trim();}
function hasCredit(req){const u=db.prepare("SELECT credits FROM users WHERE id=? AND active=1").get(req.user.uid);return !!u&&u.credits>0;}
function providerError(res,e){if(e&&e.code==="bank_provider_not_configured")return res.status(503).json({error:"bank_provider_not_configured",message:"سرویس بانکی روی سرور تنظیم نشده است."});console.error("bank_provider",e);return res.status(502).json({error:"bank_provider_unavailable",message:"سرویس بانکی در دسترس نیست؛ لطفاً دوباره تلاش کنید."});}

app.post("/api/verify/card",auth,async (req,res)=>{
  const card=normalizeDigits(String(req.body.card||"")).replace(/\s/g,"");
  if(!validCard(card)) return res.status(400).json({error:"card_invalid",message:"شماره کارت معتبر نیست"});
  if(!hasCredit(req)) return res.status(402).json({error:"اعتبار کافی نیست"});
  try{
    const d=providerData(await bankApiIrRequest("BankCardInfo",{cardNumber:card}));
    const owner=ownerNameFromData(d), iban=String(d.iban||d.IBAN||"");
    const account=String(d.accountNumber||d.account||d.depositNumber||"");
    const bank=String(d.bankName||cardBins[card.slice(0,6)]||"");
    const remaining=spend(req,"card",card,"valid");
    res.json({valid:true,bank,ownerName:owner,iban,account,remaining,message:"اطلاعات کارت از سرویس بانکی دریافت شد."});
  }catch(e){providerError(res,e);}
});
app.post("/api/verify/national-id",auth,(req,res)=>{const id=normalizeDigits(String(req.body.nationalId||""));const ok=validNationalId(id);const remaining=spend(req,"national-id",id,ok?"valid":"invalid");if(remaining===null)return res.status(402).json({error:"اعتبار کافی نیست"});res.json({valid:ok,remaining,message:ok?"ساختار کد ملی معتبر است.":"کد ملی معتبر نیست."});});
app.post("/api/verify/iban",auth,async (req,res)=>{
  const iban=normalizeDigits(String(req.body.iban||"")).toUpperCase().replace(/\s/g,"");
  if(!validIban(iban)) return res.status(400).json({error:"iban_invalid",message:"شماره شبا معتبر نیست"});
  if(!hasCredit(req)) return res.status(402).json({error:"اعتبار کافی نیست"});
  try{
    const d=providerData(await bankApiIrRequest("IbanInfo",{iban}));
    const owner=ownerNameFromData(d), bank=String(d.bankName||ibanCodes[iban.slice(4,7)]||"");
    const account=String(d.accountNumber||d.account||d.depositNumber||"");
    const remaining=spend(req,"iban",iban,d.active===false?"inactive":"valid");
    res.json({valid:d.active!==false,active:d.active!==false,bank,ownerName:owner,iban,account,remaining,message:"اطلاعات شبا از سرویس بانکی دریافت شد."});
  }catch(e){providerError(res,e);}
});

// Commercial banking conversion endpoints: only the two user-facing directions are exposed.
async function apiIrOptional(service, body, envName){const path=String(process.env[envName]||"").trim();if(!path)throw Object.assign(new Error("optional_bank_service_not_configured"),{code:"optional_bank_service_not_configured"});return providerData(await bankApiIrRequest(path.replace(/^.*\/sw1\//,""),body));}
app.post("/api/convert/card",auth,async (req,res)=>{
  const card=normalizeDigits(String(req.body.card||"")).replace(/\s/g,"");
  if(!validCard(card))return res.status(400).json({error:"conversion_invalid",message:"شماره کارت معتبر نیست"});
  if(!hasCredit(req))return res.status(402).json({error:"اعتبار کافی نیست"});
  try{
    const d=providerData(await bankApiIrRequest("BankCardInfo",{cardNumber:card}));
    const owner=ownerNameFromData(d), iban=String(d.iban||d.IBAN||""), account=String(d.accountNumber||d.account||d.depositNumber||"");
    if(!iban && !account) return res.status(502).json({error:"bank_provider_invalid_response",message:"سرویس بانکی نتیجه تبدیل کارت را کامل برنگرداند."});
    const remaining=spend(req,"conversion-card",card,"valid");
    res.json({valid:true,ownerName:owner,bank:String(d.bankName||cardBins[card.slice(0,6)]||""),card,account,iban,remaining});
  }catch(e){providerError(res,e);}
});
app.post("/api/convert/iban",auth,async (req,res)=>{
  const iban=normalizeDigits(String(req.body.iban||"")).toUpperCase().replace(/\s/g,"");
  if(!validIban(iban))return res.status(400).json({error:"conversion_invalid",message:"شماره شبا معتبر نیست"});
  if(!hasCredit(req))return res.status(402).json({error:"اعتبار کافی نیست"});
  try{
    const info=providerData(await bankApiIrRequest("IbanInfo",{iban}));
    let account=String(info.accountNumber||info.account||info.depositNumber||"");
    if(!account){
      try{const ad=await apiIrOptional("IbanToAccount",{iban},"BANK_API_IR_IBAN_TO_ACCOUNT_PATH");account=String(ad.accountNumber||ad.account||ad.depositNumber||"");}catch(e){if(e.code!=="optional_bank_service_not_configured")throw e;}
    }
    let card="";
    try{const cd=await apiIrOptional("IbanToCard",{iban},"BANK_API_IR_IBAN_TO_CARD_PATH");card=String(cd.cardNumber||cd.card||"");}catch(e){if(e.code!=="optional_bank_service_not_configured")throw e;}
    if(!account && !card)return res.status(503).json({error:"bank_conversion_incomplete",message:"سرویس بانکی نام حساب یا کارت متصل به این شبا را ارائه نکرد."});
    const remaining=spend(req,"conversion-iban",iban,"valid");
    res.json({valid:true,ownerName:ownerNameFromData(info),bank:String(info.bankName||ibanCodes[iban.slice(4,7)]||""),iban,account,card,remaining});
  }catch(e){providerError(res,e);}
});

app.get("/api/history",auth,(req,res)=>res.json(db.prepare("SELECT type,input_masked,result,created_at FROM verifications WHERE user_id=? ORDER BY id DESC LIMIT 100").all(req.user.uid)));
app.get("/api/me/devices",auth,(req,res)=>{const rows=db.prepare("SELECT id,channel,app_version,active,created_at FROM devices WHERE user_id=? ORDER BY id DESC").all(req.user.uid);const max=Number(process.env.MAX_ACTIVE_DEVICES||2);res.json({maxActive:max,active:rows.filter(x=>x.active).length,devices:rows});});
app.post("/api/me/devices/:id/revoke",auth,(req,res)=>{const id=Number(req.params.id);const d=db.prepare("SELECT id,active FROM devices WHERE id=? AND user_id=?").get(id,req.user.uid);if(!d)return res.status(404).json({error:"device_not_found"});if(!d.active)return res.json({ok:true,alreadyRevoked:true});db.prepare("UPDATE devices SET active=0 WHERE id=? AND user_id=?").run(id,req.user.uid);audit(req.user.uid,"device_revoke",req.requestId);res.json({ok:true});});
app.get("/api/me/purchases",auth,(req,res)=>res.json(db.prepare("SELECT id,order_id,amount_toman,store,status,provider_ref,paid_at,created_at FROM purchases WHERE user_id=? ORDER BY id DESC LIMIT 50").all(req.user.uid)));
app.get("/api/packages", (req, res) => {
  const packages = db.prepare(`
    SELECT
      id,
      title,
      credits,
      price_toman
    FROM packages
    WHERE active = 1
      AND credits IN (100, 500, 1000)
    ORDER BY credits ASC
  `).all();

  const fixedPrices = {
    100: 100000,
    500: 500000,
    1000: 1000000
  };

  const result = packages.map(pkg => ({
    id: pkg.id,
    title: pkg.title,
    credits: pkg.credits,
    price_toman: fixedPrices[pkg.credits]
  }));

  res.json(result);
});
app.get("/api/channels",(req,res)=>res.json(db.prepare("SELECT code,title,enabled,purchase_enabled,app_download_enabled FROM sales_channels WHERE enabled=1 ORDER BY id").all()));

app.post("/api/purchases/create",auth,async (req,res)=>{let purchaseId=null;try{const packageId=Number(req.body.packageId);const p=db.prepare("SELECT * FROM packages WHERE id=? AND active=1").get(packageId);if(!p)return res.status(404).json({error:"package_not_found"});const store=String(req.body.store||"direct").trim().toLowerCase().slice(0,30);const channel=db.prepare("SELECT * FROM sales_channels WHERE code=? AND enabled=1").get(store);if(!channel)return res.status(400).json({error:"channel_disabled"});if(!channel.purchase_enabled)return res.status(403).json({error:"purchase_disabled_for_channel"});if(store==="direct" && !process.env.SAMAN_TERMINAL_ID)return res.status(503).json({error:"saman_not_configured"});const callbackUrl=process.env.SAMAN_CALLBACK_URL||`${process.env.PUBLIC_API_URL||""}/api/payments/saman/callback`;if(store==="direct" && !callbackUrl.startsWith("https://"))return res.status(503).json({error:"saman_callback_must_use_https"});const orderId="AMNA-"+crypto.randomUUID();const info=db.prepare("INSERT INTO purchases(user_id,package_id,amount_toman,store,order_id,status,created_at) VALUES(?,?,?,?,?,?,?)").run(req.user.uid,p.id,p.price_toman,store,orderId,"pending",now());purchaseId=info.lastInsertRowid;const checkoutToken=crypto.randomBytes(32).toString("hex");db.prepare("UPDATE purchases SET checkout_token_hash=? WHERE id=?").run(crypto.createHash("sha256").update(checkoutToken).digest("hex"),purchaseId);let paymentUrl=null;if(store==="direct"){const result=await samanInit({terminalId:requiredEnv("SAMAN_TERMINAL_ID"),amountRial:p.price_toman*10,orderId,callbackUrl,phone:String(req.body.phone||"")});db.prepare("UPDATE purchases SET gateway_token=?,gateway_txn_key=? WHERE id=?").run(result.token,result.txnKey,purchaseId);paymentUrl=`${process.env.PUBLIC_API_URL||""}/api/payments/saman/redirect/${purchaseId}/${checkoutToken}`;}res.json({purchaseId,orderId,amount_toman:p.price_toman,status:"pending",provider:store,paymentUrl});}catch(e){console.error("purchase_create",e);if(purchaseId)db.prepare("UPDATE purchases SET status=CASE WHEN status='pending' THEN 'failed' ELSE status END WHERE id=?").run(purchaseId);res.status(502).json({error:"payment_provider_unavailable"});}});
function requiredEnv(name){const v=process.env[name];if(!v)throw new Error(`${name}_NOT_CONFIGURED`);return v;}


app.get("/api/payments/saman/redirect/:id/:token",async (req,res)=>{try{const id=Number(req.params.id);const hash=crypto.createHash("sha256").update(String(req.params.token)).digest("hex");const row=db.prepare("SELECT id,status,gateway_token,checkout_token_hash FROM purchases WHERE id=? AND store='direct'").get(id);if(!row||row.checkout_token_hash!==hash||!row.gateway_token)return res.status(404).send("سفارش پرداخت پیدا نشد");if(row.status==="paid")return res.status(409).send("این سفارش قبلاً پرداخت شده است");const action=process.env.SAMAN_PAYMENT_URL||"https://sep.shaparak.ir/OnlinePG/OnlinePG";res.type("html").send(`<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><title>در حال انتقال به درگاه سامان</title><body onload="document.forms[0].submit()"><p>در حال انتقال به درگاه پرداخت سامان...</p><form method="post" action="${action}"><input type="hidden" name="Token" value="${String(row.gateway_token).replace(/&/g,"&amp;").replace(/"/g,"&quot;")}"><noscript><button type="submit">ادامه پرداخت</button></noscript></form></body></html>`);}catch(e){console.error("saman_redirect",e);res.status(500).send("خطا در انتقال به درگاه");}});

app.post("/api/payments/saman/callback",async (req,res)=>{const body=req.body||{};const orderId=String(body.ResNum||body.resNum||"");const refNum=String(body.RefNum||body.refNum||"");if(!orderId)return res.status(400).send("ResNum نامعتبر است");const purchase=db.prepare("SELECT * FROM purchases WHERE order_id=? AND store='direct'").get(orderId);if(!purchase)return res.status(404).send("سفارش پیدا نشد");if(purchase.status==="paid")return res.type("html").send("پرداخت قبلاً تأیید شده است.");if(!refNum)return res.type("html").send("پرداخت ناموفق یا لغو شد.");try{const result=await samanVerify({terminalId:requiredEnv("SAMAN_TERMINAL_ID"),txnKey:purchase.gateway_txn_key,refNum});const expectedRial=purchase.amount_toman*10;if(!result.success)return res.type("html").send("پرداخت تأیید نشد.");if(result.amount!=null&&Number(result.amount)!==expectedRial)return res.status(400).send("مبلغ تراکنش با سفارش مطابقت ندارد");const credited=addCreditsForPaidPurchase(purchase.id,result.rrn||refNum);audit(purchase.user_id,"payment_saman_paid",req.requestId);const redirect=process.env.SAMAN_RESULT_URL||"";if(redirect.startsWith("https://")){const sep=redirect.includes("?")?"&":"?";return res.redirect(`${redirect}${sep}status=success&order_id=${encodeURIComponent(orderId)}`);}return res.type("html").send(`پرداخت با موفقیت تأیید شد. سفارش ${orderId}<br>کد پیگیری: ${result.rrn||refNum}<br>اعتبار افزوده‌شده: ${credited.already?0:credited.credits}`);}catch(e){console.error("saman_callback",e);return res.status(202).type("html").send("پرداخت دریافت شد ولی تأیید بانکی موقتاً در دسترس نیست؛ سفارش برای بررسی مجدد باقی می‌ماند.");}});

app.get("/api/purchases/:id",auth,(req,res)=>{const row=db.prepare("SELECT id,package_id,amount_toman,store,order_id,status,provider_ref,paid_at,created_at FROM purchases WHERE id=? AND user_id=?").get(Number(req.params.id),req.user.uid);if(!row)return res.status(404).json({error:"purchase_not_found"});res.json(row);});
// Production payment adapter contract. The actual Bazaar/Myket SDK/API credentials must be supplied by the merchant account.
app.post("/api/payments/webhook/:provider",(req,res)=>{const provider=String(req.params.provider||"").toLowerCase();const eventId=String(req.headers["x-event-id"]||req.body.event_id||"");const signature=String(req.headers["x-signature"]||"");const secret=process.env[`PAYMENT_${provider.toUpperCase()}_WEBHOOK_SECRET`]||"";if(!secret||!eventId)return res.status(503).json({error:"payment_webhook_not_configured"});const raw=JSON.stringify(req.body||{});const expected=crypto.createHmac("sha256",secret).update(raw).digest("hex");const sigBuf=Buffer.from(signature,"utf8");const expBuf=Buffer.from(expected,"utf8");if(sigBuf.length!==expBuf.length||!crypto.timingSafeEqual(sigBuf,expBuf))return res.status(401).json({error:"bad_signature"});if(db.prepare("SELECT id FROM payment_events WHERE event_id=?").get(eventId))return res.json({ok:true,duplicate:true});const orderId=String(req.body.order_id||"");const purchase=db.prepare("SELECT * FROM purchases WHERE order_id=?").get(orderId);if(!purchase)return res.status(404).json({error:"order_not_found"});
if(req.body.amount_toman!==undefined && Number(req.body.amount_toman)!==Number(purchase.amount_toman))return res.status(400).json({error:"amount_mismatch"});const rawHash=crypto.createHash("sha256").update(raw).digest("hex");db.prepare("INSERT INTO payment_events(provider,event_id,order_id,raw_hash,created_at) VALUES(?,?,?,?,?)").run(provider,eventId,orderId,rawHash,now());if(String(req.body.status||"")!=="paid")return res.json({ok:true,status:"ignored"});const result=addCreditsForPaidPurchase(purchase.id,String(req.body.provider_ref||eventId));
audit(purchase.user_id,`payment_${provider}_${req.body.status||"unknown"}`,req.requestId);
res.json({ok:true,credited:result.credits,already:result.already});});

const OWNER_EMAIL = String(process.env.OWNER_EMAIL || "").trim().toLowerCase();
const OWNER_PASSWORD = String(process.env.OWNER_PASSWORD || "");

function ownerAuth(req,res,next){
  try{
    const h=req.headers.authorization||"";
    const token=jwt.verify(h.startsWith("Bearer ")?h.slice(7):"",SECRET);
    if(token && token.admin && token.owner) { req.owner=token; return next(); }
    return res.status(403).json({error:"owner_required"});
  }catch(e){ return res.status(401).json({error:"owner_auth_required"}); }
}

app.post("/api/owner/login", rateLimit({windowMs:15*60*1000,max:10,standardHeaders:true,legacyHeaders:false}),(req,res)=>{
  const identifier=String(req.body.email||req.body.identifier||req.body.username||"").trim().toLowerCase();
  const password=String(req.body.password||"");
  if(!OWNER_EMAIL || !OWNER_PASSWORD) return res.status(503).json({error:"owner_credentials_not_configured",message:"مشخصات مالک در Environment Variables تنظیم نشده است."});
  if(identifier!==OWNER_EMAIL || password!==OWNER_PASSWORD) return res.status(401).json({error:"owner_login_invalid",message:"ایمیل یا رمز مالک نادرست است."});
  const token=jwt.sign({admin:true,owner:true,username:OWNER_EMAIL},SECRET,{expiresIn:"8h"});
  res.json({ok:true,token,user:{username:OWNER_EMAIL,email:OWNER_EMAIL,role:"owner"},role:"owner"});
});

app.get("/api/owner/me",ownerAuth,(req,res)=>res.json({ok:true,user:{username:OWNER_EMAIL,email:OWNER_EMAIL,role:"owner"}}));
app.get("/api/owner/login-logs",ownerAuth,(req,res)=>{
  const limit=Math.min(Math.max(Number(req.query.limit||500),1),1000);
  const logs=db.prepare(`SELECT l.id,l.identifier,l.username,l.email,l.success,l.ip,l.user_agent,l.request_id,l.created_at
    FROM login_logs l ORDER BY l.id DESC LIMIT ?`).all(limit);
  res.json({logs});
});


app.post("/api/admin/login", rateLimit({windowMs:15*60*1000,max:10,standardHeaders:true,legacyHeaders:false}),(req,res)=>{const username=String(req.body.username||"");const password=String(req.body.password||"");if(!ADMIN_USERNAME||!ADMIN_PASSWORD_HASH||username!==ADMIN_USERNAME||!bcrypt.compareSync(password,ADMIN_PASSWORD_HASH))return res.status(401).json({error:"اطلاعات مدیر نادرست است"});res.json({token:jwt.sign({admin:true,username},SECRET,{expiresIn:"8h"})});});

app.get("/api/admin/summary",adminAuth,(req,res)=>{const users=db.prepare("SELECT COUNT(*) c FROM users").get().c;const active=db.prepare("SELECT COUNT(*) c FROM users WHERE active=1").get().c;const checks=db.prepare("SELECT COUNT(*) c FROM verifications").get().c;const sales=db.prepare("SELECT COALESCE(SUM(amount_toman),0) s FROM purchases WHERE status='paid'").get().s;const pending=db.prepare("SELECT COUNT(*) c FROM purchases WHERE status='pending'").get().c;res.json({users,active,verifications:checks,sales_toman:sales,pending_purchases:pending});});
app.get("/api/admin/users",adminAuth,(req,res)=>res.json(db.prepare("SELECT id,public_id,username,credits,active,created_at FROM users ORDER BY id DESC LIMIT 500").all()));
app.post("/api/admin/users/:id/credits",adminAuth,(req,res)=>{const amount=Number(req.body.amount||0);if(!Number.isInteger(amount)||amount===0||Math.abs(amount)>1000000)return res.status(400).json({error:"invalid_amount"});db.prepare("UPDATE users SET credits=MAX(0,credits+?) WHERE id=?").run(amount,req.params.id);res.json({ok:true});});
app.post("/api/admin/users/:id/status",adminAuth,(req,res)=>{db.prepare("UPDATE users SET active=? WHERE id=?").run(req.body.active?1:0,req.params.id);res.json({ok:true});});
app.get("/api/admin/packages",adminAuth,(req,res)=>res.json(db.prepare("SELECT * FROM packages ORDER BY price_toman").all()));
app.post("/api/admin/packages",adminAuth,(req,res)=>{const title=String(req.body.title||"").trim();const credits=Number(req.body.credits);const price=Number(req.body.price_toman);if(!title||!Number.isInteger(credits)||credits<1||!Number.isInteger(price)||price<0)return res.status(400).json({error:"invalid"});const info=db.prepare("INSERT INTO packages(title,credits,price_toman) VALUES(?,?,?)").run(title,credits,price);res.json({id:info.lastInsertRowid});});
app.patch("/api/admin/packages/:id",adminAuth,(req,res)=>{const p=db.prepare("SELECT * FROM packages WHERE id=?").get(Number(req.params.id));if(!p)return res.status(404).json({error:"not_found"});const title=String(req.body.title??p.title);const credits=Number(req.body.credits??p.credits);const price=Number(req.body.price_toman??p.price_toman);const active=req.body.active===undefined?p.active:(req.body.active?1:0);if(!title||!Number.isInteger(credits)||credits<1||!Number.isInteger(price)||price<0)return res.status(400).json({error:"invalid"});db.prepare("UPDATE packages SET title=?,credits=?,price_toman=?,active=? WHERE id=?").run(title,credits,price,active,p.id);res.json({ok:true});});
app.get("/api/admin/channels",adminAuth,(req,res)=>res.json(db.prepare("SELECT * FROM sales_channels ORDER BY id").all()));
app.patch("/api/admin/channels/:code",adminAuth,(req,res)=>{const c=db.prepare("SELECT * FROM sales_channels WHERE code=?").get(String(req.params.code));if(!c)return res.status(404).json({error:"channel_not_found"});const enabled=req.body.enabled===undefined?c.enabled:(req.body.enabled?1:0);const purchase=req.body.purchase_enabled===undefined?c.purchase_enabled:(req.body.purchase_enabled?1:0);const download=req.body.app_download_enabled===undefined?c.app_download_enabled:(req.body.app_download_enabled?1:0);const webhook=req.body.webhook_enabled===undefined?c.webhook_enabled:(req.body.webhook_enabled?1:0);const notes=String(req.body.notes??c.notes);db.prepare("UPDATE sales_channels SET enabled=?,purchase_enabled=?,app_download_enabled=?,webhook_enabled=?,notes=?,updated_at=? WHERE code=?").run(enabled,purchase,download,webhook,notes,now(),c.code);res.json({ok:true});});
app.get("/api/admin/sales-by-channel",adminAuth,(req,res)=>res.json(db.prepare("SELECT store,COUNT(*) orders,COALESCE(SUM(CASE WHEN status='paid' THEN amount_toman ELSE 0 END),0) sales_toman FROM purchases GROUP BY store ORDER BY sales_toman DESC").all()));
app.get("/api/admin/purchases",adminAuth,(req,res)=>res.json(db.prepare("SELECT p.id,p.order_id,p.store,p.amount_toman,p.status,p.provider_ref,p.created_at,p.paid_at,u.username FROM purchases p LEFT JOIN users u ON u.id=p.user_id ORDER BY p.id DESC LIMIT 500").all()));
app.get("/api/admin/verifications",adminAuth,(req,res)=>res.json(db.prepare("SELECT v.id,v.type,v.input_masked,v.result,v.created_at,u.username FROM verifications v LEFT JOIN users u ON u.id=v.user_id ORDER BY v.id DESC LIMIT 500").all()));
app.get("/api/admin/devices",adminAuth,(req,res)=>res.json(db.prepare("SELECT d.id,d.user_id,u.username,d.channel,d.app_version,d.active,d.created_at FROM devices d LEFT JOIN users u ON u.id=d.user_id ORDER BY d.id DESC LIMIT 500").all()));
app.post("/api/admin/devices/:id/status",adminAuth,(req,res)=>{db.prepare("UPDATE devices SET active=? WHERE id=?").run(req.body.active?1:0,Number(req.params.id));res.json({ok:true});});
app.get("/api/admin/api-status",adminAuth,(req,res)=>{const checks=[
  {key:"national_id",title:"صحت‌سنجی کد ملی",status:"ready",detail:"الگوریتم رقم کنترلی"},
  {key:"card",title:"کارت بانکی",status:process.env.BANK_API_IR_TOKEN?"configured":"not_configured",detail:process.env.BANK_API_IR_TOKEN?"استعلام از سرویس بانکی API.ir":"نیازمند توکن سرویس بانکی"},
  {key:"iban",title:"شبا",status:process.env.BANK_API_IR_TOKEN?"configured":"not_configured",detail:process.env.BANK_API_IR_TOKEN?"استعلام از سرویس بانکی API.ir":"نیازمند توکن سرویس بانکی"},
  {key:"saman",title:"درگاه سامان",status:process.env.SAMAN_TERMINAL_ID?"configured":"not_configured",detail:process.env.SAMAN_TERMINAL_ID?"Credential تنظیم شده":"نیازمند تنظیم Terminal ID"},
  {key:"bazaar",title:"کافه‌بازار",status:process.env.PAYMENT_BAZAAR_WEBHOOK_SECRET?"configured":"not_configured",detail:"Webhook"},
  {key:"myket",title:"مایکت",status:process.env.PAYMENT_MYKET_WEBHOOK_SECRET?"configured":"not_configured",detail:"Webhook"}
];res.json({appVersion:APP_VERSION,apiBase:process.env.PUBLIC_API_URL||"",checks});});
app.get("/api/admin/settings",adminAuth,(req,res)=>res.json(Object.fromEntries(db.prepare("SELECT key,value FROM settings").all().map(x=>[x.key,x.value]))));
app.put("/api/admin/settings",adminAuth,(req,res)=>{db.transaction(()=>{for(const [k,v] of Object.entries(req.body||{}))db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(k),String(v));})();res.json({ok:true});});

/* ============================================================
   PAYROLL PERSISTENCE API
   حقوق و دستمزد: اطلاعات از localStorage به SQLite همگام می‌شود.
   Scope هر کاربر با user_id جداست.
   ============================================================ */
db.exec(`
CREATE TABLE IF NOT EXISTS payroll_employees(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  personnel_code TEXT NOT NULL,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, personnel_code)
);
CREATE TABLE IF NOT EXISTS payroll_records(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  personnel_code TEXT NOT NULL,
  payroll_month TEXT,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS payroll_settings(
  user_id INTEGER PRIMARY KEY,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

function payrollJson(v){ try{return JSON.parse(v||"{}");}catch{return {};} }

app.get("/api/company/me",auth,(req,res)=>{
  const u=db.prepare("SELECT id,public_id,username,email FROM users WHERE id=? AND active=1").get(req.user.uid);
  if(!u)return res.status(404).json({error:"company_not_found"});
  res.json({id:u.public_id||String(u.id),name:u.username||"شرکت جاری",public_id:u.public_id});
});

app.get("/api/payroll/sync",auth,(req,res)=>{
  const employees=db.prepare("SELECT id,personnel_code,data_json,created_at,updated_at FROM payroll_employees WHERE user_id=? ORDER BY id").all(req.user.uid)
    .map(r=>({id:r.id,code:r.personnel_code,...payrollJson(r.data_json),companyId:req.user.pid,company_id:req.user.pid}));
  const records=db.prepare("SELECT id,personnel_code,payroll_month,data_json,created_at FROM payroll_records WHERE user_id=? ORDER BY id DESC LIMIT 5000").all(req.user.uid)
    .map(r=>({id:r.id,personnelCode:r.personnel_code,payrollMonth:r.payroll_month,...payrollJson(r.data_json),companyId:req.user.pid,company_id:req.user.pid,createdAt:r.created_at}));
  const s=db.prepare("SELECT data_json FROM payroll_settings WHERE user_id=?").get(req.user.uid);
  res.json({employees,history:records,settings:s?payrollJson(s.data_json):{}});
});

app.put("/api/payroll/sync",auth,(req,res)=>{
  const body=req.body||{};
  const employees=Array.isArray(body.employees)?body.employees:[];
  const history=Array.isArray(body.history)?body.history:[];
  const settings=body.settings&&typeof body.settings==="object"?body.settings:{};
  const tx=db.transaction(()=>{
    for(const e of employees){
      const code=String(e.code||e.personnelCode||"").trim();
      if(!code)continue;
      const clean={...e}; delete clean.id; delete clean.userId; delete clean.user_id; clean.companyId=req.user.pid; clean.company_id=req.user.pid;
      db.prepare(`INSERT INTO payroll_employees(user_id,personnel_code,data_json,created_at,updated_at)
        VALUES(?,?,?,?,?)
        ON CONFLICT(user_id,personnel_code) DO UPDATE SET data_json=excluded.data_json,updated_at=excluded.updated_at`)
        .run(req.user.uid,code,JSON.stringify(clean),now(),now());
    }
    const keep=new Set(employees.map(e=>String(e.code||e.personnelCode||"").trim()).filter(Boolean));
    const existing=db.prepare("SELECT personnel_code FROM payroll_employees WHERE user_id=?").all(req.user.uid);
    for(const row of existing)if(!keep.has(row.personnel_code))db.prepare("DELETE FROM payroll_employees WHERE user_id=? AND personnel_code=?").run(req.user.uid,row.personnel_code);

    db.prepare("DELETE FROM payroll_records WHERE user_id=?").run(req.user.uid);
    const stmt=db.prepare("INSERT INTO payroll_records(user_id,personnel_code,payroll_month,data_json,created_at) VALUES(?,?,?,?,?)");
    for(const r of history){
      const code=String(r.personnelCode||r.code||"").trim();
      const clean={...r}; delete clean.id; delete clean.userId; delete clean.user_id; clean.companyId=req.user.pid; clean.company_id=req.user.pid;
      stmt.run(req.user.uid,code,String(r.payrollMonth||""),JSON.stringify(clean),String(r.createdAt||now()));
    }
    db.prepare("INSERT INTO payroll_settings(user_id,data_json,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET data_json=excluded.data_json,updated_at=excluded.updated_at")
      .run(req.user.uid,JSON.stringify(settings),now());
  });
  try{tx(); audit(req.user.uid,"payroll_sync",req.requestId); res.json({ok:true,employees:employees.length,records:history.length});}
  catch(e){console.error("payroll_sync",e);res.status(500).json({error:"payroll_sync_failed"});}
});

app.listen(PORT,()=>console.log(`AmnaYar API running on :${PORT}`));

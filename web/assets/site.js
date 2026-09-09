const API=(window.AMNA_API||'https://api.amnayar.ir/api').replace(/\/$/,'');let token=localStorage.getItem('amnayar_token')||'';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const fa=n=>String(n??'').replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
const toman=n=>new Intl.NumberFormat('fa-IR').format(Number(n||0))+' تومان';
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('show');clearTimeout(window.__toast);window.__toast=setTimeout(()=>e.classList.remove('show'),2600)}
async function api(path,opt={}){opt.headers=Object.assign({'Content-Type':'application/json'},opt.headers||{});if(token)opt.headers.Authorization='Bearer '+token;const r=await fetch(API+path,opt);let d={};try{d=await r.json()}catch{}if(!r.ok)throw Error(d.error||'خطا در ارتباط با سرور');return d}
function modal(id){$(id).classList.add('show')}function close(){ $$('.modal').forEach(x=>x.classList.remove('show')) }
function tab(t){$$('.modal-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));$('#loginForm').classList.toggle('hidden',t!=='login');$('#registerForm').classList.toggle('hidden',t!=='register')}
$$('[data-open-login]').forEach(b=>b.onclick=()=>{modal('#authModal');tab('login')});$$('[data-open-register]').forEach(b=>b.onclick=()=>{modal('#authModal');tab('register')});$$('[data-close-modal]').forEach(b=>b.onclick=close);
$('#menuBtn').onclick=()=>$('#mobileNav').classList.toggle('open');$$('.mobile-nav a').forEach(a=>a.onclick=()=>$('#mobileNav').classList.remove('open'));$$('.modal-tabs button').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
window.addEventListener('keydown',e=>{if(e.key==='Escape')close()});$$('.modal').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)close()}));
$('#loginForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),m=$('#loginMsg');m.textContent='در حال ورود...';try{const d=await api('/auth/login',{method:'POST',body:JSON.stringify({username:f.get('username'),password:f.get('password')})});token=d.token;localStorage.setItem('amnayar_token',token);close();toast('ورود موفق بود');await loadMe()}catch(x){m.textContent=x.message}};
$('#registerForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),m=$('#registerMsg');m.textContent='در حال ساخت حساب...';try{const d=await api('/auth/register',{method:'POST',body:JSON.stringify({username:f.get('username'),password:f.get('password')})});token=d.token;localStorage.setItem('amnayar_token',token);close();toast('حساب شما ساخته شد');await loadMe()}catch(x){m.textContent=x.message}};
async function loadMe(){if(!token)return;try{const d=await api('/me');$('#heroCredits').textContent=fa(d.credits)}catch{token='';localStorage.removeItem('amnayar_token')}}
async function packages(){try{const ps=await api('/packages');$('#pricingGrid').innerHTML=ps.map((p,i)=>`<article class="price-card ${i===1?'recommended':''}">${i===1?'<span class="badge">پیشنهاد محبوب</span>':''}<h3>${p.title||'بسته اعتبار'}</h3><div class="credits">${fa(p.credits)} <small>اعتبار</small></div><div class="price">${toman(p.price_toman)}</div><button class="btn primary full" data-buy="${p.id}">خرید این بسته</button></article>`).join('');$$('[data-buy]').forEach(b=>b.onclick=()=>buy(b.dataset.buy))}catch{$('#pricingGrid').innerHTML='<div class="loading-card">بسته‌ها در حال حاضر در دسترس نیستند.</div>'}}
async function buy(id){if(!token){modal('#authModal');tab('login');toast('برای خرید ابتدا وارد حساب شوید');return}try{const d=await api('/purchases/create',{method:'POST',body:JSON.stringify({packageId:Number(id),store:'direct'})});if(d.paymentUrl){location.href=d.paymentUrl}else toast('درگاه پرداخت هنوز روی سرور فعال نشده است')}catch(x){toast(x.message==='saman_not_configured'?'درگاه پرداخت هنوز روی سرور تنظیم نشده است.':x.message)}}
const configs={card:{title:'صحت‌سنجی کارت بانکی',field:'card',label:'شماره ۱۶ رقمی کارت',placeholder:'6037 9999 1234 5678',endpoint:'/verify/card',help:'شماره کارت را بدون فاصله یا با فاصله وارد کنید.'},iban:{title:'صحت‌سنجی شبا',field:'iban',label:'شماره شبا',placeholder:'IR00 0000 0000 0000 0000 0000 00',endpoint:'/verify/iban',help:'شبا باید با IR شروع شود و ۲۶ کاراکتر داشته باشد.'},national:{title:'صحت‌سنجی کد ملی',field:'nationalId',label:'کد ملی ۱۰ رقمی',placeholder:'0012345678',endpoint:'/verify/national-id',help:'کد ملی ۱۰ رقمی را وارد کنید.'}};
function normalizeInput(type,v){let s=v.replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/\s+/g,'');if(type==='card')s=s.replace(/\D/g,'').slice(0,16);if(type==='national')s=s.replace(/\D/g,'').slice(0,10);if(type==='iban'){s=s.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,26);s=s.replace(/(.{4})/g,'$1 ').trim()}return s}
function openApp(type){if(!token){modal('#authModal');tab('login');return}const c=configs[type];modal('#appModal');$('#appTitle').textContent=c.title;$('#appContent').innerHTML=`<div class="verify-help">${c.help}</div><form class="verify-form" id="verifyForm"><label>${c.label}<input id="verifyInput" name="${c.field}" placeholder="${c.placeholder}" inputmode="numeric" autocomplete="off" required></label><div class="actions"><button class="btn primary" type="submit">بررسی اطلاعات</button><button class="btn ghost" type="button" id="clearInput">پاک کردن</button></div></form><div id="verifyResult"></div>`;const input=$('#verifyInput');input.addEventListener('input',()=>input.value=normalizeInput(type,input.value));$('#clearInput').onclick=()=>{input.value='';input.focus()};$('#verifyForm').onsubmit=e=>verify(e,type);loadAppMe()}
async function loadAppMe(){try{const d=await api('/me');$('#appCredits').textContent=fa(d.credits);$('#heroCredits').textContent=fa(d.credits)}catch{}}
async function verify(e,type){e.preventDefault();const c=configs[type],box=$('#verifyResult'),input=$('#verifyInput').value;if(!input.replace(/\s/g,'')){toast('لطفاً مقدار را وارد کنید');return}box.innerHTML='<div class="result"><b>در حال بررسی...</b><small>درخواست شما در حال پردازش است.</small></div>';try{const d=await api(c.endpoint,{method:'POST',body:JSON.stringify({[c.field]:input})});$('#appCredits').textContent=fa(d.remaining);$('#heroCredits').textContent=fa(d.remaining);box.innerHTML=`<div class="result ${d.valid?'success':'error'}"><b>${d.valid?'✓ نتیجه معتبر است':'× نتیجه نامعتبر است'}</b><small>${d.bank?`بانک: ${d.bank} • `:''}اعتبار باقی‌مانده: ${fa(d.remaining)}</small></div>`}catch(x){box.innerHTML=`<div class="result error"><b>${x.message==='اعتبار کافی نیست'?'اعتبار کافی نیست':'امکان بررسی وجود ندارد'}</b><small>${x.message==='اعتبار کافی نیست'?'برای ادامه، ابتدا از بخش خرید اعتبار یک بسته تهیه کنید.':x.message}</small></div>`}}
$$('[data-open-app]').forEach(b=>b.onclick=()=>openApp(b.dataset.openApp));
```js
async function dashboard(){
  if(!token){
    modal('#authModal');
    tab('login');
    return;
  }

  modal('#appModal');
  $('#appTitle').textContent='داشبورد من';
  $('#appContent').innerHTML=`
    <div class="user-dashboard">

      <div class="dashboard-welcome">
        <div>
          <div class="eyebrow">حساب کاربری</div>
          <h2 id="dashUsername">در حال دریافت...</h2>
          <p>به پنل امنا یار خوش آمدید.</p>
        </div>
        <div class="dashboard-balance">
          <span>اعتبار قابل استفاده</span>
          <strong id="dashCredits">—</strong>
          <small>اعتبار</small>
        </div>
      </div>

      <div class="dashboard-actions">

        <button class="dashboard-action" data-dash-app="card">
          <span class="dash-icon">▣</span>
          <b>کارت بانکی</b>
          <small>صحت‌سنجی کارت</small>
        </button>

        <button class="dashboard-action" data-dash-app="iban">
          <span class="dash-icon">⌁</span>
          <b>شماره شبا</b>
          <small>صحت‌سنجی شبا</small>
        </button>

        <button class="dashboard-action" data-dash-app="national">
          <span class="dash-icon">✓</span>
          <b>کد ملی</b>
          <small>صحت‌سنجی کد ملی</small>
        </button>

        <button class="dashboard-action" id="dashBuy">
          <span class="dash-icon">＋</span>
          <b>خرید اعتبار</b>
          <small>افزایش موجودی</small>
        </button>

      </div>

      <div class="dashboard-section">
        <div class="dashboard-section-head">
          <div>
            <div class="eyebrow">فعالیت</div>
            <h3>آخرین استعلام‌ها</h3>
          </div>
          <span id="historyCount">۰ مورد</span>
        </div>

        <div id="dashHistory" class="dash-history">
          <div class="dashboard-loading">در حال دریافت سوابق...</div>
        </div>
      </div>

      <div class="dashboard-footer-actions">
        <button class="btn primary" id="dashBuy2">خرید اعتبار</button>
        <button class="btn ghost" id="dashLogout">خروج از حساب</button>
      </div>

    </div>
  `;

  try{
    const [m,h,ps]=await Promise.all([
      api('/me'),
      api('/history'),
      api('/packages')
    ]);

    $('#dashUsername').textContent='سلام، '+(m.username||'کاربر امنا یار');
    $('#dashCredits').textContent=fa(m.credits);
    $('#appCredits').textContent=fa(m.credits);
    $('#heroCredits').textContent=fa(m.credits);

    const history=Array.isArray(h)?h:[];
    $('#historyCount').textContent=fa(history.length)+' مورد';

    if(!history.length){
      $('#dashHistory').innerHTML=`
        <div class="empty-history">
          <span>⌁</span>
          <b>هنوز استعلامی انجام نداده‌اید</b>
          <small>اولین استعلام خود را از بخش خدمات شروع کنید.</small>
        </div>
      `;
    }else{
      $('#dashHistory').innerHTML=history.slice(0,10).map(x=>{
        const typeMap={
          card:'کارت بانکی',
          iban:'شماره شبا',
          national:'کد ملی',
          nationalId:'کد ملی'
        };

        const title=typeMap[x.type]||x.type||'استعلام';
        const valid=x.result==='valid';

        return `
          <div class="dash-history-item">
            <div class="history-main">
              <span class="history-icon">${valid?'✓':'×'}</span>
              <div>
                <b>${title}</b>
                <small>${valid?'نتیجه معتبر':'نتیجه نامعتبر'}</small>
              </div>
            </div>
            <span class="history-status ${valid?'ok':'bad'}">
              ${valid?'معتبر':'نامعتبر'}
            </span>
          </div>
        `;
      }).join('');
    }

    $$('[data-dash-app]').forEach(b=>{
      b.onclick=()=>{
        close();
        openApp(b.dataset.dashApp);
      };
    });

    const buyAction=()=>{
      close();
      document.querySelector('#pricing')?.scrollIntoView({
        behavior:'smooth',
        block:'start'
      });
    };

    $('#dashBuy').onclick=buyAction;
    $('#dashBuy2').onclick=buyAction;

    $('#dashLogout').onclick=()=>{
      token='';
      localStorage.removeItem('amnayar_token');
      close();
      toast('از حساب خارج شدید');
    };

  }catch(x){
    $('#appContent').innerHTML=`
      <div class="result error">
        <b>خطا در دریافت اطلاعات حساب</b>
        <small>${x.message}</small>
      </div>
    `;
  }
}
```

const accountLink=document.createElement('button');accountLink.className='account-floating';accountLink.style.display='none';
const navDashboardBtn=$('#navDashboardBtn');
const navLoginBtn=$('#navLoginBtn');
const navRegisterBtn=$('#navRegisterBtn');

function refreshAuthUI(){
  if(token){
    navLoginBtn.style.display='none';
    navRegisterBtn.style.display='none';
    navDashboardBtn.style.display='inline-flex';
  }else{
    navLoginBtn.style.display='';
    navRegisterBtn.style.display='';
    navDashboardBtn.style.display='none';
  }
}

navDashboardBtn.onclick=dashboard;

const oldLoadMe=loadMe;
loadMe=async function(){
  await oldLoadMe();
  refreshAuthUI();
};

refreshAuthUI();window.openAmnaDashboard=dashboard;packages();loadMe();
```css
/* =========================
   AmnaYar User Dashboard
   ========================= */

.user-dashboard{
  display:flex;
  flex-direction:column;
  gap:18px;
}

.dashboard-welcome{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:20px;
  padding:22px;
  border-radius:22px;
  background:linear-gradient(135deg,#0B2A55,#123f78);
  color:#fff;
}

.dashboard-welcome h2{
  margin:5px 0;
  font-size:24px;
}

.dashboard-welcome p{
  margin:0;
  opacity:.78;
}

.dashboard-balance{
  min-width:170px;
  padding:16px 20px;
  border-radius:18px;
  background:rgba(255,255,255,.1);
  text-align:center;
}

.dashboard-balance span,
.dashboard-balance small{
  display:block;
  opacity:.75;
}

.dashboard-balance strong{
  display:block;
  font-size:32px;
  margin:4px 0;
}

.dashboard-actions{
  display:grid;
  grid-template-columns:repeat(4,1fr);
  gap:12px;
}

.dashboard-action{
  border:1px solid #e5eaf1;
  background:#fff;
  border-radius:18px;
  padding:18px 14px;
  text-align:right;
  cursor:pointer;
  transition:.2s;
  color:#10233d;
}

.dashboard-action:hover{
  transform:translateY(-2px);
  box-shadow:0 10px 25px rgba(11,42,85,.09);
  border-color:#cbd8e8;
}

.dash-icon{
  width:42px;
  height:42px;
  display:flex;
  align-items:center;
  justify-content:center;
  border-radius:13px;
  background:#eef4fb;
  color:#0B2A55;
  font-size:21px;
  margin-bottom:12px;
}

.dashboard-action b,
.dashboard-action small{
  display:block;
}

.dashboard-action small{
  color:#7a8798;
  margin-top:5px;
}

.dashboard-section{
  background:#fff;
  border:1px solid #e5eaf1;
  border-radius:20px;
  padding:20px;
}

.dashboard-section-head{
  display:flex;
  justify-content:space-between;
  align-items:center;
  margin-bottom:14px;
}

.dashboard-section-head h3{
  margin:4px 0 0;
}

.dashboard-section-head > span{
  color:#7a8798;
  font-size:13px;
}

.dash-history{
  display:flex;
  flex-direction:column;
}

.dash-history-item{
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:15px;
  padding:14px 4px;
  border-bottom:1px solid #eef1f5;
}

.dash-history-item:last-child{
  border-bottom:0;
}

.history-main{
  display:flex;
  align-items:center;
  gap:12px;
}

.history-icon{
  width:36px;
  height:36px;
  display:flex;
  align-items:center;
  justify-content:center;
  border-radius:11px;
  background:#f1f6f4;
  font-weight:bold;
}

.history-main b,
.history-main small{
  display:block;
}

.history-main small{
  color:#7a8798;
  margin-top:3px;
}

.history-status{
  font-size:13px;
  font-weight:700;
}

.history-status.ok{
  color:#16845b;
}

.history-status.bad{
  color:#c43d3d;
}

.empty-history{
  text-align:center;
  padding:28px 10px;
  color:#7a8798;
}

.empty-history span{
  display:block;
  font-size:32px;
  margin-bottom:8px;
}

.empty-history b,
.empty-history small{
  display:block;
}

.empty-history small{
  margin-top:5px;
}

.dashboard-loading{
  text-align:center;
  padding:25px;
  color:#7a8798;
}

.dashboard-footer-actions{
  display:flex;
  gap:10px;
}

@media(max-width:760px){
  .dashboard-welcome{
    flex-direction:column;
    align-items:stretch;
  }

  .dashboard-balance{
    min-width:0;
  }

  .dashboard-actions{
    grid-template-columns:repeat(2,1fr);
  }

  .dashboard-section{
    padding:15px;
  }
}

@media(max-width:430px){
  .dashboard-actions{
    grid-template-columns:1fr 1fr;
  }

  .dashboard-action{
    padding:14px 11px;
  }

  .dashboard-footer-actions{
    flex-direction:column;
  }

  .dashboard-footer-actions .btn{
    width:100%;
  }
}
```

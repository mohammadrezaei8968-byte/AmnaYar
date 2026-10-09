
async function translateText(direction){
  const input=direction==='fa-en'?$('#faToEnText'):$('#enToFaText');
  const result=direction==='fa-en'?$('#faToEnResult'):$('#enToFaResult');
  const status=direction==='fa-en'?$('#faToEnStatus'):$('#enToFaStatus');
  const text=input.value.trim();
  if(!text){status.textContent='متن را وارد کنید.';return}
  if(text.length>5000){status.textContent='حداکثر ۵۰۰۰ نویسه مجاز است.';return}
  status.textContent='در حال ترجمه...'; result.value='';
  const [sl,tl]=direction==='fa-en'?['fa','en']:['en','fa'];
  const googleUrl='https://translate.googleapis.com/translate_a/single?client=gtx&sl='+sl+'&tl='+tl+'&dt=t&q='+encodeURIComponent(text);
  const parseGoogle=async r=>{
    if(!r.ok)throw new Error('google_'+r.status);
    const data=await r.json();
    const translated=Array.isArray(data?.[0])?data[0].map(x=>Array.isArray(x)?String(x[0]||''):'').join(''):'';
    if(!translated)throw new Error('empty');
    return translated;
  };
  try{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),5000);
    try{
      const r=await fetch(googleUrl,{headers:{Accept:'application/json'},signal:controller.signal});
      const translated=await parseGoogle(r);
      result.value=translated;status.textContent='ترجمه آماده است.';return;
    }finally{clearTimeout(timer)}
  }catch(primary){
    try{
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),12000);
      try{
        const r=await fetch('/api/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,direction}),signal:controller.signal});
        const d=await r.json();
        if(!r.ok)throw new Error(d.error||'ترجمه انجام نشد.');
        const translated=String(d.translatedText||'');
        if(!translated)throw new Error('ترجمه خالی بود.');
        result.value=translated;status.textContent='ترجمه آماده است.';return;
      }finally{clearTimeout(timer)}
    }catch(fallback){
      status.textContent='سرویس ترجمه موقتاً در دسترس نیست؛ دوباره تلاش کنید.';
    }
  }
}
const activeVoiceRecognizers=Object.create(null);
function setVoiceButtons(direction,recording){
  const p=direction==='fa-en'?'fa':'en',start=$('#'+p+'RecordStart'),stop=$('#'+p+'RecordStop');
  if(start)start.disabled=!!recording;if(stop)stop.disabled=!recording;
}
function startVoiceTranslation(direction){
  const status=$('#'+(direction==='fa-en'?'faVoiceStatus':'enVoiceStatus'));
  const input=direction==='fa-en'?$('#faToEnText'):$('#enToFaText');
  input.value='';setVoiceButtons(direction,true);
  status.textContent='در حال ضبط؛ صحبت کنید و سپس «پایان ضبط» را بزنید.';
  if(window.AmnaYarSpeech&&typeof window.AmnaYarSpeech.startListening==='function'){
    try{window.AmnaYarSpeech.startListening(direction)}catch(e){setVoiceButtons(direction,false);status.textContent='شروع ضبط صدا ممکن نشد؛ دوباره تلاش کنید.'}
    return;
  }
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Recognition){setVoiceButtons(direction,false);status.textContent='تشخیص گفتار در این مرورگر پشتیبانی نمی‌شود؛ از Chrome یا Edge به‌روز استفاده کنید.';return}
  const recognition=new Recognition();activeVoiceRecognizers[direction]=recognition;
  recognition.lang=direction==='fa-en'?'fa-IR':'en-US';recognition.interimResults=true;recognition.continuous=true;recognition.maxAlternatives=1;
  recognition.onresult=event=>{
    let spoken='';for(let i=0;i<event.results.length;i++){const item=event.results[i];if(item.isFinal)spoken+=item[0].transcript+' ';}
    if(spoken.trim())input.value=(input.value+' '+spoken).trim();
  };
  recognition.onerror=event=>{setVoiceButtons(direction,false);status.textContent=event.error==='not-allowed'?'اجازه میکروفون را در مرورگر فعال کنید.':'ضبط گفتار انجام نشد؛ دوباره تلاش کنید.'};
  recognition.onend=()=>{setVoiceButtons(direction,false);if(input.value.trim())status.textContent='گفتار ثبت شد؛ برای ترجمه دکمه ترجمه را بزنید.';else if(status.textContent.startsWith('در حال ضبط'))status.textContent='گفتاری ثبت نشد؛ دوباره شروع کنید.'};
  try{recognition.start()}catch(e){setVoiceButtons(direction,false);status.textContent='میکروفون در حال استفاده است؛ چند لحظه دیگر تلاش کنید.'}
}
function stopVoiceTranslation(direction){
  const status=$('#'+(direction==='fa-en'?'faVoiceStatus':'enVoiceStatus')),recognition=activeVoiceRecognizers[direction];
  try{if(window.AmnaYarSpeech&&typeof window.AmnaYarSpeech.stopListening==='function')window.AmnaYarSpeech.stopListening();else if(recognition)recognition.stop();setVoiceButtons(direction,false);status.textContent='در حال پایان ضبط…';}
  catch(e){setVoiceButtons(direction,false);status.textContent='ضبط متوقف نشد؛ دوباره تلاش کنید.'}
}
window.amnayarVoiceResult=function(text,direction,error){
  const status=$('#'+(direction==='fa-en'?'faVoiceStatus':'enVoiceStatus')),input=direction==='fa-en'?$('#faToEnText'):$('#enToFaText');
  setVoiceButtons(direction,false);
  if(error){status.textContent=error==='permission'?'اجازه دسترسی به میکروفون را فعال کنید.':error==='unsupported'?'سرویس تشخیص گفتار روی این دستگاه در دسترس نیست.':'گفتار تشخیص داده نشد؛ دوباره تلاش کنید.';return}
  if(!text){status.textContent='گفتاری دریافت نشد؛ دوباره تلاش کنید.';return}
  input.value=text;status.textContent='گفتار ثبت شد؛ برای ترجمه، دکمه ترجمه را بزنید.';
}
const $=s=>document.querySelector(s); const fa=n=>n.toLocaleString('fa-IR');
async function mergePDFs(){const files=[...$('#mergeFiles').files];if(!files.length)return $('#mergeStatus').textContent='حداقل یک فایل انتخاب کنید.';$('#mergeStatus').textContent='در حال پردازش...';const out=await PDFLib.PDFDocument.create();for(const f of files){const doc=await PDFLib.PDFDocument.load(await f.arrayBuffer());const pages=await out.copyPages(doc,doc.getPageIndices());pages.forEach(p=>out.addPage(p));}download(await out.save(),'amnayar-merged.pdf','application/pdf');$('#mergeStatus').textContent='فایل ادغام شد.'}
function parsePages(s,max){const set=new Set();const normalized=String(s||'').replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٬،]/g,',').replace(/[–—−]/g,'-').replace(/\s+/g,'');for(const part of normalized.split(',').filter(Boolean)){if(part.includes('-')){const ab=part.split('-');if(ab.length!==2)continue;let[a,b]=ab.map(Number);if(!Number.isInteger(a)||!Number.isInteger(b))continue;a=Math.max(1,Math.min(max,a));b=Math.max(1,Math.min(max,b));if(a>b)[a,b]=[b,a];for(let i=a;i<=b;i++)set.add(i-1)}else{const n=Number(part);if(Number.isInteger(n)&&n>=1&&n<=max)set.add(n-1)}}return [...set].sort((a,b)=>a-b)}
async function splitPDF(){const f=$('#splitFile').files[0],spec=$('#splitPages').value.trim(),s=$('#splitStatus');if(!f)return s.textContent='فایل PDF را انتخاب کنید.';if(!spec)return s.textContent='صفحات را وارد کنید.';s.textContent='در حال جدا کردن صفحات...';try{const doc=await PDFLib.PDFDocument.load(await f.arrayBuffer());const groups=spec.split(';').map(x=>x.trim()).filter(Boolean);const outputs=[];for(let g=0;g<groups.length;g++){const idx=parsePages(groups[g],doc.getPageCount());if(!idx.length)continue;const out=await PDFLib.PDFDocument.create();const pages=await out.copyPages(doc,idx);pages.forEach(p=>out.addPage(p));outputs.push({name:`amnayar-pages-${g+1}.pdf`,bytes:await out.save({useObjectStreams:true})})}if(!outputs.length)throw new Error('هیچ صفحه معتبری پیدا نشد.');if(outputs.length===1){download(outputs[0].bytes,outputs[0].name,'application/pdf');s.textContent='فایل PDF جدا شد.'}else{if(!window.JSZip)throw new Error('کتابخانه فشرده‌سازی آماده نیست.');const zip=new JSZip();outputs.forEach(x=>zip.file(x.name,x.bytes));const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});downloadBlob(blob,'amnayar-pdf-parts.zip');s.textContent=`${fa(outputs.length)} فایل PDF ساخته شد و داخل ZIP قرار گرفت.`}}catch(e){console.error(e);s.textContent='جداسازی PDF انجام نشد؛ فایل یا شماره صفحات را بررسی کنید.'}}
function download(bytes,name,type){downloadBlob(new Blob([bytes],{type}),name)}
function j2g(jy,jm,jd){let jy2=jy-979,jm2=jm-1,jd2=jd-1;let j_day=365*jy2+Math.floor(jy2/33)*8+Math.floor((jy2%33+3)/4);for(let i=0;i<jm2;i++)j_day+=i<6?31:30;j_day+=jd2;let g_day=j_day+79;let gy=1600+400*Math.floor(g_day/146097);g_day%=146097;let leap=true;if(g_day>=36525){g_day--;gy+=100*Math.floor(g_day/36524);g_day%=36524;if(g_day>=365)g_day++;else leap=false}gy+=4*Math.floor(g_day/1461);g_day%=1461;if(g_day>=366){leap=false;g_day--;gy+=Math.floor(g_day/365);g_day%=365}let gd=g_day+1,gm=0;const md=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];while(gd>md[gm])gd-=md[gm++];return[gy,gm+1,gd]}
function g2j(gy,gm,gd){const g_d_m=[0,31,59,90,120,151,181,212,243,273,304,334];let gy2=gy-(gm>2?0:1),days=355666+365*gy2+Math.floor(gy2/4)-Math.floor(gy2/100)+Math.floor((gy2+3)/400)+gd+g_d_m[gm-1];let jy=-1595+33*Math.floor(days/12053);days%=12053;jy+=4*Math.floor(days/1461);days%=1461;if(days>365){jy+=Math.floor((days-1)/365);days=(days-1)%365}let jm=days<186?1+Math.floor(days/31):7+Math.floor((days-186)/30);let jd=1+(days<186?days%31:(days-186)%30);return[jy,jm,jd]}
function parts(s){return s.trim().replaceAll('-','/').replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).split('/').map(Number)}function jalaliToGregorianUI(){const p=parts($('#jdate').value);if(p.length!==3)return $('#jgResult').textContent='تاریخ را به شکل 1405/06/20 وارد کنید.';const r=j2g(...p);$('#jgResult').textContent=`میلادی: ${r.join('/')}  (${r.map(fa).join('/')})`}function gregorianToJalaliUI(){const p=parts($('#gdate').value);if(p.length!==3)return $('#gjResult').textContent='تاریخ را به شکل 2026/09/11 وارد کنید.';const r=g2j(...p);$('#gjResult').textContent=`شمسی: ${r.join('/')}  (${r.map(fa).join('/')})`}
function discountCalc(){const p=+$('#price').value,x=+$('#percent').value;$('#discountResult').textContent=`مبلغ تخفیف: ${fa(Math.round(p*x/100))} — مبلغ نهایی: ${fa(Math.round(p*(1-x/100)))}`}function overtimeCalc(){const h=+$('#hourly').value,x=+$('#hours').value;$('#overtimeResult').textContent=`مبلغ اضافه‌کاری: ${fa(Math.round(h*x))}`}
function textStats(){const t=$('#textInput').value;$('#textResult').textContent=`حروف: ${fa(t.replace(/\s/g,'').length)} — کلمات: ${fa(t.trim()?t.trim().split(/\s+/).length:0)} — کاراکتر: ${fa(t.length)}`}function faDigits(){let t=$('#textInput');t.value=t.value.replace(/[0-9]/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d])}function enDigits(){let t=$('#textInput');t.value=t.value.replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d))}function cleanText(){let t=$('#textInput');t.value=t.value.replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim()}
function b64e(){try{$('#encodeResult').textContent=btoa(unescape(encodeURIComponent($('#encodeInput').value)))}catch(e){$('#encodeResult').textContent=e.message}}function b64d(){try{$('#encodeResult').textContent=decodeURIComponent(escape(atob($('#encodeInput').value)))}catch(e){$('#encodeResult').textContent='Base64 نامعتبر است.'}}function urlE(){$('#encodeResult').textContent=encodeURIComponent($('#encodeInput').value)}function jsonFmt(){try{$('#encodeResult').textContent=JSON.stringify(JSON.parse($('#encodeInput').value),null,2)}catch(e){$('#encodeResult').textContent='JSON نامعتبر است.'}}async function sha256(){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode($('#encodeInput').value));$('#encodeResult').textContent=[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}

function money(n){return fa(Math.round(Number(n)||0))+' تومان'}
function carCalc(){const f=+$('#carFactory').value,m=+$('#carMarket').value;if(!f||!m)return $('#carResult').textContent='قیمت کارخانه و بازار را وارد کنید.';const d=m-f,p=d/f*100;$('#carResult').textContent=`اختلاف قیمت: ${money(d)} — اختلاف: ${p.toLocaleString('fa-IR',{maximumFractionDigits:1})}٪`+(d>=0?' — بازار بالاتر است.':' — بازار پایین‌تر است.')}
function carProfitCalc(){const b=+$('#carBuy').value,s=+$('#carSell').value,e=+$('#carExtra').value;if(!b||!s)return $('#carProfitResult').textContent='قیمت خرید و فروش را وارد کنید.';const profit=s-b-e,p=profit/b*100;$('#carProfitResult').textContent=`${profit>=0?'سود':'زیان'}: ${money(Math.abs(profit))} — درصد: ${Math.abs(p).toLocaleString('fa-IR',{maximumFractionDigits:1})}٪`}
async function loadLiveGoldPrices(){
  const status=document.getElementById('goldLiveStatus');
  try{
    status.textContent='در حال دریافت قیمت زنده...';
    const r=await fetch('/api/market?refresh=1',{cache:'no-store'}); const j=await r.json();
    if(!r.ok)throw new Error(j.message||j.error||'market_unavailable');
    const g=Number(j.items?.gold18?.price_toman||0), coin=Number(j.items?.coin?.price_toman||0);
    if(g){$('#goldLiveGram').value=Math.round(g); if(!$('#goldGram').value)$('#goldGram').value=Math.round(g); if(!$('#goldSellGram').value)$('#goldSellGram').value=Math.round(g);}
    if(coin){$('#coinLivePrice').value=Math.round(coin); if(!$('#coinPrice').value)$('#coinPrice').value=Math.round(coin);}
    const time=j.fetchedAt?new Date(j.fetchedAt).toLocaleString('fa-IR'):'—';
    status.textContent=(j.stale?'⚠️ آخرین قیمت معتبر: ':'✓ قیمت زنده دریافت شد: ')+time;
  }catch(err){status.textContent='قیمت زنده در دسترس نیست؛ برای جلوگیری از محاسبه جعلی، قیمت خودکار استفاده نشد.';}
}
function goldBasePrice(id){const v=Number($(id)?.value||0);return v>0?v:Number($('#goldLiveGram')?.value||0)}
function goldBuyCalc(){
  const w=+$('#goldWeight').value,g=goldBasePrice('goldGram'),karat=+$('#goldKarat').value,discount=Math.max(0,+$('#goldBuyDiscount').value||0);
  if(!w||!g)return $('#goldBuyResult').textContent='وزن و قیمت مرجع را وارد یا از قیمت زنده دریافت کنید.';
  const raw=w*g*(karat/18),deduction=raw*discount/100,total=raw-deduction;$('#goldBuyResult').innerHTML='ارزش خام: <b>'+money(raw)+'</b> — کسر خرید: '+money(deduction)+' — <b>مبلغ خرید: '+money(total)+'</b>';
}
function goldSellCalc(){
  const w=+$('#goldSellWeight').value,g=goldBasePrice('goldSellGram'),karat=+$('#goldSellKarat').value,wage=Math.max(0,+$('#goldWage').value||0),profit=Math.max(0,+$('#goldProfit').value||0),tax=Math.max(0,+$('#goldTax').value||0);
  if(!w||!g)return $('#goldSellResult').textContent='وزن، عیار و قیمت مرجع را وارد کنید.';
  const base=w*g*(karat/18),wageAmt=base*wage/100,profitAmt=(base+wageAmt)*profit/100,taxBase=wageAmt+profitAmt,taxAmt=taxBase*tax/100,total=base+wageAmt+profitAmt+taxAmt;$('#goldSellResult').innerHTML='اصل طلا: '+money(base)+' — اجرت: '+money(wageAmt)+' — سود فروشنده: '+money(profitAmt)+' — مالیات: '+money(taxAmt)+' — <b>مبلغ نهایی فاکتور: '+money(total)+'</b>';
}
function coinCalc(){
  const n=+$('#coinCount').value,p=Number($('#coinPrice').value||$('#coinLivePrice').value||0);
  if(!n||!p)return $('#coinResult').textContent='تعداد و قیمت سکه را وارد یا قیمت زنده را دریافت کنید.';
  $('#coinResult').innerHTML=`تعداد: ${n.toLocaleString('fa-IR')} — قیمت واحد: ${money(p)} — <b>ارزش کل: ${money(n*p)} تومان</b>`;
}
function fxCalc(){const a=+$('#fxAmount').value,r=+$('#fxRate').value;if(!a||!r)return $('#fxResult').textContent='مقدار ارز و نرخ را وارد کنید.';$('#fxResult').textContent=`${fa(a)} ${$('#fxCurrency').value} ≈ ${money(a*r)}`}
function fxProfitCalc(){const a=+$('#fxBuyAmount').value,b=+$('#fxBuyRate').value,s=+$('#fxSellRate').value;if(!a||!b||!s)return $('#fxProfitResult').textContent='مقدار ارز و هر دو نرخ را وارد کنید.';const p=a*(s-b),pct=(s-b)/b*100;$('#fxProfitResult').textContent=`${p>=0?'سود':'زیان'}: ${money(Math.abs(p))} — درصد: ${Math.abs(pct).toLocaleString('fa-IR',{maximumFractionDigits:2})}٪`}
function depositToRent(){const d=+$('#deposit').value,r=+$('#depositRate').value||3;if(!d)return $('#depositRentResult').textContent='مبلغ رهن را وارد کنید.';$('#depositRentResult').textContent=`اجاره معادل تقریبی: ${money(d/100000000*r*1000000)}`}
function rentToDeposit(){const r=+$('#rentAmount').value,k=+$('#rentRate').value||3;if(!r||!k)return $('#rentDepositResult').textContent='اجاره و نرخ تبدیل را وارد کنید.';$('#rentDepositResult').textContent=`رهن معادل تقریبی: ${money(r/(k/100))}`}
function addInvoiceRow(){const wrap=$('#invoiceItems'),row=document.createElement('div');row.className='invoice-row';row.innerHTML='<input class="inv-desc" placeholder="شرح کالا یا خدمت"><input class="inv-qty" type="number" min="1" value="1" placeholder="تعداد"><input class="inv-price" type="number" min="0" placeholder="قیمت واحد (تومان)"><button type="button" class="btn soft" onclick="this.parentElement.remove()">حذف</button>';wrap.appendChild(row)}
async async function makeInvoicePDF(){
  const status=$('#invoiceResult');
  if(!window.PDFLib){status.textContent='کتابخانه PDF آماده نیست؛ چند ثانیه بعد دوباره تلاش کنید.';return}
  const rows=[...document.querySelectorAll('.invoice-row')].map(r=>({d:r.querySelector('.inv-desc').value.trim(),q:+r.querySelector('.inv-qty').value||0,p:+r.querySelector('.inv-price').value||0})).filter(x=>x.d&&x.q&&x.p);
  if(!rows.length){status.textContent='حداقل یک ردیف فاکتور را کامل کنید.';return}
  const seller=$('#invSeller').value.trim()||'—',buyer=$('#invBuyer').value.trim()||'—',date=$('#invDate').value.trim()||'—',num=$('#invNumber').value.trim()||'—';
  const total=rows.reduce((a,x)=>a+x.q*x.p,0),scale=2,w=1120,h=Math.max(1584,430+rows.length*82),canvas=document.createElement('canvas');canvas.width=w*scale;canvas.height=h*scale;
  const ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.direction='rtl';ctx.textAlign='right';ctx.fillStyle='#14243b';ctx.font='700 34px Arial';ctx.fillText('فاکتور فروش',w-70,70);
  const logoFile=$('#invLogo')?.files?.[0];
  if(logoFile){try{const url=URL.createObjectURL(logoFile);const logo=await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=url});const ratio=Math.min(160/logo.width,100/logo.height,1);ctx.drawImage(logo,70,25,logo.width*ratio,logo.height*ratio);URL.revokeObjectURL(url)}catch(e){status.textContent='لوگو بارگذاری نشد؛ فاکتور بدون لوگو ساخته می‌شود.'}}
  ctx.font='20px Arial';ctx.fillStyle='#52637a';ctx.fillText('شماره: '+num,w-70,112);ctx.fillText('تاریخ: '+date,w-70,145);ctx.fillStyle='#14243b';ctx.font='700 22px Arial';ctx.fillText('فروشنده: '+seller,w-70,205);ctx.fillText('خریدار: '+buyer,w-70,240);
  const left=70,right=w-70,top=285,rowH=58;ctx.fillStyle='#eef4fb';ctx.fillRect(left,top,right-left,rowH);ctx.fillStyle='#14243b';ctx.font='700 19px Arial';ctx.fillText('شرح کالا / خدمت',right-25,top+37);ctx.fillText('تعداد',right-600,top+37);ctx.fillText('قیمت واحد',right-760,top+37);ctx.fillText('جمع',left+90,top+37);
  ctx.font='18px Arial';let y=top+rowH;rows.forEach(x=>{ctx.fillStyle='#fff';ctx.fillRect(left,y,right-left,rowH);ctx.strokeStyle='#dce4ee';ctx.strokeRect(left,y,right-left,rowH);ctx.fillStyle='#14243b';ctx.fillText(x.d.slice(0,45),right-25,y+37);ctx.fillText(fa(x.q),right-600,y+37);ctx.fillText(fa(Math.round(x.p).toLocaleString('en-US')),right-760,y+37);ctx.fillText(fa(Math.round(x.q*x.p).toLocaleString('en-US')),left+90,y+37);y+=rowH;});
  ctx.font='700 24px Arial';ctx.fillText('جمع کل: '+money(total),right,y+55);ctx.font='16px Arial';ctx.fillStyle='#718096';ctx.fillText('ساخته‌شده توسط امنا یار',right,h-35);
  try{const png=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('canvas_export_failed')),'image/png'));const doc=await PDFLib.PDFDocument.create();const page=doc.addPage([w/2,h/2]);const img=await doc.embedPng(await png.arrayBuffer());page.drawImage(img,{x:0,y:0,width:w/2,height:h/2});const bytes=await doc.save();download(bytes,'amnayar-invoice-'+num+'.pdf','application/pdf');status.textContent='فاکتور آماده شد — جمع کل: '+money(total)}catch(e){console.error('invoice pdf',e);status.textContent='ساخت PDF انجام نشد؛ دوباره تلاش کنید.'}
}
function resizeImage(){const f=$('#imgFile').files[0],w=+$('#imgW').value,h=+$('#imgH').value;if(!f||!w||!h)return $('#imgStatus').textContent='فایل و ابعاد را وارد کنید.';const im=new Image();im.onload=()=>{const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(im,0,0,w,h);c.toBlob(b=>download(b,'amnayar-image.png','image/png'),'image/png');URL.revokeObjectURL(im.src);$('#imgStatus').textContent='تصویر آماده شد.'};im.src=URL.createObjectURL(f)}

function fmtBytes(n){if(!Number.isFinite(n))return '';const u=['بایت','کیلوبایت','مگابایت','گیگابایت'];let i=0;let x=n;while(x>=1024&&i<u.length-1){x/=1024;i++;}return `${x.toLocaleString('fa-IR',{maximumFractionDigits:2})} ${u[i]}`}
function savingsText(a,b){if(!a||!b)return '';const pct=(1-b/a)*100;if(pct<=0)return `حجم اولیه: ${fmtBytes(a)} — حجم خروجی: ${fmtBytes(b)} — این فایل از قبل بهینه است.`;return `حجم اولیه: ${fmtBytes(a)} — حجم جدید: ${fmtBytes(b)} — کاهش: ${pct.toLocaleString('fa-IR',{maximumFractionDigits:1})}%`}
function showConversionNotice(text,ok=true){let n=document.getElementById('amnayarConversionNotice');if(!n){n=document.createElement('div');n.id='amnayarConversionNotice';n.style.cssText='position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:100000;max-width:92vw;padding:13px 18px;border-radius:14px;background:#0b7a4b;color:#fff;box-shadow:0 12px 35px rgba(0,0,0,.18);font-weight:800;text-align:center;direction:rtl';document.body.appendChild(n)}n.textContent=text;n.style.background=ok?'#0b7a4b':'#b42318';n.style.display='block';clearTimeout(n._t);n._t=setTimeout(()=>n.style.display='none',4500)}
function downloadBlob(blob,name){if(window.AmnaYarDownloader&&blob&&blob.size<=50*1024*1024){const reader=new FileReader();reader.onload=()=>{try{window.AmnaYarDownloader.saveBase64(name||'download',blob.type||'application/octet-stream',String(reader.result).split(',')[1]||'')}catch(e){showConversionNotice('ذخیره دانلود انجام نشد.',false)}};reader.readAsDataURL(blob);return}const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1500);showConversionNotice('تبدیل با موفقیت انجام شد؛ دانلود فایل آغاز شد.')}window.addEventListener('amnayarDownloadCompleted',()=>showConversionNotice('تبدیل با موفقیت انجام شد؛ فایل دانلود شد.'));window.addEventListener('amnayarDownloadFailed',()=>showConversionNotice('تبدیل انجام شد اما ذخیره فایل ناموفق بود.',false));
$('#imageQuality')?.addEventListener('input',e=>$('#imageQualityValue').textContent=e.target.value);

// فشرده‌سازی سمت کاربر: برای تصویر هیچ وابستگی به سرویس Render ندارد.
async function compressImage(){
  const f=$('#compressImageFile').files[0],s=$('#compressImageStatus');
  if(!f)return s.textContent='تصویر را انتخاب کنید.';
  if(f.size>100*1024*1024)return s.textContent='حداکثر حجم تصویر ۱۰۰ مگابایت است.';
  s.textContent='در حال کم‌حجم‌کردن تصویر...';
  try{
    const q=Math.min(0.95,Math.max(0.2,Number($('#imageQuality').value)/100));
    const src=URL.createObjectURL(f),img=new Image();
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=src});
    const maxSide=2400;
    const scale=Math.min(1,maxSide/Math.max(img.naturalWidth,img.naturalHeight));
    const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.naturalWidth*scale));c.height=Math.max(1,Math.round(img.naturalHeight*scale));
    const ctx=c.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);
    let blob=await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('خروجی تصویر ساخته نشد.')),'image/jpeg',q));
    if(blob.size>=f.size){
      const tries=[[1800,0.58],[1400,0.42],[1000,0.30]];
      for(const [dim,qq] of tries){
        const scale2=Math.min(1,dim/Math.max(img.naturalWidth,img.naturalHeight));
        c.width=Math.max(1,Math.round(img.naturalWidth*scale2));c.height=Math.max(1,Math.round(img.naturalHeight*scale2));
        ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);
        blob=await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('خروجی تصویر ساخته نشد.')),'image/jpeg',qq));
        if(blob.size<f.size)break;
      }
    }
    URL.revokeObjectURL(src);
    if(blob.size>=f.size){s.textContent='این فایل از قبل کم‌حجم است؛ خروجی بزرگ‌تر دانلود نشد.';return;}
    downloadBlob(blob,'amnayar-compressed.jpg');s.textContent=savingsText(f.size,blob.size);
  }catch(e){s.textContent='فشرده‌سازی تصویر انجام نشد؛ فرمت تصویر را بررسی کنید.';}
}

// PDF بدون ارسال فایل به سرور دوباره ذخیره می‌شود و ساختار فایل بهینه می‌شود.
async async function compressPDF(){const f=$('#compressPdfFile').files[0],s=$('#compressPdfStatus');if(!f)return s.textContent='فایل PDF را انتخاب کنید.';const MAX=500*1024*1024;if(f.size>MAX)return s.textContent='حداکثر حجم PDF برابر ۵۰۰ مگابایت است.';const level=Math.max(25,Math.min(75,Number($('#pdfQuality').value||55)));s.textContent='در حال فشرده‌سازی PDF حجیم... لطفاً صفحه را نبندید.';try{const fd=new FormData();fd.append('file',f,f.name);fd.append('quality',String(level));const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),45*60*1000);try{const r=await fetch('/api/tools/compress-pdf',{method:'POST',body:fd,signal:controller.signal});if(!r.ok){let d={};try{d=await r.json()}catch{}throw new Error(d.error||('server_compress_'+r.status))}const blob=await r.blob(),original=Number(r.headers.get('X-Original-Size')||f.size),compressed=Number(r.headers.get('X-Compressed-Size')||blob.size);if(compressed>=original){s.textContent='این PDF از قبل کم‌حجم است؛ خروجی بزرگ‌تر دانلود نشد.';showConversionNotice('فایل از قبل کم‌حجم است؛ خروجی بزرگ‌تر دانلود نشد.',false);return}downloadBlob(blob,'amnayar-compressed.pdf');s.textContent=savingsText(original,compressed)+' — فشرده‌سازی انجام شد.'}finally{clearTimeout(timer)}}catch(e){console.error('PDF compression',e);s.textContent=e?.name==='AbortError'?'پردازش فایل حجیم بیش از زمان مجاز طول کشید؛ سطح فشرده‌سازی را بیشتر کنید.':'فشرده‌سازی PDF انجام نشد؛ فایل ممکن است رمزدار یا آسیب‌دیده باشد.';showConversionNotice('فشرده‌سازی PDF انجام نشد.',false)}}

// ویدئو در خود مرورگر با MediaRecorder به WebM فشرده می‌شود؛ فایل به سرور ارسال نمی‌شود.
async function compressVideo(){
  const f=$('#compressVideoFile').files[0],s=$('#compressVideoStatus');
  if(!f)return s.textContent='ویدئو را انتخاب کنید.';
  const max=1024*1024*1024;
  if(f.size>max)return s.textContent='حداکثر حجم هر ویدئو ۱ گیگابایت است.';
  const q=$('#videoQuality').value;
  s.textContent='در حال ارسال ویدئو برای فشرده‌سازی؛ برای فایل‌های حجیم این مرحله ممکن است زمان ببرد…';
  const fd=new FormData();fd.append('file',f,f.name);fd.append('quality',q);
  const xhr=new XMLHttpRequest();xhr.open('POST','/api/tools/compress-video');xhr.responseType='blob';xhr.timeout=60*60*1000;
  xhr.upload.onprogress=e=>{if(e.lengthComputable)s.textContent='در حال ارسال ویدئو: '+Math.round(e.loaded/e.total*100)+'٪';};
  xhr.onload=async()=>{
    if(xhr.status<200||xhr.status>=300){
      let message='فشرده‌سازی ویدئو انجام نشد؛ فایل یا فرمت را بررسی کنید.';
      try{const data=JSON.parse(await xhr.response.text());if(data.error==='ffmpeg_unavailable')message='سرویس فشرده‌سازی ویدئو آماده نیست؛ استقرار سرور را بررسی کنید.';else if(data.error==='video_too_large')message='حجم ویدئو از حد مجاز یک گیگابایت بیشتر است.';}catch(e){}
      s.textContent=message;return;
    }
    const blob=xhr.response,original=Number(xhr.getResponseHeader('X-Original-Size')||f.size),compressed=Number(xhr.getResponseHeader('X-Compressed-Size')||blob.size);
    if(compressed>=original){s.textContent='این ویدئو از قبل کم‌حجم است؛ خروجی بزرگ‌تر دانلود نشد.';return}
    downloadBlob(blob,'amnayar-compressed.mp4');s.textContent=savingsText(original,compressed)+' — خروجی MP4 آماده شد.';
  };
  xhr.onerror=()=>{s.textContent='ارتباط با سرویس فشرده‌سازی قطع شد؛ دوباره تلاش کنید.'};
  xhr.ontimeout=()=>{s.textContent='پردازش ویدئوی حجیم بیش از زمان مجاز طول کشید؛ ویدئو را کوتاه‌تر یا با کیفیت کمتر امتحان کنید.'};
  xhr.upload.onload=()=>{s.textContent='ارسال کامل شد؛ سرور در حال فشرده‌سازی ویدئو است…';};
  xhr.send(fd);
}


(async()=>{try{const r=await fetch('/api/public-config');if(!r.ok)return;const c=await r.json();const enabled=new Set((c.tools||[]).filter(x=>x.enabled).map(x=>x.slug));if(c.tools?.length)document.querySelectorAll('.tool-panel[id]').forEach(sec=>{sec.style.display=enabled.has(sec.id)?'':'none'});if((c.notices||[]).length){const n=c.notices[0];const bar=document.createElement('div');bar.className='public-notice '+n.type;bar.innerHTML=`<b>${escapeHtml(n.title)}</b><span>${escapeHtml(n.body)}</span>`;document.body.insertBefore(bar,document.body.firstChild)}}catch(e){}})();
if(new URLSearchParams(location.search).get('tool')==='gold'){window.addEventListener('DOMContentLoaded',()=>setTimeout(loadLiveGoldPrices,250));}
function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]))}

function download(bytes,name,mime){
  const blob=bytes instanceof Blob?bytes:new Blob([bytes],{type:mime||'application/octet-stream'});
  downloadBlob(blob,name||'download');
}
let imagePdfSelectedFiles=[];

function syncImagePdfInput(){
  const input=$('#imagePdfFiles');
  if(!input)return;
  try{
    const dt=new DataTransfer();
    imagePdfSelectedFiles.forEach(f=>dt.items.add(f));
    input.files=dt.files;
  }catch(e){}
}

function clearImagePdf(){
  const i=$('#imagePdfFiles'),p=$('#imagePdfPreview'),s=$('#imagePdfStatus'),c=$('#imagePdfSelectedCount');
  imagePdfSelectedFiles=[];
  if(i)i.value='';
  if(p)p.innerHTML='';
  if(c)c.textContent='';
  if(s)s.textContent='';
}

function moveImagePdfFile(index,delta){
  const target=index+delta;
  if(target<0||target>=imagePdfSelectedFiles.length)return;
  const [file]=imagePdfSelectedFiles.splice(index,1);
  imagePdfSelectedFiles.splice(target,0,file);
  syncImagePdfInput();
  imagePdfPreview();
}

function removeImagePdfFile(index){
  if(index<0||index>=imagePdfSelectedFiles.length)return;
  imagePdfSelectedFiles.splice(index,1);
  syncImagePdfInput();
  imagePdfPreview();
}

function imagePdfPreview(){
  const i=$('#imagePdfFiles'),p=$('#imagePdfPreview'),s=$('#imagePdfStatus'),c=$('#imagePdfSelectedCount');
  if(!i||!p)return;
  p.innerHTML='';
  const fs=imagePdfSelectedFiles;
  if(!fs.length){
    if(c)c.textContent='';
    if(s)s.textContent='یک یا چند عکس انتخاب کنید.';
    return;
  }
  fs.forEach((f,n)=>{
    const item=document.createElement('div');
    item.className='image-pdf-preview-item';
    item.style.position='relative';
    const img=document.createElement('img');
    img.alt=f.name;
    const u=URL.createObjectURL(f);
    img.src=u;
    img.onload=()=>URL.revokeObjectURL(u);
    const name=document.createElement('small');
    name.textContent=(n+1)+'. '+f.name;
    const order=document.createElement('div');
    order.style.cssText='display:flex;gap:5px;margin-top:7px';
    [['↑ بالا',-1],['↓ پایین',1]].forEach(([label,delta])=>{
      const move=document.createElement('button');move.type='button';move.textContent=label;
      move.disabled=(delta<0&&n===0)||(delta>0&&n===fs.length-1);
      move.style.cssText='flex:1;border:0;background:#eaf2fa;color:#244c76;border-radius:8px;padding:6px 4px;cursor:pointer;font:inherit;font-size:10px;font-weight:800';
      move.onclick=()=>moveImagePdfFile(n,delta);order.appendChild(move);
    });
    const del=document.createElement('button');
    del.type='button';
    del.textContent='✕ حذف';
    del.setAttribute('aria-label','حذف '+f.name);
    del.style.cssText='border:0;background:#fff0f0;color:#b33a3a;border-radius:8px;padding:6px 9px;margin-top:7px;cursor:pointer;font:inherit;font-size:10px;font-weight:800;width:100%';
    del.onclick=()=>removeImagePdfFile(n);
    item.append(img,name,order,del);
    p.appendChild(item);
  });
  if(c)c.textContent='تعداد عکس‌های انتخاب‌شده: '+fa(fs.length);
  if(s)s.textContent=fa(fs.length)+' عکس انتخاب شده است. برای حذف هر عکس، دکمه «✕ حذف» همان عکس را بزنید.';
}

document.addEventListener('DOMContentLoaded',()=>{
  $('#imagePdfFiles')?.addEventListener('change',e=>{
    const newly=[...e.target.files];
    const keys=new Set(imagePdfSelectedFiles.map(f=>f.name+'|'+f.size+'|'+f.lastModified));
    newly.forEach(f=>{
      const key=f.name+'|'+f.size+'|'+f.lastModified;
      if(!keys.has(key)){imagePdfSelectedFiles.push(f);keys.add(key);}
    });
    syncImagePdfInput();
    imagePdfPreview();
  });
});
async function buildImagePdfAtSettings(files,maxDim,quality){
  const prepared=await Promise.all(files.map(async f=>{
    const img=await new Promise((res,rej)=>{const x=new Image(),u=URL.createObjectURL(f);x.onload=()=>{URL.revokeObjectURL(u);res(x)};x.onerror=()=>{URL.revokeObjectURL(u);rej(new Error('image_load_failed'))};x.src=u});
    const scale=Math.min(1,maxDim/Math.max(img.naturalWidth,img.naturalHeight)),w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
    const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);
    const jpg=await new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error('image_export_failed')),'image/jpeg',quality));
    return {data:await jpg.arrayBuffer(),w,h};
  }));
  const doc=await PDFLib.PDFDocument.create();
  for(const x of prepared){
    const emb=await doc.embedJpg(x.data),portrait=x.h>=x.w,pw=portrait?595:842,ph=portrait?842:595,ratio=Math.min(pw/x.w,ph/x.h),dw=x.w*ratio,dh=x.h*ratio,page=doc.addPage([pw,ph]);
    page.drawImage(emb,{x:(pw-dw)/2,y:(ph-dh)/2,width:dw,height:dh});
  }
  return await doc.save({useObjectStreams:true});
}
async function imagesToPDF(){
  const input=$('#imagePdfFiles'),s=$('#imagePdfStatus'),fs=input?[...input.files]:[];
  if(!fs.length){if(s)s.textContent='حداقل یک عکس انتخاب کنید.';return}
  if(!window.PDFLib){if(s)s.textContent='کتابخانه PDF آماده نیست؛ صفحه را یک بار تازه‌سازی کنید.';return}
  let target=Number($('#imagePdfTargetMB')?.value||0);if($('#imagePdfTargetMB')?.value==='custom')target=Number($('#imagePdfCustomMB')?.value||0);
  const inputBytes=fs.reduce((n,f)=>n+f.size,0);
  const autoTarget=Math.max(64*1024,Math.floor(inputBytes*.90));
  const targetBytes=(target>0?Math.min(target*1024*1024,autoTarget):autoTarget);
  s.textContent='در حال تبدیل سریع و کم‌حجم PDF...';
  try{
    let bytes=await buildImagePdfAtSettings(fs,1400,.78);
    if(bytes.length>targetBytes){
      const settings=[[1050,.62],[800,.48],[650,.36]];
      for(const [d,q] of settings){s.textContent='در حال بهینه‌سازی سریع: '+d+'px / '+Math.round(q*100)+'٪...';bytes=await buildImagePdfAtSettings(fs,d,q);if(bytes.length<=targetBytes)break}
    }
    const name=fs.length===1?'amnayar-image-to-pdf.pdf':'amnayar-images-to-pdf.pdf';
    if(bytes.length>inputBytes){s.textContent='خروجی از مجموع فایل‌های اصلی بزرگ‌تر شد؛ تبدیل لغو شد تا حجم افزایش پیدا نکند.';return;}
    download(bytes,name,'application/pdf');
    const mb=(bytes.length/1048576).toFixed(2);
    s.textContent='✅ تبدیل و کم‌حجم‌سازی سریع انجام شد؛ حجم خروجی '+fa(mb)+' MB.';
  }catch(e){console.error('imagesToPDF',e);s.textContent='❌ تبدیل عکس به PDF انجام نشد؛ فایل یا فرمت عکس را بررسی کنید.';}
}


/* ===================== جعبه ابزار عملیاتی امنا یار ===================== */
(function(){
const esc=v=>String(v??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));
const num=v=>Number(String(v??'').replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[,٬،]/g,''))||0;
const modal=document.createElement('div'); modal.id='utilityModal'; modal.style.cssText='position:fixed;inset:0;background:rgba(5,20,40,.62);z-index:99999;display:none;overflow:auto;padding:30px 14px';
modal.innerHTML='<div id="utilityCard" style="max-width:900px;margin:30px auto;background:#fff;border-radius:20px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.25);direction:rtl"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><h2 id="utilityTitle" style="margin:0"></h2><button id="utilityClose" class="btn soft" type="button">✕ بستن</button></div><div id="utilityBody" style="margin-top:18px"></div></div>';
document.body.appendChild(modal); modal.onclick=e=>{if(e.target===modal)closeUtility()}; document.getElementById('utilityClose').onclick=closeUtility;
function closeUtility(){modal.style.display='none'}
function openUtility(name){const body=document.getElementById('utilityBody'),title=document.getElementById('utilityTitle');title.textContent=name;body.innerHTML=template(name);modal.style.display='block';bindUtility(name)}
function inp(id,p,typ='number'){return '<input id="'+id+'" type="'+typ+'" placeholder="'+p+'" style="width:100%;margin:6px 0;padding:11px;border:1px solid #dbe4ef;border-radius:10px">'}
function btn(id,t='محاسبه'){return '<button class="btn primary" id="'+id+'" type="button">'+t+'</button>'}
function out(id){return '<div id="'+id+'" class="muted" style="margin-top:12px;line-height:2"></div>'}
function template(n){
const common={
'محاسبه حقوق و دستمزد':inp('sal','حقوق پایه (تومان)')+inp('days','روز کارکرد','number')+inp('bonus','مزایا و پاداش (تومان)')+inp('ded','کسورات (تومان)')+btn('go')+out('o'),
'محاسبه اضافه‌کاری، شب‌کاری و تعطیل‌کاری':inp('hourly','نرخ ساعتی (تومان)')+inp('ot','ساعت اضافه‌کاری')+inp('night','ساعت شب‌کاری')+inp('holiday','ساعت تعطیل‌کاری')+btn('go')+out('o'),
'محاسبه سنوات و عیدی':inp('monthly','حقوق پایه ماهانه (تومان)')+inp('months','ماه کارکرد','number')+btn('go')+out('o'),
'محاسبه مالیات حقوق':inp('income','درآمد مشمول مالیات ماهانه (تومان)')+'<small>برای محاسبه سریع، نرخ را خودتان وارد کنید.</small>'+inp('rate','نرخ مالیات (%)')+btn('go')+out('o'),
'محاسبه بیمه':inp('income','حقوق مشمول بیمه (تومان)')+inp('rate','نرخ بیمه سهم کارمند (%)','number')+btn('go')+out('o'),
'محاسبه سود وام و اقساط':inp('loan','مبلغ وام (تومان)')+inp('rate','نرخ سالانه (%)')+inp('months','تعداد اقساط ماهانه')+btn('go')+out('o'),
'محاسبه سود سپرده':inp('dep','مبلغ سپرده (تومان)')+inp('rate','نرخ سالانه (%)')+inp('months','مدت (ماه)')+btn('go')+out('o'),
'تبدیل تومان و ریال':inp('money','مبلغ')+btn('go')+out('o'),
'محاسبه نقطه سر به سر':inp('fixed','هزینه ثابت (تومان)')+inp('price','قیمت فروش واحد')+inp('variable','هزینه متغیر واحد')+btn('go')+out('o'),
'پیش‌فاکتور ساز':'<p>برای ساخت پیش‌فاکتور، از فاکتور‌ساز استفاده کنید و عنوان را «پیش‌فاکتور» بگذارید.</p><button class="btn primary" onclick="location.href=\'?tool=invoice\'">باز کردن فاکتور‌ساز</button>',
'رسید دریافت وجه':inp('payer','دریافت از')+inp('amount','مبلغ')+inp('desc','بابت','text')+btn('go','ساخت رسید')+out('o'),
'صورت‌حساب مشتری':inp('customer','نام مشتری','text')+inp('amount','جمع بدهکار')+inp('paid','جمع پرداختی')+btn('go')+out('o'),
'محاسبه سود فروش':inp('buy','قیمت خرید')+inp('sell','قیمت فروش')+btn('go')+out('o'),
'محاسبه حاشیه سود':inp('sales','فروش')+inp('cost','بهای تمام‌شده')+btn('go')+out('o'),
'محاسبه پورسانت فروش':inp('sales','فروش')+inp('rate','درصد پورسانت')+btn('go')+out('o'),
'محاسبه تارگت فروش':inp('target','تارگت')+inp('actual','فروش فعلی')+btn('go')+out('o'),
'محاسبه رشد فروش ماهانه':inp('old','فروش ماه قبل')+inp('now','فروش ماه جاری')+btn('go')+out('o'),
'گزارش مدیریتی سریع':inp('sales','فروش')+inp('cost','هزینه')+inp('profit','سود')+btn('go','ساخت گزارش')+out('o'),
'تغییر حجم عکس':inp('w','عرض','number')+inp('h','ارتفاع','number')+'<input id="f" type="file" accept="image/*">'+btn('go','تغییر حجم')+out('o'),
'تبدیل JPG، PNG و WebP':'<input id="f" type="file" accept="image/*">'+ '<select id="fmt" style="width:100%;padding:11px"><option>image/jpeg</option><option>image/png</option><option>image/webp</option></select>'+btn('go','تبدیل')+out('o'),
'فشرده‌سازی چند عکس':'<input id="f" type="file" accept="image/*" multiple>'+btn('go','فشرده‌سازی و دریافت ZIP')+out('o'),
'ساخت عکس پرسنلی':'<input id="f" type="file" accept="image/*">'+btn('go','ساخت عکس')+out('o'),
'ساخت عکس ۳×۴':'<input id="f" type="file" accept="image/*">'+btn('go','ساخت ۳×۴')+out('o'),
'برش عکس':'<input id="f" type="file" accept="image/*">'+inp('w','عرض خروجی')+inp('h','ارتفاع خروجی')+btn('go','برش/تغییر اندازه')+out('o'),
'چرخش عکس':'<input id="f" type="file" accept="image/*">'+inp('deg','درجه چرخش (90،180،270)')+btn('go','چرخش')+out('o'),
'اصلاح فاصله و نیم‌فاصله':'<textarea id="txt" rows="8" style="width:100%;padding:10px" placeholder="متن"></textarea>'+btn('go','اصلاح')+out('o'),
'تبدیل اعداد فارسی و انگلیسی':'<textarea id="txt" rows="6" style="width:100%;padding:10px"></textarea>'+btn('go','تبدیل')+out('o'),
'حذف خطوط و فاصله‌های اضافی':'<textarea id="txt" rows="8" style="width:100%;padding:10px"></textarea>'+btn('go','پاکسازی')+out('o'),
'مرتب‌سازی متن':'<textarea id="txt" rows="8" style="width:100%;padding:10px"></textarea>'+btn('go','مرتب‌سازی')+out('o'),
'استخراج شماره موبایل':'<textarea id="txt" rows="8" style="width:100%;padding:10px"></textarea>'+btn('go','استخراج')+out('o'),
'استخراج ایمیل':'<textarea id="txt" rows="8" style="width:100%;padding:10px"></textarea>'+btn('go','استخراج')+out('o'),
'تبدیل متن به PDF':'<textarea id="txt" rows="8" style="width:100%;padding:10px"></textarea>'+btn('go','ساخت PDF')+out('o'),
'محاسبه اختلاف دو تاریخ':inp('a','تاریخ اول شمسی (1405/01/01)','text')+inp('b','تاریخ دوم شمسی (1405/12/29)','text')+btn('go')+out('o'),
'محاسبه سن':inp('birth','تاریخ تولد شمسی','text')+btn('go')+out('o'),
'محاسبه مدت سابقه کار':inp('start','شروع کار (شمسی)','text')+inp('end','پایان کار (شمسی)','text')+btn('go')+out('o'),
'محاسبه روزهای کاری':inp('start','شروع (شمسی)','text')+inp('end','پایان (شمسی)','text')+btn('go')+out('o'),
'محاسبه مهلت قرارداد':inp('start','تاریخ شروع (شمسی)','text')+inp('days','مدت قرارداد (روز)')+btn('go')+out('o'),
'تقویم شمسی حرفه‌ای':'<div id="cal" style="text-align:center"></div>'+btn('go','نمایش امروز')+out('o'),
'محاسبه افت قیمت خودرو':inp('price','قیمت خودرو')+inp('age','سن خودرو (سال)')+inp('rate','درصد افت سالانه')+btn('go')+out('o'),
'هزینه انتقال خودرو':inp('price','قیمت خودرو')+inp('fee','هزینه انتقال')+btn('go')+out('o'),
'اقساط خودرو':inp('price','قیمت خودرو')+inp('down','پیش‌پرداخت')+inp('months','تعداد اقساط')+btn('go')+out('o'),
'سود خرید و فروش خودرو':inp('buy','قیمت خرید')+inp('sell','قیمت فروش')+btn('go')+out('o'),
'محاسبه کمیسیون املاک':inp('price','مبلغ معامله')+inp('rate','درصد کمیسیون')+btn('go')+out('o'),
'اقساط وام مسکن':inp('loan','مبلغ وام')+inp('rate','نرخ سالانه')+inp('months','تعداد ماه')+btn('go')+out('o'),
'قیمت و سهم ملک':inp('price','قیمت کل ملک')+inp('share','درصد سهم')+btn('go')+out('o')
};
if(common[n])return '<p style="color:#60738b">محاسبه در مرورگر انجام می‌شود و اطلاعات شما ارسال نمی‌شود.</p>'+common[n];
const fileNames=['تبدیل Word به PDF','تبدیل Excel به PDF','تبدیل PDF به Word','تبدیل PDF به Excel','چرخاندن صفحات PDF','حذف صفحات PDF','استخراج صفحات PDF','قفل‌گذاری PDF','حذف رمز PDF','امضای دیجیتال PDF','واترمارک PDF','شماره‌گذاری صفحات PDF'];
if(fileNames.includes(n))return fileTemplate(n);
return '<p>این ابزار آماده استفاده است.</p>'+inp('v','مقدار')+btn('go')+out('o')
}
function fileTemplate(n){
if(n==='تبدیل PDF به Word'||n==='تبدیل PDF به Excel')return '<input id="f" type="file" accept="application/pdf"><p class="muted">متن صفحات استخراج و به فایل قابل استفاده تبدیل می‌شود.</p>'+btn('go','تبدیل')+out('o');
if(n==='تبدیل Word به PDF'||n==='تبدیل Excel به PDF')return '<textarea id="txt" rows="10" style="width:100%;padding:10px" placeholder="متن یا جدول را اینجا وارد کنید؛ سپس PDF بسازید."></textarea>'+btn('go','ساخت PDF')+out('o');
return '<input id="f" type="file" accept="application/pdf">'+(n==='چرخاندن صفحات PDF'?inp('deg','درجه (90،180،270)'):n==='حذف صفحات PDF'||n==='استخراج صفحات PDF'?inp('pages','صفحات مثال: 1,3-5','text'):'')+(n==='واترمارک PDF'?inp('water','متن واترمارک','text'):'')+(n==='شماره‌گذاری صفحات PDF'?'<p>شماره صفحات در پایین هر صفحه اضافه می‌شود.</p>':'')+btn('go','اجرا')+out('o')
}
async function bindUtility(n){
const g=id=>document.getElementById(id), o=()=>g('o');
g('go')?.addEventListener('click',async()=>{
try{
if(n==='تبدیل تومان و ریال'){const v=num(g('money').value);o().textContent=fa(v)+' تومان = '+fa(v*10)+' ریال';return}
if(n==='محاسبه سود وام و اقساط'){const P=num(g('loan').value),r=num(g('rate').value)/1200,N=num(g('months').value);const pay=r?P*r*Math.pow(1+r,N)/(Math.pow(1+r,N)-1):P/N;o().textContent='قسط ماهانه: '+money(pay)+' — کل پرداخت: '+money(pay*N)+' — سود: '+money(pay*N-P);return}
if(n==='محاسبه سود سپرده'){const x=num(g('dep').value),r=num(g('rate').value)/100,m=num(g('months').value);o().textContent='سود تقریبی: '+money(x*r*m/12)+' — اصل+سود: '+money(x+x*r*m/12);return}
if(n==='محاسبه نقطه سر به سر'){const f=num(g('fixed').value),p=num(g('price').value),v=num(g('variable').value);o().textContent=p>v?'نقطه سر به سر: '+fa(f/(p-v))+' واحد':'قیمت فروش باید از هزینه متغیر بیشتر باشد.';return}
if(n==='محاسبه سود فروش'||n==='سود خرید و فروش خودرو'){const p=num(g('buy').value),s=num(g('sell').value),x=s-p;o().textContent=(x>=0?'سود: ':'زیان: ')+money(Math.abs(x))+' — '+fa(Math.abs(x/p*100||0))+'٪';return}
if(n==='محاسبه حاشیه سود'){const s=num(g('sales').value),c=num(g('cost').value);o().textContent='حاشیه سود: '+fa((s-c)/s*100)+'٪ — سود: '+money(s-c);return}
if(n==='محاسبه پورسانت فروش'){o().textContent='پورسانت: '+money(num(g('sales').value)*num(g('rate').value)/100);return}
if(n==='محاسبه تارگت فروش'){const t=num(g('target').value),a=num(g('actual').value);o().textContent='تحقق: '+fa(a/t*100)+'٪ — مانده: '+money(Math.max(0,t-a));return}
if(n==='محاسبه رشد فروش ماهانه'){const a=num(g('old').value),b=num(g('now').value);o().textContent='رشد: '+fa((b-a)/a*100)+'٪';return}
if(n==='گزارش مدیریتی سریع'){o().innerHTML='<b>گزارش مدیریتی</b><br>فروش: '+money(num(g('sales').value))+'<br>هزینه: '+money(num(g('cost').value))+'<br>سود: '+money(num(g('profit').value));return}
if(n==='رسید دریافت وجه'){const w=window.open('','_blank');w.document.write('<html dir="rtl"><body style="font-family:Arial;padding:50px"><h1>رسید دریافت وجه - امنا یار</h1><p>دریافت از: '+esc(g('payer').value)+'</p><p>مبلغ: '+money(g('amount').value)+'</p><p>بابت: '+esc(g('desc').value)+'</p><hr><p>امضاء: ................</p></body></html>');w.print();return}
if(n==='محاسبه سن'){const p=parts(g('birth').value),now=new Date(),j=g2j(now.getFullYear(),now.getMonth()+1,now.getDate());o().textContent='سن تقریبی: '+fa(Math.max(0,j[0]-p[0]))+' سال';return}
if(n==='محاسبه افت قیمت خودرو'){const p=num(g('price').value),a=num(g('age').value),r=num(g('rate').value);o().textContent='افت تقریبی: '+money(p*(1-Math.pow(1-r/100,a)))+' — ارزش فعلی: '+money(p*Math.pow(1-r/100,a));return}
if(n==='هزینه انتقال خودرو'){o().textContent='هزینه کل انتقال: '+money(num(g('price').value)+num(g('fee').value));return}
if(n==='اقساط خودرو'){const p=Math.max(0,num(g('price').value)-num(g('down').value)),m=num(g('months').value);o().textContent='قسط ساده ماهانه: '+money(p/m);return}
if(n==='محاسبه کمیسیون املاک'){o().textContent='کمیسیون بر اساس نرخ واردشده: '+money(num(g('price').value)*num(g('rate').value)/100);return}
if(n==='اقساط وام مسکن'){const P=num(g('loan').value),r=num(g('rate').value)/1200,N=num(g('months').value);const pay=r?P*r*Math.pow(1+r,N)/(Math.pow(1+r,N)-1):P/N;o().textContent='قسط ماهانه: '+money(pay);return}
if(n==='قیمت و سهم ملک'){o().textContent='ارزش سهم: '+money(num(g('price').value)*num(g('share').value)/100);return}
if(n==='محاسبه مالیات حقوق'||n==='محاسبه بیمه'){o().textContent='مبلغ: '+money(num(g('income').value||g('income')?.value)*num(g('rate').value)/100);return}
if(n==='محاسبه حقوق و دستمزد'){const base=num(g('sal').value)*num(g('days').value)/30+num(g('bonus').value)-num(g('ded').value);o().textContent='خالص تقریبی: '+money(base);return}
if(n==='محاسبه اضافه‌کاری، شب‌کاری و تعطیل‌کاری'){const h=num(g('hourly').value),v=num(g('ot').value)*h+num(g('night').value)*h*1.35+num(g('holiday').value)*h*1.4;o().textContent='مبلغ تقریبی: '+money(v);return}
if(n==='محاسبه سنوات و عیدی'){const m=num(g('monthly').value),mo=num(g('months').value);o().textContent='عیدی تقریبی: '+money(Math.min(m*2,Math.max(m*mo/12*2,0)))+' — سنوات تقریبی: '+money(m*mo/12);return}
if(n==='محاسبه روزهای کاری'||n==='محاسبه اختلاف دو تاریخ'||n==='محاسبه مدت سابقه کار'){const a=g('a')?.value||g('start')?.value,b=g('b')?.value||g('end')?.value;if(!a||!b)return o().textContent='هر دو تاریخ را وارد کنید.';const x=j2g(...parts(a)),y=j2g(...parts(b)),d=Math.round((Date.UTC(...y.map((v,i)=>i===1?v-1:v))-Date.UTC(...x.map((v,i)=>i===1?v-1:v)))/86400000);o().textContent='اختلاف: '+fa(Math.abs(d))+' روز'+(n==='محاسبه روزهای کاری'?' — روز کاری تقریبی: '+fa(Math.round(Math.abs(d)*5/7)):'');return}
if(n==='محاسبه مهلت قرارداد'){const p=parts(g('start').value),x=j2g(...p),dt=new Date(Date.UTC(x[0],x[1]-1,x[2]));dt.setUTCDate(dt.getUTCDate()+num(g('days').value));const j=g2j(dt.getUTCFullYear(),dt.getUTCMonth()+1,dt.getUTCDate());o().textContent='تاریخ پایان: '+j.join('/');return}
if(n==='تقویم شمسی حرفه‌ای'){const now=new Date(),j=g2j(now.getFullYear(),now.getMonth()+1,now.getDate());g('cal').innerHTML='<h3>'+fa(j[0])+'/'+fa(j[1])+'/'+fa(j[2])+'</h3><p>امروز</p>';return}
if(n==='اصلاح فاصله و نیم‌فاصله'){const t=g('txt');t.value=t.value.replace(/[ \t]+/g,' ').replace(/ ?([،؛,:.!؟]) ?/g,'$1').replace(/می ?(?=\S)/g,'می‌').replace(/ها ?$/g,'ها');o().textContent='متن اصلاح شد.';return}
if(n==='تبدیل اعداد فارسی و انگلیسی'){const t=g('txt');t.value=t.value.replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d));o().textContent='اعداد انگلیسی شدند.';return}
if(n==='حذف خطوط و فاصله‌های اضافی'){const t=g('txt');t.value=t.value.replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();o().textContent='پاکسازی شد.';return}
if(n==='مرتب‌سازی متن'){const t=g('txt');t.value=t.value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).sort((a,b)=>a.localeCompare(b,'fa')).join('\n');o().textContent='مرتب شد.';return}
if(n==='استخراج شماره موبایل'){const x=g('txt').value.match(/(?:\+98|0098|98|0)?9\d{9}/g)||[];o().textContent=[...new Set(x)].join('\n')||'موردی پیدا نشد.';return}
if(n==='استخراج ایمیل'){const x=g('txt').value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[];o().textContent=[...new Set(x)].join('\n')||'موردی پیدا نشد.';return}
if(n==='تبدیل متن به PDF'||n==='تبدیل Word به PDF'||n==='تبدیل Excel به PDF'){const w=window.open('','_blank');w.document.write('<html dir="rtl"><head><meta charset="utf-8"><title>امنا یار</title></head><body style="font-family:Arial;padding:40px;white-space:pre-wrap">'+esc(g('txt')?.value||'')+'</body></html>');w.document.close();w.focus();w.print();o().textContent='پنجره چاپ PDF باز شد؛ گزینه Save as PDF را انتخاب کنید.';return}
if(n==='تغییر حجم عکس'||n==='تبدیل JPG، PNG و WebP'||n==='ساخت عکس پرسنلی'||n==='ساخت عکس ۳×۴'||n==='برش عکس'||n==='چرخش عکس'){const f=g('f')?.files[0];if(!f)return o().textContent='تصویر را انتخاب کنید.';const im=new Image(),u=URL.createObjectURL(f);await new Promise((res,rej)=>{im.onload=res;im.onerror=rej;im.src=u});let w=im.naturalWidth,h=im.naturalHeight,deg=num(g('deg')?.value)||0;if(n==='ساخت عکس ۳×۴'||n==='ساخت عکس پرسنلی'){w=354;h=472}else if(g('w')?.value&&g('h')?.value){w=num(g('w').value);h=num(g('h').value)}const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');if(deg%360){c.width=h;c.height=w;ctx.translate(c.width/2,c.height/2);ctx.rotate(deg*Math.PI/180);ctx.drawImage(im,-w/2,-h/2,w,h)}else ctx.drawImage(im,0,0,w,h);const type=g('fmt')?.value||'image/jpeg';c.toBlob(b=>downloadBlob(b,'amnayar-image.'+(type==='image/png'?'png':type==='image/webp'?'webp':'jpg')),type,.86);URL.revokeObjectURL(u);o().textContent='فایل آماده شد.';return}
if(n==='فشرده‌سازی چند عکس'){const fs=[...g('f').files];if(!fs.length)return o().textContent='عکس انتخاب کنید.';const z=new JSZip();for(const f of fs){const im=new Image(),u=URL.createObjectURL(f);await new Promise((res,rej)=>{im.onload=res;im.onerror=rej;im.src=u});const c=document.createElement('canvas'),scale=Math.min(1,1600/Math.max(im.naturalWidth,im.naturalHeight));c.width=im.naturalWidth*scale;c.height=im.naturalHeight*scale;c.getContext('2d').drawImage(im,0,0,c.width,c.height);const b=await new Promise(r=>c.toBlob(r,'image/jpeg',.7));z.file(f.name.replace(/\.[^.]+$/i,'.jpg'),b);URL.revokeObjectURL(u)}downloadBlob(await z.generateAsync({type:'blob'}),'amnayar-images.zip');o().textContent='ZIP آماده شد.';return}
if(n==='تبدیل PDF به Word'||n==='تبدیل PDF به Excel'){const f=g('f').files[0];if(!f)return o().textContent='PDF را انتخاب کنید.';const pdf=await pdfjsLib.getDocument({data:await f.arrayBuffer()}).promise;let text='';for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i),c=await p.getTextContent();text+=c.items.map(x=>x.str).join(' ')+'\n\n'}if(n==='تبدیل PDF به Excel'){const csv='"صفحه","متن"\\n'+text.split(/\\n+/).filter(Boolean).map((x,i)=>'"'+(i+1)+'","'+x.replace(/"/g,'""')+'"').join('\\n');downloadBlob(new Blob(['\\ufeff'+csv],{type:'text/csv;charset=utf-8'}),'amnayar-export.csv')}else{const html='<!doctype html><html><head><meta charset="utf-8"></head><body dir="rtl" style="font-family:Arial;white-space:pre-wrap">'+esc(text)+'</body></html>';downloadBlob(new Blob([html],{type:'application/msword'}),'amnayar-export.doc')}o().textContent='فایل خروجی آماده شد.';return}
if(['چرخاندن صفحات PDF','حذف صفحات PDF','استخراج صفحات PDF','واترمارک PDF','شماره‌گذاری صفحات PDF'].includes(n)){const f=g('f').files[0];if(!f)return o().textContent='PDF را انتخاب کنید.';const doc=await PDFLib.PDFDocument.load(await f.arrayBuffer()),count=doc.getPageCount();if(n==='چرخاندن صفحات PDF'){const d=num(g('deg').value)||90;doc.getPages().forEach(p=>p.setRotation(PDFLib.degrees(d)));}else if(n==='حذف صفحات PDF'||n==='استخراج صفحات PDF'){const idx=parsePages(g('pages').value,count);if(!idx.length)return o().textContent='شماره صفحه معتبر وارد کنید.';if(n==='حذف صفحات PDF'){const del=new Set(idx);for(let i=count-1;i>=0;i--)if(del.has(i))doc.removePage(i)}else{const out=await PDFLib.PDFDocument.create();const pages=await out.copyPages(doc,idx);pages.forEach(p=>out.addPage(p));download(await out.save(),'amnayar-extracted.pdf','application/pdf');o().textContent='صفحات استخراج شدند.';return}}else if(n==='واترمارک PDF'){const t=g('water').value||'امنا یار';for(const p of doc.getPages())p.drawText(t,{x:30,y:30,size:18,opacity:.35})}else if(n==='شماره‌گذاری صفحات PDF'){doc.getPages().forEach((p,i)=>{const sz=p.getSize();p.drawText(String(i+1),{x:sz.width/2,y:20,size:12})})}download(await doc.save(),'amnayar-pdf-tool.pdf','application/pdf');o().textContent='PDF آماده شد.';return}
if(n==='قفل‌گذاری PDF'||n==='حذف رمز PDF'||n==='امضای دیجیتال PDF'){o().textContent='این عملیات نیازمند رمزنگاری/امضای استاندارد PDF است و در نسخه مرورگری فعلی به‌صورت کامل پشتیبانی نمی‌شود.';return}
}catch(e){console.error(e);o().textContent='عملیات انجام نشد؛ ورودی‌ها یا فایل را بررسی کنید.'}
});
}
document.addEventListener('DOMContentLoaded',()=>{const raw=location.hash.startsWith('#utility=')?decodeURIComponent(location.hash.slice(9)):'';if(raw){setTimeout(()=>{if(typeof openUtility==='function')openUtility(raw)},150)}});
document.addEventListener('click',e=>{const b=e.target.closest('.tool-list button');if(!b)return;const n=b.textContent.trim();if(b.hasAttribute('onclick'))return;openUtility(n)});
})();


// AmnaYar tool usage analytics
(function(){
  const endpoint='/api/analytics/event';
  const sid=sessionStorage.getItem('amna_analytics_session')||((crypto&&crypto.randomUUID)?crypto.randomUUID():String(Date.now())+'-'+Math.random());
  sessionStorage.setItem('amna_analytics_session',sid);
  const sent=new Set();
  function send(type,meta){try{fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},keepalive:true,body:JSON.stringify({event_type:type,path:location.pathname+location.search,session_id:sid,meta:meta||{}})}).catch(()=>{});}catch(e){}}
  send('page_view',{referrer:document.referrer||''});
  document.addEventListener('click',function(e){
    const panel=e.target.closest&&e.target.closest('.tool-panel[id]'); if(!panel||sent.has(panel.id))return;
    sent.add(panel.id); const title=(panel.querySelector('h2')||{}).textContent||panel.id;
    send('tool_use',{tool:panel.id,name:title.trim(),category:'tools'});
  },true);
  document.addEventListener('input',function(e){
    const panel=e.target.closest&&e.target.closest('.tool-panel[id]'); if(!panel||sent.has(panel.id))return;
    sent.add(panel.id); const title=(panel.querySelector('h2')||{}).textContent||panel.id;
    send('tool_use',{tool:panel.id,name:title.trim(),category:'tools'});
  },true);
})();

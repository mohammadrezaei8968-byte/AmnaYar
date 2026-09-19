
async function translateText(direction){const input=direction==='fa-en'?$('#faToEnText'):$('#enToFaText');const result=direction==='fa-en'?$('#faToEnResult'):$('#enToFaResult');const status=direction==='fa-en'?$('#faToEnStatus'):$('#enToFaStatus');const text=input.value.trim();if(!text){status.textContent='متن را وارد کنید.';return}if(text.length>5000){status.textContent='حداکثر ۵۰۰۰ نویسه مجاز است.';return}status.textContent='در حال ترجمه...';result.value='';try{const r=await fetch('/api/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,direction})});let data={};try{data=await r.json()}catch{}if(!r.ok)throw new Error(data.error||'ترجمه انجام نشد.');result.value=data.translatedText||'';status.textContent='ترجمه آماده است.'}catch(e){status.textContent=e.message||'ترجمه انجام نشد؛ دوباره تلاش کنید.'}}
const $=s=>document.querySelector(s); const fa=n=>n.toLocaleString('fa-IR');
async function mergePDFs(){const files=[...$('#mergeFiles').files];if(!files.length)return $('#mergeStatus').textContent='حداقل یک فایل انتخاب کنید.';$('#mergeStatus').textContent='در حال پردازش...';const out=await PDFLib.PDFDocument.create();for(const f of files){const doc=await PDFLib.PDFDocument.load(await f.arrayBuffer());const pages=await out.copyPages(doc,doc.getPageIndices());pages.forEach(p=>out.addPage(p));}download(await out.save(),'amnayar-merged.pdf','application/pdf');$('#mergeStatus').textContent='فایل ادغام شد.'}
function parsePages(s,max){const set=new Set();const normalized=String(s||'').replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٬،]/g,',').replace(/[–—−]/g,'-').replace(/\s+/g,'');for(const part of normalized.split(',').filter(Boolean)){if(part.includes('-')){const ab=part.split('-');if(ab.length!==2)continue;let[a,b]=ab.map(Number);if(!Number.isInteger(a)||!Number.isInteger(b))continue;a=Math.max(1,Math.min(max,a));b=Math.max(1,Math.min(max,b));if(a>b)[a,b]=[b,a];for(let i=a;i<=b;i++)set.add(i-1)}else{const n=Number(part);if(Number.isInteger(n)&&n>=1&&n<=max)set.add(n-1)}}return [...set].sort((a,b)=>a-b)}
async function splitPDF(){const f=$('#splitFile').files[0],spec=$('#splitPages').value.trim(),s=$('#splitStatus');if(!f)return s.textContent='فایل PDF را انتخاب کنید.';if(!spec)return s.textContent='صفحات را وارد کنید.';s.textContent='در حال جدا کردن صفحات...';try{const doc=await PDFLib.PDFDocument.load(await f.arrayBuffer());const groups=spec.split(';').map(x=>x.trim()).filter(Boolean);const outputs=[];for(let g=0;g<groups.length;g++){const idx=parsePages(groups[g],doc.getPageCount());if(!idx.length)continue;const out=await PDFLib.PDFDocument.create();const pages=await out.copyPages(doc,idx);pages.forEach(p=>out.addPage(p));outputs.push({name:`amnayar-pages-${g+1}.pdf`,bytes:await out.save({useObjectStreams:true})})}if(!outputs.length)throw new Error('هیچ صفحه معتبری پیدا نشد.');if(outputs.length===1){download(outputs[0].bytes,outputs[0].name,'application/pdf');s.textContent='فایل PDF جدا شد.'}else{if(!window.JSZip)throw new Error('کتابخانه فشرده‌سازی آماده نیست.');const zip=new JSZip();outputs.forEach(x=>zip.file(x.name,x.bytes));const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});downloadBlob(blob,'amnayar-pdf-parts.zip');s.textContent=`${fa(outputs.length)} فایل PDF ساخته شد و داخل ZIP قرار گرفت.`}}catch(e){console.error(e);s.textContent='جداسازی PDF انجام نشد؛ فایل یا شماره صفحات را بررسی کنید.'}}
function download(bytes,name,type){const blob=new Blob([bytes],{type});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function j2g(jy,jm,jd){let jy2=jy-979,jm2=jm-1,jd2=jd-1;let j_day=365*jy2+Math.floor(jy2/33)*8+Math.floor((jy2%33+3)/4);for(let i=0;i<jm2;i++)j_day+=i<6?31:30;j_day+=jd2;let g_day=j_day+79;let gy=1600+400*Math.floor(g_day/146097);g_day%=146097;let leap=true;if(g_day>=36525){g_day--;gy+=100*Math.floor(g_day/36524);g_day%=36524;if(g_day>=365)g_day++;else leap=false}gy+=4*Math.floor(g_day/1461);g_day%=1461;if(g_day>=366){leap=false;g_day--;gy+=Math.floor(g_day/365);g_day%=365}let gd=g_day+1,gm=0;const md=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];while(gd>md[gm])gd-=md[gm++];return[gy,gm+1,gd]}
function g2j(gy,gm,gd){const g_d_m=[0,31,59,90,120,151,181,212,243,273,304,334];let gy2=gy-(gm>2?0:1),days=355666+365*gy2+Math.floor(gy2/4)-Math.floor(gy2/100)+Math.floor((gy2+3)/400)+gd+g_d_m[gm-1];let jy=-1595+33*Math.floor(days/12053);days%=12053;jy+=4*Math.floor(days/1461);days%=1461;if(days>365){jy+=Math.floor((days-1)/365);days=(days-1)%365}let jm=days<186?1+Math.floor(days/31):7+Math.floor((days-186)/30);let jd=1+(days<186?days%31:(days-186)%30);return[jy,jm,jd]}
function parts(s){return s.trim().replaceAll('-','/').split('/').map(Number)}function jalaliToGregorianUI(){const p=parts($('#jdate').value);if(p.length!==3)return $('#jgResult').textContent='تاریخ را به شکل 1405/06/20 وارد کنید.';const r=j2g(...p);$('#jgResult').textContent=`میلادی: ${r.join('/')}  (${r.map(fa).join('/')})`}function gregorianToJalaliUI(){const p=parts($('#gdate').value);if(p.length!==3)return $('#gjResult').textContent='تاریخ را به شکل 2026/09/11 وارد کنید.';const r=g2j(...p);$('#gjResult').textContent=`شمسی: ${r.join('/')}  (${r.map(fa).join('/')})`}
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
async function makeInvoicePDF(){
  if(!window.PDFLib)return $('#invoiceResult').textContent='کتابخانه PDF آماده نیست؛ چند ثانیه بعد دوباره تلاش کنید.';
  const rows=[...document.querySelectorAll('.invoice-row')].map(r=>({d:r.querySelector('.inv-desc').value.trim(),q:+r.querySelector('.inv-qty').value||0,p:+r.querySelector('.inv-price').value||0})).filter(x=>x.d&&x.q&&x.p);
  if(!rows.length)return $('#invoiceResult').textContent='حداقل یک ردیف فاکتور را کامل کنید.';
  const seller=$('#invSeller').value.trim()||'—',buyer=$('#invBuyer').value.trim()||'—',date=$('#invDate').value.trim()||'—',num=$('#invNumber').value.trim()||'—';
  const total=rows.reduce((a,x)=>a+x.q*x.p,0),scale=2,w=1120,h=Math.max(1584,430+rows.length*82),canvas=document.createElement('canvas');canvas.width=w*scale;canvas.height=h*scale;
  const ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.direction='rtl';ctx.textAlign='right';ctx.fillStyle='#14243b';ctx.font='700 34px Arial';ctx.fillText('فاکتور فروش — امنا یار',w-70,70);
  ctx.font='20px Arial';ctx.fillStyle='#52637a';ctx.fillText('شماره: '+num,w-70,112);ctx.fillText('تاریخ: '+date,w-70,145);ctx.fillStyle='#14243b';ctx.font='700 22px Arial';ctx.fillText('فروشنده: '+seller,w-70,205);ctx.fillText('خریدار: '+buyer,w-70,240);
  const left=70,right=w-70,top=285,rowH=58;ctx.fillStyle='#eef4fb';ctx.fillRect(left,top,right-left,rowH);ctx.fillStyle='#14243b';ctx.font='700 19px Arial';ctx.fillText('شرح کالا / خدمت',right-25,top+37);ctx.fillText('تعداد',right-600,top+37);ctx.fillText('قیمت واحد',right-760,top+37);ctx.fillText('جمع',left+90,top+37);
  ctx.font='18px Arial';let y=top+rowH;rows.forEach(x=>{ctx.fillStyle='#fff';ctx.fillRect(left,y,right-left,rowH);ctx.strokeStyle='#dce4ee';ctx.strokeRect(left,y,right-left,rowH);ctx.fillStyle='#14243b';ctx.fillText(x.d.slice(0,45),right-25,y+37);ctx.fillText(fa(x.q),right-600,y+37);ctx.fillText(fa(Math.round(x.p).toLocaleString('en-US')),right-760,y+37);ctx.fillText(fa(Math.round(x.q*x.p).toLocaleString('en-US')),left+90,y+37);y+=rowH;});
  ctx.font='700 24px Arial';ctx.fillText('جمع کل: '+money(total),right,y+55);ctx.font='16px Arial';ctx.fillStyle='#718096';ctx.fillText('ساخته‌شده رایگان توسط امنا یار',right,h-35);
  const png=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('canvas_export_failed')),'image/png'));const doc=await PDFLib.PDFDocument.create();const page=doc.addPage([w/2,h/2]);const img=await doc.embedPng(await png.arrayBuffer());page.drawImage(img,{x:0,y:0,width:w/2,height:h/2});const bytes=await doc.save();download(bytes,'amnayar-invoice-'+num+'.pdf','application/pdf');$('#invoiceResult').textContent='فاکتور آماده شد — جمع کل: '+money(total);
}
function resizeImage(){const f=$('#imgFile').files[0],w=+$('#imgW').value,h=+$('#imgH').value;if(!f||!w||!h)return $('#imgStatus').textContent='فایل و ابعاد را وارد کنید.';const im=new Image();im.onload=()=>{const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(im,0,0,w,h);c.toBlob(b=>download(b,'amnayar-image.png','image/png'),'image/png');URL.revokeObjectURL(im.src);$('#imgStatus').textContent='تصویر آماده شد.'};im.src=URL.createObjectURL(f)}

function fmtBytes(n){if(!Number.isFinite(n))return '';const u=['بایت','کیلوبایت','مگابایت','گیگابایت'];let i=0;let x=n;while(x>=1024&&i<u.length-1){x/=1024;i++;}return `${x.toLocaleString('fa-IR',{maximumFractionDigits:2})} ${u[i]}`}
function savingsText(a,b){if(!a||!b)return '';const pct=(1-b/a)*100;if(pct<=0)return `حجم اولیه: ${fmtBytes(a)} — حجم خروجی: ${fmtBytes(b)} — این فایل از قبل بهینه است.`;return `حجم اولیه: ${fmtBytes(a)} — حجم جدید: ${fmtBytes(b)} — کاهش: ${pct.toLocaleString('fa-IR',{maximumFractionDigits:1})}%`}
function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1500)}
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
    const maxSide=3000;
    const scale=Math.min(1,maxSide/Math.max(img.naturalWidth,img.naturalHeight));
    const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.naturalWidth*scale));c.height=Math.max(1,Math.round(img.naturalHeight*scale));
    c.getContext('2d',{alpha:false}).drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(src);
    const blob=await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('خروجی تصویر ساخته نشد.')),'image/jpeg',q));
    downloadBlob(blob,'amnayar-compressed.jpg');s.textContent=savingsText(f.size,blob.size);
  }catch(e){s.textContent='فشرده‌سازی تصویر انجام نشد؛ فرمت تصویر را بررسی کنید.';}
}

// PDF بدون ارسال فایل به سرور دوباره ذخیره می‌شود و ساختار فایل بهینه می‌شود.
async function compressPDF(){
  const f=$('#compressPdfFile').files[0],s=$('#compressPdfStatus');
  if(!f)return s.textContent='فایل PDF را انتخاب کنید.';
  if(f.size>100*1024*1024)return s.textContent='حداکثر حجم PDF ۱۰۰ مگابایت است.';
  if(!window.pdfjsLib)return s.textContent='کتابخانه PDF هنوز آماده نشده است؛ چند ثانیه بعد دوباره تلاش کنید.';
  s.textContent='در حال فشرده‌سازی PDF در مرورگر...';
  try{
    const level=Number($('#pdfQuality').value||70);
    const pdf=await pdfjsLib.getDocument({data:await f.arrayBuffer()}).promise;
    const out=await PDFLib.PDFDocument.create();
    const scale=level<=40?0.9:level<=60?1.1:level<=75?1.35:1.7;
    const quality=level<=40?0.45:level<=60?0.58:level<=75?0.72:0.86;
    for(let n=1;n<=pdf.numPages;n++){
      const page=await pdf.getPage(n);const vp=page.getViewport({scale});
      const c=document.createElement('canvas');c.width=Math.max(1,Math.round(vp.width));c.height=Math.max(1,Math.round(vp.height));
      const ctx=c.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);
      await page.render({canvasContext:ctx,viewport:vp}).promise;
      const data=await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('image failed')),'image/jpeg',quality));
      const img=await out.embedJpg(await data.arrayBuffer());const p=out.addPage([vp.width,vp.height]);p.drawImage(img,{x:0,y:0,width:vp.width,height:vp.height});c.width=1;c.height=1;
      s.textContent=`در حال فشرده‌سازی صفحه ${fa(n)} از ${fa(pdf.numPages)}...`;
    }
    const bytes=await out.save({useObjectStreams:true,addDefaultPage:false});const blob=new Blob([bytes],{type:'application/pdf'});downloadBlob(blob,'amnayar-compressed.pdf');s.textContent=savingsText(f.size,blob.size)+` — کیفیت خروجی: ${fa(level)}٪`;
  }catch(e){console.error(e);s.textContent='فشرده‌سازی PDF انجام نشد؛ ممکن است فایل رمزدار، آسیب‌دیده یا بسیار سنگین باشد.';}
}

// ویدئو در خود مرورگر با MediaRecorder به WebM فشرده می‌شود؛ فایل به سرور ارسال نمی‌شود.
async function compressVideo(){
  const f=$('#compressVideoFile').files[0],s=$('#compressVideoStatus');
  if(!f)return s.textContent='ویدئو را انتخاب کنید.';
  if(f.size>100*1024*1024)return s.textContent='حداکثر حجم ویدئو ۱۰۰ مگابایت است.';
  if(!window.MediaRecorder)return s.textContent='مرورگر شما فشرده‌سازی ویدئو را پشتیبانی نمی‌کند؛ لطفاً Chrome یا Edge را امتحان کنید.';
  s.textContent='در حال کم‌حجم‌کردن ویدئو در مرورگر...';
  const url=URL.createObjectURL(f),video=document.createElement('video');video.src=url;video.muted=false;video.volume=0;video.playsInline=true;video.preload='metadata';
  try{
    await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=reject});
    const q=$('#videoQuality').value;const maxW=q==='small'?960:1280;const scale=Math.min(1,maxW/video.videoWidth);const w=Math.max(2,Math.round(video.videoWidth*scale/2)*2),h=Math.max(2,Math.round(video.videoHeight*scale/2)*2);
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');
    const stream=canvas.captureStream(24);const sourceStream=video.captureStream?.();if(sourceStream){sourceStream.getAudioTracks().forEach(t=>stream.addTrack(t));}const mime=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':MediaRecorder.isTypeSupported('video/webm;codecs=vp8')?'video/webm;codecs=vp8':'video/webm';
    const bitrate=q==='small'?700000:q==='high'?1800000:1200000;const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:bitrate});const chunks=[];rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
    const done=new Promise((resolve,reject)=>{rec.onstop=()=>resolve();rec.onerror=e=>reject(e.error||e)});let raf=0;
    const draw=()=>{if(video.ended||video.paused)return;ctx.drawImage(video,0,0,w,h);raf=requestAnimationFrame(draw)};
    rec.start(250);await video.play();draw();await new Promise(resolve=>video.onended=resolve);cancelAnimationFrame(raf);rec.stop();await done;stream.getTracks().forEach(t=>t.stop());sourceStream?.getTracks().forEach(t=>t.stop());
    const blob=new Blob(chunks,{type:'video/webm'});downloadBlob(blob,'amnayar-compressed.webm');s.textContent=savingsText(f.size,blob.size)+' — خروجی WebM است.';
  }catch(e){s.textContent='فشرده‌سازی ویدئو انجام نشد؛ Chrome یا Edge را امتحان کنید.';}
  finally{URL.revokeObjectURL(url);}
}


(async()=>{try{const r=await fetch('/api/public-config');if(!r.ok)return;const c=await r.json();const enabled=new Set((c.tools||[]).filter(x=>x.enabled).map(x=>x.slug));if(c.tools?.length)document.querySelectorAll('.tool-panel[id]').forEach(sec=>{sec.style.display=enabled.has(sec.id)?'':'none'});if((c.notices||[]).length){const n=c.notices[0];const bar=document.createElement('div');bar.className='public-notice '+n.type;bar.innerHTML=`<b>${escapeHtml(n.title)}</b><span>${escapeHtml(n.body)}</span>`;document.body.insertBefore(bar,document.body.firstChild)}}catch(e){}})();
if(new URLSearchParams(location.search).get('tool')==='gold'){window.addEventListener('DOMContentLoaded',()=>setTimeout(loadLiveGoldPrices,250));}
function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]))}

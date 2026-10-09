
const voiceResultWaiters=Object.create(null),voiceStopPending=Object.create(null);
function finishVoiceWait(direction){voiceStopPending[direction]=false;const resolve=voiceResultWaiters[direction];if(resolve){delete voiceResultWaiters[direction];resolve();}}
async function translateText(direction){
  const input=direction==='fa-en'?$('#faToEnText'):$('#enToFaText');
  const result=direction==='fa-en'?$('#faToEnResult'):$('#enToFaResult');
  const status=direction==='fa-en'?$('#faToEnStatus'):$('#enToFaStatus');
  let text=input.value.trim();
  if(!text&&voiceStopPending[direction]){
    status.textContent='در حال آماده‌سازی گفتار برای ترجمه…';
    await Promise.race([new Promise(resolve=>{voiceResultWaiters[direction]=resolve}),new Promise(resolve=>setTimeout(resolve,5000))]);
    text=input.value.trim();finishVoiceWait(direction);
  }
  if(!text){status.textContent='گفتار ضبط کنید یا متن را وارد کنید.';return}
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
  input.value='';voiceStopPending[direction]=false;setVoiceButtons(direction,true);
  status.textContent='در حال ضبط؛ صحبت کنید و سپس «پایان ضبط» را بزنید.';
  if(window.AmnaYarSpeech&&typeof window.AmnaYarSpeech.startListening==='function'){
    try{window.AmnaYarSpeech.startListening(direction)}catch(e){setVoiceButtons(direction,false);status.textContent='شروع ضبط صدا ممکن نشد؛ دوباره تلاش کنید.'}
    return;
  }
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Recognition){setVoiceButtons(direction,false);status.textContent='تشخیص گفتار در این مرورگر پشتیبانی نمی‌شود؛ از Chrome یا Edge به‌روز استفاده کنید.';return}
  const recognition=new Recognition();activeVoiceRecognizers[direction]=recognition;
  recognition.lang=direction==='fa-en'?'fa-IR':'en-US';recognition.interimResults=true;recognition.continuous=true;recognition.maxAlternatives=1;
  let finalTranscript='';
  recognition.onresult=event=>{
    for(let i=event.resultIndex;i<event.results.length;i++){const item=event.results[i];if(item.isFinal)finalTranscript+=item[0].transcript+' ';}
    if(finalTranscript.trim())input.value=finalTranscript.trim();
  };
  recognition.onerror=event=>{setVoiceButtons(direction,false);finishVoiceWait(direction);status.textContent=event.error==='not-allowed'?'اجازه میکروفون را در مرورگر فعال کنید.':'ضبط گفتار انجام نشد؛ دوباره تلاش کنید.'};
  recognition.onend=()=>{setVoiceButtons(direction,false);finishVoiceWait(direction);if(input.value.trim())status.textContent='گفتار به متن تبدیل شد؛ متن را بازبینی یا اصلاح کنید.';else if(status.textContent.startsWith('در حال ضبط'))status.textContent='گفتاری ثبت نشد؛ دوباره شروع کنید.'};
  try{recognition.start()}catch(e){setVoiceButtons(direction,false);status.textContent='میکروفون در حال استفاده است؛ چند لحظه دیگر تلاش کنید.'}
}
function stopVoiceTranslation(direction){
  const status=$('#'+(direction==='fa-en'?'faVoiceStatus':'enVoiceStatus')),recognition=activeVoiceRecognizers[direction];
  voiceStopPending[direction]=true;
  try{if(window.AmnaYarSpeech&&typeof window.AmnaYarSpeech.stopListening==='function')window.AmnaYarSpeech.stopListening();else if(recognition)recognition.stop();setVoiceButtons(direction,false);status.textContent='ضبط متوقف شد؛ منتظر ثبت متن گفتار…';}
  catch(e){setVoiceButtons(direction,false);status.textContent='ضبط متوقف نشد؛ دوباره تلاش کنید.'}
}
window.amnayarVoiceResult=function(text,direction,error){
  const status=$('#'+(direction==='fa-en'?'faVoiceStatus':'enVoiceStatus')),input=direction==='fa-en'?$('#faToEnText'):$('#enToFaText');
  setVoiceButtons(direction,false);
  if(error){finishVoiceWait(direction);status.textContent=error==='permission'?'اجازه دسترسی به میکروفون را فعال کنید.':error==='unsupported'?'سرویس تشخیص گفتار روی این دستگاه در دسترس نیست.':'گفتار تشخیص داده نشد؛ دوباره تلاش کنید.';return}
  if(!text){finishVoiceWait(direction);status.textContent='گفتاری دریافت نشد؛ دوباره تلاش کنید.';return}
  input.value=text;finishVoiceWait(direction);status.textContent='گفتار به متن تبدیل شد؛ متن را بازبینی یا اصلاح کنید.';
}
const $=s=>document.querySelector(s); const fa=n=>n.toLocaleString('fa-IR');
async function mergePDFs(){const files=[...$('#mergeFiles').files];if(!files.length)return $('#mergeStatus').textContent='حداقل یک فایل انتخاب کنید.';$('#mergeStatus').textContent='در حال پردازش...';const out=await PDFLib.PDFDocument.create();for(const f of files){const doc=await PDFLib.PDFDocument.load(await f.arrayBuffer());const pages=await out.copyPages(doc,doc.getPageIndices());pages.forEach(p=>out.addPage(p));}download(await out.save(),'amnayar-merged.pdf','application/pdf');$('#mergeStatus').textContent='فایل ادغام شد.'}
function parsePages(s,max){const set=new Set();const normalized=String(s||'').replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٬،]/g,',').replace(/[–—−]/g,'-').replace(/\s+/g,'');for(const part of normalized.split(',').filter(Boolean)){if(part.includes('-')){const ab=part.split('-');if(ab.length!==2)continue;let[a,b]=ab.map(Number);if(!Number.isInteger(a)||!Number.isInteger(b))continue;a=Math.max(1,Math.min(max,a));b=Math.max(1,Math.min(max,b));if(a>b)[a,b]=[b,a];for(let i=a;i<=b;i++)set.add(i-1)}else{const n=Number(part);if(Number.isInteger(n)&&n>=1&&n<=max)set.add(n-1)}}return [...set].sort((a,b)=>a-b)}
async function splitPDF(){const f=$('#splitFile').files[0],spec=$('#splitPages').value.trim(),s=$('#splitStatus');if(!f)return s.textContent='فایل PDF را انتخاب کنید.';if(!spec)return s.textContent='صفحات را وارد کنید.';s.textContent='در حال جدا کردن صفحات...';try{const doc=await PDFLib.PDFDocument.load(await f.arrayBuffer());const groups=spec.split(';').map(x=>x.trim()).filter(Boolean);const outputs=[];for(let g=0;g<groups.length;g++){const idx=parsePages(groups[g],doc.getPageCount());if(!idx.length)continue;const out=await PDFLib.PDFDocument.create();const pages=await out.copyPages(doc,idx);pages.forEach(p=>out.addPage(p));outputs.push({name:`amnayar-pages-${g+1}.pdf`,bytes:await out.save({useObjectStreams:true})})}if(!outputs.length)throw new Error('هیچ صفحه معتبری پیدا نشد.');if(outputs.length===1){download(outputs[0].bytes,outputs[0].name,'application/pdf');s.textContent='فایل PDF جدا شد.'}else{if(!window.JSZip)throw new Error('کتابخانه فشرده‌سازی آماده نیست.');const zip=new JSZip();outputs.forEach(x=>zip.file(x.name,x.bytes));const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});downloadBlob(blob,'amnayar-pdf-parts.zip');s.textContent=`${fa(outputs.length)} فایل PDF ساخته شد و داخل ZIP قرار گرفت.`}}catch(e){console.error(e);s.textContent='جداسازی PDF انجام نشد؛ فایل یا شماره صفحات را بررسی کنید.'}}
function download(bytes,name,type){downloadBlob(new Blob([bytes],{type}),name)}
function j2g(jy,jm,jd){let jy2=jy-979,jm2=jm-1,jd2=jd-1;let j_day=365*jy2+Math.floor(jy2/33)*8+Math.floor((jy2%33+3)/4);for(let i=0;i<jm2;i++)j_day+=i<6?31:30;j_day+=jd2;let g_day=j_day+79;let gy=1600+400*Math.floor(g_day/146097);g_day%=146097;let leap=true;if(g_day>=36525){g_day--;gy+=100*Math.floor(g_day/36524);g_day%=36524;if(g_day>=365)g_day++;else leap=false}gy+=4*Math.floor(g_day/1461);g_day%=1461;if(g_day>=366){leap=false;g_day--;gy+=Math.floor(g_day/365);g_day%=365}let gd=g_day+1,gm=0;const md=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];while(gd>md[gm])gd-=md[gm++];return[gy,gm+1,gd]}
function g2j(gy,gm,gd){const g_d_m=[0,31,59,90,120,151,181,212,243,273,304,334];const gy2=gm>2?gy+1:gy;let days=355666+365*gy+Math.floor((gy2+3)/4)-Math.floor((gy2+99)/100)+Math.floor((gy2+399)/400)+gd+g_d_m[gm-1];let jy=-1595+33*Math.floor(days/12053);days%=12053;jy+=4*Math.floor(days/1461);days%=1461;if(days>365){jy+=Math.floor((days-1)/365);days=(days-1)%365}const jm=days<186?1+Math.floor(days/31):7+Math.floor((days-186)/30);const jd=1+(days<186?days%31:(days-186)%30);return[jy,jm,jd]}
function parts(s){return String(s||'').trim().replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[.\-]/g,'/').split('/').map(x=>x===''?NaN:Number(x))}
function faDateDigits(value){return String(value).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[Number(d)])}
function datePartsText(p){return String(p[0]).padStart(4,'0')+'/'+String(p[1]).padStart(2,'0')+'/'+String(p[2]).padStart(2,'0')}
function validJalaliParts(p){if(p.length!==3||!p.every(Number.isInteger)||p[0]<1200||p[0]>1600||p[1]<1||p[1]>12||p[2]<1||p[2]>(p[1]<=6?31:30))return false;const g=j2g(...p),back=g2j(...g);return back.every((v,i)=>v===p[i])}
function validGregorianParts(p){if(p.length!==3||!p.every(Number.isInteger)||p[0]<1600||p[0]>2500||p[1]<1||p[1]>12||p[2]<1||p[2]>31)return false;const d=new Date(Date.UTC(p[0],p[1]-1,p[2]));return d.getUTCFullYear()===p[0]&&d.getUTCMonth()+1===p[1]&&d.getUTCDate()===p[2]}
function jalaliToGregorianUI(){const p=parts($('#jdate').value);if(!validJalaliParts(p))return $('#jgResult').textContent='تاریخ شمسی معتبر را به شکل ۱۴۰۵/۰۶/۲۰ وارد کنید.';const r=j2g(...p);$('#jgResult').textContent='میلادی: '+faDateDigits(datePartsText(r))}
function gregorianToJalaliUI(){const p=parts($('#gdate').value);if(!validGregorianParts(p))return $('#gjResult').textContent='تاریخ میلادی معتبر را به شکل ۲۰۲۶/۰۹/۱۱ وارد کنید.';const r=g2j(...p);$('#gjResult').textContent='شمسی: '+faDateDigits(datePartsText(r))}
const jalaliMonthNames=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
let jalaliCalendarTarget=null,jalaliCalendarYear=0,jalaliCalendarMonth=0;
function openJalaliCalendar(pickerId,textId){jalaliCalendarTarget={pickerId,textId};const typed=parts($('#'+textId)?.value||$('#'+pickerId)?.value);if(validJalaliParts(typed)){jalaliCalendarYear=typed[0];jalaliCalendarMonth=typed[1]}else{const d=new Date();[jalaliCalendarYear,jalaliCalendarMonth]=g2j(d.getFullYear(),d.getMonth()+1,d.getDate()).slice(0,2)}renderJalaliCalendar()}
function renderJalaliCalendar(){
 let pop=$('#amnayarJalaliCalendar');
 if(!jalaliCalendarTarget)return;
 if(!pop){pop=document.createElement('div');pop.id='amnayarJalaliCalendar';pop.className='amnayar-jalali-calendar';pop.setAttribute('role','dialog');pop.setAttribute('aria-label','تقویم شمسی');document.body.appendChild(pop);}
 let days=31;
 while(days>0&&!validJalaliParts([jalaliCalendarYear,jalaliCalendarMonth,days]))days--;
 const first=j2g(jalaliCalendarYear,jalaliCalendarMonth,1);
 const weekday=(new Date(Date.UTC(first[0],first[1]-1,first[2])).getUTCDay()+1)%7;
 const current=parts($('#'+jalaliCalendarTarget.textId)?.value||'');
 const years=Array.from({length:401},(_,i)=>1200+i).map(y=>'<option value="'+y+'" '+(y===jalaliCalendarYear?'selected':'')+'>'+faDateDigits(y)+'</option>').join('');
 const months=jalaliMonthNames.map((m,i)=>'<option value="'+(i+1)+'" '+(i+1===jalaliCalendarMonth?'selected':'')+'>'+m+'</option>').join('');
 let out='<div class="jalali-cal-head"><button type="button" data-cal-shift="-12" aria-label="سال قبل">«</button><button type="button" data-cal-shift="-1" aria-label="ماه قبل">‹</button><select id="jalaliCalMonth" aria-label="انتخاب ماه">'+months+'</select><select id="jalaliCalYear" aria-label="انتخاب سال">'+years+'</select><button type="button" data-cal-shift="1" aria-label="ماه بعد">›</button><button type="button" data-cal-shift="12" aria-label="سال بعد">»</button></div><div class="jalali-cal-grid">'+['ش','ی','د','س','چ','پ','ج'].map(x=>'<span class="jalali-cal-week">'+x+'</span>').join('');
 for(let i=0;i<weekday;i++)out+='<span></span>';
 for(let d=1;d<=days;d++)out+='<button type="button" data-cal-day="'+d+'" '+(d===current[2]&&jalaliCalendarYear===current[0]&&jalaliCalendarMonth===current[1]?'class="selected"':'')+'>'+faDateDigits(d)+'</button>';
 out+='</div><div class="jalali-cal-foot"><button type="button" class="btn soft" data-cal-today>امروز</button><button type="button" class="btn soft" data-cal-close>بستن</button></div>';
 pop.innerHTML=out;pop.style.display='block';pop.onclick=e=>e.stopPropagation();
 pop.querySelectorAll('[data-cal-shift]').forEach(el=>el.addEventListener('click',()=>shiftJalaliCalendar(Number(el.dataset.calShift))));
 pop.querySelector('#jalaliCalMonth').addEventListener('change',e=>{jalaliCalendarMonth=Number(e.target.value);renderJalaliCalendar()});
 pop.querySelector('#jalaliCalYear').addEventListener('change',e=>{jalaliCalendarYear=Number(e.target.value);renderJalaliCalendar()});
 pop.querySelectorAll('[data-cal-day]').forEach(el=>el.addEventListener('click',()=>selectJalaliCalendarDay(Number(el.dataset.calDay))));
 pop.querySelector('[data-cal-today]').addEventListener('click',selectJalaliToday);
 pop.querySelector('[data-cal-close]').addEventListener('click',()=>{pop.remove();jalaliCalendarTarget=null});
 const target=$('#'+jalaliCalendarTarget.pickerId),r=target.getBoundingClientRect();
 pop.style.top=Math.max(window.scrollY+8,Math.min(window.scrollY+r.bottom+6,window.scrollY+window.innerHeight-360))+'px';
 pop.style.left=Math.max(8,Math.min(window.innerWidth-r.width-8,r.left))+'px';
}
function selectJalaliToday(){const d=new Date(),j=g2j(d.getFullYear(),d.getMonth()+1,d.getDate());jalaliCalendarYear=j[0];jalaliCalendarMonth=j[1];selectJalaliCalendarDay(j[2])}
function shiftJalaliCalendar(delta){if(!jalaliCalendarTarget)return;const step=Number(delta);if(!Number.isFinite(step)||!step)return;const index=(jalaliCalendarYear*12)+(jalaliCalendarMonth-1)+step;const year=Math.floor(index/12),month=((index%12)+12)%12+1;if(year<1200||year>1600)return;jalaliCalendarYear=year;jalaliCalendarMonth=month;renderJalaliCalendar()}
function selectJalaliCalendarDay(day){if(!jalaliCalendarTarget)return;const value=faDateDigits(datePartsText([jalaliCalendarYear,jalaliCalendarMonth,day]));const picker=$('#'+jalaliCalendarTarget.pickerId),text=$('#'+jalaliCalendarTarget.textId);if(picker)picker.value=value;if(text)text.value=value;$('#amnayarJalaliCalendar')?.remove();jalaliCalendarTarget=null}
document.addEventListener('click',e=>{const pop=$('#amnayarJalaliCalendar');if(pop&&!pop.contains(e.target)&&!e.target.matches('[data-jalali-picker]'))pop.remove()});
[['invDatePicker','invDate'],['dateDiffStartPicker','dateDiffStart'],['dateDiffEndPicker','dateDiffEnd']].forEach(([pickerId,textId])=>{const p=$('#'+pickerId);if(p){p.addEventListener('click',()=>openJalaliCalendar(pickerId,textId));p.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openJalaliCalendar(pickerId,textId)}});}});
function calculateDateDistance(){const a=parts($('#dateDiffStart').value),b=parts($('#dateDiffEnd').value),out=$('#dateDistanceResult');if(!validJalaliParts(a)||!validJalaliParts(b)){out.textContent='تاریخ شمسی معتبر را به شکل سال/ماه/روز وارد کنید یا از تقویم شمسی انتخاب کنید.';return}const ga=j2g(...a),gb=j2g(...b),msA=Date.UTC(ga[0],ga[1]-1,ga[2]),msB=Date.UTC(gb[0],gb[1]-1,gb[2]),days=Math.round(Math.abs(msB-msA)/86400000);out.textContent='فاصله دو تاریخ: '+fa(days)+' روز'+(days===0?' (یک روز یکسان)':'')}
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
  const status=$('#invoiceResult');
  if(!window.PDFLib){status.textContent='کتابخانه PDF آماده نیست؛ چند ثانیه بعد دوباره تلاش کنید.';return}
  const rows=[...document.querySelectorAll('.invoice-row')].map(r=>({d:r.querySelector('.inv-desc').value.trim(),q:+r.querySelector('.inv-qty').value||0,p:+r.querySelector('.inv-price').value||0})).filter(x=>x.d&&x.q&&x.p);
  if(!rows.length){status.textContent='حداقل یک ردیف فاکتور را کامل کنید.';return}
  const seller=$('#invSeller').value.trim()||'—',buyer=$('#invBuyer').value.trim()||'—',date=$('#invDate').value.trim()||'—',num=$('#invNumber').value.trim()||'—';
  const total=rows.reduce((a,x)=>a+x.q*x.p,0),scale=2,w=1120,h=Math.max(1584,430+rows.length*82),canvas=document.createElement('canvas');canvas.width=w*scale;canvas.height=h*scale;
  const ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.fillStyle='#f4f7fb';ctx.fillRect(0,0,w,h);ctx.fillStyle='#102f56';ctx.fillRect(0,0,w,175);ctx.fillStyle='#12a06a';ctx.fillRect(0,170,w,7);ctx.direction='rtl';ctx.textAlign='right';ctx.fillStyle='#fff';ctx.font='700 38px Arial';ctx.fillText('فاکتور فروش',w-70,67);ctx.font='18px Arial';ctx.fillStyle='#dbeafe';ctx.fillText('INVOICE  |  AMNAYAR',w-70,96);
  const logoFile=$('#invLogo')?.files?.[0];
  if(logoFile){try{const url=URL.createObjectURL(logoFile);const logo=await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=url});const ratio=Math.min(160/logo.width,100/logo.height,1);ctx.drawImage(logo,70,25,logo.width*ratio,logo.height*ratio);URL.revokeObjectURL(url)}catch(e){status.textContent='لوگو بارگذاری نشد؛ فاکتور بدون لوگو ساخته می‌شود.'}}
  ctx.font='20px Arial';ctx.fillStyle='#dbeafe';ctx.fillText('شماره: '+num,w-70,126);ctx.fillText('تاریخ: '+date,w-70,153);
  const left=70,right=w-70,top=215,rowH=64;ctx.fillStyle='#fff';ctx.fillRect(left,top,right-left,95);ctx.strokeStyle='#dbe4ef';ctx.strokeRect(left,top,right-left,95);ctx.fillStyle='#64748b';ctx.font='16px Arial';ctx.fillText('فروشنده',right-25,top+32);ctx.fillText('خریدار',left+300,top+32);ctx.fillStyle='#102f56';ctx.font='700 22px Arial';ctx.fillText(seller,right-25,top+68);ctx.textAlign='left';ctx.fillText(buyer,left+25,top+68);ctx.textAlign='right';
  const tableTop=330;ctx.fillStyle='#102f56';ctx.fillRect(left,tableTop,right-left,rowH);ctx.fillStyle='#fff';ctx.font='700 19px Arial';ctx.fillText('شرح کالا / خدمت',right-25,tableTop+39);ctx.fillText('تعداد',right-600,tableTop+39);ctx.fillText('قیمت واحد',right-760,tableTop+39);ctx.fillText('جمع (تومان)',left+160,tableTop+39);
  ctx.font='18px Arial';let y=tableTop+rowH;rows.forEach((x,i)=>{ctx.fillStyle=i%2?'#f1f6fb':'#fff';ctx.fillRect(left,y,right-left,rowH);ctx.strokeStyle='#dce4ee';ctx.strokeRect(left,y,right-left,rowH);ctx.fillStyle='#14243b';ctx.fillText(x.d.slice(0,45),right-25,y+40);ctx.fillText(fa(x.q),right-600,y+40);ctx.fillText(fa(Math.round(x.p).toLocaleString('en-US')),right-760,y+40);ctx.fillText(fa(Math.round(x.q*x.p).toLocaleString('en-US')),left+160,y+40);y+=rowH;});
  ctx.fillStyle='#e7f7ef';ctx.fillRect(left,y+22,right-left,82);ctx.strokeStyle='#a9dfc5';ctx.strokeRect(left,y+22,right-left,82);ctx.fillStyle='#087443';ctx.font='700 28px Arial';ctx.fillText('جمع کل: '+money(total),right-24,y+73);ctx.font='16px Arial';ctx.fillStyle='#718096';ctx.fillText('این فاکتور توسط سامانه امنا یار تولید شده است.',right,h-35);
  try{const png=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('canvas_export_failed')),'image/png'));const doc=await PDFLib.PDFDocument.create();const page=doc.addPage([w/2,h/2]);const img=await doc.embedPng(await png.arrayBuffer());page.drawImage(img,{x:0,y:0,width:w/2,height:h/2});const bytes=await doc.save();download(bytes,'amnayar-invoice-'+num+'.pdf','application/pdf');status.textContent='فاکتور آماده شد — جمع کل: '+money(total)}catch(e){console.error('invoice pdf',e);status.textContent='ساخت PDF انجام نشد؛ دوباره تلاش کنید.'}
}
function resizeImage(){const f=$('#imgFile').files[0],w=+$('#imgW').value,h=+$('#imgH').value;if(!f||!w||!h)return $('#imgStatus').textContent='فایل و ابعاد را وارد کنید.';const im=new Image();im.onload=()=>{const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(im,0,0,w,h);c.toBlob(b=>download(b,'amnayar-image.png','image/png'),'image/png');URL.revokeObjectURL(im.src);$('#imgStatus').textContent='تصویر آماده شد.'};im.src=URL.createObjectURL(f)}

function fmtBytes(n){if(!Number.isFinite(n))return '';const u=['بایت','کیلوبایت','مگابایت','گیگابایت'];let i=0;let x=n;while(x>=1024&&i<u.length-1){x/=1024;i++;}return `${x.toLocaleString('fa-IR',{maximumFractionDigits:2})} ${u[i]}`}
function savingsText(a,b){if(!a||!b)return '';const pct=(1-b/a)*100;if(pct<=0)return `حجم اولیه: ${fmtBytes(a)} — حجم خروجی: ${fmtBytes(b)} — این فایل از قبل بهینه است.`;return `حجم اولیه: ${fmtBytes(a)} — حجم جدید: ${fmtBytes(b)} — کاهش: ${pct.toLocaleString('fa-IR',{maximumFractionDigits:1})}%`}
function showConversionNotice(text,ok=true){let n=document.getElementById('amnayarConversionNotice');if(!n){n=document.createElement('div');n.id='amnayarConversionNotice';n.style.cssText='position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:100000;max-width:92vw;padding:13px 18px;border-radius:14px;background:#0b7a4b;color:#fff;box-shadow:0 12px 35px rgba(0,0,0,.18);font-weight:800;text-align:center;direction:rtl';document.body.appendChild(n)}n.textContent=text;n.style.background=ok?'#0b7a4b':'#b42318';n.style.display='block';clearTimeout(n._t);n._t=setTimeout(()=>n.style.display='none',4500)}
function downloadBlob(blob,name){
  const bridge=window.AmnaYarDownloader;
  if(bridge&&blob&&blob.size<=50*1024*1024){
    const reader=new FileReader();
    reader.onload=()=>{try{bridge.saveBase64(name||'download',blob.type||'application/octet-stream',String(reader.result).split(',')[1]||'')}catch(e){showConversionNotice('ذخیره دانلود انجام نشد.',false)}};
    reader.onerror=()=>showConversionNotice('خواندن فایل برای دانلود ناموفق بود.',false);
    reader.readAsDataURL(blob);return;
  }
  if(bridge&&blob&&typeof bridge.beginChunkedSave==='function'&&typeof bridge.appendBase64Chunk==='function'&&typeof bridge.finishChunkedSave==='function'){
    try{
      if(!bridge.beginChunkedSave(name||'download',blob.type||'application/octet-stream'))throw new Error('begin_save_failed');
      const chunkSize=2*1024*1024;let offset=0;
      const nextChunk=()=>{
        const part=blob.slice(offset,Math.min(offset+chunkSize,blob.size)),reader=new FileReader();
        reader.onload=()=>{
          try{
            const encoded=String(reader.result).split(',')[1]||'';
            if(!bridge.appendBase64Chunk(encoded))throw new Error('append_chunk_failed');
            offset+=part.size;
            if(offset<blob.size){nextChunk();return}
            if(!bridge.finishChunkedSave())throw new Error('finish_save_failed');
          }catch(e){try{bridge.abortChunkedSave()}catch(_){}showConversionNotice('ذخیره فایل کامل نشد؛ فضای خالی گوشی را بررسی کنید.',false)}
        };
        reader.onerror=()=>{try{bridge.abortChunkedSave()}catch(_){}showConversionNotice('خواندن فایل برای ذخیره ناموفق بود.',false)};
        reader.readAsDataURL(part);
      };
      showConversionNotice('در حال ذخیره فایل در پوشه دانلودها…');
      nextChunk();return;
    }catch(e){try{bridge.abortChunkedSave()}catch(_){}showConversionNotice('ذخیره فایل انجام نشد.',false);return}
  }
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1500);showConversionNotice('تبدیل با موفقیت انجام شد؛ دانلود فایل آغاز شد.');
}
window.addEventListener('amnayarDownloadCompleted',()=>showConversionNotice('تبدیل با موفقیت انجام شد؛ فایل دانلود شد.'));
window.addEventListener('amnayarDownloadFailed',()=>showConversionNotice('تبدیل انجام شد اما ذخیره فایل ناموفق بود.',false));
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
function compressVideo(){
  const f=$('#compressVideoFile').files[0],s=$('#compressVideoStatus');
  if(!f)return s.textContent='ویدئو را انتخاب کنید.';
  const max=2*1024*1024*1024;
  if(f.size>max)return s.textContent='حداکثر حجم هر ویدئو ۲ گیگابایت است.';
  const q=$('#videoQuality').value;
  s.textContent='در حال ارسال ویدئو برای فشرده‌سازی؛ برای فایل‌های حجیم این مرحله ممکن است زمان ببرد…';
  const fd=new FormData();fd.append('file',f,f.name);fd.append('quality',q);
  const xhr=new XMLHttpRequest();xhr.open('POST','/api/tools/compress-video');xhr.responseType='blob';xhr.timeout=2*60*60*1000;const uploadStartedAt=Date.now();
  xhr.upload.onprogress=e=>{if(e.lengthComputable){const pct=Math.round(e.loaded/e.total*100),elapsed=Math.max(.25,(Date.now()-uploadStartedAt)/1000),mbps=(e.loaded/1048576)/elapsed;s.textContent='در حال ارسال فیلم: '+pct.toLocaleString('fa-IR')+'٪ — ارسال‌شده '+(e.loaded/1048576).toFixed(1)+' از '+(e.total/1048576).toFixed(1)+' مگابایت؛ میانگین '+mbps.toFixed(1)+' مگابایت/ثانیه';}};xhr.upload.onload=()=>{s.textContent='آپلود کامل شد؛ سرور در حال کم‌کردن حجم فیلم است…';};
  xhr.onload=async()=>{
    if(xhr.status<200||xhr.status>=300){
      let message='فشرده‌سازی ویدئو انجام نشد؛ فایل یا فرمت را بررسی کنید.';
      try{const data=JSON.parse(await xhr.response.text());if(data.error==='ffmpeg_unavailable')message='سرویس فشرده‌سازی ویدئو آماده نیست؛ استقرار سرور را بررسی کنید.';else if(data.error==='video_too_large')message='حجم فیلم از حد مجاز ۲ گیگابایت بیشتر است.';else if(data.error==='video_compress_failed')message='سرور نتوانست این ویدئو را پردازش کند؛ فایل آسیب‌دیده یا کدک ناسازگار ممکن است علت باشد.';else if(data.error==='video_required')message='فایل ویدئویی معتبر انتخاب کنید.';}catch(e){}
      s.textContent=message;return;
    }
    const blob=xhr.response,original=Number(xhr.getResponseHeader('X-Original-Size')||f.size),compressed=Number(xhr.getResponseHeader('X-Compressed-Size')||blob.size);
    if(compressed>=original){s.textContent='این ویدئو از قبل کم‌حجم است؛ خروجی بزرگ‌تر دانلود نشد.';return}
    downloadBlob(blob,'amnayar-compressed.mp4');s.textContent=savingsText(original,compressed)+' — خروجی MP4 آماده شد.';
  };
  xhr.onerror=()=>{s.textContent='ارتباط با سرویس فشرده‌سازی قطع شد؛ دوباره تلاش کنید.'};
  xhr.ontimeout=()=>{s.textContent='پردازش ویدئوی حجیم بیش از زمان مجاز طول کشید؛ ویدئو را کوتاه‌تر یا با کیفیت کمتر امتحان کنید.'};
  xhr.send(fd);
}


(async()=>{try{const r=await fetch('/api/public-config');if(!r.ok)return;const c=await r.json();const enabled=new Set((c.tools||[]).filter(x=>x.enabled).map(x=>x.slug));if(c.tools?.length)document.querySelectorAll('.tool-panel[id]').forEach(sec=>{sec.style.display=(sec.id==='docqa'||enabled.has(sec.id))?'':'none'});if((c.notices||[]).length){const n=c.notices[0];const bar=document.createElement('div');bar.className='public-notice '+n.type;bar.innerHTML=`<b>${escapeHtml(n.title)}</b><span>${escapeHtml(n.body)}</span>`;document.body.insertBefore(bar,document.body.firstChild)}}catch(e){}})();
if(new URLSearchParams(location.search).get('tool')==='gold'){window.addEventListener('DOMContentLoaded',()=>setTimeout(loadLiveGoldPrices,250));}
function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]))}

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
    img.alt='شماره '+(n+1)+' — '+f.name;img.title='شماره '+(n+1)+'؛ برای انتقال این عکس به ابتدای ترتیب، روی آن بزنید';img.style.cursor='pointer';img.addEventListener('click',()=>{if(n===0)return;moveImagePdfFile(n,-n)});
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
  if(s)s.textContent=fa(fs.length)+' عکس انتخاب شده است؛ شماره روی هر عکس ترتیب صفحات PDF را مشخص می‌کند. برای تغییر ترتیب، عکس را بزنید تا به ابتدای فهرست منتقل شود یا از دکمه‌های بالا/پایین استفاده کنید.';
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
  const input=$('#imagePdfFiles'),s=$('#imagePdfStatus'),fs=imagePdfSelectedFiles.length?[...imagePdfSelectedFiles]:(input?[...input.files]:[]);
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


// AmnaYar tool usage analytics: log each action and avoid logging every keystroke.
(function(){
  const endpoint='/api/analytics/event';
  const sid=sessionStorage.getItem('amna_analytics_session')||((crypto&&crypto.randomUUID)?crypto.randomUUID():String(Date.now())+'-'+Math.random());
  sessionStorage.setItem('amna_analytics_session',sid);
  const inputSent=new Set();
  function send(type,meta){try{fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},keepalive:true,body:JSON.stringify({event_type:type,path:location.pathname+location.search,session_id:sid,meta:meta||{}})}).catch(()=>{});}catch(e){}}
  function record(panel){const title=(panel.querySelector('h2')||{}).textContent||panel.id;logLocalToolAction(title.trim(),panel.id);send('tool_use',{tool:panel.id,name:title.trim(),category:'tools'});}
  send('page_view',{referrer:document.referrer||''});
  document.addEventListener('click',function(e){const panel=e.target.closest&&e.target.closest('.tool-panel[id]');if(panel)record(panel)},true);
  document.addEventListener('input',function(e){const panel=e.target.closest&&e.target.closest('.tool-panel[id]');if(!panel||inputSent.has(panel.id))return;inputSent.add(panel.id);record(panel)},true);
})();
/* Document-grounded Q&A: extracts only the user's uploaded file and returns matching source passages. */
let amnaReferenceChunks=[];
async function loadReferenceDocument(){
 const f=$('#docQaFile')?.files?.[0],status=$('#docQaStatus'),ask=$('#docQaAsk');
 if(!f){status.textContent='ابتدا فایل را انتخاب کنید.';return}
 if(f.size>100*1024*1024){status.textContent='حجم فایل حداکثر ۱۰۰ مگابایت باشد.';return}
 status.textContent='در حال خواندن فایل…';amnaReferenceChunks=[];if(ask)ask.disabled=true;
 const ext=(f.name.split('.').pop()||'').toLowerCase();let ocrWorker=null;
 const addText=(source,text)=>{const clean=String(text||'').replace(/[\t ]+/g,' ').replace(/\n{2,}/g,'\n').trim();if(!clean)return;const sentences=clean.split(/(?<=[.!?؟؛])\s+|\n+/).map(x=>x.trim()).filter(Boolean);let chunk='';for(const sentence of sentences){if((chunk+' '+sentence).trim().length>650&&chunk){amnaReferenceChunks.push({source,text:chunk.trim()});chunk=''}chunk+=(chunk?' ':'')+sentence;if(chunk.length>900){for(let i=0;i<chunk.length;i+=650)amnaReferenceChunks.push({source,text:chunk.slice(i,i+650)});chunk=''}}if(chunk.trim())amnaReferenceChunks.push({source,text:chunk.trim()})};
 async function ensureOcrWorker(){
  if(ocrWorker)return ocrWorker;
  if(!window.Tesseract)await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';s.onload=resolve;s.onerror=()=>reject(new Error('کتابخانه OCR بارگذاری نشد؛ اتصال اینترنت را بررسی کنید.'));document.head.appendChild(s)});
  if(!window.Tesseract)throw new Error('سرویس OCR در دسترس نیست.');
  ocrWorker=await Tesseract.createWorker('fas+eng',1,{logger:m=>{if(m.status==='recognizing text')status.textContent='تشخیص نوشته از تصویر: '+Math.round((m.progress||0)*100).toLocaleString('fa-IR')+'٪'}});
  return ocrWorker;
 }
 async function ocrImage(image,label){const worker=await ensureOcrWorker();const r=await worker.recognize(image);const text=String(r.data?.text||'').trim();if(text)addText(label,text);return text.length}
 try{
  if(ext==='txt'){addText('متن '+f.name,await f.text())}
  else if(['png','jpg','jpeg','webp','bmp','tif','tiff'].includes(ext)||f.type.startsWith('image/')){status.textContent='در حال OCR تصویر…';await ocrImage(f,'تصویر '+f.name)}
  else if(ext==='pdf'){
   if(!window.pdfjsLib)throw new Error('کتابخانه PDF بارگذاری نشده است؛ اتصال اینترنت را بررسی کنید.');
   pdfjsLib.GlobalWorkerOptions.workerSrc=window.__amnaPdfWorkerSrc||'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
   const pdf=await pdfjsLib.getDocument({data:await f.arrayBuffer(),useWorkerFetch:false,isEvalSupported:false}).promise;
   for(let p=1;p<=pdf.numPages;p++){
    status.textContent='خواندن صفحه '+fa(p)+' از '+fa(pdf.numPages)+'…';
    const page=await pdf.getPage(p),content=await page.getTextContent(),txt=content.items.map(x=>x.str).join(' ').replace(/\s+/g,' ').trim();
    if(txt.length>20)addText('صفحه '+fa(p),txt);
    else{
     status.textContent='صفحه '+fa(p)+' متن قابل استخراج ندارد؛ در حال OCR…';
     const viewport=page.getViewport({scale:1.35}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
     await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
     await ocrImage(canvas,'صفحه '+fa(p)+' (OCR)');canvas.width=1;canvas.height=1;
    }
    await new Promise(resolve=>setTimeout(resolve,0));
   }
  }else if(ext==='docx'){
   if(!window.mammoth)throw new Error('کتابخانه Word بارگذاری نشده است.');
   const r=await mammoth.extractRawText({arrayBuffer:await f.arrayBuffer()});addText('سند Word '+f.name,r.value)
  }else if(ext==='xlsx'||ext==='xls'){
   if(!window.XLSX)throw new Error('کتابخانه Excel بارگذاری نشده است.');
   const wb=XLSX.read(await f.arrayBuffer(),{type:'array'});
   for(const name of wb.SheetNames){const rows=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:false});for(let i=0;i<rows.length;i++){const row=rows[i].map(v=>String(v??'').trim()).filter(Boolean).join(' | ');if(row)addText('برگه '+name+'، ردیف '+fa(i+1),row)}}
  }else throw new Error('فرمت پشتیبانی‌شده: PDF، DOCX، XLSX، XLS، TXT و تصویر. فایل Word قدیمی DOC را ابتدا به DOCX تبدیل کنید.');
  if(!amnaReferenceChunks.length)throw new Error('متن قابل استخراج پیدا نشد؛ فایل خالی، رمزدار یا ناخوانا است.');
  status.textContent='فایل خوانده شد: '+f.name+' — '+fa(amnaReferenceChunks.length)+' بخش قابل جست‌وجو آماده است. سؤال را بنویسید یا با گفتار بگویید.';
  if(ask)ask.disabled=false;
 }catch(e){console.error('document extraction',e);status.textContent='خواندن فایل انجام نشد: '+(e.message||'فرمت فایل را بررسی کنید.')}
 finally{if(ocrWorker)try{await ocrWorker.terminate()}catch(e){}}
}
function askReferenceDocument(){
 const q=String($('#docQaQuestion')?.value||'').trim(),out=$('#docQaAnswer');
 if(!amnaReferenceChunks.length){out.textContent='ابتدا فایل مرجع را بارگذاری و پردازش کنید.';return}
 if(!q){out.textContent='پرسش خود را وارد کنید یا با گفتار ثبت کنید.';return}
 const normalizeDoc=v=>String(v||'').toLocaleLowerCase('fa').replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 const stop=new Set('از به با در را برای که این آن است بود شد می و یا اگر تا درباره طبق چیست چطور چگونه کدام چه آیا لطفا لطفاً من شما فایل متن مبلغ تاریخ شماره نام هست هستند شده شود می‌شود'.split(/\s+/));
 const normalized=normalizeDoc(q),words=[...new Set(normalized.split(/\s+/).filter(w=>w.length>1&&!stop.has(w)))];
 if(!words.length){out.textContent='برای جست‌وجوی دقیق‌تر، یک نام، عدد، تاریخ یا عبارت مشخص از فایل را در سؤال بیاورید.';return}
 const ranked=amnaReferenceChunks.map(c=>{
  const t=normalizeDoc(c.text),tokens=new Set(t.split(/\s+/));
  let hits=0,partial=0;
  for(const w of words){if(tokens.has(w))hits++;else if(w.length>=3&&t.includes(w))partial++}
  const phrase=normalized.length>4&&t.includes(normalized)?words.length*2:0;
  const coverage=(hits+partial*.35)/words.length;
  const numberHits=(normalized.match(/\d+/g)||[]).filter(n=>t.includes(n)).length;
  return {...c,hits,coverage,score:hits+partial*.35+phrase+numberHits*1.5};
 }).filter(x=>x.hits>0||x.coverage>=.3).sort((a,b)=>b.score-a.score).slice(0,5);
 const best=ranked[0];
 if(!best||best.score<=0||best.coverage<.2){out.textContent='در متن استخراج‌شده از فایل، مدرک کافی برای پاسخ این سؤال پیدا نشد. اگر فایل اسکن‌شده است، کیفیت تصویر را بررسی و دوباره بارگذاری کنید؛ یا سؤال را با واژه‌های دقیق‌تر بنویسید.';return}
 const answer=best.text.length>1400?best.text.slice(0,1400)+'…':best.text;
 out.innerHTML='<p><b>پاسخ مستند از فایل</b></p><p>'+escapeDocQa(answer)+'</p><p class="muted">منبع: '+escapeDocQa(best.source)+' — '+fa(best.hits)+' واژه از '+fa(words.length)+' واژهٔ اصلی سؤال تطبیق داشت.</p>'+(ranked.length>1?'<details><summary>بخش‌های مرتبط دیگر</summary>'+ranked.slice(1).map((x,i)=>'<article class="docqa-source"><b>منبع '+fa(i+2)+' — '+escapeDocQa(x.source)+'</b><p>'+escapeDocQa(x.text.slice(0,900))+(x.text.length>900?'…':'')+'</p></article>').join('')+'</details>':'')+'<p class="muted">پاسخ فقط بر اساس متن استخراج‌شده از فایل است؛ این ابزار فعلاً مدل هوش مصنوعی مولد برای استنتاج و تحلیل آزاد ندارد.</p>';
}function escapeDocQa(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function startDocumentQuestionVoice(){const status=$('#docQaStatus');if(window.AmnaYarSpeech?.startListening){try{window.AmnaYarSpeech.startListening('doc-qa');status.textContent='صحبت کنید؛ پس از پایان گفتار، پرسش در کادر قرار می‌گیرد.';return}catch(e){}}const R=window.SpeechRecognition||window.webkitSpeechRecognition;if(!R){status.textContent='تشخیص گفتار در این مرورگر فعال نیست؛ از نسخه اندروید یا مرورگر سازگار استفاده کنید.';return}const r=new R();r.lang='fa-IR';r.interimResults=false;r.maxAlternatives=1;r.onresult=e=>{const text=e.results?.[0]?.[0]?.transcript||'';if(text){$('#docQaQuestion').value=text;status.textContent='پرسش صوتی ثبت شد؛ برای جست‌وجو دکمه پاسخ را بزنید.'}else status.textContent='گفتاری تشخیص داده نشد؛ دوباره تلاش کنید.'};r.onerror=e=>status.textContent=e.error==='not-allowed'?'اجازه میکروفون را در مرورگر فعال کنید.':'گفتار ثبت نشد؛ اتصال اینترنت و میکروفون را بررسی کنید.';try{r.start()}catch(e){status.textContent='شروع میکروفون ممکن نشد؛ دوباره تلاش کنید.'}}
window.amnayarDocumentQuestionResult=function(text,direction,error){const status=$('#docQaStatus');if(error||!text){status.textContent='گفتار پرسش ثبت نشد؛ دوباره تلاش کنید.';return}$('#docQaQuestion').value=text;status.textContent='پرسش صوتی ثبت شد؛ برای یافتن پاسخ از فایل، دکمه پاسخ را بزنید.'};

// Professional calendar helpers and local audio recorder for speech tools.
function ensureAmnaAudioControls(){
  const areas=[...document.querySelectorAll('#translate .tool-box')].filter(x=>x.querySelector('textarea'));
  const qa=document.querySelector('#docqa .tool-box');if(qa)areas.push(qa);
  areas.forEach((box,i)=>{if(box.querySelector('.amna-audio-controls'))return;const id='amnaAudio'+i;const wrap=document.createElement('div');wrap.className='amna-audio-controls tool-actions';wrap.style.cssText='display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;align-items:center';wrap.innerHTML='<button type="button" class="btn soft" data-audio-start="'+id+'">🎙 ضبط فایل صوتی</button><button type="button" class="btn soft" data-audio-stop="'+id+'" disabled>■ پایان ضبط</button><a class="btn soft" data-audio-download="'+id+'" hidden>ذخیره فایل صوتی</a><audio data-audio-player="'+id+'" controls hidden style="width:100%;margin-top:8px"></audio><span data-audio-status="'+id+'" class="muted">هنوز صدایی ضبط نشده است.</span>';box.appendChild(wrap)});
  document.querySelectorAll('[data-audio-start]').forEach(b=>{if(b.dataset.bound)return;b.dataset.bound='1';b.addEventListener('click',async()=>{const id=b.dataset.audioStart,status=document.querySelector('[data-audio-status="'+id+'"]'),stop=document.querySelector('[data-audio-stop="'+id+'"]'),dl=document.querySelector('[data-audio-download="'+id+'"]'),player=document.querySelector('[data-audio-player="'+id+'"]');try{if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw new Error('این مرورگر ضبط فایل صوتی را پشتیبانی نمی‌کند.');const stream=await navigator.mediaDevices.getUserMedia({audio:true});const mime=['audio/webm;codecs=opus','audio/webm','audio/mp4'].find(x=>MediaRecorder.isTypeSupported(x));const rec=new MediaRecorder(stream,mime?{mimeType:mime}:undefined),chunks=[];window.__amnaAudioRecorders=window.__amnaAudioRecorders||{};window.__amnaAudioRecorders[id]={rec,stream,chunks};rec.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data)};rec.onerror=()=>{status.textContent='خطا در ضبط صدا رخ داد.'};rec.onstop=()=>{stream.getTracks().forEach(t=>t.stop());const type=rec.mimeType||'audio/webm',blob=new Blob(chunks,{type}),url=URL.createObjectURL(blob),ext=type.includes('mp4')?'m4a':'webm';player.src=url;player.hidden=false;dl.href=url;dl.download='amnayar-voice-'+new Date().toISOString().replace(/[:.]/g,'-')+'.'+ext;dl.hidden=false;dl.onclick=e=>{if(window.AmnaYarDownloader&&typeof window.AmnaYarDownloader.saveBase64==='function'){e.preventDefault();window.__amnaSavingAudioId=id;const reader=new FileReader();reader.onload=()=>{try{window.AmnaYarDownloader.saveBase64(dl.download,type,String(reader.result||'').split(',')[1]||'')}catch(_){status.textContent='ذخیره مستقیم انجام نشد؛ از پخش صدا یا مرورگر برای ذخیره استفاده کنید.'}};reader.onerror=()=>{status.textContent='تبدیل فایل صوتی برای ذخیره انجام نشد.'};reader.readAsDataURL(blob)}};status.textContent='فایل صوتی آماده است ('+Math.max(1,Math.round(blob.size/1024))+' کیلوبایت). ذخیره شدنی است: برای شنیدن پخش کنید یا «ذخیره فایل صوتی» را بزنید.';stop.disabled=true;b.disabled=false};rec.start(500);b.disabled=true;stop.disabled=false;status.textContent='در حال ضبط صدا…';stop.onclick=()=>{const state=window.__amnaAudioRecorders?.[id];if(state?.rec?.state==='recording'){status.textContent='در حال آماده‌سازی فایل صوتی…';state.rec.stop()}}}catch(e){status.textContent=e.name==='NotAllowedError'?'اجازه میکروفون را از تنظیمات مرورگر/برنامه فعال کنید.':(e.message||'ضبط صدا شروع نشد.');b.disabled=false;stop.disabled=true}})});
}
function addAmnaUserChip(){const nav=document.querySelector('.nav nav,.nav-actions,.nav');if(!nav||document.getElementById('amnaToolsUser')||document.getElementById('amnayarAppUserChip'))return;const token=['amnayar_auth_token','amnayar_token','amnayar_access_token','auth_token'].some(k=>{try{return !!localStorage.getItem(k)}catch(e){return false}});if(!token)return;fetch('/api/me',{headers:{Authorization:'Bearer '+(localStorage.getItem('amnayar_auth_token')||localStorage.getItem('amnayar_token')||localStorage.getItem('amnayar_access_token')||localStorage.getItem('auth_token')||'')},cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>{const u=d&&(d.user||d);if(!u)return;const chip=document.createElement('span');chip.id='amnaToolsUser';chip.className='user-chip';chip.textContent='کاربر: '+String(u.display_name||u.username||'');nav.appendChild(chip)}).catch(()=>{});}
function logLocalToolAction(title,kind){try{const key='amnayar_action_history',old=JSON.parse(localStorage.getItem(key)||'[]');old.unshift({title:String(title||kind||'ابزار'),kind:String(kind||'tool'),at:new Date().toISOString()});localStorage.setItem(key,JSON.stringify(old.slice(0,100)))}catch(e){}}
document.addEventListener('DOMContentLoaded',()=>{ensureAmnaAudioControls();addAmnaUserChip();});

;

async function translateStandalone(direction){const input=document.getElementById(direction==='fa-en'?'plainFaText':'plainEnText'),out=document.getElementById(direction==='fa-en'?'plainEnResult':'plainFaResult'),status=document.getElementById(direction==='fa-en'?'plainFaStatus':'plainEnStatus');const text=String(input?.value||'').trim();if(!text){status.textContent='متن را وارد کنید.';return}if(text.length>5000){status.textContent='حداکثر ۵۰۰۰ نویسه مجاز است.';return}status.textContent='در حال ترجمه…';out.value='';try{const [sl,tl]=direction==='fa-en'?['fa','en']:['en','fa'];let translated='';try{const r=await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl='+sl+'&tl='+tl+'&dt=t&q='+encodeURIComponent(text));if(!r.ok)throw Error('google');const d=await r.json();translated=(d[0]||[]).map(x=>x[0]||'').join('')}catch(_){const r=await fetch('/api/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,direction})});const d=await r.json();if(!r.ok)throw Error(d.error||'ترجمه در دسترس نیست');translated=String(d.translatedText||'')}if(!translated)throw Error('ترجمه خالی دریافت شد');out.value=translated;status.textContent='ترجمه آماده شد؛ می‌توانید متن را کپی کنید.'}catch(e){status.textContent='ترجمه انجام نشد: '+(e.message||'اتصال سرویس ترجمه را بررسی کنید.')}} 

const activeTranslationRecognizers=Object.create(null);
function startTranslationVoice(direction){
 const input=document.getElementById(direction==='fa-en'?'plainFaText':'plainEnText'),status=document.getElementById(direction==='fa-en'?'plainFaStatus':'plainEnStatus');
 window.__amnaTranslationVoiceDirection=direction;
 if(activeTranslationRecognizers[direction]){status.textContent='تشخیص گفتار همین زبان در حال اجراست.';return}
 if(window.AmnaYarSpeech&&typeof window.AmnaYarSpeech.startListening==='function'){
   try{window.AmnaYarSpeech.startListening(direction==='fa-en'?'translate-fa-en':'translate-en-fa');status.textContent='صحبت کنید؛ تشخیص گفتار در حال اجراست.';return}catch(e){}
 }
 const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!Recognition){status.textContent='تشخیص گفتار در این مرورگر در دسترس نیست؛ در Chrome به‌روز یا اپلیکیشن امنا یار امتحان کنید.';return}
 try{
  const rec=new Recognition();activeTranslationRecognizers[direction]=rec;
  rec.lang=direction==='fa-en'?'fa-IR':'en-US';rec.interimResults=true;rec.continuous=true;rec.maxAlternatives=1;let finalText='';
  rec.onresult=e=>{let interim='';for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0].transcript;if(e.results[i].isFinal)finalText+=t+' ';else interim+=t}input.value=(finalText+interim).trim();status.textContent='در حال تشخیص گفتار؛ متن را می‌توانید ویرایش کنید.'};
  rec.onerror=e=>{status.textContent=e.error==='not-allowed'?'اجازه میکروفون را در تنظیمات مرورگر فعال کنید.':'تشخیص گفتار ناموفق بود؛ اتصال اینترنت و میکروفون را بررسی کنید.'};
  rec.onend=()=>{if(activeTranslationRecognizers[direction]===rec)delete activeTranslationRecognizers[direction];if(input.value.trim())status.textContent='گفتار به متن تبدیل شد. برای ترجمه دکمه ترجمه را بزنید.'};
  rec.start();status.textContent='صحبت کنید؛ برای پایان، «پایان صحبت» را بزنید.';
 }catch(e){delete activeTranslationRecognizers[direction];status.textContent='شروع میکروفون ناموفق بود؛ اجازه دسترسی را بررسی کنید.'}
}
function stopTranslationVoice(direction){
 const status=document.getElementById(direction==='fa-en'?'plainFaStatus':'plainEnStatus');
 try{
   if(window.AmnaYarSpeech&&typeof window.AmnaYarSpeech.stopListening==='function'){window.AmnaYarSpeech.stopListening();return}
   const rec=activeTranslationRecognizers[direction];if(rec)rec.stop();else status.textContent='ضبط گفتار این زبان فعال نیست.';
 }catch(e){status.textContent='توقف گفتار انجام نشد؛ دوباره تلاش کنید.'}
}
window.amnayarTranslationInputVoiceResult=function(text,direction,error){
 const faToEn=direction==='translate-fa-en',input=document.getElementById(faToEn?'plainFaText':'plainEnText'),status=document.getElementById(faToEn?'plainFaStatus':'plainEnStatus');
 if(error||!text){status.textContent=error==='permission'?'اجازه میکروفون را فعال کنید.':'گفتار ثبت نشد؛ دوباره تلاش کنید.';return}
 input.value=text;status.textContent='گفتار به متن تبدیل شد؛ برای ترجمه، دکمه ترجمه را بزنید.';
};
function copyTranslation(id){const el=document.getElementById(id);if(!el||!el.value){return}if(navigator.clipboard?.writeText)navigator.clipboard.writeText(el.value).then(()=>{const s=document.getElementById(id==='plainEnResult'?'plainFaStatus':'plainEnStatus');if(s)s.textContent='ترجمه کپی شد.'}).catch(()=>{el.focus();el.select();document.execCommand('copy')});else{el.focus();el.select();document.execCommand('copy')}}
(function checkAmnaAppUpdate(){if(new URLSearchParams(location.search).get('app')!=='1')return;fetch('/app-version.json?ts='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.json():null).then(v=>{if(!v||!v.latestVersion)return;const current=new URLSearchParams(location.search).get('appVersion')||'1.0.0';const parts=x=>String(x).split('.').map(n=>parseInt(n,10)||0);const newer=(a,b)=>{a=parts(a);b=parts(b);for(let i=0;i<Math.max(a.length,b.length);i++){if((a[i]||0)!==(b[i]||0))return(a[i]||0)>(b[i]||0)}return false};if(!newer(v.latestVersion,current))return;const bar=document.createElement('div');bar.style.cssText='position:fixed;z-index:100000;top:8px;left:8px;right:8px;background:#0c6b48;color:#fff;padding:14px;border-radius:14px;box-shadow:0 8px 30px #0003;display:flex;gap:10px;align-items:center;justify-content:space-between;direction:rtl';bar.innerHTML='<span>نسخه جدید امنا یار ('+String(v.latestVersion).replace(/[&<>"]/g,'')+') منتشر شده است.</span><button type="button" style="border:0;border-radius:9px;padding:9px 12px;font-weight:bold" id="amnaUpdateNow">به‌روزرسانی</button><button type="button" aria-label="بستن" id="amnaUpdateClose" style="border:0;background:transparent;color:white;font-size:20px">×</button>';document.body.appendChild(bar);document.getElementById('amnaUpdateNow').onclick=()=>{const url=String(v.bazaarUrl||'https://cafebazaar.ir/app/ir.amnayar.app');location.href=url};document.getElementById('amnaUpdateClose').onclick=()=>bar.remove()}).catch(()=>{})})();


/* AmnaYar reliability patch: visible action history, voice fallback, clear audio state and compression diagnostics. */
(function(){
  const historyKey='amnayar_action_history';
  function readActions(){try{return JSON.parse(localStorage.getItem(historyKey)||'[]').filter(x=>x&&x.title).slice(0,100)}catch(_){return []}}
  function saveAction(title,kind){
    try{
      const rows=readActions();
      rows.unshift({title:String(title||'اقدام در ابزار'),kind:String(kind||'tool'),at:new Date().toISOString()});
      localStorage.setItem(historyKey,JSON.stringify(rows.slice(0,100)));
      renderActionHistory();
    }catch(_){}
  }
  function renderActionHistory(){
    if(!document.body)return;
    let panel=document.getElementById('amnaActionHistory');
    if(!panel){
      panel=document.createElement('details');panel.id='amnaActionHistory';panel.className='amna-action-history';
      panel.innerHTML='<summary>🕘 سابقه اقدامات من <span data-count>۰</span></summary><div class="amna-action-history-body"><p class="muted">اقدام‌های اخیر شما روی همین دستگاه ذخیره می‌شود.</p><ol data-items></ol><button type="button" class="btn soft" data-clear-history>پاک‌کردن سابقه محلی</button></div>';
      const main=document.querySelector('main');
      if(main)main.appendChild(panel);else document.body.appendChild(panel);
      panel.querySelector('[data-clear-history]').addEventListener('click',()=>{try{localStorage.removeItem(historyKey)}catch(_){}renderActionHistory()});
    }
    const rows=readActions(),count=panel.querySelector('[data-count]'),list=panel.querySelector('[data-items]');
    if(count)count.textContent=rows.length.toLocaleString('fa-IR');
    if(list)list.innerHTML=rows.slice(0,20).map(x=>{
      const date=new Date(x.at);const when=Number.isNaN(date.getTime())?'':date.toLocaleString('fa-IR',{dateStyle:'short',timeStyle:'short'});
      const li=document.createElement('li');li.textContent=(x.title||'اقدام')+' — '+when;return li.outerHTML;
    }).join('')||'<li>هنوز اقدامی ثبت نشده است.</li>';
  }
  window.logLocalToolAction=saveAction;
  document.addEventListener('click',e=>{
    const el=e.target.closest('button,[role="button"],a');
    if(!el)return;
    const panel=el.closest('.tool-panel');
    if(!panel)return;
    const label=(el.innerText||el.textContent||el.getAttribute('aria-label')||'').replace(/\s+/g,' ').trim();
    if(!label||/بازگشت|بستن|پاک کردن انتخاب|پاک‌کردن سابقه محلی/.test(label))return;
    if(el.matches('a')&&el.getAttribute('href')==='#')return;
    saveAction((panel.querySelector('h2')?.textContent||panel.id)+' — '+label,'tool');
  },true);
  document.addEventListener('change',e=>{
    const el=e.target;if(!el.matches('input[type=file]'))return;
    const panel=el.closest('.tool-panel');if(!panel||!el.files?.length)return;
    saveAction((panel.querySelector('h2')?.textContent||panel.id)+' — انتخاب فایل: '+el.files[0].name,'file');
  },true);
  document.addEventListener('DOMContentLoaded',()=>{
    renderActionHistory();
    const footer=document.querySelector('footer');
    if(footer&&!footer.textContent.includes('کافی‌نت همراه شما'))footer.insertAdjacentHTML('beforeend','<span class="amna-tagline">امنا یار؛ کافی‌نت همراه شما</span>');
  });
  window.addEventListener('storage',e=>{if(e.key===historyKey)renderActionHistory()});
})();

/* A native speech error now falls back to browser recognition when available. */
(function(){
  const previousResult=window.amnayarVoiceResult;
  const browserFallback=Object.create(null);
  const previousStop=window.stopVoiceTranslation;
  window.amnayarVoiceResult=function(text,direction,error){
    if(!error && text){if(previousResult)previousResult(text,direction,error);return}
    if(previousResult)previousResult(text,direction,error);
    if(!['recognition_failed','unsupported','no_speech'].includes(error))return;
    const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!Recognition)return;
    const status=document.getElementById(direction==='fa-en'?'faVoiceStatus':'enVoiceStatus');
    const input=document.getElementById(direction==='fa-en'?'faToEnText':'enToFaText');
    try{
      const rec=new Recognition();browserFallback[direction]=rec;
      rec.lang=direction==='fa-en'?'fa-IR':'en-US';rec.interimResults=true;rec.continuous=true;rec.maxAlternatives=1;
      rec.onresult=ev=>{let text='';for(let i=0;i<ev.results.length;i++)text+=ev.results[i][0].transcript+' ';input.value=text.trim()};
      rec.onerror=()=>{if(status)status.textContent='تشخیص گفتار انجام نشد؛ اجازه میکروفون و اتصال اینترنت یا سرویس گفتار دستگاه را بررسی کنید.';setVoiceButtons(direction,false);delete browserFallback[direction]};
      rec.onend=()=>{if(input?.value.trim()&&status)status.textContent='متن گفتار ثبت شد؛ آن را بازبینی یا اصلاح کنید.';setVoiceButtons(direction,false);delete browserFallback[direction]};
      rec.start();setVoiceButtons(direction,true);
      if(status)status.textContent='سرویس داخلی پاسخ نداد؛ تشخیص گفتار مرورگر در حال اجراست.';
    }catch(_){if(status)status.textContent='شروع تشخیص گفتار ممکن نشد؛ دسترسی میکروفون و اتصال را بررسی کنید.'}
  };
  if(typeof previousStop==='function')window.stopVoiceTranslation=function(direction){
    const rec=browserFallback[direction];
    if(rec){try{rec.stop()}catch(_){}return}
    previousStop(direction);
  };
})();

/* PDF compression: show upload progress and keep the server/local fallback paths. */
async function compressPDF(){
  const f=$('#compressPdfFile')?.files?.[0],s=$('#compressPdfStatus');
  if(!f){if(s)s.textContent='ابتدا فایل PDF را انتخاب کنید.';return}
  if(!/\.pdf$/i.test(f.name)&&f.type!=='application/pdf'){s.textContent='فایل انتخاب‌شده PDF نیست.';return}
  if(f.size>500*1024*1024){s.textContent='حداکثر حجم PDF برابر ۵۰۰ مگابایت است.';return}
  const level=Math.max(15,Math.min(75,Number($('#pdfQuality')?.value||35)));
  const routes=['/api/tools/compress-pdf','https://api.amnayar.ir/api/tools/compress-pdf'];
  s.textContent='آماده‌سازی فایل PDF برای ارسال…';
  let lastError=null;
  for(let i=0;i<routes.length;i++){
    try{
      const fd=new FormData();fd.append('file',f,f.name);fd.append('quality',String(level));
      const blob=await new Promise((resolve,reject)=>{
        const xhr=new XMLHttpRequest();xhr.open('POST',routes[i]);xhr.responseType='blob';xhr.timeout=45*60*1000;const started=Date.now();
        xhr.upload.onprogress=e=>{if(e.lengthComputable){const pct=Math.round(e.loaded/e.total*100),elapsed=Math.max(.25,(Date.now()-started)/1000),rate=(e.loaded/1048576)/elapsed;s.textContent='ارسال PDF به سرور: '+pct.toLocaleString('fa-IR')+'٪ ('+(e.loaded/1048576).toFixed(1)+' از '+(e.total/1048576).toFixed(1)+' مگابایت) — '+rate.toFixed(1)+' مگابایت/ثانیه';}};
        xhr.upload.onload=()=>{s.textContent='آپلود کامل شد؛ در حال فشرده‌سازی PDF روی سرور…'};
        xhr.onload=async()=>{
          if(xhr.status>=200&&xhr.status<300){resolve({blob:xhr.response,xhr});return}
          let code='server_'+xhr.status;try{const data=JSON.parse(await xhr.response.text());code=String(data.error||code)}catch(_){}
          const err=new Error(code);err.status=xhr.status;reject(err);
        };
        xhr.onerror=()=>reject(new Error('network_error'));
        xhr.ontimeout=()=>reject(new Error('timeout'));
        xhr.onabort=()=>reject(new Error('aborted'));
        xhr.send(fd);
      });
      const out=blob.blob,resp=blob.xhr;
      const original=Number(resp.getResponseHeader('X-Original-Size')||f.size),compressed=Number(resp.getResponseHeader('X-Compressed-Size')||out.size);
      if(!out.size||out.type.includes('json'))throw new Error('خروجی PDF معتبر دریافت نشد.');
      if(compressed>=original){s.textContent='سرور نتوانست حجم را کاهش دهد؛ تلاش برای فشرده‌سازی محلی…';await compressPDFLocally(f,level,s);return}
      downloadBlob(out,'amnayar-compressed.pdf');
      s.textContent=savingsText(original,compressed)+' — فایل فشرده و دانلود شد.';
      if(typeof logLocalToolAction==='function')logLocalToolAction('فشرده‌سازی PDF با موفقیت','conversion');
      return;
    }catch(e){
      lastError=e;
      if(e.status===404||e.status===502||e.status===503||e.message==='network_error')continue;
      if(e.message==='ghostscript_unavailable'||e.message==='pdf_already_optimized'||e.status===422){s.textContent='فشرده‌سازی سرور کامل نشد؛ تلاش برای فشرده‌سازی محلی…';await compressPDFLocally(f,level,s);return}
      if(e.message==='timeout'){s.textContent='پردازش PDF بیش از زمان مجاز طول کشید؛ فایل کوچک‌تر یا کیفیت پایین‌تر را امتحان کنید.';return}
      console.warn('PDF compression route failed',e);
    }
  }
  console.warn('AmnaYar PDF compression failed',lastError);
  await compressPDFLocally(f,level,s);
}

/* Explicitly distinguish "recorded and ready" from "saved to device". */
document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('[data-audio-download]').forEach(link=>{
    link.addEventListener('click',()=>{
      const id=link.dataset.audioDownload,status=document.querySelector('[data-audio-status="'+id+'"]');
      if(status&&!window.AmnaYarDownloader)status.textContent='فایل صوتی آماده است؛ پنجره دانلود مرورگر را بررسی کنید تا ذخیره کامل شود.';
    });
  });
});

/* Load document parsers on demand if a CDN request failed on initial page load. */
(function(){
  const scriptPromises=Object.create(null);
  function loadScriptOnce(url){
    if(scriptPromises[url])return scriptPromises[url];
    scriptPromises[url]=new Promise((resolve,reject)=>{
      const existing=[...document.scripts].find(s=>s.src===url);
      if(existing&&existing.dataset.amnaLoaded==='1'){resolve();return}
      const s=document.createElement('script');s.src=url;s.async=true;
      s.onload=()=>{s.dataset.amnaLoaded='1';if(url.includes('jsdelivr.net/npm/pdfjs-dist'))window.__amnaPdfWorkerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';resolve()};
      s.onerror=()=>{s.remove();reject(new Error('بارگذاری کتابخانه فایل ناموفق بود: '+url))};
      document.head.appendChild(s);
    });
    return scriptPromises[url];
  }
  async function ensureParser(ext){
    if(ext==='pdf'&&!window.pdfjsLib){
      let ok=false;
      for(const url of ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js','https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js']){
        try{await loadScriptOnce(url);if(window.pdfjsLib){ok=true;break}}catch(_){}
      }
      if(!ok)throw new Error('کتابخانه خواندن PDF بارگذاری نشد؛ اینترنت یا فیلترشکن را بررسی کنید.');
    }
    if(ext==='docx'&&!window.mammoth){
      let ok=false;
      for(const url of ['https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js','https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js']){
        try{await loadScriptOnce(url);if(window.mammoth){ok=true;break}}catch(_){}
      }
      if(!ok)throw new Error('کتابخانه خواندن Word بارگذاری نشد؛ اتصال اینترنت را بررسی کنید.');
    }
    if(['xlsx','xls'].includes(ext)&&!window.XLSX){
      let ok=false;
      for(const url of ['https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js','https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js']){
        try{await loadScriptOnce(url);if(window.XLSX){ok=true;break}}catch(_){}
      }
      if(!ok)throw new Error('کتابخانه خواندن Excel بارگذاری نشد؛ اتصال اینترنت را بررسی کنید.');
    }
  }
  const oldLoad=window.loadReferenceDocument;
  if(typeof oldLoad==='function')window.loadReferenceDocument=async function(){
    const f=document.getElementById('docQaFile')?.files?.[0];
    if(!f){const s=document.getElementById('docQaStatus');if(s)s.textContent='ابتدا فایل PDF، DOCX، XLS یا XLSX را انتخاب کنید.';return}
    const ext=(f.name.split('.').pop()||'').toLowerCase();
    if(ext==='doc'){const s=document.getElementById('docQaStatus');if(s)s.textContent='فایل Word قدیمی DOC پشتیبانی نمی‌شود؛ آن را با Word به DOCX یا PDF متنی تبدیل کنید.';return}
    try{const s=document.getElementById('docQaStatus');if(s)s.textContent='در حال آماده‌سازی کتابخانه خواندن فایل…';await ensureParser(ext);return await oldLoad()}
    catch(e){const s=document.getElementById('docQaStatus');if(s)s.textContent='فایل خوانده نشد: '+(e.message||'فرمت یا اتصال را بررسی کنید.')}
  };
})();

/* Offline fallback: rasterizes PDF pages and rebuilds a smaller PDF when server Ghostscript is unavailable.
   This is intentionally limited because selectable text and annotations are flattened in this mode. */
async function compressPDFLocally(file,quality,status){
  if(file.size>40*1024*1024){status.textContent='فشرده‌سازی سرور در دسترس نیست و این فایل از حد امن فشرده‌سازی محلی (۴۰ مگابایت) بزرگ‌تر است. سرویس سرور باید فعال شود.';return}
  if(!window.pdfjsLib||!window.PDFLib){status.textContent='فشرده‌سازی سرور در دسترس نیست و کتابخانه فشرده‌سازی محلی هم بارگذاری نشده؛ اتصال اینترنت را بررسی کنید.';return}
  status.textContent='سرور در دسترس نیست؛ فشرده‌سازی محلی شروع شد. در این روش صفحات به تصویر تبدیل می‌شوند و متن PDF قابل انتخاب نخواهد بود.';
  let canvas=null;
  try{
    pdfjsLib.GlobalWorkerOptions.workerSrc=window.__amnaPdfWorkerSrc||'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const source=await pdfjsLib.getDocument({data:await file.arrayBuffer(),useWorkerFetch:false,isEvalSupported:false}).promise;
    if(source.numPages>80){status.textContent='این فایل بیش از ۸۰ صفحه دارد؛ برای جلوگیری از پرشدن حافظه، فشرده‌سازی محلی انجام نشد. سرویس سرور باید فعال شود.';return}
    const out=await PDFLib.PDFDocument.create();
    const scale=quality<=35?0.62:quality<=50?0.76:quality<=70?0.9:1.0;
    const jpegQuality=quality<=35?0.34:quality<=50?0.46:quality<=70?0.58:0.7;
    canvas=document.createElement('canvas');const ctx=canvas.getContext('2d');
    for(let index=1;index<=source.numPages;index++){
      status.textContent='فشرده‌سازی محلی صفحه '+index.toLocaleString('fa-IR')+' از '+source.numPages.toLocaleString('fa-IR')+'…';
      const page=await source.getPage(index),base=page.getViewport({scale:1}),viewport=page.getViewport({scale});
      canvas.width=Math.max(1,Math.floor(viewport.width));canvas.height=Math.max(1,Math.floor(viewport.height));
      await page.render({canvasContext:ctx,viewport}).promise;
      const imageBlob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',jpegQuality));
      if(!imageBlob)throw new Error('ساخت تصویر صفحه ناموفق بود');
      const image=await out.embedJpg(await imageBlob.arrayBuffer());
      const pdfPage=out.addPage([base.width,base.height]);
      pdfPage.drawImage(image,{x:0,y:0,width:base.width,height:base.height});
      page.cleanup();
    }
    const bytes=await out.save({useObjectStreams:true,addDefaultPage:false});
    const blob=new Blob([bytes],{type:'application/pdf'});
    if(blob.size>=file.size){status.textContent='نسخه محلی کوچک‌تر از فایل اصلی نشد؛ لطفاً سرویس فشرده‌سازی سرور فعال شود.';return}
    downloadBlob(blob,'amnayar-compressed-local.pdf');
    status.textContent=savingsText(file.size,blob.size)+' — فشرده‌سازی محلی انجام شد. توجه: متن صفحات به تصویر تبدیل شده است.';
    if(typeof logLocalToolAction==='function')logLocalToolAction('فشرده‌سازی محلی PDF با موفقیت','conversion');
  }catch(e){
    console.error('Local PDF compression failed',e);
    status.textContent='فشرده‌سازی محلی انجام نشد: '+(e.message||'فایل رمزدار، آسیب‌دیده یا ناسازگار است.')+'؛ فایل اصلی تغییری نکرد.';
  }finally{if(canvas){canvas.width=1;canvas.height=1}}
}

/* Voice-question fallback for document Q&A when Android's recognizer reports an error. */
(function(){
  const previous=window.amnayarDocumentQuestionResult;
  window.amnayarDocumentQuestionResult=function(text,direction,error){
    if(previous)previous(text,direction,error);
    if(!error&&String(text||'').trim())return;
    const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!Recognition)return;
    const status=document.getElementById('docQaStatus'),question=document.getElementById('docQaQuestion');
    try{
      const rec=new Recognition();rec.lang='fa-IR';rec.interimResults=false;rec.continuous=false;rec.maxAlternatives=1;
      rec.onresult=function(e){const value=String(e.results?.[0]?.[0]?.transcript||'').trim();if(value){question.value=value;status.textContent='پرسش صوتی ثبت شد؛ اکنون «یافتن پاسخ در فایل» را بزنید.'}};
      rec.onerror=function(){status.textContent='پرسش صوتی کار نکرد؛ دسترسی میکروفون و سرویس تشخیص گفتار دستگاه را بررسی کنید.'};
      rec.start();status.textContent='تشخیص گفتار داخلی پاسخ نداد؛ در حال تلاش با مرورگر…';
    }catch(_){status.textContent='شروع پرسش صوتی ممکن نشد؛ مجوز میکروفون را بررسی کنید.'}
  };
})();

/* Route native Android speech results into the standalone translator when it initiated recording. */
(function(){const previous=window.amnayarVoiceResult;window.amnayarVoiceResult=function(text,direction,error){if(window.__amnaTranslationVoiceDirection===direction){const input=document.getElementById(direction==='fa-en'?'plainFaText':'plainEnText'),status=document.getElementById(direction==='fa-en'?'plainFaStatus':'plainEnStatus');if(error){if(status)status.textContent='تشخیص گفتار ناموفق بود؛ مجوز میکروفون یا اتصال را بررسی کنید.';return}if(input&&String(text||'').trim())input.value=String(text).trim();if(status)status.textContent=input&&input.value.trim()?'گفتار ثبت شد؛ اکنون دکمه ترجمه را بزنید.':'گفتاری دریافت نشد؛ دوباره تلاش کنید.';window.__amnaTranslationVoiceDirection=null;return}if(previous)previous(text,direction,error)}})();

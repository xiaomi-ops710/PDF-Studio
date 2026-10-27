'use strict';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const IC={home:'M4 11l8-7 8 7v9h-5v-6H9v6H4z',grid:'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',zin:'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5M8 11h6M11 8v6',zout:'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5M8 11h6',moon:'M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z',info:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5v.5',full:'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',dl:'M12 4v12m0 0l-4-4m4 4l4-4M4 20h16',up:'M12 16V4m0 0L8 8m4-4l4 4M4 20h16',up2:'M6 15l6-6 6 6',dn2:'M6 9l6 6 6-6',cur:'M5 3l14 7-6 2-2 6z',pen:'M16 4l4 4L8 20H4v-4L16 4z',hl:'M9 11l4 4M4 20h6l10-10-6-6L4 14v6z',er:'M7 20h13M5 15l9-9 5 5-6 6H8z',text:'M5 6V4h14v2M12 4v16M9 20h6',undo:'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',redo:'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',close:'M6 6l12 12M18 6L6 18',trash:'M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3'};
function icons(r=document){r.querySelectorAll('i[data-i]').forEach(e=>{e.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${IC[e.dataset.i]}"/></svg>`;e.removeAttribute('data-i')})}
icons();
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

/* ---------- storage (IndexedDB) ---------- */
const DB=(()=>{let p;const open=()=>p||(p=new Promise((res,rej)=>{const r=indexedDB.open('pdfstudio',1);r.onupgradeneeded=()=>{r.result.createObjectStore('files',{keyPath:'id'});r.result.createObjectStore('annots',{keyPath:'id'})};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}));
const tx=async(s,m,f)=>{const d=await open();return new Promise((res,rej)=>{const t=d.transaction(s,m),q=f(t.objectStore(s));t.oncomplete=()=>res(q&&q.result);t.onerror=()=>rej(t.error)})};
return{put:(s,v)=>tx(s,'readwrite',o=>o.put(v)),get:(s,k)=>tx(s,'readonly',o=>o.get(k)),all:s=>tx(s,'readonly',o=>o.getAll()),del:(s,k)=>tx(s,'readwrite',o=>o.delete(k))}})();

/* ---------- state ---------- */
const S={pdf:null,id:'',name:'',bytes:null,size:0,meta:null,zoom:1,sizes:[],els:[],ann:{},hist:[],hi:-1,tool:'select',col:{pen:'#1d1b20',hl:'#ffeb3b',tx:'#1d1b20'},w:{pen:3,hl:18,er:14,tx:20},cur:1,tb:null};
const COLORS=['#1d1b20','#d32f2f','#ef6c00','#fbc02d','#ffeb3b','#2e7d32','#1565c0','#6750a4','#d81b60'];
const RANGE={pen:[1,14],hl:[6,40],er:[6,50],tx:[8,72]};
const A=i=>S.ann[i]||(S.ann[i]={s:[],t:[]});
const V=$('#viewer'),P=$('#pages');
document.body.classList.add('nodoc');
let toastT;function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('show'),2200)}
const fmtSize=b=>b>1048576?(b/1048576).toFixed(1)+' MB':Math.max(1,Math.round(b/1024))+' KB';

/* ---------- open ---------- */
async function img2pdf(f){const {PDFDocument}=PDFLib,d=await PDFDocument.create(),b=await f.arrayBuffer();let im;
  if(f.type==='image/png')im=await d.embedPng(b);else if(f.type==='image/jpeg')im=await d.embedJpg(b);
  else{const bm=await createImageBitmap(f),c=document.createElement('canvas');c.width=bm.width;c.height=bm.height;c.getContext('2d').drawImage(bm,0,0);im=await d.embedPng(await (await fetch(c.toDataURL('image/png'))).arrayBuffer())}
  d.addPage([im.width,im.height]).drawImage(im,{x:0,y:0,width:im.width,height:im.height});
  const u=await d.save();return u.buffer.slice(u.byteOffset,u.byteOffset+u.byteLength)}
async function pick(f){if(!f)return;try{toast('開いています…');const b=/^image\//.test(f.type)?await img2pdf(f):await f.arrayBuffer();await load(b,f.name)}catch(e){console.error(e);toast('開けませんでした。PDFか画像を選んでください')}}
async function load(buf,name){
  const task=pdfjsLib.getDocument({data:new Uint8Array(buf.slice(0))});
  task.onPassword=(cb,r)=>cb(prompt(r===2?'パスワードが違います。もう一度入力してください':'このPDFのパスワードを入力')||'');
  const pdf=await task.promise,n=pdf.numPages;
  S.tx={};S.pdf=pdf;S.bytes=buf;S.name=name;S.size=buf.byteLength;S.id=pdf.fingerprints[0];
  S.meta=await pdf.getMetadata().catch(()=>({info:{}}));
  S.sizes=[];for(let i=1;i<=(n<=200?n:1);i++){const v=(await pdf.getPage(i)).getViewport({scale:1});S.sizes.push({w:v.width,h:v.height})}
  while(S.sizes.length<n)S.sizes.push(S.sizes[0]);
  const sv=await DB.get('annots',S.id).catch(()=>0);S.ann=sv?sv.data:{};S.hist=[JSON.stringify(S.ann)];S.hi=0;
  document.body.classList.remove('nodoc');$('#title').textContent=name;$('#pTot').textContent='/ '+n;$('#pNum').max=n;
  $('#sres').innerHTML='';$('#sq').value='';build();S.zoom=1;fitW();btns();setTool('select');
  DB.put('files',{id:S.id,name,size:S.size,pages:n,date:Date.now(),blob:new Blob([buf],{type:'application/pdf'})}).catch(()=>{});
  toast(n+'ページを開きました');
}
function build(){P.innerHTML='';S.els=S.sizes.map((s,i)=>{const e=document.createElement('div');e.className='page';e.dataset.i=i;e.innerHTML='<canvas class="pdf"></canvas><canvas class="ink"></canvas><div class="tl"></div>';P.append(e);sizeEl(i,e);return e});V.scrollTop=0}
const sizeEl=(i,e=S.els[i])=>{e.style.width=S.sizes[i].w*S.zoom+'px';e.style.height=S.sizes[i].h*S.zoom+'px'};

/* ---------- rendering ---------- */
async function draw(i){
  const e=S.els[i],z=S.zoom;e._z=z;const k=e._k=(e._k||0)+1;
  try{
    const pg=await S.pdf.getPage(i+1),dpr=Math.min(devicePixelRatio||1,2),vp=pg.getViewport({scale:z*dpr});
    if(k!==e._k)return;
    const u=pg.getViewport({scale:1}),s=S.sizes[i];
    if(Math.abs(u.width-s.w)>1||Math.abs(u.height-s.h)>1){S.sizes[i]={w:u.width,h:u.height};sizeEl(i)}
    const c=e.querySelector('.pdf');c.width=vp.width;c.height=vp.height;
    e._t&&e._t.cancel();e._t=pg.render({canvasContext:c.getContext('2d'),viewport:vp});await e._t.promise;
    if(k!==e._k)return;
    const n=e.querySelector('.ink');n.width=vp.width;n.height=vp.height;ink(i);txt(i);
  }catch(err){if(!err||err.name!=='RenderingCancelledException'){console.warn(err);if(k===e._k)e._z=null}}
}
function free(e){e._z=null;e._k=(e._k||0)+1;e._t&&e._t.cancel();e.querySelectorAll('canvas').forEach(c=>{c.width=0;c.height=0});e.querySelector('.tl').innerHTML=''}
function vis(){const t=V.scrollTop-800,b=V.scrollTop+V.clientHeight+800;
  S.els.forEach((e,i)=>{const on=e.offsetTop+e.offsetHeight>t&&e.offsetTop<b;if(on){if(e._z!==S.zoom)draw(i)}else if(e.querySelector('.pdf').width>0)free(e)})}
let raf;V.addEventListener('scroll',()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{if(!S.pdf)return;vis();const m=V.scrollTop+V.clientHeight/3;let c=0;S.els.forEach((e,i)=>{if(e.offsetTop<=m)c=i});if(S.cur!==c+1){S.cur=c+1;$('#pNum').value=S.cur;$$('.th').forEach((t,i)=>t.classList.toggle('on',i===c))}})},{passive:true});

/* ---------- zoom / nav ---------- */
function zoom(z){z=Math.min(5,Math.max(.25,z));if(!S.pdf||Math.abs(z-S.zoom)<.005)return;
  const cx=(V.scrollLeft+V.clientWidth/2)/V.scrollWidth,cy=(V.scrollTop+V.clientHeight/2)/V.scrollHeight;
  S.zoom=z;S.els.forEach((e,i)=>{sizeEl(i);e._z=null;e._k=(e._k||0)+1});
  V.scrollLeft=cx*V.scrollWidth-V.clientWidth/2;V.scrollTop=cy*V.scrollHeight-V.clientHeight/2;
  $('#zLbl').textContent=Math.round(z*100)+'%';vis()}
function fitW(){const s=S.sizes[S.cur-1]||S.sizes[0];const z=(V.clientWidth-32)/s.w;S.zoom=0;zoom(Math.min(z,3))}
function go(n){n=Math.min(S.sizes.length,Math.max(1,n|0));const e=S.els[n-1];if(e)V.scrollTo({top:e.offsetTop-12,behavior:'smooth'})}
$('#zIn').onclick=()=>zoom(S.zoom*1.25);$('#zOut').onclick=()=>zoom(S.zoom/1.25);$('#zLbl').onclick=fitW;
$('#pPrev').onclick=()=>go(S.cur-1);$('#pNext').onclick=()=>go(S.cur+1);$('#pNum').onchange=e=>go(+e.target.value);
let g0;V.addEventListener('gesturestart',e=>{e.preventDefault();g0=S.zoom;P.style.transformOrigin=`${V.scrollLeft+V.clientWidth/2}px ${V.scrollTop+V.clientHeight/2}px`});
V.addEventListener('gesturechange',e=>{e.preventDefault();P.style.transform=`scale(${Math.min(5,Math.max(.25,g0*e.scale))/g0})`});
V.addEventListener('gestureend',e=>{e.preventDefault();P.style.transform='';zoom(g0*e.scale)});
V.addEventListener('wheel',e=>{if(e.ctrlKey){e.preventDefault();zoom(S.zoom*Math.exp(-e.deltaY/200))}},{passive:false});
addEventListener('resize',()=>S.pdf&&vis());

/* ---------- ink ---------- */
function ink(i){const c=S.els[i].querySelector('.ink');if(!c.width)return;const x=c.getContext('2d'),k=c.width/S.sizes[i].w;x.clearRect(0,0,c.width,c.height);A(i).s.forEach(s=>stroke(x,s,k))}
function stroke(x,s,k){const p=s.p;if(!p.length)return;
  if(s.t==='h'){x.save();x.lineCap=x.lineJoin='round';x.globalAlpha=.4;x.strokeStyle=s.c;x.lineWidth=s.w*k;x.beginPath();x.moveTo(p[0][0]*k,p[0][1]*k);p.forEach(q=>x.lineTo(q[0]*k,q[1]*k));if(p.length===1)x.lineTo(p[0][0]*k+.1,p[0][1]*k);x.stroke();x.restore()}
  else for(let j=0;j<p.length;j++)seg(x,s,k,p,j)}
function seg(x,s,k,p,j){const a=p[Math.max(0,j-1)],b=p[j];x.save();x.lineCap=x.lineJoin='round';x.strokeStyle=s.c;x.lineWidth=s.w*k*(.3+1.4*b[2]);x.beginPath();x.moveTo(a[0]*k,a[1]*k);x.lineTo(b[0]*k+(j?0:.01),b[1]*k);x.stroke();x.restore()}
let D=null;
const pt=e=>{const r=D.c.getBoundingClientRect(),k=r.width/S.sizes[D.i].w,raw=e.pointerType==='pen'?(e.pressure||.5):.5;D.pp=D.pp*.5+raw*.5;return[+((e.clientX-r.left)/k).toFixed(2),+((e.clientY-r.top)/k).toFixed(2),+Math.max(.08,D.pp).toFixed(2)]};
V.addEventListener('pointerdown',e=>{
  if(!['pen','hl','er'].includes(S.tool))return;const pg=e.target.closest('.page');if(!pg)return;
  if(e.pointerType==='touch'&&!$('#finger').checked)return;
  const c=pg.querySelector('.ink'),i=+pg.dataset.i;e.preventDefault();c.setPointerCapture(e.pointerId);
  D={i,c,id:e.pointerId,pp:e.pointerType==='pen'?(e.pressure||.5):.5,ch:false,s:S.tool==='er'?null:{t:S.tool==='hl'?'h':'p',c:S.col[S.tool],w:S.w[S.tool],p:[]}};step(e)});
V.addEventListener('pointermove',e=>{if(!D||e.pointerId!==D.id)return;const l=e.getCoalescedEvents?e.getCoalescedEvents():[];(l.length?l:[e]).forEach(step)});
function step(e){const p=pt(e);if(!D.s){erase(p);return}
  D.s.p.push(p);const x=D.c.getContext('2d'),k=D.c.width/S.sizes[D.i].w;
  if(D.s.t==='h'){ink(D.i);stroke(x,D.s,k)}else seg(x,D.s,k,D.s.p,D.s.p.length-1)}
function erase(p){const r=S.w.er/2,a=A(D.i),n=a.s.length;a.s=a.s.filter(s=>!s.p.some(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<r+s.w/2));if(a.s.length!==n){D.ch=true;ink(D.i)}}
function end(e){if(!D||e.pointerId!==D.id)return;if(D.s&&D.s.p.length){A(D.i).s.push(D.s);D.ch=true}const ch=D.ch;D=null;if(ch)commit()}
V.addEventListener('pointerup',end);V.addEventListener('pointercancel',end);
/* Apple Pencil でスクロールさせない（指のスクロールは維持） */
['touchstart','touchmove'].forEach(n=>V.addEventListener(n,e=>{if(['pen','hl','er'].includes(S.tool)&&e.touches[0]&&e.touches[0].touchType==='stylus'&&e.cancelable)e.preventDefault()},{passive:false}));

/* ---------- text boxes ---------- */
V.addEventListener('click',e=>{if(S.tool!=='text')return;const pg=e.target.closest('.page');if(!pg||e.target.closest('.tb'))return;
  const i=+pg.dataset.i,r=pg.getBoundingClientRect(),k=r.width/S.sizes[i].w,t={x:(e.clientX-r.left)/k,y:(e.clientY-r.top)/k,s:S.w.tx,c:S.col.tx,t:''};
  A(i).t.push(t);const d=tbEl(i,t);pg.querySelector('.tl').append(d);d.querySelector('.c').focus()});
function txt(i){const l=S.els[i].querySelector('.tl');l.innerHTML='';A(i).t.forEach(t=>l.append(tbEl(i,t)))}
const pos=(d,t)=>{d.style.cssText=`left:${t.x*S.zoom}px;top:${t.y*S.zoom}px;font-size:${t.s*S.zoom}px;color:${t.c}`};
function tbEl(i,t){const d=document.createElement('div'),c=document.createElement('div');d.className='tb';d.innerHTML='<b class="h">✥</b><b class="x">×</b>';
  c.className='c';c.contentEditable='plaintext-only';c.spellcheck=false;c.textContent=t.t;d.append(c);pos(d,t);d._v=t.t;
  c.addEventListener('input',()=>{t.t=c.innerText.replace(/\n$/,'');save()});
  c.addEventListener('focus',()=>{S.tb={t,d};syncProps()});
  c.addEventListener('blur',()=>{if(!t.t.trim()){A(i).t=A(i).t.filter(x=>x!==t);d.remove()}if(t.t!==d._v){d._v=t.t;commit()}setTimeout(()=>{if(S.tb&&S.tb.t===t&&document.activeElement!==c){S.tb=null;syncProps()}},250)});
  const h=d.querySelector('.h');h.onpointerdown=ev=>{ev.preventDefault();h.setPointerCapture(ev.pointerId);d.classList.add('drag');const sx=ev.clientX,sy=ev.clientY,ox=t.x,oy=t.y;
    h.onpointermove=m=>{t.x=ox+(m.clientX-sx)/S.zoom;t.y=oy+(m.clientY-sy)/S.zoom;pos(d,t)};
    h.onpointerup=()=>{h.onpointermove=h.onpointerup=null;d.classList.remove('drag');commit()}};
  const x=d.querySelector('.x');x.onpointerdown=ev=>ev.preventDefault();x.onclick=()=>{A(i).t=A(i).t.filter(q=>q!==t);d.remove();S.tb=null;commit()};
  return d}

/* ---------- history / save ---------- */
function commit(){S.hist=S.hist.slice(0,S.hi+1);S.hist.push(JSON.stringify(S.ann));if(S.hist.length>40)S.hist.shift();S.hi=S.hist.length-1;btns();save()}
function undo(d){const n=S.hi+d;if(n<0||n>=S.hist.length)return;S.hi=n;S.ann=JSON.parse(S.hist[n]);S.els.forEach((e,i)=>{ink(i);txt(i)});btns();save()}
let st;function save(){clearTimeout(st);st=setTimeout(()=>DB.put('annots',{id:S.id,data:S.ann}).catch(()=>{}),500)}
function btns(){$('#bUndo').disabled=S.hi<=0;$('#bRedo').disabled=S.hi>=S.hist.length-1}
$('#bUndo').onclick=()=>undo(-1);$('#bRedo').onclick=()=>undo(1);

/* ---------- tools / props ---------- */
const tk=()=>S.tb?'tx':{pen:'pen',hl:'hl',er:'er',text:'tx'}[S.tool];
function setTool(t){const same=S.tool===t;S.tool=t;document.body.dataset.tool=t;
  $$('.tool[data-t]').forEach(b=>b.classList.toggle('on',b.dataset.t===t));
  if(t!=='text'&&t!=='select'&&document.activeElement&&document.activeElement.isContentEditable)document.activeElement.blur();
  const pr=$('#props');if(t==='select')pr.classList.add('off');else if(same)pr.classList.toggle('off');else pr.classList.remove('off');syncProps()}
function syncProps(){const k=tk(),pr=$('#props');if(S.tb)pr.classList.remove('off');else if(S.tool==='select'){pr.classList.add('off');return}
  const col=k&&k!=='er'?(S.tb?S.tb.t.c:S.col[k]):null;
  $('#sw').style.display=col?'flex':'none';$$('#sw button').forEach(b=>b.classList.toggle('on',b.dataset.c===col));
  const r=RANGE[k||'pen'],sz=$('#sz');sz.min=r[0];sz.max=r[1];sz.value=S.tb?S.tb.t.s:S.w[k||'pen'];$('#szV').textContent=sz.value;$('#szL').textContent=k==='tx'?'文字サイズ':'太さ'}
$('#sw').innerHTML=COLORS.map(c=>`<button data-c="${c}" style="background:${c}" aria-label="${c}"></button>`).join('');
$('#sw').onclick=e=>{const c=e.target.dataset.c;if(!c)return;if(S.tb){S.tb.t.c=c;S.tb.d.style.color=c;S.col.tx=c;commit()}else S.col[tk()]=c;syncProps()};
$('#sz').oninput=e=>{const v=+e.target.value,k=tk();$('#szV').textContent=v;if(S.tb){S.tb.t.s=v;pos(S.tb.d,S.tb.t);S.w.tx=v;save()}else if(k)S.w[k]=v};
$('#finger').onchange=e=>document.body.classList.toggle('finger',e.target.checked);
$$('.tool[data-t]').forEach(b=>b.onclick=()=>setTool(b.dataset.t));
['#dock','#props'].forEach(s=>$(s).addEventListener('mousedown',e=>{if(e.target.tagName!=='INPUT')e.preventDefault()}));

/* ---------- sidebar thumbnails ---------- */
let thIO;
function thumbs(){const box=$('#thumbs');if(box.childElementCount===S.sizes.length&&box._id===S.id)return;box._id=S.id;box.innerHTML='';thIO&&thIO.disconnect();
  thIO=new IntersectionObserver(es=>es.forEach(async en=>{if(!en.isIntersecting||en.target._d)return;en.target._d=1;const i=+en.target.dataset.i,pg=await S.pdf.getPage(i+1),w=196,v=pg.getViewport({scale:1}),sc=w*2/v.width,vp=pg.getViewport({scale:sc}),c=en.target.querySelector('canvas');c.width=vp.width;c.height=vp.height;pg.render({canvasContext:c.getContext('2d'),viewport:vp})}),{root:$('#side')});
  S.sizes.forEach((s,i)=>{const b=document.createElement('button');b.className='th'+(i===S.cur-1?' on':'');b.dataset.i=i;b.innerHTML=`<canvas style="aspect-ratio:${s.w}/${s.h}"></canvas>${i+1}`;b.onclick=()=>go(i+1);box.append(b);thIO.observe(b)})}
$('#bSide').onclick=()=>{document.body.classList.toggle('side');if(document.body.classList.contains('side'))thumbs()};

/* ---------- toolbar actions ---------- */
$('#bInv').onclick=e=>{document.body.classList.toggle('inv');e.currentTarget.classList.toggle('on')};
const fsOn=()=>document.fullscreenElement||document.webkitFullscreenElement;
$('#bFull').onclick=()=>{document.body.classList.add('imm');document.body.classList.remove('side');const d=document.documentElement,f=d.requestFullscreen||d.webkitRequestFullscreen;try{const r=f&&f.call(d);r&&r.catch&&r.catch(()=>{})}catch(_){}};
$('#exit').onclick=()=>{document.body.classList.remove('imm');if(fsOn())(document.exitFullscreen||document.webkitExitFullscreen).call(document)};
['fullscreenchange','webkitfullscreenchange'].forEach(n=>document.addEventListener(n,()=>{if(!fsOn())document.body.classList.remove('imm')}));
$('#bOpen').onclick=$('#hOpen').onclick=()=>$('#file').click();
$('#file').onchange=e=>{pick(e.target.files[0]);e.target.value=''};
$('#bHome').onclick=()=>{S.pdf=null;document.body.classList.add('nodoc');P.innerHTML='';$('#title').textContent='PDF Studio';$('#props').classList.add('off');recent()};
['dragenter','dragover'].forEach(n=>addEventListener(n,e=>{e.preventDefault();document.body.classList.add('dragover')}));
['dragleave','drop'].forEach(n=>addEventListener(n,e=>{e.preventDefault();document.body.classList.remove('dragover')}));
addEventListener('drop',e=>pick(e.dataTransfer.files[0]));
addEventListener('keydown',e=>{if(!S.pdf||(document.activeElement&&document.activeElement.isContentEditable)||e.target.tagName==='INPUT')return;
  if((e.metaKey||e.ctrlKey)&&e.key==='z'){e.preventDefault();undo(e.shiftKey?1:-1)}
  else if(e.key==='+'||e.key==='=')zoom(S.zoom*1.25);else if(e.key==='-')zoom(S.zoom/1.25);else if(e.key==='ArrowRight')go(S.cur+1);else if(e.key==='ArrowLeft')go(S.cur-1);
  else if(e.key==='Escape')$('#exit').click()});

/* ---------- recent files ---------- */
async function recent(){const box=$('#recent');let l=[];try{l=(await DB.all('files')).sort((a,b)=>b.date-a.date)}catch(_){}
  box.innerHTML=l.length?'<h2>最近のファイル</h2>':'';
  l.forEach(f=>{const b=document.createElement('div');b.className='rc';b.tabIndex=0;b.innerHTML=`<b></b><small>${f.pages}ページ・${fmtSize(f.size)}</small><small>${new Date(f.date).toLocaleDateString('ja-JP')}</small><button class="del" aria-label="削除"><i data-i="trash"></i></button>`;
    b.querySelector('b').textContent=f.name;icons(b);
    b.onclick=async e=>{if(e.target.closest('.del')){e.stopPropagation();if(confirm(`「${f.name}」と書き込みを端末から削除しますか？`)){await DB.del('files',f.id);await DB.del('annots',f.id);recent()}return}
      try{await load(await f.blob.arrayBuffer(),f.name)}catch(_){toast('開けませんでした')}};
    box.append(b)})}
recent();

/* ---------- info ---------- */
const pd=s=>{const m=/^D:(\d{4})(\d\d)?(\d\d)?(\d\d)?(\d\d)?(\d\d)?/.exec(s||'');if(!m)return s||'—';const[,y,mo='01',d='01',h='00',mi='00',se='00']=m;return new Date(+y,mo-1,+d,+h,+mi,+se).toLocaleString('ja-JP')};
function psz(w,h){const mm=[w,h].map(v=>v/72*25.4),L=[['A3',297,420],['A4',210,297],['A5',148,210],['B5',182,257],['レター',216,279],['リーガル',216,356]];
  const f=L.find(([,a,b])=>(Math.abs(mm[0]-a)<3&&Math.abs(mm[1]-b)<3)||(Math.abs(mm[0]-b)<3&&Math.abs(mm[1]-a)<3));
  return`${mm[0].toFixed(0)}×${mm[1].toFixed(0)} mm`+(f?`（${f[0]}${mm[0]>mm[1]?'・横':''}）`:'')}
$('#bInfo').onclick=async()=>{if(!S.pdf)return;const d=$('#info'),i=(S.meta&&S.meta.info)||{},yn=v=>v?'はい':'いいえ',F=pdfjsLib.PermissionFlag||{};
  const pm=await S.pdf.getPermissions().catch(()=>null),att=Object.keys(await S.pdf.getAttachments().catch(()=>null)||{}).length,ol=((await S.pdf.getOutline().catch(()=>null))||[]).length;
  const sz=[...new Set(S.sizes.map(s=>psz(s.w,s.h)))],cp=S.sizes[S.cur-1],st=Object.values(S.ann).reduce((a,x)=>[a[0]+x.s.length,a[1]+x.t.length],[0,0]);
  const G=[['ファイル',[['名前',S.name],['サイズ',fmtSize(S.size)+`（${S.size.toLocaleString()} バイト）`],['ページ数',S.pdf.numPages],['ページサイズ',sz.slice(0,4).join(' / ')+(sz.length>4?' ほか':'')],['現在のページ（'+S.cur+'）',psz(cp.w,cp.h)+`・${cp.w.toFixed(0)}×${cp.h.toFixed(0)} pt`]]],
   ['文書情報',[['タイトル',i.Title],['作成者',i.Author],['件名',i.Subject],['キーワード',i.Keywords],['言語',i.Language],['作成日時',pd(i.CreationDate)],['更新日時',pd(i.ModDate)]]],
   ['作成元',[['作成アプリ',i.Creator],['PDF変換',i.Producer],['PDFバージョン',i.PDFFormatVersion]]],
   ['構造・セキュリティ',[['暗号化・権限設定',pm?'あり':'なし'],...(pm?[['印刷',yn(pm.includes(F.PRINT))],['コピー',yn(pm.includes(F.COPY))],['編集',yn(pm.includes(F.MODIFY_CONTENTS))]]:[]),['しおり（目次）',ol?ol+'件':'なし'],['添付ファイル',att?att+'件':'なし'],['フォーム（AcroForm）',yn(i.IsAcroFormPresent)],['XFAフォーム',yn(i.IsXFAPresent)],['電子署名',yn(i.IsSignaturesPresent)]]],
   ['このアプリでの書き込み',[['ペンの線',st[0]+'本'],['テキストボックス',st[1]+'個']]],
   ['内部情報',[['識別子',S.id],['エンジン','pdf.js '+pdfjsLib.version]]]];
  d.innerHTML=`<div class="dh"><span>PDFの詳細情報</span><button class="ib" id="dx" aria-label="閉じる"><i data-i="close"></i></button></div>`+G.map(([h,r])=>`<div class="ds"><h3>${h}</h3><dl>${r.map(([k,v])=>`<div><dt>${k}</dt><dd>${(v===undefined||v===''||v===null)?'—':String(v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}</dd></div>`).join('')}</dl></div>`).join('');
  icons(d);d.querySelector('#dx').onclick=()=>d.close();d.onclick=e=>{if(e.target===d)d.close()};d.showModal()};

/* ---------- export (annotations flattened into PDF) ---------- */
$('#bExp').onclick=async()=>{if(!S.pdf)return;try{toast('書き出し中…');
  const {PDFDocument}=PDFLib,doc=await PDFDocument.load(S.bytes,{ignoreEncryption:true}),pgs=doc.getPages(),sc=2;let n=0;
  for(const key of Object.keys(S.ann)){const i=+key,a=S.ann[i];if(!a||(!a.s.length&&!a.t.length)||!pgs[i])continue;
    const p=pgs[i],r=p.getRotation().angle%360,cb=p.getCropBox(),s=S.sizes[i];
    const v=document.createElement('canvas');v.width=s.w*sc;v.height=s.h*sc;const x=v.getContext('2d');
    a.s.forEach(q=>stroke(x,q,sc));x.textBaseline='top';
    a.t.forEach(t=>{x.font=`${t.s*sc}px -apple-system,"Hiragino Sans",sans-serif`;x.fillStyle=t.c;t.t.split('\n').forEach((ln,j)=>x.fillText(ln,t.x*sc,(t.y+j*t.s*1.35+t.s*.1)*sc))});
    let o=v;if(r){o=document.createElement('canvas');const W=cb.width*sc,H=cb.height*sc;o.width=W;o.height=H;const y=o.getContext('2d');
      y.setTransform(...(r===90?[0,-1,1,0,0,H]:r===180?[-1,0,0,-1,W,H]:[0,1,-1,0,W,0]));y.drawImage(v,0,0)}
    const img=await doc.embedPng(o.toDataURL('image/png'));p.drawImage(img,{x:cb.x,y:cb.y,width:cb.width,height:cb.height});n++}
  const out=await doc.save(),name=S.name.replace(/\.pdf$/i,'')+(n?'-書き込み済み':'')+'.pdf',f=new File([out],name,{type:'application/pdf'});
  if(navigator.canShare&&navigator.canShare({files:[f]})){try{await navigator.share({files:[f]});return}catch(e){if(e.name==='AbortError')return}}
  const a=document.createElement('a');a.href=URL.createObjectURL(f);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000);toast('保存しました')
}catch(e){console.error(e);toast('書き出しに失敗しました')}};

if('serviceWorker'in navigator)addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));

/* ---------- sidebar tabs / outline / search ---------- */
$$('#stabs button').forEach(b=>b.onclick=()=>{$$('#stabs button').forEach(x=>x.classList.toggle('on',x===b));['thumbs','outl','srch'].forEach(id=>$('#'+id).hidden=id!==b.dataset.p);if(b.dataset.p==='outl')outline();if(b.dataset.p==='srch')$('#sq').focus()});
async function jump(dest){try{const a=typeof dest==='string'?await S.pdf.getDestination(dest):dest;if(!a)return;go((typeof a[0]==='object'?await S.pdf.getPageIndex(a[0]):a[0])+1)}catch(_){}}
async function outline(){const b=$('#outl');if(b._id===S.id)return;b._id=S.id;b.innerHTML='';const o=await S.pdf.getOutline().catch(()=>null);
  if(!o||!o.length){b.innerHTML='<p class="empty">このPDFにはしおり（目次）がありません</p>';return}
  const add=(l,d)=>l.forEach(it=>{const x=document.createElement('button');x.className='ol';x.style.paddingLeft=12+d*16+'px';x.textContent=it.title||'（無題）';x.onclick=()=>jump(it.dest);b.append(x);if(it.items&&it.items.length)add(it.items,d+1)});add(o,0)}
async function ptext(i){if(S.tx[i]===undefined)S.tx[i]=(await(await S.pdf.getPage(i+1)).getTextContent()).items.map(x=>x.str).join(' ');return S.tx[i]}
let sTok=0;
$('#sq').onkeydown=async e=>{if(e.key!=='Enter')return;e.target.blur();const q=e.target.value.trim().toLowerCase(),box=$('#sres'),tok=++sTok;box.innerHTML='';if(!q)return;
  const st=document.createElement('p');st.className='empty';box.append(st);let hits=0,pages=0;
  for(let i=0;i<S.sizes.length;i++){if(tok!==sTok)return;st.textContent=`検索中… ${i+1}/${S.sizes.length}ページ`;
    const t=await ptext(i),l=t.toLowerCase();let n=0,at=l.indexOf(q),first=at;while(at>=0){n++;at=l.indexOf(q,at+q.length)}
    if(!n)continue;hits+=n;pages++;const b=document.createElement('button');b.className='sr';const s=Math.max(0,first-14),h=document.createElement('b');h.textContent=`${i+1}ページ・${n}件`;
    b.append(h,document.createTextNode((s?'…':'')+t.slice(s,first)));const m=document.createElement('mark');m.textContent=t.slice(first,first+q.length);b.append(m,document.createTextNode(t.slice(first+q.length,first+q.length+28)));b.onclick=()=>go(i+1);box.append(b);if(pages>=200)break}
  st.textContent=hits?`${pages}ページで${hits}件見つかりました`:'見つかりませんでした（画像のみのPDFは検索できません）';box.prepend(st)};

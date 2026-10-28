'use strict';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const IC={home:'home',grid:'grid_view',zin:'zoom_in',zout:'zoom_out',moon:'contrast',info:'info',full:'fullscreen',dl:'download',up:'upload_file',up2:'keyboard_arrow_up',dn2:'keyboard_arrow_down',cur:'arrow_selector_tool',pen:'edit',hl:'ink_highlighter',er:'ink_eraser',text:'text_fields',undo:'undo',redo:'redo',close:'close',gear:'settings',more:'more_vert',pages:'description',search:'search',shape:'shapes',check:'check',rotl:'rotate_left',rotr:'rotate_right',left:'chevron_left',right:'chevron_right',copy:'content_copy',plus:'add',merge:'merge',cam:'photo_camera',photo:'image',trash:'delete',hlt:'format_ink_highlighter',ult:'format_underlined',stt:'format_strikethrough',note:'sticky_note_2',cross:'close',dot:'circle',date:'calendar_today',sign:'signature',stamp:'approval',pic:'add_photo_alternate',view:'chrome_reader_mode',comment:'comment',org:'dashboard_customize',tools:'apps'};
function icons(r=document){r.querySelectorAll('i[data-i]').forEach(e=>{e.innerHTML=`<span class="ms">${IC[e.dataset.i]||e.dataset.i}</span>`;e.removeAttribute('data-i')})}
icons();
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

/* ---------- storage (IndexedDB) ---------- */
const DB=(()=>{let p;const open=()=>p||(p=new Promise((res,rej)=>{const r=indexedDB.open('pdfstudio',1);r.onupgradeneeded=()=>{r.result.createObjectStore('files',{keyPath:'id'});r.result.createObjectStore('annots',{keyPath:'id'})};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}));
const tx=async(s,m,f)=>{const d=await open();return new Promise((res,rej)=>{const t=d.transaction(s,m),q=f(t.objectStore(s));t.oncomplete=()=>res(q&&q.result);t.onerror=()=>rej(t.error)})};
return{put:(s,v)=>tx(s,'readwrite',o=>o.put(v)),get:(s,k)=>tx(s,'readonly',o=>o.get(k)),all:s=>tx(s,'readonly',o=>o.getAll()),del:(s,k)=>tx(s,'readwrite',o=>o.delete(k))}})();

/* ---------- state ---------- */
const S={pdf:null,id:'',name:'',bytes:null,size:0,meta:null,zoom:1,sizes:[],els:[],ann:{},hist:[],hi:-1,tool:'select',col:{pen:'#1d1b20',hl:'#ffeb3b',tx:'#1d1b20',ul:'#1565c0',st:'#d32f2f'},w:{pen:3,hl:18,er:14,tx:20},cur:1,tb:null};
S.shape='rect';
const CFG=Object.assign({mode:'auto',seed:'#6750a4',fit:'w',gap:14,sens:1,finger:false,view:'c'},JSON.parse(localStorage.getItem('ps-cfg')||'{}'));
const POS=JSON.parse(localStorage.getItem('ps-pos')||'{}'),DRAW=['pen','hl','er','shape'];
const COLORS=['#1d1b20','#d32f2f','#ef6c00','#fbc02d','#ffeb3b','#2e7d32','#1565c0','#6750a4','#d81b60'];
const RANGE={pen:[1,14],hl:[6,40],er:[6,50],tx:[8,72]};
const A=i=>{const a=S.ann[i]||(S.ann[i]={s:[],t:[],g:[]});if(!a.g)a.g=[];return a};
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
async function thumb(pdf){const pg=await pdf.getPage(1),v=pg.getViewport({scale:1}),vp=pg.getViewport({scale:360/v.width}),c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;await pg.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;return c.toDataURL('image/jpeg',.7)}
async function load(buf,name,ann){
  busy('開いています…');
  try{
    const task=pdfjsLib.getDocument({data:new Uint8Array(buf.slice(0))});
    task.onPassword=(cb,r)=>cb(prompt(r===2?'パスワードが違います。もう一度入力してください':'このPDFのパスワードを入力')||'');
    const pdf=await task.promise,n=pdf.numPages;
    S.tx={};S.pdf=pdf;S.bytes=buf;S.name=name;S.size=buf.byteLength;S.id=pdf.fingerprints[0];
    S.meta=await pdf.getMetadata().catch(()=>({info:{}}));
    S.sizes=[];for(let i=1;i<=(n<=200?n:1);i++){const v=(await pdf.getPage(i)).getViewport({scale:1});S.sizes.push({w:v.width,h:v.height})}
    while(S.sizes.length<n)S.sizes.push(S.sizes[0]);
    const sv=ann?null:await DB.get('annots',S.id).catch(()=>0);S.ann=ann||(sv?sv.data:{});S.hist=[JSON.stringify(S.ann)];S.hi=0;
    document.body.classList.remove('nodoc');$('#title').textContent=name;$('#pTot').textContent='/ '+n;$('#pNum').max=n;
    $('#sres').innerHTML='';$('#sq').value='';S.cur=1;build();S.zoom=1;fit(CFG.fit);btns();setTool('select');setMode('v');
    const sp=POS[S.id];if(sp>1&&S.els[sp-1])V.scrollTop=S.els[sp-1].offsetTop-12;
    const th=await thumb(pdf).catch(()=>'');
    DB.put('files',{id:S.id,name,size:S.size,pages:n,date:Date.now(),thumb:th,blob:new Blob([buf],{type:'application/pdf'})}).catch(()=>{});
    if(ann)save();
  }finally{idle()}
}
function build(){P.innerHTML='';S.els=S.sizes.map((s,i)=>{const e=document.createElement('div');e.className='page';e.dataset.i=i;e.innerHTML='<canvas class="pdf"></canvas><div class="txl"></div><canvas class="ink"></canvas><div class="tl"></div>';P.append(e);sizeEl(i,e);return e});V.scrollTop=0}
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
    const n=e.querySelector('.ink');n.width=vp.width;n.height=vp.height;ink(i);txt(i);textLayer(pg,e,z,k);
  }catch(err){if(!err||err.name!=='RenderingCancelledException'){console.warn(err);if(k===e._k)e._z=null}}
}
function free(e){e._z=null;e._k=(e._k||0)+1;e._t&&e._t.cancel();e.querySelectorAll('canvas').forEach(c=>{c.width=0;c.height=0});e.querySelector('.tl').innerHTML='';e.querySelector('.txl').innerHTML=''}
function vis(){const t=V.scrollTop-800,b=V.scrollTop+V.clientHeight+800;
  S.els.forEach((e,i)=>{const on=e.offsetTop+e.offsetHeight>t&&e.offsetTop<b;if(on){if(e._z!==S.zoom)draw(i)}else if(e.querySelector('.pdf').width>0)free(e)})}
let raf;V.addEventListener('scroll',()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{if(!S.pdf)return;vis();const m=V.scrollTop+V.clientHeight/3;let c=0;S.els.forEach((e,i)=>{if(e.offsetTop<=m)c=i});if(S.cur!==c+1){S.cur=c+1;POS[S.id]=S.cur;clearTimeout(window._pt);window._pt=setTimeout(()=>localStorage.setItem('ps-pos',JSON.stringify(POS)),800);$('#pNum').value=S.cur;$$('.th').forEach((t,i)=>t.classList.toggle('on',i===c))}})},{passive:true});

/* ---------- zoom / nav ---------- */
function zoom(z){z=Math.min(5,Math.max(.25,z));if(!S.pdf||Math.abs(z-S.zoom)<.005)return;
  const cx=(V.scrollLeft+V.clientWidth/2)/V.scrollWidth,cy=(V.scrollTop+V.clientHeight/2)/V.scrollHeight;
  S.zoom=z;S.els.forEach((e,i)=>{sizeEl(i);e._z=null;e._k=(e._k||0)+1});
  V.scrollLeft=cx*V.scrollWidth-V.clientWidth/2;V.scrollTop=cy*V.scrollHeight-V.clientHeight/2;
  $('#zLbl').textContent=Math.round(z*100)+'%';vis()}
const off=()=>innerWidth>=700&&!document.body.classList.contains('imm')&&!document.body.classList.contains('nodoc')?88:0,two=()=>CFG.view==='d';
function fitW(){const s=S.sizes[S.cur-1]||S.sizes[0];const z=(V.clientWidth-32-off()-(two()?CFG.gap:0))/(s.w*(two()?2:1));S.zoom=0;zoom(Math.min(z,3))}
function fitP(){const s=S.sizes[S.cur-1]||S.sizes[0];S.zoom=0;zoom(Math.min((V.clientWidth-32-off()-(two()?CFG.gap:0))/(s.w*(two()?2:1)),(V.clientHeight-170)/s.h,3))}
function fit(m){if(m==='p')fitP();else if(m==='z'){S.zoom=0;zoom(1)}else fitW()}
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
function stroke(x,s,k){if(s.t==='m'){mark(x,s,k);return}const p=s.p;if(!p.length)return;if(s.t==='s'){shape(x,s,k);return}
  if(s.t==='h'){x.save();x.lineCap=x.lineJoin='round';x.globalAlpha=.4;x.strokeStyle=s.c;x.lineWidth=s.w*k;x.beginPath();x.moveTo(p[0][0]*k,p[0][1]*k);p.forEach(q=>x.lineTo(q[0]*k,q[1]*k));if(p.length===1)x.lineTo(p[0][0]*k+.1,p[0][1]*k);x.stroke();x.restore()}
  else for(let j=0;j<p.length;j++)seg(x,s,k,p,j)}
function seg(x,s,k,p,j){const a=p[Math.max(0,j-1)],b=p[j];x.save();x.lineCap=x.lineJoin='round';x.strokeStyle=s.c;x.lineWidth=s.w*k*(1+CFG.sens*(.3+1.4*b[2]-1));x.beginPath();x.moveTo(a[0]*k,a[1]*k);x.lineTo(b[0]*k+(j?0:.01),b[1]*k);x.stroke();x.restore()}
let D=null;
const pt=e=>{const r=D.c.getBoundingClientRect(),k=r.width/S.sizes[D.i].w,raw=e.pointerType==='pen'?(e.pressure||.5):.5;D.pp=D.pp*.5+raw*.5;return[+((e.clientX-r.left)/k).toFixed(2),+((e.clientY-r.top)/k).toFixed(2),+Math.max(.08,D.pp).toFixed(2)]};
V.addEventListener('pointerdown',e=>{
  if(!DRAW.includes(S.tool))return;const pg=e.target.closest('.page');if(!pg)return;
  if(e.pointerType==='touch'&&!$('#finger').checked)return;
  const c=pg.querySelector('.ink'),i=+pg.dataset.i;e.preventDefault();c.setPointerCapture(e.pointerId);
  D={i,c,id:e.pointerId,pp:e.pointerType==='pen'?(e.pressure||.5):.5,ch:false,s:S.tool==='er'?null:S.tool==='shape'?{t:'s',k:S.shape,c:S.col.pen,w:S.w.pen,p:[]}:{t:S.tool==='hl'?'h':'p',c:S.col[S.tool],w:S.w[S.tool],p:[]}};step(e)});
V.addEventListener('pointermove',e=>{if(!D||e.pointerId!==D.id)return;const l=e.getCoalescedEvents?e.getCoalescedEvents():[];(l.length?l:[e]).forEach(step)});
function step(e){const p=pt(e);if(!D.s){erase(p);return}
  if(D.s.t==='s'){D.s.p[0]=D.s.p[0]||p;D.s.p[1]=p;ink(D.i);stroke(D.c.getContext('2d'),D.s,D.c.width/S.sizes[D.i].w);return}D.s.p.push(p);const x=D.c.getContext('2d'),k=D.c.width/S.sizes[D.i].w;
  if(D.s.t==='h'){ink(D.i);stroke(x,D.s,k)}else seg(x,D.s,k,D.s.p,D.s.p.length-1)}
function erase(p){const r=S.w.er/2,a=A(D.i),n=a.s.length;a.s=a.s.filter(s=>!spts(s).some(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<r+s.w/2));if(a.s.length!==n){D.ch=true;ink(D.i)}}
function end(e){if(!D||e.pointerId!==D.id)return;if(D.s&&D.s.p.length&&!(D.s.t==='s'&&(D.s.p.length<2||Math.hypot(D.s.p[1][0]-D.s.p[0][0],D.s.p[1][1]-D.s.p[0][1])<2))){A(D.i).s.push(D.s);D.ch=true}const ch=D.ch;D=null;if(ch)commit()}
V.addEventListener('pointerup',end);V.addEventListener('pointercancel',end);
/* Apple Pencil でスクロールさせない（指のスクロールは維持） */
['touchstart','touchmove'].forEach(n=>V.addEventListener(n,e=>{if(DRAW.includes(S.tool)&&e.touches[0]&&e.touches[0].touchType==='stylus'&&e.cancelable)e.preventDefault()},{passive:false}));

/* ---------- text boxes ---------- */
V.addEventListener('click',e=>{const pg=e.target.closest('.page');if(!pg||e.target.closest('.tb,.gx'))return;
  const i=+pg.dataset.i,r=pg.getBoundingClientRect(),k=r.width/S.sizes[i].w,x=(e.clientX-r.left)/k,y=(e.clientY-r.top)/k;
  if(S.tool==='text'||S.tool==='note'){const t={x,y,s:S.tool==='note'?14:S.w.tx,c:S.tool==='note'?'#1d1b20':S.col.tx,t:''};if(S.tool==='note')t.k='n';
    A(i).t.push(t);const d=tbEl(i,t);pg.querySelector('.tl').append(d);d.querySelector('.c').focus()}
  else if(PLACE.includes(S.tool)&&S.pend){const p=S.pend,w=p.tw,h=w*p.h/p.w,g={x:x-w/2,y:y-h/2,w,h,d:p.d};A(i).g.push(g);pg.querySelector('.tl').append(gEl(i,g));commit()}
  else if(S.tool==='select')$$('.gx.sel').forEach(el=>el.classList.remove('sel'))});
function txt(i){const l=S.els[i].querySelector('.tl');l.innerHTML='';A(i).t.forEach(t=>l.append(tbEl(i,t)));A(i).g.forEach(g=>l.append(gEl(i,g)))}
const pos=(d,t)=>{d.style.cssText=`left:${t.x*S.zoom}px;top:${t.y*S.zoom}px;font-size:${t.s*S.zoom}px;color:${t.c}`};
function tbEl(i,t){const d=document.createElement('div'),c=document.createElement('div');d.className='tb'+(t.k==='n'?' note':'');d.innerHTML='<b class="h"><span class="ms">open_with</span></b><b class="x"><span class="ms">close</span></b>';
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
const tk=()=>S.tb?'tx':{pen:'pen',hl:'hl',er:'er',text:'tx',shape:'pen',hlt:'hl',ult:'ul',stt:'st'}[S.tool];
function setTool(t){const same=S.tool===t;S.tool=t;document.body.dataset.tool=t;S.pend=null;if(PLACE.includes(t))arm(t);
  $$('.tool[data-t]').forEach(b=>b.classList.toggle('on',b.dataset.t===t));
  if(t!=='text'&&t!=='note'&&t!=='select'&&document.activeElement&&document.activeElement.isContentEditable)document.activeElement.blur();
  const pr=$('#props');if(t==='select'||t==='note'||PLACE.includes(t))pr.classList.add('off');else if(same)pr.classList.toggle('off');else pr.classList.remove('off');syncProps()}
function syncProps(){const k=tk(),pr=$('#props');$('#shp').style.display=S.tool==='shape'?'flex':'none';$('#sz').parentNode.style.display=['hlt','ult','stt'].includes(S.tool)?'none':'flex';if(S.tb)pr.classList.remove('off');else if(S.tool==='select'){pr.classList.add('off');return}
  const col=k&&k!=='er'?(S.tb?S.tb.t.c:S.col[k]):null;
  $('#sw').style.display=col?'flex':'none';$$('#sw button').forEach(b=>b.classList.toggle('on',b.dataset.c===col));
  const r=RANGE[k]||RANGE.pen,sz=$('#sz');sz.min=r[0];sz.max=r[1];sz.value=S.tb?S.tb.t.s:S.w[k||'pen'];$('#szV').textContent=sz.value;$('#szL').textContent=k==='tx'?'文字サイズ':'太さ';sv(sz)}
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
$('#bOpen').onclick=()=>$('#file').click();
$('#file').onchange=e=>{pick(e.target.files[0]);e.target.value=''};
$('#bHome').onclick=()=>{S.pdf=null;document.body.classList.add('nodoc');P.innerHTML='';$('#title').textContent='PDF Studio';$('#props').classList.add('off');recent()};
['dragenter','dragover'].forEach(n=>addEventListener(n,e=>{e.preventDefault();document.body.classList.add('dragover')}));
['dragleave','drop'].forEach(n=>addEventListener(n,e=>{e.preventDefault();document.body.classList.remove('dragover')}));
addEventListener('drop',e=>pick(e.dataTransfer.files[0]));
addEventListener('keydown',e=>{if(!S.pdf||(document.activeElement&&document.activeElement.isContentEditable)||e.target.tagName==='INPUT')return;
  if((e.metaKey||e.ctrlKey)&&e.key==='z'){e.preventDefault();undo(e.shiftKey?1:-1)}
  else if(e.key==='+'||e.key==='=')zoom(S.zoom*1.25);else if(e.key==='-')zoom(S.zoom/1.25);else if(e.key==='ArrowRight')go(S.cur+1);else if(e.key==='ArrowLeft')go(S.cur-1);
  else if(e.key==='Escape')$('#exit').click()});

/* ---------- home / recent files ---------- */
let rcSort='date',rcQ='',RC=[];
const rel=t=>{const d=Math.floor((Date.now()-t)/864e5);return d<1?'今日':d<2?'昨日':d<7?d+'日前':new Date(t).toLocaleDateString('ja-JP')};
async function recent(){try{RC=await DB.all('files')}catch(_){RC=[]}paintRecent()}
function mkCard(f,n){const b=document.createElement('div'),pos=Math.min(f.pages,POS[f.id]||1);b.className='rc v'+(n%3);b.tabIndex=0;
  b.innerHTML=`<div class="rth">${f.thumb?`<img alt="" src="${f.thumb}">`:'<i data-i="pages"></i>'}<button class="del" aria-label="削除"><i data-i="trash"></i></button></div><div class="rt"><b></b><small>${f.pages}ページ・${fmtSize(f.size)}</small><small>${rel(f.date)}${pos>1?'・続きから p.'+pos:''}</small></div><div class="prog"><span style="width:${Math.round(pos/f.pages*100)}%"></span></div>`;
  b.querySelector('b').textContent=f.name;icons(b);
  b.onclick=async e=>{if(e.target.closest('.del')){e.stopPropagation();if(confirm(`「${f.name}」と書き込みを端末から削除しますか？`)){await DB.del('files',f.id);await DB.del('annots',f.id);recent()}return}
    try{await load(await f.blob.arrayBuffer(),f.name)}catch(_){toast('開けませんでした')}};
  return b}
function paintRecent(){const box=$('#recent');
  const l=RC.filter(f=>f.name.toLowerCase().includes(rcQ)).sort(rcSort==='name'?(a,b)=>a.name.localeCompare(b.name,'ja'):rcSort==='size'?(a,b)=>b.size-a.size:(a,b)=>b.date-a.date);
  box.innerHTML='';
  if(!l.length){box.innerHTML=`<div class="es"><i data-i="pages"></i><p>${RC.length?'見つかりませんでした':'まだファイルがありません。<br>左上の＋からPDFを開くと、ここに並びます。'}</p></div>`;icons(box);return}
  const big=!rcQ&&l.length>1,head=big?l.slice(0,5):[],rest=big?l.slice(5):l,h2=t=>{const h=document.createElement('h2');h.textContent=t;return h};
  if(head.length){const c=document.createElement('div');c.className='car';head.forEach((f,n)=>c.append(mkCard(f,n)));box.append(h2(rcSort==='date'?'続きから':'並べ替え結果'),c)}
  if(rest.length){const g=document.createElement('div');g.className='grid';rest.forEach((f,n)=>g.append(mkCard(f,n+head.length)));if(head.length)box.append(h2('すべてのファイル'));box.append(g)}}
$('#hq').oninput=e=>{rcQ=e.target.value.toLowerCase();paintRecent()};
$('#hch').onclick=e=>{const b=e.target.closest('button');if(!b)return;rcSort=b.dataset.s;$$('#hch button').forEach(x=>x.classList.toggle('on',x===b));paintRecent()};
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
const loadImg=src=>new Promise((r,j)=>{const i=new Image();i.onload=()=>r(i);i.onerror=j;i.src=src});
async function overlay(a,s,sc){const v=document.createElement('canvas');v.width=s.w*sc;v.height=s.h*sc;const x=v.getContext('2d');
  a.s.forEach(q=>stroke(x,q,sc));
  for(const g of a.g||[]){try{x.drawImage(await loadImg(g.d),g.x*sc,g.y*sc,g.w*sc,g.h*sc)}catch(_){}}
  x.textBaseline='top';
  a.t.forEach(t=>{x.font=`${t.s*sc}px -apple-system,"Hiragino Sans",sans-serif`;const ls=t.t.split('\n'),n=t.k==='n';let ox=0,oy=0;
    if(n){ox=.55*t.s;oy=.4*t.s;const w=Math.max(...ls.map(l=>x.measureText(l).width))/sc;x.fillStyle='#fff59d';x.beginPath();if(x.roundRect)x.roundRect(t.x*sc,t.y*sc,(w+1.1*t.s)*sc,(ls.length*1.35*t.s+.8*t.s)*sc,.6*t.s*sc);else x.rect(t.x*sc,t.y*sc,(w+1.1*t.s)*sc,(ls.length*1.35*t.s+.8*t.s)*sc);x.fill()}
    x.fillStyle=t.c;ls.forEach((ln,j)=>x.fillText(ln,(t.x+ox)*sc,(t.y+oy+j*t.s*1.35+t.s*.1)*sc))});
  return v}
async function bake(doc,ann,sizes){const pgs=doc.getPages(),sc=2;let n=0;
  for(const key of Object.keys(ann)){const i=+key,a=ann[i];if(!a||(!a.s.length&&!a.t.length&&!(a.g&&a.g.length))||!pgs[i])continue;
    const p=pgs[i],r=p.getRotation().angle%360,cb=p.getCropBox(),s=sizes[i],v=await overlay(a,s,sc);
    let o=v;if(r){o=document.createElement('canvas');const W=cb.width*sc,H=cb.height*sc;o.width=W;o.height=H;const y=o.getContext('2d');
      y.setTransform(...(r===90?[0,-1,1,0,0,H]:r===180?[-1,0,0,-1,W,H]:[0,1,-1,0,W,0]));y.drawImage(v,0,0)}
    const img=await doc.embedPng(o.toDataURL('image/png'));p.drawImage(img,{x:cb.x,y:cb.y,width:cb.width,height:cb.height});n++}
  return n}
async function deliver(out,name,type){const f=new File([out],name,{type:type||'application/pdf'});
  if(navigator.canShare&&navigator.canShare({files:[f]})){try{await navigator.share({files:[f]});return}catch(e){if(e.name==='AbortError')return}}
  const a=document.createElement('a');a.href=URL.createObjectURL(f);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000);toast('保存しました')}
$('#bExp').onclick=async()=>{if(!S.pdf)return;busy('書き出し中…');try{const doc=await PDFLib.PDFDocument.load(S.bytes,{ignoreEncryption:true}),n=await bake(doc,S.ann,S.sizes),out=await doc.save();idle();await deliver(out,S.name.replace(/\.pdf$/i,'')+(n?'-書き込み済み':'')+'.pdf')}catch(e){idle();console.error(e);toast('書き出しに失敗しました')}};

if('serviceWorker'in navigator)addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));

/* ---------- sidebar tabs / outline / search ---------- */
$$('#stabs button').forEach(b=>b.onclick=()=>{$$('#stabs button').forEach(x=>x.classList.toggle('on',x===b));['thumbs','outl','srch','cmt'].forEach(id=>$('#'+id).hidden=id!==b.dataset.p);if(b.dataset.p==='outl')outline();if(b.dataset.p==='cmt')comments();if(b.dataset.p==='srch')$('#sq').focus()});
async function jump(dest){try{const a=typeof dest==='string'?await S.pdf.getDestination(dest):dest;if(!a)return;go((typeof a[0]==='object'?await S.pdf.getPageIndex(a[0]):a[0])+1)}catch(_){}}
async function outline(){const b=$('#outl');if(b._id===S.id)return;b._id=S.id;b.innerHTML='';const o=await S.pdf.getOutline().catch(()=>null);
  if(!o||!o.length){b.innerHTML='<p class="empty">このPDFにはしおり（目次）がありません</p>';return}
  const add=(l,d)=>l.forEach(it=>{const x=document.createElement('button');x.className='ol';x.style.paddingLeft=12+d*16+'px';x.textContent=it.title||'（無題）';x.onclick=()=>jump(it.dest);b.append(x);if(it.items&&it.items.length)add(it.items,d+1)});add(o,0)}
async function ptext(i){if(S.tx[i]===undefined)S.tx[i]=(await(await S.pdf.getPage(i+1)).getTextContent()).items.map(x=>x.str).join(' ');return S.tx[i]}
let sTok=0;
$('#sq').onkeydown=async e=>{if(e.key!=='Enter')return;e.target.blur();const q=e.target.value.trim().toLowerCase(),box=$('#sres'),tok=++sTok;box.innerHTML='';if(!q)return;
  const st=document.createElement('p');st.className='empty';const lp=document.createElement('div');lp.className='lp';lp.innerHTML='<i class="lpf"></i>';box.append(st,lp);let hits=0,pages=0;
  for(let i=0;i<S.sizes.length;i++){if(tok!==sTok)return;st.textContent=`検索中… ${i+1}/${S.sizes.length}ページ`;lp.firstChild.style.width=((i+1)/S.sizes.length*100)+'%';
    const t=await ptext(i),l=t.toLowerCase();let n=0,at=l.indexOf(q),first=at;while(at>=0){n++;at=l.indexOf(q,at+q.length)}
    if(!n)continue;hits+=n;pages++;const b=document.createElement('button');b.className='sr';const s=Math.max(0,first-14),h=document.createElement('b');h.textContent=`${i+1}ページ・${n}件`;
    b.append(h,document.createTextNode((s?'…':'')+t.slice(s,first)));const m=document.createElement('mark');m.textContent=t.slice(first,first+q.length);b.append(m,document.createTextNode(t.slice(first+q.length,first+q.length+28)));b.onclick=()=>go(i+1);box.append(b);if(pages>=200)break}
  st.textContent=hits?`${pages}ページで${hits}件見つかりました`:'見つかりませんでした（画像のみのPDFは検索できません）';lp.remove();$('#stabs [data-p=srch]').innerHTML='検索'+(hits?`<b class="bd">${hits>99?'99+':hits}</b>`:'');box.prepend(st)};

/* ---------- shapes ---------- */
function shape(x,s,k){const[a,b]=s.p;if(!b)return;const x0=a[0]*k,y0=a[1]*k,x1=b[0]*k,y1=b[1]*k;
  x.save();x.lineCap=x.lineJoin='round';x.strokeStyle=s.c;x.lineWidth=s.w*k;x.beginPath();
  if(s.k==='rect')x.rect(x0,y0,x1-x0,y1-y0);
  else if(s.k==='ell')x.ellipse((x0+x1)/2,(y0+y1)/2,Math.abs(x1-x0)/2,Math.abs(y1-y0)/2,0,0,7);
  else{x.moveTo(x0,y0);x.lineTo(x1,y1);if(s.k==='arrow'){const an=Math.atan2(y1-y0,x1-x0),L=Math.max(10*k,s.w*k*4);[-1,1].forEach(m=>{x.moveTo(x1,y1);x.lineTo(x1+L*Math.cos(an+Math.PI+m*.45),y1+L*Math.sin(an+Math.PI+m*.45))})}}
  x.stroke();x.restore()}
function spts(s){if(s.t==='m')return s.r.flatMap(r=>{const o=[];for(let i=0;i<=8;i++)o.push([r[0]+r[2]*i/8,r[1]+r[3]/2]);return o});if(s.t!=='s')return s.p;const[a,b]=s.p;if(!b)return s.p;const o=[];
  for(let i=0;i<=40;i++){const t=i/40;let x,y;
    if(s.k==='rect'){const u=t*4,e=Math.floor(u)%4,f=u-Math.floor(u),X0=a[0],Y0=a[1],X1=b[0],Y1=b[1];[x,y]=[[X0+(X1-X0)*f,Y0],[X1,Y0+(Y1-Y0)*f],[X1-(X1-X0)*f,Y1],[X0,Y1-(Y1-Y0)*f]][e]}
    else if(s.k==='ell'){x=(a[0]+b[0])/2+Math.cos(t*6.283)*(b[0]-a[0])/2;y=(a[1]+b[1])/2+Math.sin(t*6.283)*(b[1]-a[1])/2}
    else{x=a[0]+(b[0]-a[0])*t;y=a[1]+(b[1]-a[1])*t}
    o.push([x,y])}return o}
$('#shp').onclick=e=>{const b=e.target.closest('button');if(!b)return;S.shape=b.dataset.k;$$('#shp button').forEach(x=>x.classList.toggle('on',x===b))};

/* ---------- busy / slider fill / menu ---------- */
let bc=0;
function busy(m){bc++;$('#busyT').textContent=m||'';$('#busy').classList.add('on')}
function idle(){bc=Math.max(0,bc-1);if(!bc)$('#busy').classList.remove('on')}
function sv(el){el.style.setProperty('--v',(el.value-el.min)/(el.max-el.min)*100+'%')}
document.addEventListener('input',e=>{if(e.target.type==='range')sv(e.target)});
const menu=$('#menu');
$('#bMore').onclick=e=>{e.stopPropagation();menu.classList.toggle('off')};
addEventListener('click',e=>{if(!e.target.closest('#bMore'))menu.classList.add('off')});

/* ---------- dynamic theme (OKLCH tonal palette from a seed colour) ---------- */
const lin=(L,C,h)=>{const a=C*Math.cos(h*Math.PI/180),b=C*Math.sin(h*Math.PI/180),l=(L+.3963377774*a+.2158037573*b)**3,m=(L-.1055613458*a-.0638541728*b)**3,s=(L-.0894841775*a-1.291485548*b)**3;return[4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.707614701*s]};
const enc=v=>{v=Math.min(1,Math.max(0,v));return Math.round(255*(v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055))};
const tn=(h,C,T)=>{const L=(T/100)**.75;let c=C,v;for(;c>0;c-=.004){v=lin(L,c,h);if(v.every(x=>x>-.001&&x<1.001))break}if(c<=0)v=lin(L,0,h);return'#'+v.map(x=>enc(x).toString(16).padStart(2,'0')).join('')};
function seedOf(hex){const r=[1,3,5].map(i=>parseInt(hex.substr(i,2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4),l=Math.cbrt(.4122214708*r[0]+.5363325363*r[1]+.0514459929*r[2]),m=Math.cbrt(.2119034982*r[0]+.6806995451*r[1]+.1073969566*r[2]),s=Math.cbrt(.0883024619*r[0]+.2817188376*r[1]+.6299787005*r[2]),a=1.9779984951*l-2.428592205*m+.4505937099*s,b=.0259040371*l+.7827717662*m-.808675766*s;return{h:(Math.atan2(b,a)*180/Math.PI+360)%360,c:Math.hypot(a,b)}}
function applyTheme(){const{h,c}=seedOf(CFG.seed),Cp=Math.min(.16,Math.max(.07,c)),dark=CFG.mode==='dark'||(CFG.mode==='auto'&&matchMedia('(prefers-color-scheme:dark)').matches),
  t=dark?{pr:80,onpr:20,prc:30,onprc:90,bg:6,sf:12,sfh:17,sfhh:22,on:90,onv:80,out:30,vbg:4,sc:30,tc:30}:{pr:40,onpr:100,prc:90,onprc:10,bg:98,sf:94,sfh:92,sfhh:90,on:10,onv:30,out:80,vbg:88,sc:90,tc:90},
  v={'--pr':tn(h,Cp,t.pr),'--onpr':tn(h,Cp,t.onpr),'--prc':tn(h,Cp*.55,t.prc),'--onprc':tn(h,Cp,t.onprc),'--bg':tn(h,.008,t.bg),'--sf':tn(h,.012,t.sf),'--sfh':tn(h,.012,t.sfh),'--sfhh':tn(h,.014,t.sfhh),'--on':tn(h,.01,t.on),'--onv':tn(h,.02,t.onv),'--out':tn(h,.02,t.out),'--vbg':tn(h,.014,t.vbg),'--sc':tn(h,Cp*.3,t.sc),'--tc':tn(h+60,Cp*.5,t.tc),'--ontc':tn(h+60,Cp,dark?90:10),'--sh':dark?'0 6px 20px rgba(0,0,0,.55)':'0 6px 20px rgba(0,0,0,.2)'},
  r=document.documentElement;Object.keys(v).forEach(k=>r.style.setProperty(k,v[k]));r.style.colorScheme=dark?'dark':'light';
  document.querySelector('meta[name=theme-color]').content=v['--bg']}
matchMedia('(prefers-color-scheme:dark)').addEventListener('change',()=>CFG.mode==='auto'&&applyTheme());
applyTheme();$('#finger').checked=CFG.finger;document.body.classList.toggle('finger',CFG.finger);P.style.gap=CFG.gap+'px';P.classList.toggle('two',CFG.view==='d');

/* ---------- settings ---------- */
const SEEDS=['#6750a4','#0b57d0','#00796b','#2e7d32','#b3261e','#e8710a','#c2185b','#5d4037','#455a64'];
const saveCfg=()=>localStorage.setItem('ps-cfg',JSON.stringify(CFG));
function renderSet(){const d=$('#set'),st=d.scrollTop;
  const sg=(k,o)=>`<nav class="seg" data-k="${k}">${o.map(([v,l])=>{const on=String(CFG[k])===String(v);return`<button data-v="${v}" class="${on?'on':''}">${on?'✓ ':''}${l}</button>`}).join('')}</nav>`;
  d.innerHTML=`<div class="dh"><span>設定</span><button class="ib" id="sx" aria-label="閉じる"><i data-i="close"></i></button></div>
  <section class="ds st"><h3>テーマ</h3><p class="li">モード</p>${sg('mode',[['auto','自動'],['light','ライト'],['dark','ダーク']])}<p class="li">テーマカラー（アプリ全体の配色が変わります）</p>
    <nav id="seeds">${SEEDS.map(c=>`<button data-c="${c}" style="background:${c}" class="${c.toLowerCase()===CFG.seed.toLowerCase()?'on':''}" aria-label="${c}"></button>`).join('')}<label class="cust" title="好きな色"><input type="color" id="cseed" value="${CFG.seed}"></label></nav></section>
  <section class="ds st"><h3>表示</h3><p class="li">ファイルを開いたときの表示</p>${sg('fit',[['w','幅に合わせる'],['p','ページ全体'],['z','100%']])}<p class="li">ページの間隔</p>${sg('gap',[[6,'狭い'],[14,'標準'],[30,'広い']])}<p class="li">ページ表示</p>${sg('view',[['c','連続スクロール'],['d','見開き（2ページ）']])}</section>
  <section class="ds st"><h3>ペン</h3><label class="row"><span style="min-width:96px">筆圧の強さ</span><input id="sens" type="range" min="0" max="150" value="${Math.round(CFG.sens*100)}"><output id="sensV">${Math.round(CFG.sens*100)}%</output></label>
    <label class="row"><span style="min-width:96px">指でも描く</span><input id="cfinger" type="checkbox" class="switch" ${CFG.finger?'checked':''}></label><p class="li">筆圧0%で一定の太さ、100%が標準、150%で強弱が大きくなります。</p></section>
  <section class="ds st"><h3>データ</h3><p class="li" id="stor">使用量を計算中…</p><nav class="btns"><button class="tonal" id="clrRecent">最近のファイルを削除</button><button class="tonal" id="clrAnn">書き込みを全て削除</button></nav></section>
  <section class="ds st"><h3>アプリについて</h3><p class="li">PDF Studio ・ pdf.js ${pdfjsLib.version}</p></section>`;
  icons(d);d.querySelectorAll('input[type=range]').forEach(sv);d.scrollTop=st}
$('#set').addEventListener('click',e=>{const t=e.target,d=$('#set');
  if(t===d||t.closest('#sx')){d.close();return}
  const sb=t.closest('.seg button');if(sb){const k=sb.parentNode.dataset.k,v=sb.dataset.v;CFG[k]=isNaN(+v)?v:+v;saveCfg();if(k==='mode')applyTheme();if(k==='gap')P.style.gap=CFG.gap+'px';if(k==='view'){applyView();if(S.pdf)fit(CFG.fit)}renderSet();return}
  const sd=t.closest('#seeds button[data-c]');if(sd){CFG.seed=sd.dataset.c;saveCfg();applyTheme();renderSet();return}
  if(t.id==='clrRecent'&&confirm('最近のファイルをすべて削除しますか？（書き込みは残ります）'))DB.all('files').then(l=>Promise.all(l.map(f=>DB.del('files',f.id)))).then(()=>{recent();toast('削除しました')});
  if(t.id==='clrAnn'&&confirm('すべての書き込みを削除しますか？'))DB.all('annots').then(l=>Promise.all(l.map(f=>DB.del('annots',f.id)))).then(()=>toast('削除しました'))});
$('#set').addEventListener('input',e=>{const t=e.target;
  if(t.id==='cseed'){CFG.seed=t.value;applyTheme();saveCfg()}
  if(t.id==='sens'){CFG.sens=t.value/100;$('#sensV').textContent=t.value+'%';saveCfg()}
  if(t.id==='cfinger'){CFG.finger=t.checked;saveCfg();$('#finger').checked=t.checked;document.body.classList.toggle('finger',t.checked)}});
$('#set').addEventListener('change',e=>{if(e.target.id==='cseed')renderSet()});
$('#bSet').onclick=()=>{renderSet();$('#set').showModal();if(navigator.storage&&navigator.storage.estimate)navigator.storage.estimate().then(r=>{const s=$('#stor');if(s)s.textContent='このアプリの使用量: '+fmtSize(r.usage||0)+(r.quota?'（上限の目安 '+fmtSize(r.quota)+'）':'')})};

/* ---------- page organizer (edit document) ---------- */
const O={items:[],docs:[]};
const ov=it=>it.rot%180?{w:it.h,h:it.w}:{w:it.w,h:it.h};
function rotAnn(a,w,h,rot){for(let n=0;n<rot/90;n++){const hh=h,f=(x,y)=>[hh-y,x];a.s.forEach(s=>s.p.forEach(q=>{[q[0],q[1]]=f(q[0],q[1])}));a.t.forEach(t=>{[t.x,t.y]=f(t.x,t.y)});a.g.forEach(g=>{[g.x,g.y]=f(g.x,g.y)});a.s.forEach(s=>{if(s.t==='m')s.r=s.r.map(([x,y,ww,hh])=>{const p=f(x,y),q=f(x+ww,y+hh);return[Math.min(p[0],q[0]),Math.min(p[1],q[1]),Math.abs(p[0]-q[0]),Math.abs(q[1]-p[1])]})});[w,h]=[h,w]}return a}
function orgOpen(){if(!S.pdf)return;O.docs=[{pdf:S.pdf,bytes:S.bytes}];O.items=S.sizes.map((s,i)=>({d:0,i,rot:0,w:s.w,h:s.h,sel:false}));$('#org').classList.add('open');orgPaint()}
const cnt=()=>{const n=O.items.filter(i=>i.sel).length;$('#oTitle').textContent=`ページを整理（${O.items.length}ページ${n?`・${n}選択`:''}）`};
function orgPaint(){const g=$('#ogrid');g.innerHTML='';
  O.items.forEach((it,n)=>{const c=document.createElement('button');c.className='oc'+(it.sel?' on':'');
    if(!it._cv){it._cv=document.createElement('canvas');othumb(it)}
    const v=ov(it);it._cv.style.aspectRatio=v.w+'/'+v.h;c.append(it._cv);
    const l=document.createElement('span');l.textContent=it.blank?`${n+1}（白紙）`:n+1;c.append(l);
    c.onclick=()=>{it.sel=!it.sel;c.classList.toggle('on',it.sel);cnt()};g.append(c)});cnt()}
async function othumb(it){const c=it._cv;try{
  if(it.blank){const v=ov(it);c.width=160;c.height=Math.round(160*v.h/v.w);const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);return}
  const pg=await O.docs[it.d].pdf.getPage(it.i+1),rt=(pg.rotate+it.rot)%360,v0=pg.getViewport({scale:1,rotation:rt}),vp=pg.getViewport({scale:300/v0.width,rotation:rt});
  c.width=vp.width;c.height=vp.height;await pg.render({canvasContext:c.getContext('2d'),viewport:vp}).promise}catch(_){}}
async function orgBuild(items){const{PDFDocument,degrees}=PDFLib,out=await PDFDocument.create(),cache=[];
  for(const it of items){if(it.blank){const v=ov(it);out.addPage([v.w,v.h]);continue}
    const src=cache[it.d]||(cache[it.d]=await PDFDocument.load(O.docs[it.d].bytes,{ignoreEncryption:true})),[p]=await out.copyPages(src,[it.i]);
    if(it.rot)p.setRotation(degrees((p.getRotation().angle+it.rot)%360));out.addPage(p)}
  const ann={};items.forEach((it,n)=>{const a=S.ann[it.i];if(it.d===0&&!it.blank&&a&&(a.s.length||a.t.length||a.g&&a.g.length))ann[n]=rotAnn(JSON.parse(JSON.stringify(a)),it.w,it.h,it.rot)});
  return{out,ann,sizes:items.map(ov)}}
$('#ochips').onclick=async e=>{const a=e.target.closest('button')&&e.target.closest('button').dataset.a;if(!a)return;let I=O.items;const sel=I.filter(i=>i.sel);
  if(a==='all'){const v=sel.length!==I.length;I.forEach(i=>i.sel=v)}
  else if(a==='rl'||a==='rr')sel.forEach(i=>{i.rot=(i.rot+(a==='rr'?90:270))%360;i._cv=null});
  else if(a==='dup'){const o=[];I.forEach(i=>{o.push(i);if(i.sel)o.push({...i,sel:false,_cv:null})});O.items=o}
  else if(a==='del'){if(!sel.length)toast('削除するページを選んでください');else if(sel.length===I.length)toast('すべてのページは削除できません');else if(confirm(`${sel.length}ページを削除しますか？`))O.items=I.filter(i=>!i.sel)}
  else if(a==='l'){for(let n=1;n<I.length;n++)if(I[n].sel&&!I[n-1].sel)[I[n-1],I[n]]=[I[n],I[n-1]]}
  else if(a==='r'){for(let n=I.length-2;n>=0;n--)if(I[n].sel&&!I[n+1].sel)[I[n+1],I[n]]=[I[n],I[n+1]]}
  else if(a==='blank'){const ref=sel[sel.length-1]||I[I.length-1],v=ov(ref);I.splice(I.indexOf(ref)+1,0,{d:-1,blank:true,i:0,rot:0,w:v.w,h:v.h,sel:false})}
  else if(a==='merge'){$('#file2').click();return}
  else if(a==='ext'){if(!sel.length){toast('書き出すページを選んでください');return}busy('書き出し中…');try{const{out,ann,sizes}=await orgBuild(sel),n=await bake(out,ann,sizes),u=await out.save();idle();await deliver(u,S.name.replace(/\.pdf$/i,'')+'-抜粋.pdf')}catch(err){idle();console.error(err);toast('書き出せませんでした')}return}
  orgPaint()};
$('#file2').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;busy('読み込み中…');
  try{const buf=/^image\//.test(f.type)?await img2pdf(f):await f.arrayBuffer(),task=pdfjsLib.getDocument({data:new Uint8Array(buf.slice(0))});task.onPassword=(cb)=>cb(prompt('このPDFのパスワードを入力')||'');
    const pdf=await task.promise,d=O.docs.push({pdf,bytes:buf})-1,I=O.items,at=I.reduce((m,x,n)=>x.sel?n+1:m,I.length),add=[];
    for(let i=0;i<Math.min(pdf.numPages,500);i++){const v=(await pdf.getPage(i+1)).getViewport({scale:1});add.push({d,i,rot:0,w:v.width,h:v.height,sel:false})}
    I.splice(at,0,...add);orgPaint();toast(`${add.length}ページを挿入しました`)}catch(err){console.error(err);toast('挿入できませんでした')}finally{idle()}};
$('#oApply').onclick=async()=>{busy('適用中…');try{const{out,ann}=await orgBuild(O.items),u=await out.save(),nm=/編集済み/.test(S.name)?S.name:S.name.replace(/\.pdf$/i,'')+'-編集済み.pdf';
  $('#org').classList.remove('open');await load(u.buffer.slice(u.byteOffset,u.byteOffset+u.byteLength),nm,ann);toast('編集内容を適用しました')}catch(err){console.error(err);toast('適用できませんでした')}finally{idle()}};
$('#bOrg').onclick=orgOpen;$('#oClose').onclick=()=>$('#org').classList.remove('open');

/* ---------- FAB menu / rail / side sheet / loading shape ---------- */
const fm=$('#fabm');
function fabToggle(e){if(e)e.stopPropagation();fm.classList.toggle('off');document.body.classList.toggle('fabopen',!fm.classList.contains('off'))}
$('#fab').onclick=$('#rfab').onclick=fabToggle;
const FI={pdf:'#file',img:'#fileImg',cam:'#fileCam'};
fm.onclick=e=>{const b=e.target.closest('button');if(!b)return;$(FI[b.dataset.f]).click();fabToggle()};
addEventListener('click',e=>{if(!fm.classList.contains('off')&&!e.target.closest('#fabm,#fab,#rfab'))fabToggle()});
['fileImg','fileCam'].forEach(id=>$('#'+id).onchange=e=>{pick(e.target.files[0]);e.target.value=''});
$('#rSet').onclick=()=>$('#bSet').click();
$('#sClose').onclick=()=>document.body.classList.remove('side');
(function(){const mk=a=>'polygon('+Array.from({length:96},(_,i)=>{const t=i/96*6.2832,r=50*(1+a*Math.cos(12*t))/(1+a);return(50+r*Math.sin(t)).toFixed(1)+'% '+(50-r*Math.cos(t)).toFixed(1)+'%'}).join(',')+')',r=document.documentElement.style;r.setProperty('--cA',mk(.17));r.setProperty('--cB',mk(.05))})();

/* ================= Acrobat-style modes / markup / stamps / tools ================= */
const PLACE=['check','cross','dot','date','sign','stamp','pic'];
function setMode(m){S.mode=m;document.body.dataset.mode=m;$$('#drail .ri[data-m]').forEach(b=>b.classList.toggle('on',b.dataset.m===m));setTool('select')}
$$('#drail .ri[data-m]').forEach(b=>b.onclick=()=>setMode(b.dataset.m));
$('#dOrg').onclick=orgOpen;
function applyView(){P.classList.toggle('two',CFG.view==='d')}

/* text layer (selection / copy / text markup) */
async function textLayer(pg,e,z,k){try{const tc=await pg.getTextContent();if(k!==e._k)return;const tl=e.querySelector('.txl');tl.innerHTML='';tl.style.setProperty('--scale-factor',z);
  await pdfjsLib.renderTextLayer({textContentSource:tc,textContent:tc,container:tl,viewport:pg.getViewport({scale:z}),textDivs:[]}).promise}catch(_){}}
function mark(x,s,k){x.save();x.fillStyle=x.strokeStyle=s.c;
  s.r.forEach(([a,b,w,h])=>{if(s.k==='hl'){x.globalAlpha=.4;x.fillRect(a*k,b*k,w*k,h*k)}else{x.lineWidth=Math.max(1.2,h*.08*k);x.lineCap='round';const y=(s.k==='ul'?b+h*.96:b+h*.55)*k;x.beginPath();x.moveTo(a*k,y);x.lineTo((a+w)*k,y);x.stroke()}});x.restore()}
let selT;document.addEventListener('selectionchange',()=>{if(!['hlt','ult','stt'].includes(S.tool))return;clearTimeout(selT);selT=setTimeout(applyMark,500)});
function applyMark(){const sel=getSelection();if(!sel||sel.isCollapsed||!sel.rangeCount)return;
  const rs=[...sel.getRangeAt(0).getClientRects()].filter(r=>r.width>1&&r.height>2);if(!rs.length)return;
  const k={hlt:'hl',ult:'ul',stt:'st'}[S.tool],by={};
  S.els.forEach((e,i)=>{const pr=e.getBoundingClientRect(),sc=pr.width/S.sizes[i].w;
    rs.forEach(r=>{const cx=r.left+r.width/2,cy=r.top+r.height/2;if(cx>=pr.left&&cx<=pr.right&&cy>=pr.top&&cy<=pr.bottom&&r.height<pr.height*.2)(by[i]=by[i]||[]).push([+((r.left-pr.left)/sc).toFixed(1),+((r.top-pr.top)/sc).toFixed(1),+(r.width/sc).toFixed(1),+(r.height/sc).toFixed(1)])})});
  let ch=false;
  Object.keys(by).forEach(i=>{let a=by[i];a=a.filter((r,n)=>!a.some((q,m)=>m!==n&&q[0]<=r[0]+.5&&q[1]<=r[1]+.5&&q[0]+q[2]>=r[0]+r[2]-.5&&q[1]+q[3]>=r[1]+r[3]-.5&&(q[2]*q[3]>r[2]*r[3]||m<n)));
    if(a.length){A(i).s.push({t:'m',k,c:S.col[k],r:a,p:[],w:6});ch=true;ink(+i)}});
  sel.removeAllRanges();if(ch)commit()}

/* comments list */
function comments(){const b=$('#cmt');b.innerHTML='';let n=0;
  const add=(i,t)=>{n++;const x=document.createElement('button');x.className='sr';x.innerHTML=`<b>${i+1}ページ</b>`;const sp=document.createElement('span');sp.textContent=t;x.append(sp);x.onclick=()=>go(i+1);b.append(x)};
  Object.keys(S.ann).map(Number).sort((a,c)=>a-c).forEach(i=>{const a=A(i);
    a.t.forEach(t=>add(i,(t.k==='n'?'付箋: ':'テキスト: ')+(t.t||'（空）')));
    a.s.forEach(s=>{if(s.t==='m')add(i,{hl:'ハイライト',ul:'下線',st:'取り消し線'}[s.k])});
    a.g.forEach(()=>add(i,'スタンプ・署名・画像'))});
  if(!n)b.innerHTML='<p class="empty">コメントはまだありません</p>'}

/* stamps / signature / fill & sign */
function glyph(txt,color,size,target){const c=document.createElement('canvas'),x=c.getContext('2d'),f=`700 ${size}px -apple-system,"Hiragino Sans",sans-serif`;x.font=f;
  const w=Math.ceil(x.measureText(txt).width)+16,h=Math.ceil(size*1.3);c.width=w;c.height=h;const y=c.getContext('2d');y.font=f;y.fillStyle=color;y.textBaseline='middle';y.fillText(txt,8,h/2+size*.04);
  return{d:c.toDataURL('image/png'),w,h,tw:w*target/size}}
function stampImg(txt,color){const c=document.createElement('canvas'),x=c.getContext('2d'),f='800 64px -apple-system,"Hiragino Sans",sans-serif';x.font=f;
  const w=Math.ceil(x.measureText(txt).width)+56,h=108;c.width=w;c.height=h;const y=c.getContext('2d');y.strokeStyle=y.fillStyle=color;y.lineWidth=8;y.beginPath();
  if(y.roundRect)y.roundRect(6,6,w-12,h-12,18);else y.rect(6,6,w-12,h-12);y.stroke();y.font=f;y.textBaseline='middle';y.textAlign='center';y.fillText(txt,w/2,h/2+3);
  return{d:c.toDataURL('image/png'),w,h,tw:w*.4}}
function arm(t){
  if(t==='check')S.pend=glyph('✓','#1d1b20',120,22);
  else if(t==='cross')S.pend=glyph('✕','#1d1b20',120,20);
  else if(t==='dot')S.pend=glyph('●','#1d1b20',120,14);
  else if(t==='date')S.pend=glyph(new Date().toLocaleDateString('ja-JP'),'#1d1b20',64,12);
  else if(t==='sign'){const g=JSON.parse(localStorage.getItem('ps-sig')||'null');if(g)S.pend={...g,tw:150};else{sigOpen();return}}
  else if(t==='stamp'){stampOpen();return}
  else if(t==='pic'){$('#fileG').click();return}
  toast('置きたい場所をタップ')}
function gEl(i,g){const d=document.createElement('div');d.className='gx';const im=new Image();im.src=g.d;d.append(im);
  d.insertAdjacentHTML('beforeend','<b class="h"><span class="ms">open_with</span></b><b class="x"><span class="ms">close</span></b><b class="r"><span class="ms">zoom_out_map</span></b>');
  const ps=()=>{d.style.cssText=`left:${g.x*S.zoom}px;top:${g.y*S.zoom}px;width:${g.w*S.zoom}px;height:${g.h*S.zoom}px`};ps();
  d.addEventListener('click',e=>{if(e.target.closest('b'))return;const on=d.classList.contains('sel');$$('.gx.sel').forEach(x=>x.classList.remove('sel'));if(!on)d.classList.add('sel')});
  const h=d.querySelector('.h');h.onpointerdown=ev=>{ev.preventDefault();h.setPointerCapture(ev.pointerId);d.classList.add('drag');const sx=ev.clientX,sy=ev.clientY,ox=g.x,oy=g.y;
    h.onpointermove=m=>{g.x=ox+(m.clientX-sx)/S.zoom;g.y=oy+(m.clientY-sy)/S.zoom;ps()};h.onpointerup=()=>{h.onpointermove=h.onpointerup=null;d.classList.remove('drag');commit()}};
  const r=d.querySelector('.r');r.onpointerdown=ev=>{ev.preventDefault();r.setPointerCapture(ev.pointerId);d.classList.add('drag');const sx=ev.clientX,w0=g.w,ar=g.h/g.w;
    r.onpointermove=m=>{g.w=Math.max(12,w0+(m.clientX-sx)/S.zoom);g.h=g.w*ar;ps()};r.onpointerup=()=>{r.onpointermove=r.onpointerup=null;d.classList.remove('drag');commit()}};
  d.querySelector('.x').onclick=()=>{A(i).g=A(i).g.filter(q=>q!==g);d.remove();commit()};
  return d}
function sigOpen(){const d=$('#sig');
  d.innerHTML='<div class="dh"><span>署名を書く</span><button class="ib" id="sgx" aria-label="閉じる"><i data-i="close"></i></button></div><div class="sgw"><canvas id="sgc" width="900" height="360"></canvas><p class="li">Apple Pencilや指で書いてください。保存した署名はこの端末だけに残ります。</p></div><nav class="btns" style="padding:0 24px 22px"><button class="tonal" id="sgClr">消去</button><button class="fabx" id="sgOk"><i data-i="check"></i>この署名を使う</button></nav>';
  icons(d);const c=$('#sgc'),x=c.getContext('2d');x.lineCap=x.lineJoin='round';let dn=false,l;
  const pt=e=>{const r=c.getBoundingClientRect();return[(e.clientX-r.left)*c.width/r.width,(e.clientY-r.top)*c.height/r.height,e.pointerType==='pen'?(e.pressure||.5):.5]};
  c.onpointerdown=e=>{dn=true;l=pt(e);c.setPointerCapture(e.pointerId)};
  c.onpointermove=e=>{if(!dn)return;const p=pt(e);x.lineWidth=2+9*p[2];x.strokeStyle='#111';x.beginPath();x.moveTo(l[0],l[1]);x.lineTo(p[0],p[1]);x.stroke();l=p};
  c.onpointerup=c.onpointercancel=()=>dn=false;
  $('#sgClr').onclick=()=>x.clearRect(0,0,c.width,c.height);$('#sgx').onclick=()=>d.close();
  $('#sgOk').onclick=()=>{const im=x.getImageData(0,0,c.width,c.height).data;let x0=c.width,y0=c.height,x1=0,y1=0;
    for(let yy=0;yy<c.height;yy++)for(let xx=0;xx<c.width;xx++)if(im[(yy*c.width+xx)*4+3]>10){if(xx<x0)x0=xx;if(xx>x1)x1=xx;if(yy<y0)y0=yy;if(yy>y1)y1=yy}
    if(x1<=x0){toast('署名を書いてください');return}
    const w=x1-x0+12,h=y1-y0+12,o=document.createElement('canvas');o.width=w;o.height=h;o.getContext('2d').drawImage(c,x0-6,y0-6,w,h,0,0,w,h);
    const g={d:o.toDataURL('image/png'),w,h};try{localStorage.setItem('ps-sig',JSON.stringify(g))}catch(_){}
    d.close();S.pend={...g,tw:150};toast('置きたい場所をタップ')};
  d.onclick=e=>{if(e.target===d)d.close()};d.showModal()}
const STAMPS=[['承認','#2e7d32'],['却下','#b3261e'],['確認済み','#1565c0'],['社外秘','#b3261e'],['下書き','#ef6c00'],['コピー','#6750a4'],['至急','#b3261e'],['完了','#2e7d32']];
function stampOpen(){const d=$('#stamps');
  d.innerHTML=`<div class="dh"><span>スタンプ</span><button class="ib" id="stx" aria-label="閉じる"><i data-i="close"></i></button></div><section class="ds st"><nav class="btns">${STAMPS.map(([t,c],n)=>`<button class="stp" data-n="${n}" style="color:${c};border-color:${c}">${t}</button>`).join('')}</nav><nav class="btns"><button class="tonal" id="stSig">署名を書き直す</button><button class="tonal" id="stPic">画像を追加</button></nav></section>`;
  icons(d);d.onclick=e=>{const b=e.target.closest('button');if(e.target===d||(b&&b.id==='stx')){d.close();return}if(!b)return;
    if(b.dataset.n!==undefined){const[t,c]=STAMPS[b.dataset.n];S.pend=stampImg(t,c);d.close();toast('置きたい場所をタップ')}
    else if(b.id==='stSig'){d.close();sigOpen()}else if(b.id==='stPic'){d.close();$('#fileG').click()}};d.showModal()}
$('#fileG').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;
  try{const bm=await createImageBitmap(f),m=Math.min(1,1400/Math.max(bm.width,bm.height)),c=document.createElement('canvas');c.width=Math.round(bm.width*m);c.height=Math.round(bm.height*m);c.getContext('2d').drawImage(bm,0,0,c.width,c.height);
    S.pend={d:c.toDataURL(f.type==='image/png'?'image/png':'image/jpeg',.88),w:c.width,h:c.height,tw:Math.min(220,Math.max(60,c.width/4))};toast('置きたい場所をタップ')}catch(_){toast('画像を読み込めませんでした')}};

/* option chooser */
function choose(title,opts){return new Promise(res=>{const d=$('#opt');let val='';
  d.innerHTML=`<div class="dh"><span>${title}</span></div><nav class="btns" style="padding:8px 24px 24px">${opts.map(([v,l])=>`<button class="tonal" data-v="${v}">${l}</button>`).join('')}<button class="tonal" data-v="">キャンセル</button></nav>`;
  d.onclick=e=>{const b=e.target.closest('button');if(!b&&e.target!==d)return;val=b?b.dataset.v:'';d.close()};d.onclose=()=>res(val);d.showModal()})}

/* tools: split / compress / export / merge */
const need=()=>S.pdf||(toast('先にPDFを開いてください'),false);
async function splitPdf(){if(!need())return;const v=prompt('分割する範囲をカンマ区切りで入力（例: 1-3,4-6）。空欄なら1ページずつ分割します。','');if(v===null)return;
  const n=S.sizes.length;let rs=[];
  if(!v.trim())rs=Array.from({length:n},(_,i)=>[i,i]);
  else for(const part of v.split(/[,、]/)){const m=/^\s*(\d+)\s*(?:[-〜~]\s*(\d+))?\s*$/.exec(part);if(!m){toast('範囲の形式が正しくありません');return}const a=+m[1],b=+(m[2]||m[1]);if(a<1||b>n||a>b){toast('ページ番号が範囲外です');return}rs.push([a-1,b-1])}
  if(rs.length>60){toast('分割数が多すぎます（最大60）');return}
  busy('分割中…');
  try{O.docs=[{pdf:S.pdf,bytes:S.bytes}];const base=S.name.replace(/\.pdf$/i,''),files=[];
    for(const[a,b]of rs){const items=[];for(let i=a;i<=b;i++)items.push({d:0,i,rot:0,w:S.sizes[i].w,h:S.sizes[i].h});const{out,ann,sizes}=await orgBuild(items);await bake(out,ann,sizes);files.push(new File([await out.save()],`${base}-${a+1}${b>a?'-'+(b+1):''}.pdf`,{type:'application/pdf'}))}
    idle();
    if(navigator.canShare&&navigator.canShare({files})){try{await navigator.share({files});return}catch(e){if(e.name==='AbortError')return}}
    files.forEach((f,k)=>setTimeout(()=>{const a=document.createElement('a');a.href=URL.createObjectURL(f);a.download=f.name;a.click()},k*400));toast(files.length+'個のファイルを保存します')
  }catch(e){idle();console.error(e);toast('分割できませんでした')}}
async function compressPdf(){if(!need())return;const q=await choose('PDFを圧縮（ページを画像化します）',[['h','高画質'],['m','標準'],['l','最小サイズ']]);if(!q)return;
  const sc={h:1.6,m:1.1,l:.75}[q],jq={h:.8,m:.6,l:.4}[q];busy('圧縮中…');
  try{const out=await PDFLib.PDFDocument.create();
    for(let i=0;i<S.sizes.length;i++){$('#busyT').textContent=`圧縮中… ${i+1}/${S.sizes.length}`;
      const pg=await S.pdf.getPage(i+1),vp=pg.getViewport({scale:sc}),c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);
      await pg.render({canvasContext:x,viewport:vp}).promise;const b=await new Promise(r=>c.toBlob(r,'image/jpeg',jq)),im=await out.embedJpg(await b.arrayBuffer()),s=S.sizes[i];
      out.addPage([s.w,s.h]).drawImage(im,{x:0,y:0,width:s.w,height:s.h});c.width=c.height=0}
    await bake(out,S.ann,S.sizes);const u=await out.save();idle();toast(`${fmtSize(S.size)} → ${fmtSize(u.length)}`);await deliver(u,S.name.replace(/\.pdf$/i,'')+'-圧縮.pdf')
  }catch(e){idle();console.error(e);toast('圧縮できませんでした')}}
async function exportImage(){if(!need())return;busy('画像を作成中…');
  try{const i=S.cur-1,pg=await S.pdf.getPage(i+1),sc=2.5,vp=pg.getViewport({scale:sc}),c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;
    await pg.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;if(S.ann[i])c.getContext('2d').drawImage(await overlay(A(i),S.sizes[i],sc),0,0);
    const b=await new Promise(r=>c.toBlob(r,'image/png')),u=new Uint8Array(await b.arrayBuffer());idle();await deliver(u,`${S.name.replace(/\.pdf$/i,'')}-p${i+1}.png`,'image/png')
  }catch(e){idle();console.error(e);toast('書き出せませんでした')}}
async function exportText(){if(!need())return;busy('テキストを抽出中…');
  try{let t='';for(let i=0;i<S.sizes.length;i++)t+=`--- ${i+1}ページ ---\n${await ptext(i)}\n\n`;idle();await deliver(new TextEncoder().encode(t),S.name.replace(/\.pdf$/i,'')+'.txt','text/plain')}
  catch(e){idle();console.error(e);toast('抽出できませんでした')}}
$('#fileM').onchange=async e=>{const fs=[...e.target.files];e.target.value='';if(!fs.length)return;if(!S.pdf&&fs.length<2){toast('2つ以上のファイルを選んでください');return}
  busy('結合中…');
  try{const{PDFDocument}=PDFLib,out=await PDFDocument.create(),add=async buf=>{const src=await PDFDocument.load(buf,{ignoreEncryption:true});(await out.copyPages(src,src.getPageIndices())).forEach(p=>out.addPage(p))};
    const has=!!S.pdf,ann=has?JSON.parse(JSON.stringify(S.ann)):undefined,nm=has?S.name.replace(/\.pdf$/i,'')+'-結合.pdf':'結合.pdf';
    if(has)await add(S.bytes);for(const f of fs)await add(/^image\//.test(f.type)?await img2pdf(f):await f.arrayBuffer());
    const u=await out.save();await load(u.buffer.slice(u.byteOffset,u.byteOffset+u.byteLength),nm,ann);toast('結合しました')
  }catch(err){console.error(err);toast('結合できませんでした')}finally{idle()}};

/* tools hub */
const TOOLS=[
 ['コメントと入力',[['comment','コメント','ハイライト・付箋・手描き・図形',1,()=>setMode('c')],['signature','入力と署名','署名・チェック・日付・スタンプ',1,()=>setMode('f')]]],
 ['ページ',[['dashboard_customize','ページを整理','回転・並べ替え・削除・挿入',1,orgOpen],['merge','PDFを結合','複数のPDFや画像を1つにまとめる',0,()=>$('#fileM').click()],['call_split','PDFを分割','ページ範囲ごとにファイルを分ける',1,splitPdf]]],
 ['書き出しと最適化',[['compress','PDFを圧縮','ページを画像化してサイズを小さく',1,compressPdf],['image','画像として書き出し','表示中のページをPNGで保存',1,exportImage],['article','テキストとして書き出し','文字を抽出して.txtで保存',1,exportText]]],
 ['作成',[['add_photo_alternate','画像からPDF','写真や画像をPDFに変換',0,()=>$('#fileImg').click()],['photo_camera','カメラでスキャン','撮影してPDFにする',0,()=>$('#fileCam').click()]]],
 ['文書',[['info','詳細情報','プロパティとメタデータ',1,()=>$('#bInfo').click()],['lock','パスワード保護','このアプリでは未対応です',-1,null]]]];
function openTools(){const g=$('#tgrid');g.innerHTML='';
  TOOLS.forEach(([h,items])=>{const hh=document.createElement('h2');hh.textContent=h;const gr=document.createElement('div');gr.className='tg';
    items.forEach(([ic,t,d,req,f],n)=>{const dis=req===-1||(req===1&&!S.pdf),b=document.createElement('button');b.className='tcd v'+(n%3)+(dis?' dis':'');
      b.innerHTML=`<span class="tci"><i data-i="${ic}"></i></span><b></b><small></small>`;b.querySelector('b').textContent=t;b.querySelector('small').textContent=req===-1?d:(dis?'PDFを開くと使えます':d);
      b.onclick=()=>{if(dis){toast(req===-1?d:'先にPDFを開いてください');return}$('#tools').classList.remove('open');f()};gr.append(b)});
    g.append(hh,gr)});
  icons(g);$('#tools').classList.add('open')}
$('#tClose').onclick=()=>$('#tools').classList.remove('open');
$('#rTools').onclick=$('#dTools').onclick=openTools;

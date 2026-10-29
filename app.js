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
const CFG=Object.assign({mode:'auto',seed:'#6750a4',fit:'w',gap:14,sens:1,finger:false,view:'c',tone:'n',snap:0,edge:0,asp:3,autohide:1,resume:0,grid:0},JSON.parse(localStorage.getItem('ps-cfg')||'{}'));
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
    document.body.classList.remove('nodoc');$('#title').textContent=name;$('#pTot').textContent=n;$('#pNum').max=n;
    $('#sres').innerHTML='';$('#sq').value='';S.cur=1;build();S.zoom=1;fit(CFG.fit);btns();setTool('select');setMode('v');bmUpdate();document.body.classList.remove('barhide');
    const sp=POS[S.id];if(sp>1&&S.els[sp-1])V.scrollTop=S.els[sp-1].offsetTop-12;
    const th=await thumb(pdf).catch(()=>'');
    DB.put('files',{id:S.id,name,size:S.size,pages:n,date:Date.now(),thumb:th,blob:new Blob([buf],{type:'application/pdf'})}).catch(()=>{});
    if(ann)save();if(S.after){const f=S.after;S.after=null;setTimeout(f,400)}
  }finally{idle()}
}
function build(){P.innerHTML='';S.els=S.sizes.map((s,i)=>{const e=document.createElement('div');e.className='page';e.dataset.i=i;e.innerHTML='<canvas class="pdf"></canvas><div class="txl"></div><canvas class="ink"></canvas><div class="tl"></div>';P.append(e);sizeEl(i,e);return e});V.scrollTop=0}
const sizeEl=(i,e=S.els[i])=>{const s=S.sizes[i],z=S.zoom;e.style.width=s.w*z+'px';e.style.height=s.h*z+'px';['.tl','.txl'].forEach(q=>{const l=e.querySelector(q);if(l){l.style.width=s.w+'px';l.style.height=s.h+'px';l.style.transform=`scale(${z})`;l.style.setProperty('--z',z)}})};

/* ---------- rendering ---------- */
async function draw(i){const e=S.els[i];if(e._run){e._again=true;return}e._run=true;let n=0;
  try{do{e._again=false;e._z=S.zoom;await drawOnce(i,S.zoom);n++}while((e._again||e._z!==S.zoom)&&e._vis&&n<8)}catch(err){console.warn(err)}finally{e._run=false}}
async function drawOnce(i,z){const e=S.els[i];
  try{const pg=await S.pdf.getPage(i+1),dpr=Math.min(devicePixelRatio||1,2),vp=pg.getViewport({scale:z*dpr}),u=pg.getViewport({scale:1}),s=S.sizes[i];
    if(Math.abs(u.width-s.w)>1||Math.abs(u.height-s.h)>1){S.sizes[i]={w:u.width,h:u.height};sizeEl(i)}
    const t=document.createElement('canvas');t.width=Math.ceil(vp.width);t.height=Math.ceil(vp.height);
    const task=pg.render({canvasContext:t.getContext('2d'),viewport:vp});e._t=task;await task.promise;e._t=null;
    if(z!==S.zoom||!e._vis){t.width=t.height=0;return}
    const c=e.querySelector('.pdf');c.width=t.width;c.height=t.height;c.getContext('2d').drawImage(t,0,0);t.width=t.height=0;e.classList.add('rd');
    const n=e.querySelector('.ink');n.width=c.width;n.height=c.height;ink(i);
    if(!e._tl){e._tl=true;txt(i);await textLayer(pg,e)}
  }catch(err){if(err&&err.name==='RenderingCancelledException')e._again=true;else console.warn(err)}}
function free(e){e.classList.remove('rd');e._vis=false;e._z=null;e._tl=false;if(e._t){try{e._t.cancel()}catch(_){}e._t=null}e.querySelectorAll('canvas').forEach(c=>{c.width=0;c.height=0});e.querySelector('.tl').innerHTML='';e.querySelector('.txl').innerHTML=''}
function vis(){const t=V.scrollTop-800,b=V.scrollTop+V.clientHeight+800;
  S.els.forEach((e,i)=>{const on=e.offsetTop+e.offsetHeight>t&&e.offsetTop<b;e._vis=on;if(on){if(e._z!==S.zoom)draw(i)}else if(e.querySelector('.pdf').width>0)free(e)})}
let raf;V.addEventListener('scroll',()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{if(!S.pdf)return;vis();const m=V.scrollTop+V.clientHeight/3;let c=0;S.els.forEach((e,i)=>{if(e.offsetTop<=m)c=i});if(S.cur!==c+1){S.cur=c+1;POS[S.id]=S.cur;clearTimeout(window._pt);window._pt=setTimeout(()=>localStorage.setItem('ps-pos',JSON.stringify(POS)),800);$('#pNum').value=S.cur;bmUpdate();$$('.th').forEach((t,i)=>t.classList.toggle('on',i===c))}})},{passive:true});

/* ---------- zoom / nav ---------- */
function zoom(z){z=Math.min(5,Math.max(.25,z));if(!S.pdf||Math.abs(z-S.zoom)<.005)return;
  const cx=(V.scrollLeft+V.clientWidth/2)/V.scrollWidth,cy=(V.scrollTop+V.clientHeight/2)/V.scrollHeight;
  S.zoom=z;S.els.forEach((e,i)=>{sizeEl(i);e._z=null;if(e._t){try{e._t.cancel()}catch(_){}}});
  V.scrollLeft=cx*V.scrollWidth-V.clientWidth/2;V.scrollTop=cy*V.scrollHeight-V.clientHeight/2;
  $('#zLbl').textContent=Math.round(z*100)+'%';vis()}
const off=()=>innerWidth>=700&&!document.body.classList.contains('imm')&&!document.body.classList.contains('nodoc')?176:0,two=()=>CFG.view==='d';
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
function pw(s,p){const sn=s.sn==null?CFG.sens:s.sn;let f;if(s.y==='b')f=1;else if(s.y==='r')f=1+sn*(.15+2.2*p-1);else if(s.y==='p')f=1+sn*.5*(p-.5);else f=1+sn*(.3+1.4*p-1);return Math.max(.12,f)}
function bbox(p,m){let a=1e9,b=1e9,c=-1e9,d=-1e9;p.forEach(q=>{if(q[0]<a)a=q[0];if(q[1]<b)b=q[1];if(q[0]>c)c=q[0];if(q[1]>d)d=q[1]});return[a-m,b-m,c+m,d+m]}
function strokePath(x,p,k){x.beginPath();x.moveTo(p[0][0]*k,p[0][1]*k);p.forEach(q=>x.lineTo(q[0]*k,q[1]*k));if(p.length===1)x.lineTo(p[0][0]*k+.1,p[0][1]*k)}
function stroke(x,s,k){if(s.t==='m'){mark(x,s,k);return}const p=s.p;if(!p.length)return;if(s.t==='s'){shape(x,s,k);return}
  if(s.t==='h'){x.save();x.lineCap=x.lineJoin='round';x.globalAlpha=s.o==null?.4:s.o;x.strokeStyle=s.c;x.lineWidth=s.w*k;strokePath(x,p,k);x.stroke();x.restore();return}
  let o=s.o==null?1:s.o;if(s.y==='p')o*=.7;
  if(s.d&&s.d!=='s'){x.save();x.lineCap=x.lineJoin='round';x.globalAlpha=o;x.strokeStyle=s.c;x.lineWidth=s.w*k;x.setLineDash(s.d==='t'?[.01,s.w*k*2.4]:[s.w*k*3.5,s.w*k*2.4]);strokePath(x,p,k);x.stroke();x.restore();return}
  if(o<1){const b=bbox(p,s.w*3),W=Math.ceil((b[2]-b[0])*k),H=Math.ceil((b[3]-b[1])*k);
    if(W>0&&H>0&&W*H<2.4e7){const t=document.createElement('canvas');t.width=W;t.height=H;const tc=t.getContext('2d');for(let j=0;j<p.length;j++)seg(tc,s,k,p,j,b[0]*k,b[1]*k);x.save();x.globalAlpha=o;x.drawImage(t,b[0]*k,b[1]*k);x.restore();t.width=t.height=0;return}}
  for(let j=0;j<p.length;j++)seg(x,s,k,p,j,0,0)}
function seg(x,s,k,p,j,ox,oy){ox=ox||0;oy=oy||0;const a=p[Math.max(0,j-1)],b=p[j];x.save();x.lineCap=x.lineJoin='round';x.strokeStyle=s.c;x.lineWidth=s.w*k*pw(s,b[2]);x.beginPath();x.moveTo(a[0]*k-ox,a[1]*k-oy);x.lineTo(b[0]*k-ox+(j?0:.01),b[1]*k-oy);x.stroke();x.restore()}
let D=null;
const pt=e=>{const r=D.c.getBoundingClientRect(),k=r.width/S.sizes[D.i].w,raw=e.pointerType==='pen'?Math.pow(e.pressure||.5,CURVE[S.ps.curve]||1):.5;D.pp=D.pp*.5+raw*.5;return[+((e.clientX-r.left)/k).toFixed(2),+((e.clientY-r.top)/k).toFixed(2),+Math.max(.08,D.pp).toFixed(2)]};
V.addEventListener('pointerdown',e=>{
  if(!DRAW.includes(S.tool))return;const pg=e.target.closest('.page');if(!pg)return;
  if(e.pointerType==='touch'&&!$('#finger').checked)return;
  const c=pg.querySelector('.ink'),i=+pg.dataset.i;e.preventDefault();c.setPointerCapture(e.pointerId);
  D={i,c,id:e.pointerId,pp:e.pointerType==='pen'?(e.pressure||.5):.5,ch:false,s:newStroke()};step(e)});
V.addEventListener('pointermove',e=>{if(!D||e.pointerId!==D.id)return;const l=e.getCoalescedEvents?e.getCoalescedEvents():[];(l.length?l:[e]).forEach(step)});
function step(e){const p=pt(e);if(!D.s){erase(p);eraseObj(e);return}
  if(D.s.t==='s'){D.s.p[0]=D.s.p[0]||p;D.s.p[1]=p;ink(D.i);stroke(D.c.getContext('2d'),D.s,D.c.width/S.sizes[D.i].w);return}if(D.s.t==='p'&&S.ps.sm&&D.s.p.length){const q=D.s.p[D.s.p.length-1],a=1-S.ps.sm*.085;p[0]=+(q[0]+(p[0]-q[0])*a).toFixed(2);p[1]=+(q[1]+(p[1]-q[1])*a).toFixed(2)}D.s.p.push(p);const x=D.c.getContext('2d'),k=D.c.width/S.sizes[D.i].w;
  if(D.s.t==='h'||D.s.o<1||(D.s.d&&D.s.d!=='s')||D.s.y==='p'){ink(D.i);stroke(x,D.s,k)}else seg(x,D.s,k,D.s.p,D.s.p.length-1)}
function erase(p){const r=S.w.er/2,a=A(D.i),n=a.s.length;a.s=a.s.filter(s=>!spts(s).some(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<r+s.w/2));if(a.s.length!==n){D.ch=true;ink(D.i)}}
function end(e){if(!D||e.pointerId!==D.id)return;if(D.s&&D.s.p.length&&!(D.s.t==='s'&&(D.s.p.length<2||Math.hypot(D.s.p[1][0]-D.s.p[0][0],D.s.p[1][1]-D.s.p[0][1])<2))){A(D.i).s.push(D.s);D.ch=true}const ch=D.ch;D=null;if(ch)commit()}
V.addEventListener('pointerup',end);V.addEventListener('pointercancel',end);
/* Apple Pencil でスクロールさせない（指のスクロールは維持） */
['touchstart','touchmove'].forEach(n=>V.addEventListener(n,e=>{if(DRAW.includes(S.tool)&&e.touches[0]&&e.touches[0].touchType==='stylus'&&e.cancelable)e.preventDefault()},{passive:false}));

/* ---------- text boxes ---------- */
V.addEventListener('click',e=>{const pg=e.target.closest('.page');if(!pg||e.target.closest('.tb,.gx'))return;
  const i=+pg.dataset.i,r=pg.getBoundingClientRect(),k=r.width/S.sizes[i].w,x=(e.clientX-r.left)/k,y=(e.clientY-r.top)/k;
  if(S.tool==='text'||S.tool==='note'){const t={x,y,s:S.tool==='note'?14:S.w.tx,c:S.tool==='note'?'#1d1b20':S.col.tx,t:'',f:S.tf.f,b:S.tf.b,i:S.tf.i,bg:S.tool==='note'?'':S.tf.bg};if(S.tool==='note')t.k='n';
    A(i).t.push(t);const d=tbEl(i,t);pg.querySelector('.tl').append(d);d.querySelector('.c').focus()}
  else if(PLACE.includes(S.tool)&&S.pend){const p=S.pend,w=p.tw,h=w*p.h/p.w,g={x:x-w/2,y:y-h/2,w,h,d:p.d};A(i).g.push(g);pg.querySelector('.tl').append(gEl(i,g));commit()}
  else if(S.tool==='select'){$$('.gx.sel').forEach(el=>el.classList.remove('sel'));strokeMenu(e,i,x,y,k)}});
function txt(i){const l=S.els[i].querySelector('.tl');l.innerHTML='';A(i).t.forEach(t=>l.append(tbEl(i,t)));A(i).g.forEach(g=>l.append(gEl(i,g)))}
const pos=(d,t)=>{d.style.left=t.x+'px';d.style.top=t.y+'px';d.style.fontSize=t.s+'px';d.style.color=t.c};
const FONTS={g:'-apple-system,"Hiragino Sans",sans-serif',m:'"Hiragino Mincho ProN","Yu Mincho",serif',r:'"Hiragino Maru Gothic ProN","Hannotate SC",sans-serif',c:'ui-monospace,Menlo,monospace'};
function tbStyle(d,t){const c=d.querySelector('.c'),n=t.k==='n';c.style.fontFamily=FONTS[t.f||'g'];c.style.fontWeight=t.b?700:400;c.style.fontStyle=t.i?'italic':'normal';c.style.background=n?'':(t.bg||'');c.style.padding=n?'':(t.bg?'.15em .3em':'');c.style.borderRadius=t.bg?'.3em':''}
function tbEl(i,t){const d=document.createElement('div'),c=document.createElement('div');d.className='tb'+(t.k==='n'?' note':'');d._obj=t;
  d.innerHTML='<b class="h"><span class="ms">open_with</span></b><b class="d"><span class="ms">content_copy</span></b><b class="x"><span class="ms">delete</span></b>';
  c.className='c';c.contentEditable='plaintext-only';c.spellcheck=false;c.textContent=t.t;d.append(c);pos(d,t);tbStyle(d,t);d._v=t.t;
  c.addEventListener('input',()=>{t.t=c.innerText.replace(/\n$/,'');save()});
  c.addEventListener('focus',()=>{$$('.tb.sel,.gx.sel').forEach(x=>x.classList.remove('sel'));d.classList.add('sel');S.tb={t,d};syncProps()});
  c.addEventListener('blur',()=>{if(!t.t.trim()){A(i).t=A(i).t.filter(x=>x!==t);d.remove()}if(t.t!==d._v){d._v=t.t;commit()}setTimeout(()=>{if(S.tb&&S.tb.t===t&&document.activeElement!==c&&!$('#props').contains(document.activeElement)){S.tb=null;syncProps()}},250)});
  const h=d.querySelector('.h');h.onpointerdown=ev=>{ev.preventDefault();ev.stopPropagation();h.setPointerCapture(ev.pointerId);d.classList.add('drag');const sx=ev.clientX,sy=ev.clientY,ox=t.x,oy=t.y;
    h.onpointermove=m=>{t.x=ox+(m.clientX-sx)/S.zoom;t.y=oy+(m.clientY-sy)/S.zoom;pos(d,t)};
    h.onpointerup=()=>{h.onpointermove=h.onpointerup=null;d.classList.remove('drag');commit()}};
  d.querySelector('.d').onpointerdown=ev=>{ev.preventDefault();ev.stopPropagation();const n={...t,x:t.x+12,y:t.y+12},nd=tbEl(i,n);A(i).t.push(n);S.els[i].querySelector('.tl').append(nd);nd.classList.add('sel');commit()};
  d.querySelector('.x').onpointerdown=ev=>{ev.preventDefault();ev.stopPropagation();A(i).t=A(i).t.filter(q=>q!==t);d.remove();S.tb=null;commit();syncProps()};
  return d}

/* ---------- history / save ---------- */
function commit(){S.hist=S.hist.slice(0,S.hi+1);S.hist.push(JSON.stringify(S.ann));if(S.hist.length>40)S.hist.shift();S.hi=S.hist.length-1;btns();save()}
function undo(d){const n=S.hi+d;if(n<0||n>=S.hist.length)return;S.hi=n;S.ann=JSON.parse(S.hist[n]);S.els.forEach((e,i)=>{ink(i);txt(i)});btns();save()}
let st;function save(){clearTimeout(st);st=setTimeout(()=>DB.put('annots',{id:S.id,data:S.ann}).catch(()=>{}),500)}
function btns(){$('#bUndo').disabled=S.hi<=0;$('#bRedo').disabled=S.hi>=S.hist.length-1}
$('#bUndo').onclick=()=>undo(-1);$('#bRedo').onclick=()=>undo(1);

/* ---------- tools / props ---------- */
const tk=()=>S.tb?'tx':{pen:'pen',hl:'hl',er:'er',text:'tx',shape:'pen',hlt:'hl',ult:'ul',stt:'st'}[S.tool];
function setTool(t){const same=S.tool===t;S.tool=t;document.body.dataset.tool=t;S.pend=null;if(t!=='select'&&document.body.classList.contains('hideann')){document.body.classList.remove('hideann');$('#bHide').classList.remove('on')}if(PLACE.includes(t))arm(t);
  $$('.tool[data-t]').forEach(b=>b.classList.toggle('on',b.dataset.t===t));$('#bFill').classList.toggle('on',PLACE.includes(t));
  if(t!=='text'&&t!=='note'&&t!=='select'&&document.activeElement&&document.activeElement.isContentEditable)document.activeElement.blur();
  const pr=$('#props');if(t==='select'||t==='note'||PLACE.includes(t))pr.classList.add('off');else if(same)pr.classList.toggle('off');else pr.classList.remove('off');syncProps()}
$$('.tool[data-t]').forEach(b=>b.onclick=()=>setTool(b.dataset.t));
['#dock','#props'].forEach(s=>$(s).addEventListener('mousedown',e=>{if(e.target.tagName!=='INPUT')e.preventDefault()}));

/* ---------- sidebar thumbnails ---------- */
let thIO;
function thumbs(){const box=$('#thumbs');if(box.childElementCount===S.sizes.length&&box._id===S.id)return;box._id=S.id;box.innerHTML='';thIO&&thIO.disconnect();
  thIO=new IntersectionObserver(es=>es.forEach(async en=>{if(!en.isIntersecting||en.target._d)return;en.target._d=1;const i=+en.target.dataset.i,pg=await S.pdf.getPage(i+1),w=196,v=pg.getViewport({scale:1}),sc=w*2/v.width,vp=pg.getViewport({scale:sc}),c=en.target.querySelector('canvas');c.width=vp.width;c.height=vp.height;pg.render({canvasContext:c.getContext('2d'),viewport:vp})}),{root:$('#side')});
  S.sizes.forEach((s,i)=>{const b=document.createElement('button');b.className='th'+(i===S.cur-1?' on':'');b.dataset.i=i;b.innerHTML=`<canvas style="aspect-ratio:${s.w}/${s.h}"></canvas>${i+1}`;b.onclick=()=>go(i+1);box.append(b);thIO.observe(b)})}
$('#bSide').onclick=()=>{document.body.classList.toggle('side');if(document.body.classList.contains('side'))thumbs()};

/* ---------- toolbar actions ---------- */
$('#bInv').onclick=()=>setTone(CFG.tone==='i'?'n':'i');
const fsOn=()=>document.fullscreenElement||document.webkitFullscreenElement;
$('#bFull').onclick=()=>{document.body.classList.add('imm');document.body.classList.remove('side');const d=document.documentElement,f=d.requestFullscreen||d.webkitRequestFullscreen;try{const r=f&&f.call(d);r&&r.catch&&r.catch(()=>{})}catch(_){}};
$('#exit').onclick=()=>{document.body.classList.remove('imm');if(fsOn())(document.exitFullscreen||document.webkitExitFullscreen).call(document)};
['fullscreenchange','webkitfullscreenchange'].forEach(n=>document.addEventListener(n,()=>{if(!fsOn())document.body.classList.remove('imm')}));
$('#bOpen').onclick=()=>$('#file').click();
$('#file').onchange=e=>{pick(e.target.files[0]);e.target.value=''};
$('#bHome').onclick=()=>{S.pdf=null;document.body.classList.add('nodoc');P.innerHTML='';$('#title').textContent='PDF Studio';$('#props').classList.add('off');stopRead();autoScroll(false);setHv('home');recent()};
['dragenter','dragover'].forEach(n=>addEventListener(n,e=>{e.preventDefault();document.body.classList.add('dragover')}));
['dragleave','drop'].forEach(n=>addEventListener(n,e=>{e.preventDefault();document.body.classList.remove('dragover')}));
addEventListener('drop',e=>pick(e.dataTransfer.files[0]));
addEventListener('keydown',e=>{if(!S.pdf||(document.activeElement&&document.activeElement.isContentEditable)||e.target.tagName==='INPUT')return;
  if((e.metaKey||e.ctrlKey)&&e.key==='z'){e.preventDefault();undo(e.shiftKey?1:-1)}
  else if(e.key==='+'||e.key==='=')zoom(S.zoom*1.25);else if(e.key==='-')zoom(S.zoom/1.25);else if(e.key==='ArrowRight')go(S.cur+1);else if(e.key==='ArrowLeft')go(S.cur-1);
  else if(e.key==='Escape')$('#exit').click()});

/* ---------- home / recent files ---------- */
let rcSort='date',rcQ='',RC=[],hv='home',htab='recent';
const rel=t=>{const d=Math.floor((Date.now()-t)/864e5);return d<1?'今日':d<2?'昨日':d<7?d+'日前':new Date(t).toLocaleDateString('ja-JP')};
async function recent(){try{RC=await DB.all('files')}catch(_){RC=[]}paintRecent()}
async function starToggle(id){const f=await DB.get('files',id);if(!f)return false;f.star=!f.star;await DB.put('files',f);return f.star}
function mkRow(f){const r=document.createElement('div');r.className='lr';r.tabIndex=0;
  r.innerHTML=`<div class="lth">${f.thumb?`<img alt="" src="${f.thumb}">`:'<i data-i="pages"></i>'}</div><div class="lt"><b></b><small>PDF ・ ${rel(f.date)} ・ ${fmtSize(f.size)}</small></div><button class="ib ls${f.star?' on':''}" aria-label="スター"><i data-i="star"></i></button><button class="ib lm" aria-label="その他"><i data-i="more_vert"></i></button>`;
  r.querySelector('b').textContent=f.name;icons(r);
  const open=async()=>{try{await load(await f.blob.arrayBuffer(),f.name)}catch(_){toast('開けませんでした')}};
  r.onclick=e=>{if(!e.target.closest('button'))open()};
  r.querySelector('.ls').onclick=async e=>{e.stopPropagation();const b=e.currentTarget;f.star=await starToggle(f.id);b.classList.toggle('on',f.star);if(htab==='star')recent()};
  r.querySelector('.lm').onclick=e=>{e.stopPropagation();popMenu(e.currentTarget,[['folder_open','開く',open],['star',f.star?'スターを外す':'スターを付ける',async()=>{await starToggle(f.id);recent()}],['edit','名前を変更',async()=>{const n=prompt('新しい名前',f.name);if(!n)return;const g=await DB.get('files',f.id);g.name=n;await DB.put('files',g);recent()}],['delete','削除',async()=>{if(confirm(`「${f.name}」と書き込みを端末から削除しますか？`)){await DB.del('files',f.id);await DB.del('annots',f.id);recent()}}]])};
  return r}
function paintRecent(){const box=$('#recent');let l=RC.slice();
  if(hv==='search')l=rcQ?l.filter(f=>f.name.toLowerCase().includes(rcQ)):[];else if(htab==='star')l=l.filter(f=>f.star);
  l.sort(hv==='files'&&rcSort==='name'?(a,b)=>a.name.localeCompare(b.name,'ja'):hv==='files'&&rcSort==='size'?(a,b)=>b.size-a.size:(a,b)=>b.date-a.date);
  if(hv==='home')l=l.slice(0,10);
  box.innerHTML='';box.classList.toggle('gridv',hv==='files'&&!!CFG.grid);
  if(!l.length){const msg=hv==='search'?(rcQ?'見つかりませんでした':'ファイル名を入力して検索します'):htab==='star'?'スターを付けたファイルがここに並びます':'まだファイルがありません。<br>右下の＋からPDFを開くと、ここに並びます。';
    box.innerHTML=`<div class="es"><i data-i="pages"></i><p>${msg}</p></div>`;icons(box);return}
  if(hv==='home'&&htab==='recent'){box.append(mkHero(l[0]));l=l.slice(1)}
  l.forEach(f=>box.append(mkRow(f)))}
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
  a.t.forEach(t=>{x.font=`${t.i?'italic ':''}${t.b?'700 ':''}${t.s*sc}px ${FONTS[t.f||'g']}`;const ls=t.t.split('\n'),n=t.k==='n'||!!t.bg;let ox=0,oy=0;
    if(n){const pxk=t.k==='n'?[.55,.4]:[.3,.15];ox=pxk[0]*t.s;oy=pxk[1]*t.s;const w=Math.max(...ls.map(l=>x.measureText(l).width))/sc;x.fillStyle=t.k==='n'?'#fff59d':t.bg;x.beginPath();if(x.roundRect)x.roundRect(t.x*sc,t.y*sc,(w+2*pxk[0]*t.s)*sc,(ls.length*1.35*t.s+2*pxk[1]*t.s)*sc,.6*t.s*sc);else x.rect(t.x*sc,t.y*sc,(w+2*pxk[0]*t.s)*sc,(ls.length*1.35*t.s+2*pxk[1]*t.s)*sc);x.fill()}
    x.fillStyle=t.c;ls.forEach((ln,j)=>x.fillText(ln,(t.x+ox)*sc,(t.y+oy+j*t.s*1.35+t.s*.1)*sc))});
  return v}
async function bake(doc,ann,sizes){const pgs=doc.getPages(),sc=2;let n=0;
  for(const key of Object.keys(ann)){const i=+key,a=ann[i];if(!a||(!a.s.length&&!a.t.length&&!(a.g&&a.g.length))||!pgs[i])continue;
    const p=pgs[i],r=p.getRotation().angle%360,cb=p.getCropBox(),s=sizes[i],v=await overlay(a,s,sc);
    let o=v;if(r){o=document.createElement('canvas');const W=cb.width*sc,H=cb.height*sc;o.width=W;o.height=H;const y=o.getContext('2d');
      y.setTransform(...(r===90?[0,-1,1,0,0,H]:r===180?[-1,0,0,-1,W,H]:[0,1,-1,0,W,0]));y.drawImage(v,0,0)}
    const img=await doc.embedPng(o.toDataURL('image/png'));p.drawImage(img,{x:cb.x,y:cb.y,width:cb.width,height:cb.height});n++}
  return n}
async function deliver(out,name,type,dl){const f=new File([out],name,{type:type||'application/pdf'});
  if(!dl&&navigator.canShare&&navigator.canShare({files:[f]})){try{await navigator.share({files:[f]});return}catch(e){if(e.name==='AbortError')return}}
  const a=document.createElement('a');a.href=URL.createObjectURL(f);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000);toast('保存しました')}
async function exportPdf(dl){if(!S.pdf)return;busy('書き出し中…');try{const doc=await PDFLib.PDFDocument.load(S.bytes,{ignoreEncryption:true}),n=await bake(doc,S.ann,S.sizes),out=await doc.save();idle();await deliver(out,S.name.replace(/\.pdf$/i,'')+(n?'-書き込み済み':'')+'.pdf',undefined,dl)}catch(e){idle();console.error(e);toast('書き出しに失敗しました')}}
$('#bExp').onclick=()=>exportPdf(true);$('#bShare').onclick=$('#bSend').onclick=()=>exportPdf(false);

if('serviceWorker'in navigator)addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));

/* ---------- sidebar tabs / outline / search ---------- */
$$('#stabs button').forEach(b=>b.onclick=()=>{$$('#stabs button').forEach(x=>x.classList.toggle('on',x===b));['thumbs','outl','srch','cmt'].forEach(id=>$('#'+id).hidden=id!==b.dataset.p);if(b.dataset.p==='outl')outline();if(b.dataset.p==='cmt')comments();if(b.dataset.p==='srch')$('#sq').focus()});
async function jump(dest){try{const a=typeof dest==='string'?await S.pdf.getDestination(dest):dest;if(!a)return;go((typeof a[0]==='object'?await S.pdf.getPageIndex(a[0]):a[0])+1)}catch(_){}}
async function outline(){renderBm();const b=$('#olt');if(b._id===S.id)return;b._id=S.id;b.innerHTML='';const o=await S.pdf.getOutline().catch(()=>null);
  if(!o||!o.length){b.innerHTML='<p class="empty">このPDFにはしおり（目次）がありません</p>';return}
  const add=(l,d)=>l.forEach(it=>{const x=document.createElement('button');x.className='ol';x.style.paddingLeft=12+d*16+'px';x.textContent=it.title||'（無題）';x.onclick=()=>jump(it.dest);b.append(x);if(it.items&&it.items.length)add(it.items,d+1)});add(o,0)}
async function ptext(i){if(S.tx[i]===undefined)S.tx[i]=(await(await S.pdf.getPage(i+1)).getTextContent()).items.map(x=>x.str).join(' ');return S.tx[i]}
let sTok=0;
$('#sq').onkeydown=async e=>{if(e.key!=='Enter')return;e.target.blur();const q=e.target.value.trim().toLowerCase(),box=$('#sres'),tok=++sTok;S.q=q;markHits();box.innerHTML='';if(!q)return;
  const st=document.createElement('p');st.className='empty';const lp=document.createElement('div');lp.className='lp';lp.innerHTML='<i class="lpf"></i>';box.append(st,lp);let hits=0,pages=0;
  for(let i=0;i<S.sizes.length;i++){if(tok!==sTok)return;st.textContent=`検索中… ${i+1}/${S.sizes.length}ページ`;lp.firstChild.style.width=((i+1)/S.sizes.length*100)+'%';
    const t=await ptext(i),l=t.toLowerCase();let n=0,at=l.indexOf(q),first=at;while(at>=0){n++;at=l.indexOf(q,at+q.length)}
    if(!n)continue;hits+=n;pages++;const b=document.createElement('button');b.className='sr';const s=Math.max(0,first-14),h=document.createElement('b');h.textContent=`${i+1}ページ・${n}件`;
    b.append(h,document.createTextNode((s?'…':'')+t.slice(s,first)));const m=document.createElement('mark');m.textContent=t.slice(first,first+q.length);b.append(m,document.createTextNode(t.slice(first+q.length,first+q.length+28)));b.onclick=()=>go(i+1);box.append(b);if(pages>=200)break}
  st.textContent=hits?`${pages}ページで${hits}件見つかりました`:'見つかりませんでした（画像のみのPDFは検索できません）';lp.remove();$('#stabs [data-p=srch]').innerHTML='検索'+(hits?`<b class="bd">${hits>99?'99+':hits}</b>`:'');box.prepend(st)};

/* ---------- shapes ---------- */
function shape(x,s,k){const[a,b]=s.p;if(!b)return;const x0=a[0]*k,y0=a[1]*k,x1=b[0]*k,y1=b[1]*k,o=s.o==null?1:s.o,w=s.w*k;
  x.save();x.lineCap=x.lineJoin='round';x.strokeStyle=x.fillStyle=s.c;x.lineWidth=w;
  if(s.d&&s.d!=='s')x.setLineDash(s.d==='t'?[.01,w*2.4]:[w*3.5,w*2.4]);
  const closed=['rect','rrect','ell','tri'].includes(s.k);x.beginPath();
  if(s.k==='rect')x.rect(x0,y0,x1-x0,y1-y0);
  else if(s.k==='rrect'){const X=Math.min(x0,x1),Y=Math.min(y0,y1),W=Math.abs(x1-x0),H=Math.abs(y1-y0),r=Math.min(W,H)*.22;if(x.roundRect)x.roundRect(X,Y,W,H,r);else x.rect(X,Y,W,H)}
  else if(s.k==='ell')x.ellipse((x0+x1)/2,(y0+y1)/2,Math.abs(x1-x0)/2,Math.abs(y1-y0)/2,0,0,7);
  else if(s.k==='tri'){x.moveTo((x0+x1)/2,y0);x.lineTo(x1,y1);x.lineTo(x0,y1);x.closePath()}
  else{x.moveTo(x0,y0);x.lineTo(x1,y1)}
  if(closed&&s.fo>0){x.save();x.globalAlpha=s.fo*o;x.fill();x.restore()}
  x.globalAlpha=o;x.stroke();
  if(s.k==='arrow'||s.k==='darrow'){x.setLineDash([]);const an=Math.atan2(y1-y0,x1-x0),L=Math.max(10*k,w*4),head=(px,py,ang)=>{x.beginPath();[-1,1].forEach(m=>{x.moveTo(px,py);x.lineTo(px+L*Math.cos(ang+Math.PI+m*.45),py+L*Math.sin(ang+Math.PI+m*.45))});x.stroke()};head(x1,y1,an);if(s.k==='darrow')head(x0,y0,an+Math.PI)}
  x.restore()}
function spts(s){if(s.t==='m')return s.r.flatMap(r=>{const o=[];for(let i=0;i<=8;i++)o.push([r[0]+r[2]*i/8,r[1]+r[3]/2]);return o});if(s.t!=='s')return s.p;const[a,b]=s.p;if(!b)return s.p;const o=[];
  for(let i=0;i<=40;i++){const t=i/40;let x,y;
    if(s.k==='rect'||s.k==='rrect'){const u=t*4,e=Math.floor(u)%4,f=u-Math.floor(u),X0=a[0],Y0=a[1],X1=b[0],Y1=b[1];[x,y]=[[X0+(X1-X0)*f,Y0],[X1,Y0+(Y1-Y0)*f],[X1-(X1-X0)*f,Y1],[X0,Y1-(Y1-Y0)*f]][e]}
    else if(s.k==='tri'){const P=[[(a[0]+b[0])/2,a[1]],[b[0],b[1]],[a[0],b[1]]],u=t*3,e=Math.floor(u)%3,f=u-Math.floor(u),A1=P[e],B1=P[(e+1)%3];x=A1[0]+(B1[0]-A1[0])*f;y=A1[1]+(B1[1]-A1[1])*f}
    else if(s.k==='ell'){x=(a[0]+b[0])/2+Math.cos(t*6.283)*(b[0]-a[0])/2;y=(a[1]+b[1])/2+Math.sin(t*6.283)*(b[1]-a[1])/2}
    else{x=a[0]+(b[0]-a[0])*t;y=a[1]+(b[1]-a[1])*t}
    o.push([x,y])}return o}

/* ---------- busy / slider fill / menu ---------- */
let bc=0;
function busy(m){bc++;$('#busyT').textContent=m||'';$('#busy').classList.add('on')}
function idle(){bc=Math.max(0,bc-1);if(!bc)$('#busy').classList.remove('on')}
function sv(el){el.style.setProperty('--v',(el.value-el.min)/(el.max-el.min)*100+'%')}
document.addEventListener('input',e=>{if(e.target.type==='range')sv(e.target)});
const menu=$('#more');
$('#bMore').onclick=e=>{e.stopPropagation();if(S.pdf)fillMore();menu.classList.toggle('off')};
addEventListener('click',e=>{if(!e.target.closest('#bMore,.keep'))menu.classList.add('off')});

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
  <section class="ds st"><h3>操作</h3><p class="li">ページを1枚ずつ止めながらスクロール</p>${sg('snap',[[1,'オン'],[0,'オフ']])}<p class="li">画面の左右端をタップしてページ送り</p>${sg('edge',[[1,'オン'],[0,'オフ']])}<p class="li">自動スクロールの速さ</p>${sg('asp',[[1,'ゆっくり'],[3,'標準'],[6,'はやい'],[10,'最速']])}<p class="li">スクロール中に上部バーを隠す</p>${sg('autohide',[[1,'オン'],[0,'オフ']])}<p class="li">起動時に前回のファイルを開く</p>${sg('resume',[[1,'オン'],[0,'オフ']])}</section>
  <section class="ds st"><h3>データ</h3><p class="li" id="stor">使用量を計算中…</p><nav class="btns"><button class="tonal" id="clrRecent">最近のファイルを削除</button><button class="tonal" id="clrAnn">書き込みを全て削除</button><button class="tonal" id="bkUp">書き込みをバックアップ</button><button class="tonal" id="bkDn">バックアップから復元</button></nav></section>
  <section class="ds st"><h3>アプリについて</h3><p class="li">PDF Studio ・ pdf.js ${pdfjsLib.version}</p></section>`;
  icons(d);d.querySelectorAll('input[type=range]').forEach(sv);d.scrollTop=st}
$('#set').addEventListener('click',e=>{const t=e.target,d=$('#set');
  if(t===d||t.closest('#sx')){d.close();return}
  const sb=t.closest('.seg button');if(sb){const k=sb.parentNode.dataset.k,v=sb.dataset.v;CFG[k]=isNaN(+v)?v:+v;saveCfg();if(k==='mode')applyTheme();if(k==='gap')P.style.gap=CFG.gap+'px';if(k==='view'){applyView();if(S.pdf)fit(CFG.fit)}if(k==='snap')document.body.classList.toggle('snap',!!CFG.snap);if(k==='autohide'&&!CFG.autohide)document.body.classList.remove('barhide');renderSet();return}
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
async function orgBuild(items){const{PDFDocument,degrees}=PDFLib,out=markId(await PDFDocument.create()),cache=[];
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
$('#fab').onclick=fabToggle;
const FI={pdf:'#file',img:'#fileImg',cam:'#fileCam'};
fm.onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.f==='note')newNote();else $(FI[b.dataset.f]).click();fabToggle()};
addEventListener('click',e=>{if(!fm.classList.contains('off')&&!e.target.closest('#fabm,#fab,#rfab'))fabToggle()});
['fileImg','fileCam'].forEach(id=>$('#'+id).onchange=e=>{pick(e.target.files[0]);e.target.value=''});

$('#sClose').onclick=()=>document.body.classList.remove('side');
(function(){const mk=a=>'polygon('+Array.from({length:96},(_,i)=>{const t=i/96*6.2832,r=50*(1+a*Math.cos(12*t))/(1+a);return(50+r*Math.sin(t)).toFixed(1)+'% '+(50-r*Math.cos(t)).toFixed(1)+'%'}).join(',')+')',r=document.documentElement.style;r.setProperty('--cA',mk(.17));r.setProperty('--cB',mk(.05))})();

/* ================= Acrobat-style modes / markup / stamps / tools ================= */
const PLACE=['check','cross','dot','date','sign','ini','stamp','pic'];
function setMode(m){setTool(m==='c'?'hlt':'select');if(m==='f')setTimeout(()=>popMenu($('#bFill'),FILLMENU(),'right'),50)}


function applyView(){P.classList.toggle('two',CFG.view==='d')}

/* text layer (selection / copy / text markup) */
async function textLayer(pg,e){try{const tc=await pg.getTextContent(),tmp=document.createElement('div');
  await pdfjsLib.renderTextLayer({textContentSource:tc,textContent:tc,container:tmp,viewport:pg.getViewport({scale:1}),textDivs:[]}).promise;
  if(!e._vis)return;e.querySelector('.txl').replaceChildren(...tmp.childNodes);markHits(e)}catch(_){}}
function markHits(e){(e?[e]:S.els).forEach(el=>el.querySelectorAll('.txl span').forEach(sp=>sp.classList.toggle('hit',!!S.q&&sp.textContent.toLowerCase().includes(S.q))))}
function mark(x,s,k){x.save();x.fillStyle=x.strokeStyle=s.c;
  s.r.forEach(([a,b,w,h])=>{if(s.k==='hl'){x.globalAlpha=s.o==null?.4:s.o;x.fillRect(a*k,b*k,w*k,h*k)}else{x.lineWidth=Math.max(1.2,h*.08*k);x.lineCap='round';const y=(s.k==='ul'?b+h*.96:b+h*.55)*k;x.beginPath();x.moveTo(a*k,y);x.lineTo((a+w)*k,y);x.stroke()}});x.restore()}
let selT;document.addEventListener('selectionchange',()=>{if(!['hlt','ult','stt'].includes(S.tool))return;clearTimeout(selT);selT=setTimeout(applyMark,500)});
function applyMark(){const sel=getSelection();if(!sel||sel.isCollapsed||!sel.rangeCount)return;
  const rs=[...sel.getRangeAt(0).getClientRects()].filter(r=>r.width>1&&r.height>2);if(!rs.length)return;
  const k={hlt:'hl',ult:'ul',stt:'st'}[S.tool],by={};
  S.els.forEach((e,i)=>{const pr=e.getBoundingClientRect(),sc=pr.width/S.sizes[i].w;
    rs.forEach(r=>{const cx=r.left+r.width/2,cy=r.top+r.height/2;if(cx>=pr.left&&cx<=pr.right&&cy>=pr.top&&cy<=pr.bottom&&r.height<pr.height*.2)(by[i]=by[i]||[]).push([+((r.left-pr.left)/sc).toFixed(1),+((r.top-pr.top)/sc).toFixed(1),+(r.width/sc).toFixed(1),+(r.height/sc).toFixed(1)])})});
  let ch=false;
  Object.keys(by).forEach(i=>{let a=by[i];a=a.filter((r,n)=>!a.some((q,m)=>m!==n&&q[0]<=r[0]+.5&&q[1]<=r[1]+.5&&q[0]+q[2]>=r[0]+r[2]-.5&&q[1]+q[3]>=r[1]+r[3]-.5&&(q[2]*q[3]>r[2]*r[3]||m<n)));
    if(a.length){A(i).s.push({t:'m',k,c:S.col[k],r:a,p:[],w:6,o:k==='hl'?S.o.hlt/100:undefined});ch=true;ink(+i)}});
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
  else if(t==='ini'){const g=JSON.parse(localStorage.getItem('ps-ini')||'null');if(g)S.pend={...g,tw:70};else{sigOpen('ps-ini');return}}
  else if(t==='stamp'){stampOpen();return}
  else if(t==='pic'){$('#fileG').click();return}
  toast('置きたい場所をタップ')}
function gEl(i,g){const d=document.createElement('div');d.className='gx';d._obj=g;const im=new Image();im.src=g.d;d.append(im);
  d.insertAdjacentHTML('beforeend','<b class="h"><span class="ms">open_with</span></b><b class="x"><span class="ms">close</span></b><b class="r"><span class="ms">zoom_out_map</span></b>');
  const ps=()=>{d.style.cssText=`left:${g.x}px;top:${g.y}px;width:${g.w}px;height:${g.h}px`};ps();
  d.addEventListener('click',e=>{if(e.target.closest('b'))return;const on=d.classList.contains('sel');$$('.gx.sel').forEach(x=>x.classList.remove('sel'));if(!on)d.classList.add('sel')});
  const h=d.querySelector('.h');h.onpointerdown=ev=>{ev.preventDefault();h.setPointerCapture(ev.pointerId);d.classList.add('drag');const sx=ev.clientX,sy=ev.clientY,ox=g.x,oy=g.y;
    h.onpointermove=m=>{g.x=ox+(m.clientX-sx)/S.zoom;g.y=oy+(m.clientY-sy)/S.zoom;ps()};h.onpointerup=()=>{h.onpointermove=h.onpointerup=null;d.classList.remove('drag');commit()}};
  const r=d.querySelector('.r');r.onpointerdown=ev=>{ev.preventDefault();r.setPointerCapture(ev.pointerId);d.classList.add('drag');const sx=ev.clientX,w0=g.w,ar=g.h/g.w;
    r.onpointermove=m=>{g.w=Math.max(12,w0+(m.clientX-sx)/S.zoom);g.h=g.w*ar;ps()};r.onpointerup=()=>{r.onpointermove=r.onpointerup=null;d.classList.remove('drag');commit()}};
  d.querySelector('.x').onpointerdown=ev=>{ev.preventDefault();ev.stopPropagation();A(i).g=A(i).g.filter(q=>q!==g);d.remove();commit()};
  return d}
function sigOpen(key){key=key||'ps-sig';const tw=key==='ps-sig'?150:70,d=$('#sig');
  d.innerHTML='<div class="dh"><span>'+(key==='ps-sig'?'署名':'イニシャル')+'を書く</span><button class="ib" id="sgx" aria-label="閉じる"><i data-i="close"></i></button></div><div class="sgw"><canvas id="sgc" width="900" height="360"></canvas><p class="li">Apple Pencilや指で書いてください。保存した署名はこの端末だけに残ります。</p></div><nav class="btns" style="padding:0 24px 22px"><button class="tonal" id="sgClr">消去</button><button class="fabx" id="sgOk"><i data-i="check"></i>この署名を使う</button></nav>';
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
    const g={d:o.toDataURL('image/png'),w,h};try{localStorage.setItem(key,JSON.stringify(g))}catch(_){}
    d.close();S.pend={...g,tw};toast('置きたい場所をタップ')};
  d.onclick=e=>{if(e.target===d)d.close()};d.showModal()}
const STAMPS=[['承認','#2e7d32'],['却下','#b3261e'],['確認済み','#1565c0'],['社外秘','#b3261e'],['下書き','#ef6c00'],['コピー','#6750a4'],['至急','#b3261e'],['完了','#2e7d32']];
function stampOpen(){const d=$('#stamps');
  d.innerHTML=`<div class="dh"><span>スタンプ</span><button class="ib" id="stx" aria-label="閉じる"><i data-i="close"></i></button></div><section class="ds st"><nav class="btns">${STAMPS.map(([t,c],n)=>`<button class="stp" data-n="${n}" style="color:${c};border-color:${c}">${t}</button>`).join('')}</nav><nav class="btns"><button class="tonal" id="stSig">署名を書き直す</button><button class="tonal" id="stIni">イニシャルを書き直す</button><button class="tonal" id="stTxt">テキストスタンプ</button><button class="tonal" id="stPic">画像を追加</button></nav></section>`;
  icons(d);d.onclick=e=>{const b=e.target.closest('button');if(e.target===d||(b&&b.id==='stx')){d.close();return}if(!b)return;
    if(b.dataset.n!==undefined){const[t,c]=STAMPS[b.dataset.n];S.pend=stampImg(t,c);d.close();toast('置きたい場所をタップ')}
    else if(b.id==='stSig'){d.close();sigOpen()}else if(b.id==='stIni'){d.close();sigOpen('ps-ini')}else if(b.id==='stTxt'){d.close();txtStamp()}else if(b.id==='stPic'){d.close();$('#fileG').click()}};d.showModal()}
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
  try{const{PDFDocument}=PDFLib,out=markId(await PDFDocument.create()),add=async buf=>{const src=await PDFDocument.load(buf,{ignoreEncryption:true});(await out.copyPages(src,src.getPageIndices())).forEach(p=>out.addPage(p))};
    const has=!!S.pdf,ann=has?JSON.parse(JSON.stringify(S.ann)):undefined,nm=has?S.name.replace(/\.pdf$/i,'')+'-結合.pdf':'結合.pdf';
    if(has)await add(S.bytes);for(const f of fs)await add(/^image\//.test(f.type)?await img2pdf(f):await f.arrayBuffer());
    const u=await out.save();await load(u.buffer.slice(u.byteOffset,u.byteOffset+u.byteLength),nm,ann);toast('結合しました')
  }catch(err){console.error(err);toast('結合できませんでした')}finally{idle()}};

/* tools hub */
const TOOLS=[
 ['コメントと入力',[['comment','コメント','ハイライト・付箋・手描き・図形',1,()=>setMode('c')],['signature','入力と署名','署名・チェック・日付・スタンプ',1,()=>setMode('f')],['summarize','コメントを書き出し','付箋やハイライトした文章を.txtに',1,exportComments]]],
 ['ページ',[['dashboard_customize','ページを整理','回転・並べ替え・削除・挿入',1,orgOpen],['merge','PDFを結合','複数のPDFや画像を1つにまとめる',0,()=>$('#fileM').click()],['call_split','PDFを分割','ページ範囲ごとにファイルを分ける',1,splitPdf],['water_drop','透かしを追加','全ページに文字の透かしを入れる',1,addWatermark],['format_list_numbered','ページ番号を追加','位置と形式を選んで番号を入れる',1,addPageNumbers]]],
 ['閲覧',[['swipe_vertical','自動スクロール','一定の速さで自動的に進む',1,()=>autoScroll(true)],['visibility_off','書き込みを隠す・表示','書き込みを一時的に非表示にする',1,()=>setHide(!document.body.classList.contains('hideann'))]]],
 ['書き出しと最適化',[['compress','PDFを圧縮','ページを画像化してサイズを小さく',1,compressPdf],['image','画像として書き出し','表示中のページをPNGで保存',1,exportImage],['article','テキストとして書き出し','文字を抽出して.txtで保存',1,exportText]]],
 ['作成',[['add_photo_alternate','画像からPDF','写真や画像をPDFに変換',0,()=>$('#fileImg').click()],['photo_camera','カメラでスキャン','撮影してPDFにする',0,()=>$('#fileCam').click()],['edit_note','ノートを作成','白紙・罫線・方眼・ドットから選ぶ',0,newNote]]],
 ['文書',[['info','詳細情報','プロパティとメタデータ',1,()=>$('#bInfo').click()],['edit_document','詳細情報を編集','タイトル・作成者などを変更',1,editMeta],['lock','パスワード保護','このアプリでは未対応です',-1,null]]]];
function openTools(){const g=$('#tgrid');g.innerHTML='';$('#tq').value='';
  TOOLS.forEach(([h,items])=>{const hh=document.createElement('h2');hh.textContent=h;const gr=document.createElement('div');gr.className='tg';
    items.forEach(([ic,t,d,req,f],n)=>{const dis=req===-1,b=document.createElement('button');b.className='tcd v'+(n%3)+(dis?' dis':'');
      b.innerHTML=`<span class="tci"><i data-i="${ic}"></i></span><b></b><small></small>`;b.querySelector('b').textContent=t;b.querySelector('small').textContent=d;
      b.onclick=()=>{if(dis){toast(d);return}$('#tools').classList.remove('open');navSel(hv);if(req===1&&!S.pdf){S.after=f;$('#file').click();toast('PDFを選んでください');return}f()};gr.append(b)});
    g.append(hh,gr)});
  icons(g);$('#tools').classList.add('open')}
$('#tClose').onclick=()=>{$('#tools').classList.remove('open');navSel(hv)};


/* ================= Acrobat-style app shell ================= */
/* popover menu */
function closePop(){document.querySelectorAll('.pop').forEach(x=>x.remove());if(S.sel){const i=S.sel.i;S.sel=null;ink(i)}}
function popMenu(a,items,side){closePop();const p=document.createElement('div');p.className='pop';
  items.forEach(it=>{if(it==='-'){p.append(document.createElement('hr'));return}const b=document.createElement('button');b.innerHTML=`<i data-i="${it[0]}"></i><span></span>`;b.querySelector('span').textContent=it[1];b.onclick=e=>{e.stopPropagation();closePop();it[2]()};p.append(b)});
  icons(p);document.body.append(p);const r=a.getBoundingClientRect();
  if(side==='right'){p.style.left=Math.min(r.right+10,innerWidth-p.offsetWidth-12)+'px';p.style.top=Math.max(12,Math.min(r.top,innerHeight-p.offsetHeight-12))+'px'}
  else{p.style.top=Math.min(r.bottom+8,innerHeight-p.offsetHeight-12)+'px';p.style.left=Math.max(12,Math.min(r.left,innerWidth-p.offsetWidth-12))+'px'}
  requestAnimationFrame(()=>p.classList.add('on'))}
addEventListener('click',e=>{if(!e.target.closest('.pop'))closePop()},true);
const FILLMENU=()=>[['signature','署名',()=>setTool('sign')],['draw','イニシャル',()=>setTool('ini')],['check','チェックマーク',()=>setTool('check')],['close','バツ印',()=>setTool('cross')],['circle','丸',()=>setTool('dot')],['calendar_today','今日の日付',()=>setTool('date')],['approval','スタンプ',()=>setTool('stamp')],['add_photo_alternate','画像を追加',()=>setTool('pic')]];
$('#bFill').onclick=e=>{e.stopPropagation();popMenu(e.currentTarget,FILLMENU(),'right')};
$('#bTabFill').onclick=e=>{e.stopPropagation();popMenu(e.currentTarget,FILLMENU())};
$('#bTabEdit').onclick=e=>{e.stopPropagation();popMenu(e.currentTarget,[['dashboard_customize','ページを整理',orgOpen],['call_split','PDFを分割',splitPdf],['merge','ファイルを結合',()=>$('#fileM').click()],['compress','PDFを圧縮',compressPdf]])};
$('#bTabExp').onclick=e=>{e.stopPropagation();popMenu(e.currentTarget,[['image','画像として書き出し（表示中のページ）',exportImage],['article','テキストとして書き出し',exportText],'-',['download','コピーを保存',()=>exportPdf(true)],['ios_share','コピーを送信',()=>exportPdf(false)],['print','印刷',printPdf]])};
$('#bTabTools').onclick=openTools;
$('#bSearch').onclick=()=>{document.body.classList.add('side');thumbs();$('#stabs [data-p=srch]').click()};
$('#bCmt').onclick=()=>{document.body.classList.add('side');$('#stabs [data-p=cmt]').click()};
$('#bRedo2').onclick=()=>$('#bRedo').click();
$('#bCmp').onclick=compressPdf;$('#bMrg').onclick=()=>$('#fileM').click();$('#bSpl').onclick=splitPdf;$('#bSet2').onclick=()=>$('#bSet').click();
$('#bPrint').onclick=printPdf;$('#bRead').onclick=$('#bSpeak').onclick=readAloud;$('#rdStop').onclick=stopRead;
$('#mView').onclick=()=>{const v=$('#mVw');v.hidden=!v.hidden;$('#mView .chev').style.transform=v.hidden?'':'rotate(90deg)'};
$('#fW').onclick=()=>fitW();$('#fP').onclick=()=>fitP();
$('#vC').onclick=()=>{CFG.view='c';saveCfg();applyView();fit(CFG.fit)};$('#vD').onclick=()=>{CFG.view='d';saveCfg();applyView();fit(CFG.fit)};
$('#mStar').onclick=async()=>{const s=await starToggle(S.id);$('#mStar').classList.toggle('on',s);toast(s?'スターを付けました':'スターを外しました')};
function fillMore(){recent().then(fillRec);$('#mName').textContent=S.name;const i=(S.meta&&S.meta.info)||{},d=i.ModDate||i.CreationDate;$('#mMeta').textContent='PDF ・ '+(d?pd(d).split(' ')[0]:fmtSize(S.size));DB.get('files',S.id).then(f=>$('#mStar').classList.toggle('on',!!(f&&f.star))).catch(()=>{})}
async function printPdf(){if(!S.pdf)return;busy('印刷用PDFを準備中…');
  try{const doc=await PDFLib.PDFDocument.load(S.bytes,{ignoreEncryption:true});await bake(doc,S.ann,S.sizes);const u=await doc.save();idle();
    const url=URL.createObjectURL(new Blob([u],{type:'application/pdf'})),w=window.open(url,'_blank');if(!w)location.href=url;toast('開いたPDFの共有ボタンから印刷できます')}
  catch(e){idle();console.error(e);toast('印刷用PDFを作成できませんでした')}}
/* read aloud */
let rd=null;
async function readAloud(){if(!need())return;if(rd){stopRead();return}
  if(!('speechSynthesis' in window)){toast('この端末は読み上げに対応していません');return}
  rd={i:S.cur-1};$('#rdbar').classList.add('on');
  const next=async()=>{if(!rd)return;if(rd.i>=S.sizes.length){stopRead();return}
    const t=(await ptext(rd.i)).trim();go(rd.i+1);if(!t){rd.i++;next();return}
    const parts=t.match(/[\s\S]{1,2500}/g),lang=/[\u3040-\u30ff\u4e00-\u9fff]/.test(t)?'ja-JP':'en-US';
    parts.forEach((p,k)=>{const u=new SpeechSynthesisUtterance(p);u.lang=lang;u.onerror=()=>{if(rd)stopRead()};if(k===parts.length-1)u.onend=()=>{if(rd){rd.i++;next()}};speechSynthesis.speak(u)})};
  next()}
function stopRead(){rd=null;try{speechSynthesis.cancel()}catch(_){}$('#rdbar').classList.remove('on')}
/* home: quick tiles + bottom navigation */
const navSel=k=>$$('#bnav .bi').forEach(b=>b.classList.toggle('on',b.dataset.v===k));
function setHv(v){hv=v;document.body.dataset.hv=v;navSel(v);$('#tools').classList.remove('open');if(v==='search'){$('#hq').value=rcQ='';setTimeout(()=>$('#hq').focus(),60)}paintRecent()}
$$('#bnav .bi').forEach(b=>b.onclick=()=>{if(b.dataset.v==='tools'){openTools();navSel('tools')}else setHv(b.dataset.v)});
$$('#htabs button').forEach(b=>b.onclick=()=>{htab=b.dataset.t;$$('#htabs button').forEach(x=>x.classList.toggle('on',x===b));paintRecent()});
const QT=[['add','PDFを作成',0,e=>fabToggle(e)],['signature','入力と署名',1,()=>setMode('f')],['dashboard_customize','ページを整理',1,orgOpen],['merge','ファイルを結合',0,()=>$('#fileM').click()],['compress','PDFを圧縮',1,compressPdf],['call_split','PDFを分割',1,splitPdf],['image','画像で書き出し',1,exportImage],['volume_up','読み上げ',1,readAloud],['edit_note','ノート作成',0,newNote],['photo_camera','スキャン',0,()=>$('#fileCam').click()],['apps','すべてのツール',0,()=>{openTools();navSel('tools')}]];
$('#qt').innerHTML=QT.map((t,n)=>`<button class="qb q${n%8}"><span class="qti"><i data-i="${t[0]}"></i></span><span>${t[1]}</span></button>`).join('');icons($('#qt'));
$$('#qt .qb').forEach((b,n)=>b.onclick=e=>{const t=QT[n];if(t[2]&&!S.pdf){S.after=t[3];$('#file').click();toast('PDFを選んでください')}else t[3](e)});

/* ================= pen / tool customisation ================= */
const CURVE={s:.6,n:1,h:1.7},U={pw:'pt',po:'%',ps:'%',pm:'',hw:'pt',ho:'%',sf:'%',ew:'pt',mo:'%',tz:'pt'};
const SHAPES=[['line','直線'],['arrow','矢印'],['darrow','両矢印'],['rect','四角'],['rrect','角丸'],['ell','楕円'],['tri','三角']];
Object.assign(S,{o:{pen:100,hl:40,hlt:40},ps:{y:'f',sens:100,sm:3,d:'s',curve:'n'},fill:0,tf:{f:'g',b:0,i:0,bg:''},q:''});
let RCOL=JSON.parse(localStorage.getItem('ps-rc')||'[]'),FAV=JSON.parse(localStorage.getItem('ps-fav')||'[null,null,null]'),favSave=false;
function newStroke(){if(S.tool==='er')return null;
  if(S.tool==='shape')return{t:'s',k:S.shape,c:S.col.pen,w:S.w.pen,o:S.o.pen/100,d:S.ps.d,fo:S.fill/100,p:[]};
  if(S.tool==='hl')return{t:'h',c:S.col.hl,w:S.w.hl,o:S.o.hl/100,p:[]};
  return{t:'p',c:S.col.pen,w:S.w.pen,o:S.o.pen/100,y:S.ps.y,sn:S.ps.sens/100,d:S.ps.d,p:[]}}
function eraseObj(e){const el=S.els[D.i];el.querySelectorAll('.tb,.gx').forEach(d=>{const r=d.getBoundingClientRect(),m=6;
  if(d._obj&&e.clientX>=r.left-m&&e.clientX<=r.right+m&&e.clientY>=r.top-m&&e.clientY<=r.bottom+m){const a=A(D.i);if(d.classList.contains('tb'))a.t=a.t.filter(q=>q!==d._obj);else a.g=a.g.filter(q=>q!==d._obj);d.remove();D.ch=true}})}
V.addEventListener('pointerdown',e=>{if(!e.target.closest('.tb,.gx'))$$('.tb.sel,.gx.sel').forEach(x=>x.classList.remove('sel'));
  if(S.tb&&!e.target.closest('.tb,#props,#dock')){S.tb=null;syncProps()}},true);
const pk=()=>S.tb?'tx':{pen:'pen',hl:'hl',shape:'shape',er:'er',text:'tx',hlt:'hlt',ult:'ult',stt:'stt'}[S.tool];
const ck=kd=>({pen:'pen',shape:'pen',hl:'hl',hlt:'hl',ult:'ul',stt:'st',tx:'tx'}[kd]);
const colorOf=kd=>kd==='tx'&&S.tb?S.tb.t.c:(S.col[ck(kd)]||'#000000');
function propsHTML(kd){
  const R=(id,l,mn,mx,st,v)=>`<label class="row"><span>${l}</span><input id="${id}" type="range" min="${mn}" max="${mx}" step="${st}" value="${v}"><output id="${id}V">${v}${U[id]||''}</output></label>`;
  const G=(k,o,cur,cls)=>`<nav class="${cls||'seg'}" data-g="${k}">${o.map(([v,l])=>`<button data-v="${v}" class="${String(cur)===String(v)?'on':''}">${l}</button>`).join('')}</nav>`;
  const cur=colorOf(kd),all=[...COLORS,...RCOL.filter(c=>!COLORS.includes(c)).slice(0,6)];
  const col=`<div class="sw">${all.map(c=>`<button data-c="${c}" style="background:${c}" class="${c.toLowerCase()===cur.toLowerCase()?'on':''}" aria-label="${c}"></button>`).join('')}<label class="cust" title="好きな色"><input type="color" id="cc" value="${cur}"></label></div>`;
  const fing=`<label class="row"><span>指でも描く</span><input id="fsw" type="checkbox" class="switch" ${CFG.finger?'checked':''}></label>`;
  const fav=`<div class="favr"><span>お気に入り</span>${FAV.map((f,n)=>`<button class="fav${f?'':' empty'}" data-fav="${n}">${f?`<i style="background:${f.c}"></i>${f.w}`:'＋'}</button>`).join('')}<button class="chip2${favSave?' on':''}" data-act="favsave">${favSave?'保存先を選択':'保存'}</button></div>`;
  const dash=G('pd',[['s','実線'],['d','破線'],['t','点線']],S.ps.d);
  if(S.compact&&['pen','hl','shape','tx'].includes(kd)){const cw=kd==='hl'?[10,18,28,40]:kd==='tx'?[12,16,20,28,40]:[.5,1,2,3,6,10],cv=kd==='hl'?S.w.hl:kd==='tx'?(S.tb?S.tb.t.s:S.w.tx):S.w.pen;
    return`<div class="cmprow">${col.replace('class="sw"','class="sw cs"')}<span class="vs"></span><nav class="chips2 cw">${cw.map(w=>`<button data-w="${w}" class="${cv==w?'on':''}">${w}</button>`).join('')}</nav><button class="chip2" data-act="expand">詳細</button></div>`}
  if(kd==='pen')return`<canvas id="pv" width="360" height="72"></canvas><nav class="chips2">${[1,2,3,6,10].map(w=>`<button data-w="${w}" class="${S.w.pen==w?'on':''}">${w}</button>`).join('')}</nav>`+G('py',[['b','ボール'],['f','万年筆'],['r','筆'],['p','鉛筆']],S.ps.y)+R('pw','太さ',.5,30,.5,S.w.pen)+R('po','不透明度',10,100,5,S.o.pen)+(S.ps.y!=='b'?R('ps','筆圧の強さ',0,200,10,S.ps.sens)+G('pc',[['s','やわらかい'],['n','標準'],['h','かため']],S.ps.curve):'')+R('pm','手ぶれ補正',0,10,1,S.ps.sm)+dash+col+fav+fing;
  if(kd==='hl')return`<canvas id="pv" width="360" height="72"></canvas>`+R('hw','太さ',6,48,1,S.w.hl)+R('ho','不透明度',10,80,5,S.o.hl)+col+fav+fing;
  if(kd==='shape')return G('sk',SHAPES,S.shape,'chips2')+R('pw','線の太さ',.5,30,.5,S.w.pen)+R('po','不透明度',10,100,5,S.o.pen)+dash+R('sf','塗りつぶし',0,100,5,S.fill)+col+fing;
  if(kd==='er')return R('ew','消しゴムの大きさ',6,60,1,S.w.er)+`<p class="li">線・図形・テキストボックス・画像に触れると消えます。</p><nav class="btns"><button class="tonal" data-act="clrpage">このページの書き込みを全消去</button></nav>`+fing;
  if(kd==='tx'){const t=S.tb?S.tb.t:{s:S.w.tx,f:S.tf.f,b:S.tf.b,i:S.tf.i,bg:S.tf.bg};
    return R('tz','文字サイズ',8,96,1,t.s)+G('tf',[['g','ゴシック'],['m','明朝'],['r','丸ゴ'],['c','等幅']],t.f||'g')+`<nav class="chips2"><button data-act="tb" class="${t.b?'on':''}"><b>B</b>　太字</button><button data-act="ti" class="${t.i?'on':''}"><i>I</i>　斜体</button></nav><p class="li">背景色</p><div class="sw">${['','#fff59d','#bbdefb','#c8e6c9','#ffcdd2','#ffffff'].map(c=>`<button data-bg="${c}" class="${(t.bg||'')===c?'on':''}" style="background:${c||'repeating-conic-gradient(#ccc 0 25%,#fff 0 50%) 0 0/10px 10px'}" aria-label="背景"></button>`).join('')}</div><p class="li">文字色</p>`+col}
  if(kd==='hlt')return R('mo','不透明度',10,100,5,S.o.hlt)+col;
  return col}
function syncProps(){const pr=$('#props'),kd=pk();
  if(S.tb)pr.classList.remove('off');else if(S.tool==='select'||S.tool==='note'||PLACE.includes(S.tool)||!kd){pr.classList.add('off');return}
  const st=pr.scrollTop;let hh=propsHTML(kd);if(!S.compact&&['pen','hl','shape','tx'].includes(kd))hh='<nav class="chips2"><button data-act="collapse">コンパクト表示にする</button></nav>'+hh;pr.innerHTML=hh;pr.classList.toggle('cmpk',hh.startsWith('<div class="cmprow">'));pr.querySelectorAll('input[type=range]').forEach(sv);pr.scrollTop=st;pvDraw()}
function pvDraw(){const c=$('#pv');if(!c)return;const x=c.getContext('2d');x.clearRect(0,0,c.width,c.height);x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);
  const p=[];for(let i=0;i<=60;i++){const t=i/60;p.push([22+t*316,36+Math.sin(t*6.28)*14,Math.min(1,.12+Math.sin(t*3.14)*.9)])}
  stroke(x,S.tool==='hl'?{t:'h',c:S.col.hl,w:S.w.hl,o:S.o.hl/100,p}:{t:'p',c:S.col.pen,w:S.w.pen,o:S.o.pen/100,y:S.ps.y,sn:S.ps.sens/100,d:S.ps.d,p},1)}
function setColor(c,rec){const kd=pk();if(kd==='tx'&&S.tb){S.tb.t.c=c;S.tb.d.style.color=c;S.col.tx=c;commit()}else S.col[ck(kd)]=c;
  if(rec){RCOL=[c,...RCOL.filter(x=>x!==c)].slice(0,8);localStorage.setItem('ps-rc',JSON.stringify(RCOL))}syncProps()}
const favState=()=>S.tool==='hl'?{k:'hl',c:S.col.hl,w:S.w.hl,o:S.o.hl}:{k:'pen',c:S.col.pen,w:S.w.pen,o:S.o.pen,ps:{...S.ps}};
function loadFav(f){if(f.k==='hl'){S.tool='hl';S.col.hl=f.c;S.w.hl=f.w;S.o.hl=f.o}else{S.col.pen=f.c;S.w.pen=f.w;S.o.pen=f.o;Object.assign(S.ps,f.ps||{})}}
const PR=$('#props');
PR.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const g=b.parentNode.dataset&&b.parentNode.dataset.g,v=b.dataset.v;
  if(g){if(g==='py')S.ps.y=v;else if(g==='pc')S.ps.curve=v;else if(g==='pd')S.ps.d=v;else if(g==='sk')S.shape=v;else if(g==='tf'){if(S.tb){S.tb.t.f=v;tbStyle(S.tb.d,S.tb.t);commit()}else S.tf.f=v}syncProps();return}
  if(b.dataset.c){setColor(b.dataset.c,true);return}
  if(b.dataset.w){const w=+b.dataset.w,kd=pk();if(kd==='hl')S.w.hl=w;else if(kd==='tx'){if(S.tb){S.tb.t.s=w;pos(S.tb.d,S.tb.t);save()}else S.w.tx=w}else S.w.pen=w;syncProps();return}
  if(b.dataset.bg!==undefined){const bg=b.dataset.bg;if(S.tb){S.tb.t.bg=bg;tbStyle(S.tb.d,S.tb.t);commit()}else S.tf.bg=bg;syncProps();return}
  if(b.dataset.fav!==undefined){const n=+b.dataset.fav;if(favSave||!FAV[n]){FAV[n]=favState();favSave=false;localStorage.setItem('ps-fav',JSON.stringify(FAV));toast('お気に入りに保存しました')}else{loadFav(FAV[n]);setTool(S.tool)}syncProps();return}
  const a=b.dataset.act;
  if(a==='favsave'){favSave=!favSave;syncProps()}
  else if(a==='tb'||a==='ti'){const k=a==='tb'?'b':'i';if(S.tb){S.tb.t[k]=S.tb.t[k]?0:1;tbStyle(S.tb.d,S.tb.t);commit()}else S.tf[k]=S.tf[k]?0:1;syncProps()}
  else if(a==='expand'){S.compact=false;syncProps()}else if(a==='collapse'){S.compact=true;syncProps()}else if(a==='clrpage'){if(confirm('このページの書き込みをすべて消去しますか？')){const i=S.cur-1;S.ann[i]={s:[],t:[],g:[]};ink(i);txt(i);commit()}}});
PR.addEventListener('input',e=>{const t=e.target,v=+t.value,id=t.id;
  if(id==='cc'){const kd=pk();if(kd==='tx'&&S.tb){S.tb.t.c=t.value;S.tb.d.style.color=t.value}else S.col[ck(kd)]=t.value;pvDraw();return}
  if(id==='fsw'){CFG.finger=t.checked;saveCfg();$('#finger').checked=t.checked;document.body.classList.toggle('finger',t.checked);return}
  const set={pw:()=>S.w.pen=v,po:()=>S.o.pen=v,ps:()=>S.ps.sens=v,pm:()=>S.ps.sm=v,hw:()=>S.w.hl=v,ho:()=>S.o.hl=v,sf:()=>S.fill=v,ew:()=>S.w.er=v,mo:()=>S.o.hlt=v,tz:()=>{if(S.tb){S.tb.t.s=v;pos(S.tb.d,S.tb.t);save()}else S.w.tx=v}}[id];
  if(set){set();const o=$('#'+id+'V');if(o)o.textContent=v+(U[id]||'');sv(t);pvDraw()}});
PR.addEventListener('change',e=>{if(e.target.id==='cc')setColor(e.target.value,true)});

/* bookmarks / page tone */
const BM=JSON.parse(localStorage.getItem('ps-bm')||'{}'),bmSave=()=>localStorage.setItem('ps-bm',JSON.stringify(BM));
function bmUpdate(){pslUpdate();const b=$('#bBm');if(b)b.classList.toggle('on',(BM[S.id]||[]).includes(S.cur))}
function renderBm(){const b=$('#bml'),l=BM[S.id]||[];b.innerHTML=l.length?'<h4 class="oh">マイしおり</h4>':'';l.forEach(p=>{const x=document.createElement('button');x.className='ol';x.textContent=p+'ページ';x.onclick=()=>go(p);b.append(x)})}
$('#bBm').onclick=()=>{if(!S.pdf)return;const l=BM[S.id]||(BM[S.id]=[]),i=l.indexOf(S.cur);if(i>=0)l.splice(i,1);else l.push(S.cur);l.sort((a,b)=>a-b);bmSave();bmUpdate();renderBm();toast(i>=0?'しおりを外しました':S.cur+'ページにしおりを付けました')};
function setTone(t){CFG.tone=t;saveCfg();document.body.classList.toggle('inv',t==='i');document.body.dataset.tone=t;$$('[data-tn]').forEach(b=>b.classList.toggle('on',b.dataset.tn===t));$('#bInv').classList.toggle('on',t==='i')}
$$('[data-tn]').forEach(b=>b.onclick=()=>setTone(b.dataset.tn));
setTone(CFG.tone||'n');

/* ================= 10 new features ================= */
const markId=d=>{d.catalog.set(PDFLib.PDFName.of('PSId'),PDFLib.PDFString.of(Math.random().toString(16).slice(2)+Date.now().toString(16)));return d};
async function modifyDoc(fn,suffix,replace){if(!need())return;busy('処理中…');const old=S.id;
  try{const doc=await PDFLib.PDFDocument.load(S.bytes,{ignoreEncryption:true});await fn(doc);markId(doc);const u=await doc.save(),nm=S.name.replace(/\.pdf$/i,'')+suffix+'.pdf',ann=JSON.parse(JSON.stringify(S.ann));
    await load(u.buffer.slice(u.byteOffset,u.byteOffset+u.byteLength),nm,ann);if(replace){DB.del('files',old).catch(()=>{});DB.del('annots',old).catch(()=>{});recent()}toast('適用しました')}
  catch(e){console.error(e);toast('処理できませんでした')}finally{idle()}}
/* 1. new note (blank / lined / grid / dot) */
async function newNote(){const t=await choose('ノートのテンプレート',[['w','白紙'],['l','罫線'],['g','方眼'],['d','ドット']]);if(!t)return;
  const n=+(await choose('ページ数',[['1','1ページ'],['5','5ページ'],['10','10ページ'],['20','20ページ']])||0);if(!n)return;busy('ノートを作成中…');
  try{const{PDFDocument,rgb}=PDFLib,doc=markId(await PDFDocument.create()),W=595,H=842,c=rgb(.74,.77,.82);
    for(let i=0;i<n;i++){const p=doc.addPage([W,H]);
      if(t==='l')for(let y=H-80;y>40;y-=26)p.drawLine({start:{x:36,y},end:{x:W-36,y},thickness:.6,color:c});
      else if(t==='g'){for(let x=36;x<=W-36;x+=21)p.drawLine({start:{x,y:40},end:{x,y:H-40},thickness:.4,color:c});for(let y=40;y<=H-40;y+=21)p.drawLine({start:{x:36,y},end:{x:W-36,y},thickness:.4,color:c})}
      else if(t==='d'){for(let x=36;x<=W-36;x+=21)for(let y=40;y<=H-40;y+=21)p.drawCircle({x,y,size:.9,color:c})}}
    const u=await doc.save(),d=new Date(),z=v=>String(v).padStart(2,'0'),nm=`ノート-${d.getFullYear()}${z(d.getMonth()+1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}.pdf`;
    S.after=()=>setTool('pen');await load(u.buffer.slice(u.byteOffset,u.byteOffset+u.byteLength),nm)}
  catch(e){console.error(e);toast('ノートを作成できませんでした')}finally{idle()}}
/* 2. auto scroll */
const AS={on:false,acc:0,last:0};
function autoScroll(on){AS.on=on===undefined?!AS.on:on;$('#asbar').classList.toggle('on',AS.on);$('#asV').textContent=CFG.asp;if(AS.on){AS.acc=V.scrollTop;AS.last=performance.now();requestAnimationFrame(asTick)}}
function asTick(t){if(!AS.on)return;const dt=t-AS.last;AS.last=t;if(Math.abs(V.scrollTop-AS.acc)>2)AS.acc=V.scrollTop;AS.acc+=CFG.asp*10*dt/1000;V.scrollTop=AS.acc;
  if(V.scrollTop+V.clientHeight>=V.scrollHeight-1){autoScroll(false);toast('最後まで到達しました');return}requestAnimationFrame(asTick)}
$('#bAuto').onclick=()=>{if(need())autoScroll()};$('#asStop').onclick=()=>autoScroll(false);
$('#asPlus').onclick=()=>{CFG.asp=Math.min(10,CFG.asp+1);saveCfg();$('#asV').textContent=CFG.asp};
$('#asMinus').onclick=()=>{CFG.asp=Math.max(1,CFG.asp-1);saveCfg();$('#asV').textContent=CFG.asp};
['touchstart','wheel'].forEach(n=>V.addEventListener(n,()=>{if(AS.on)autoScroll(false)},{passive:true}));
/* 3. hide annotations */
function setHide(on){document.body.classList.toggle('hideann',on);$('#bHide').classList.toggle('on',on);$('#bHide').lastChild.textContent=on?'書き込みを表示':'書き込みを隠す';toast(on?'書き込みを隠しました':'書き込みを表示しました')}
$('#bHide').onclick=()=>{if(need())setHide(!document.body.classList.contains('hideann'))};
/* 4. page snap (setting) + 5. edge tap page turn */
document.body.classList.toggle('snap',!!CFG.snap);
let dn={};V.addEventListener('pointerdown',e=>{dn={x:e.clientX,y:e.clientY,t:Date.now()}},true);
V.addEventListener('pointerup',e=>{if(!CFG.edge||!S.pdf||S.tool!=='select'||e.target.closest('.tb,.gx'))return;
  if(Date.now()-dn.t>320||Math.hypot(e.clientX-dn.x,e.clientY-dn.y)>10)return;const sel=getSelection();if(sel&&!sel.isCollapsed)return;
  const r=V.getBoundingClientRect(),f=(e.clientX-r.left)/r.width;if(f<.18)go(S.cur-1);else if(f>.82)go(S.cur+1)},true);
/* 6. watermark / 7. page numbers */
async function addWatermark(){if(!need())return;const txt=prompt('透かしの文字','社外秘');if(!txt)return;
  const o=+(await choose('透かしの濃さ',[['15','薄い'],['28','標準'],['45','濃い']])||0);if(!o)return;
  const c=document.createElement('canvas');c.width=c.height=1400;const x=c.getContext('2d');x.translate(700,700);x.rotate(-Math.PI/4.6);x.textAlign='center';x.textBaseline='middle';
  let f=300;const fn=()=>`800 ${f}px -apple-system,"Hiragino Sans",sans-serif`;x.font=fn();const w=x.measureText(txt).width;if(w>1100){f=f*1100/w;x.font=fn()}
  x.fillStyle=`rgba(110,110,110,${o/100})`;x.fillText(txt,0,0);const png=c.toDataURL('image/png');
  await modifyDoc(async doc=>{const img=await doc.embedPng(png);doc.getPages().forEach(p=>{const cb=p.getCropBox(),sz=Math.min(cb.width,cb.height);p.drawImage(img,{x:cb.x+cb.width/2-sz/2,y:cb.y+cb.height/2-sz/2,width:sz,height:sz})})},'-透かし')}
async function addPageNumbers(){if(!need())return;const pos=await choose('ページ番号の位置',[['bc','下・中央'],['br','下・右'],['bl','下・左'],['tr','上・右']]);if(!pos)return;
  const fm=await choose('表示形式',[['n','1'],['t','1 / 全体']]);if(!fm)return;const N=S.sizes.length;
  await modifyDoc(async doc=>{const pgs=doc.getPages(),F='600 44px -apple-system,"Hiragino Sans",sans-serif';
    for(let i=0;i<pgs.length;i++){const s=fm==='t'?`${i+1} / ${N}`:`${i+1}`,c=document.createElement('canvas'),x=c.getContext('2d');x.font=F;const w=Math.ceil(x.measureText(s).width)+12;
      c.width=w;c.height=60;x.font=F;x.fillStyle='#444';x.textBaseline='middle';x.fillText(s,6,32);
      const img=await doc.embedPng(c.toDataURL('image/png')),p=pgs[i],cb=p.getCropBox(),h=13,wd=w*h/60,m=26,
        X=pos[1]==='c'?cb.x+cb.width/2-wd/2:pos[1]==='r'?cb.x+cb.width-wd-m:cb.x+m,Y=pos[0]==='b'?cb.y+m*.7:cb.y+cb.height-h-m*.7;
      p.drawImage(img,{x:X,y:Y,width:wd,height:h})}},'-番号付き')}
/* 8. edit document properties */
function editMeta(){if(!need())return;const i=(S.meta&&S.meta.info)||{},d=$('#metad');
  d.innerHTML='<div class="dh"><span>詳細情報を編集</span><button class="ib" id="mx" aria-label="閉じる"><i data-i="close"></i></button></div><div class="mf"><label>タイトル<input id="mTi"></label><label>作成者<input id="mAu"></label><label>件名<input id="mSu"></label><label>キーワード（カンマ区切り）<input id="mKw"></label></div><nav class="btns" style="padding:0 24px 22px"><button class="fabx" id="mOk"><i data-i="check"></i>保存</button></nav>';
  icons(d);$('#mTi').value=i.Title||'';$('#mAu').value=i.Author||'';$('#mSu').value=i.Subject||'';$('#mKw').value=i.Keywords||'';
  $('#mx').onclick=()=>d.close();
  $('#mOk').onclick=async()=>{const v=[$('#mTi').value,$('#mAu').value,$('#mSu').value,$('#mKw').value];d.close();
    await modifyDoc(async doc=>{doc.setTitle(v[0]);doc.setAuthor(v[1]);doc.setSubject(v[2]);doc.setKeywords(v[3].split(/[,、]/).map(x=>x.trim()).filter(Boolean));doc.setModificationDate(new Date())},'',true)};
  d.onclick=e=>{if(e.target===d)d.close()};d.showModal()}
/* 9. text stamp (initials/signature live in sigOpen) */
async function txtStamp(){const t=prompt('スタンプの文字','確認済み');if(!t)return;const c=await choose('スタンプの色',[['#b3261e','赤'],['#1565c0','青'],['#2e7d32','緑'],['#1d1b20','黒']]);if(!c)return;S.pend=stampImg(t,c);toast('置きたい場所をタップ')}
/* 10. export comments (incl. highlighted sentences) */
async function exportComments(){if(!need())return;busy('コメントを集計中…');
  try{let out=`${S.name} のコメント\n\n`,n=0;const L={hl:'ハイライト',ul:'下線',st:'取り消し線'};
    for(const key of Object.keys(S.ann).map(Number).sort((a,b)=>a-b)){const a=A(key),marks=a.s.filter(s=>s.t==='m');if(!a.t.length&&!marks.length)continue;out+=`■ ${key+1}ページ\n`;
      if(marks.length){const pg=await S.pdf.getPage(key+1),vp=pg.getViewport({scale:1}),tc=await pg.getTextContent(),
          items=tc.items.map(it=>{const m=pdfjsLib.Util.transform(vp.transform,it.transform);return{s:it.str,x:m[4],y:m[5]-it.height,w:it.width,h:it.height}});
        marks.forEach(m=>{const txt=items.filter(it=>m.r.some(r=>{const cx=it.x+it.w/2,cy=it.y+it.h/2;return cx>=r[0]&&cx<=r[0]+r[2]&&cy>=r[1]&&cy<=r[1]+r[3]})).map(it=>it.s).join('');n++;out+=`  [${L[m.k]}] ${txt||'（文字なし）'}\n`})}
      a.t.forEach(t=>{n++;out+=`  [${t.k==='n'?'付箋':'テキスト'}] ${t.t.replace(/\n/g,' ')}\n`});out+='\n'}
    idle();if(!n){toast('書き出せるコメントがありません');return}
    await deliver(new TextEncoder().encode(out),S.name.replace(/\.pdf$/i,'')+'-コメント.txt','text/plain')}
  catch(e){idle();console.error(e);toast('書き出せませんでした')}}

/* ================= v9: reading UI + object editing ================= */
Object.assign(S,{compact:true,sel:null});
/* auto-hide bar, reading progress, page scrubber */
let lt=0,pslT,pslDrag=false;
V.addEventListener('scroll',()=>{if(document.body.classList.contains('nodoc')||!S.pdf)return;const t=V.scrollTop,d=t-lt,mx=V.scrollHeight-V.clientHeight;
  $('#rpf').style.width=(mx>0?t/mx*100:0)+'%';
  if(Math.abs(d)>=8){lt=t;if(CFG.autohide)document.body.classList.toggle('barhide',d>0&&t>120)}
  if(S.sizes.length>1){const p=$('#psl');p.classList.add('on');clearTimeout(pslT);pslT=setTimeout(()=>{if(!pslDrag)p.classList.remove('on')},2200)}},{passive:true});
addEventListener('pointerdown',e=>{if(e.clientY<64&&document.body.classList.contains('barhide'))document.body.classList.remove('barhide')},true);
function pslUpdate(){const r=$('#pslR');if(!r)return;r.max=S.sizes.length||1;r.value=S.cur;$('#pslL').textContent=`${S.cur} / ${S.sizes.length}`;sv(r)}
$('#pslR').addEventListener('pointerdown',()=>pslDrag=true);
['pointerup','pointercancel'].forEach(n=>$('#pslR').addEventListener(n,()=>{pslDrag=false;clearTimeout(pslT);pslT=setTimeout(()=>$('#psl').classList.remove('on'),1500)}));
$('#pslR').addEventListener('input',e=>{const n=+e.target.value,el=S.els[n-1];if(el)V.scrollTop=el.offsetTop-12;$('#pslL').textContent=`${n} / ${S.sizes.length}`;sv(e.target)});
/* tap a stroke with the select tool: delete / duplicate / recolor / thickness */
function sbox(s){if(s.t==='m'){let a=1e9,b=1e9,c=-1e9,d=-1e9;s.r.forEach(r=>{a=Math.min(a,r[0]);b=Math.min(b,r[1]);c=Math.max(c,r[0]+r[2]);d=Math.max(d,r[1]+r[3])});return[a,b,c,d]}return bbox(s.p,(s.w||4)/2+2)}
function drawSel(i,s){const c=S.els[i].querySelector('.ink');if(!c.width)return;const x=c.getContext('2d'),k=c.width/S.sizes[i].w,b=sbox(s);
  x.save();x.setLineDash([8,5]);x.lineWidth=2.5;x.strokeStyle=(getComputedStyle(document.documentElement).getPropertyValue('--pr')||'#6750a4').trim();x.strokeRect(b[0]*k,b[1]*k,(b[2]-b[0])*k,(b[3]-b[1])*k);x.restore()}
function strokeMenu(e,i,x,y,k){const sel=getSelection();if(sel&&!sel.isCollapsed)return;const thr=14/k;let best=null,bd=1e9;
  A(i).s.forEach(s=>{const pts=spts(s);if(!pts||!pts.length)return;let d=1e9;for(let n=0;n<pts.length;n++){const dd=Math.hypot(pts[n][0]-x,pts[n][1]-y);if(dd<d)d=dd}d-=(s.w||0)/2;if(d<thr&&d<bd){bd=d;best=s}});
  if(!best)return;const s=best,isM=s.t==='m',anchor={getBoundingClientRect:()=>({left:e.clientX,right:e.clientX,top:e.clientY,bottom:e.clientY,width:0,height:0})},done=()=>{commit();ink(i)};
  popMenu(anchor,[['delete','削除',()=>{A(i).s=A(i).s.filter(q=>q!==s);done()}],
    ['content_copy','複製',()=>{const n=JSON.parse(JSON.stringify(s));if(n.r)n.r.forEach(r=>{r[0]+=12;r[1]+=12});else n.p.forEach(q=>{q[0]+=12;q[1]+=12});A(i).s.push(n);done()}],
    ['palette','色を現在の色に変更',()=>{s.c=isM?S.col[s.k]:(s.t==='h'?S.col.hl:S.col.pen);done()}],
    ...(isM?[]:[['add','太くする',()=>{s.w=Math.min(60,s.w*1.3);done()}],['remove','細くする',()=>{s.w=Math.max(.5,s.w/1.3);done()}]])]);
  S.sel={i,s};drawSel(i,s)}
/* home: hero card */
function mkHero(f){const pos=Math.min(f.pages,POS[f.id]||1),h=document.createElement('div');h.className='hero2';
  h.innerHTML=`<div class="h2t">${f.thumb?`<img alt="" src="${f.thumb}">`:''}</div><div class="h2b"><small>続きから読む</small><b></b><span>${pos} / ${f.pages}ページ ・ ${rel(f.date)}</span><div class="prog"><span style="width:${Math.round(pos/f.pages*100)}%"></span></div><button class="fabx">開く</button></div>`;
  h.querySelector('b').textContent=f.name;h.onclick=async()=>{try{await load(await f.blob.arrayBuffer(),f.name)}catch(_){toast('開けませんでした')}};return h}
$('#gtog').onclick=()=>{CFG.grid=CFG.grid?0:1;saveCfg();paintRecent()};
/* tools search, zoom presets, recent switcher */
$('#tq').oninput=e=>{const q=e.target.value.trim().toLowerCase();$$('#tgrid .tcd').forEach(c=>c.style.display=c.textContent.toLowerCase().includes(q)?'':'none');
  $$('#tgrid .tg').forEach(g=>{const any=[...g.children].some(c=>c.style.display!=='none');g.style.display=any?'':'none';g.previousElementSibling.style.display=any?'':'none'})};
$$('[data-zp]').forEach(b=>b.onclick=()=>zoom(+b.dataset.zp));
function fillRec(){const rec=$('#mRec');rec.innerHTML='';
  RC.filter(f=>f.id!==S.id).sort((a,b)=>b.date-a.date).slice(0,4).forEach(f=>{const b=document.createElement('button');b.innerHTML='<i data-i="description"></i><span></span>';b.querySelector('span').textContent=f.name;
    b.onclick=async()=>{try{await load(await f.blob.arrayBuffer(),f.name)}catch(_){toast('開けませんでした')}};rec.append(b)});
  if(!rec.childElementCount)rec.innerHTML='<p class="empty">ほかのファイルはありません</p>';icons(rec)}
/* backup / restore of annotations */
async function backup(){busy('バックアップ中…');try{const an=await DB.all('annots'),data={v:1,annots:an,bm:BM,pos:POS};idle();await deliver(new TextEncoder().encode(JSON.stringify(data)),'pdfstudio-backup.json','application/json')}catch(e){idle();toast('バックアップできませんでした')}}
$('#set').addEventListener('click',e=>{const id=e.target.id;if(id==='bkUp')backup();if(id==='bkDn')$('#fileB').click()});
$('#fileB').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;
  try{const d=JSON.parse(await f.text());if(!d||d.v!==1)throw 0;for(const a of d.annots||[])await DB.put('annots',a);Object.assign(BM,d.bm||{});bmSave();Object.assign(POS,d.pos||{});localStorage.setItem('ps-pos',JSON.stringify(POS));
    toast(`${(d.annots||[]).length}件の書き込みを復元しました。同じPDFを開くと反映されます`)}catch(_){toast('復元できませんでした')}};
/* guide + keyboard shortcuts */
const GUIDE=[['edit','描く','左の列のペンを選び、Apple Pencilで書きます。色と太さは画面下のバーで変えられ、「詳細」でさらに細かく設定できます。'],
 ['format_ink_highlighter','文字をハイライト','ハイライト・下線・取り消し線を選んでから、文字をなぞって選択すると自動で付きます。'],
 ['arrow_selector_tool','書き込みを編集','選択ツールで線をタップすると、削除・複製・色や太さの変更ができます。消しゴムでもなぞって消せます。'],
 ['signature','署名と入力','左の列の一番下から、署名・イニシャル・チェック・日付・スタンプを選び、置きたい場所をタップします。'],
 ['pinch','拡大縮小とページ移動','2本指のピンチで拡大縮小。スクロールすると上にページ用のスライダーが出て、すばやく移動できます。'],
 ['dashboard_customize','ページ編集とツール','「編集」メニューやツール一覧から、整理・結合・分割・圧縮・透かし・ページ番号などが使えます。'],
 ['keyboard','キーボード','V 選択 / P ペン / H ハイライト / E 消しゴム / T テキスト / N 付箋 / S 図形 / [ ] ペンの太さ / Cmd+F 検索 / Cmd+S 保存 / Cmd+Z 元に戻す']];
function showGuide(){const d=$('#guide');
  d.innerHTML=`<div class="dh"><span>使い方ガイド</span><button class="ib" id="gdx" aria-label="閉じる"><i data-i="close"></i></button></div><div class="gl">${GUIDE.map(([i,t,s])=>`<div class="gi"><span class="gic"><i data-i="${i}"></i></span><div><b>${t}</b><p>${s}</p></div></div>`).join('')}</div>`;
  icons(d);$('#gdx').onclick=()=>d.close();d.onclick=e=>{if(e.target===d)d.close()};d.onclose=()=>localStorage.setItem('ps-guide','1');d.showModal()}
$('#bGuide').onclick=showGuide;
if(!localStorage.getItem('ps-guide'))setTimeout(showGuide,800);
addEventListener('keydown',e=>{if(!S.pdf||e.target.isContentEditable||/INPUT|TEXTAREA/.test(e.target.tagName)||document.querySelector('dialog[open]'))return;const m=e.metaKey||e.ctrlKey;
  if(m&&e.key==='f'){e.preventDefault();$('#bSearch').click();return}if(m&&e.key==='s'){e.preventDefault();exportPdf(true);return}if(m&&e.key==='p'){e.preventDefault();printPdf();return}if(m)return;
  const T={v:'select',h:'hlt',u:'ult',k:'stt',n:'note',p:'pen',m:'hl',s:'shape',t:'text',e:'er'}[e.key];if(T){setTool(T);return}
  if(e.key==='['||e.key===']'){S.w.pen=Math.max(.5,Math.min(30,S.w.pen+(e.key===']'?1:-1)));toast('ペンの太さ '+S.w.pen);if(!$('#props').classList.contains('off'))syncProps()}
  if(e.key==='?')showGuide()});
/* resume last file on launch */
if(CFG.resume)recent().then(()=>{const f=RC.slice().sort((a,b)=>b.date-a.date)[0];if(f)f.blob.arrayBuffer().then(b=>load(b,f.name)).catch(()=>{})});

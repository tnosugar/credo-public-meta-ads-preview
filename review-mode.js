/* review-mode.js — review widget (loads only on ?review=1). Classic script.
 * Anchors commentable elements, shows ONE floating add-comment pill that
 * follows the deepest hovered anchor, renders banner + sidebar + composer,
 * persists via Firebase RTDB (/comments/{id}) or a localStorage fallback. */
const CFG = (window.CREDO_REVIEW_CONFIG) || {};
const L = Object.assign({
  bannerTitle:'Review mode', localOnly:'Local-only', exit:'Exit review', sidebarTitle:'Comments',
  empty:'No comments yet.', add:'+ Comment', save:'Post comment', cancel:'Cancel', edit:'Edit', del:'Delete',
  placeholder:'Your feedback…', replacementPlaceholder:'Suggested change (optional)…', namePrompt:'Your name:'
}, CFG.REVIEW_LABELS || {});
const FB = CFG.FIREBASE_CONFIG || {};
const FB_OK = FB.apiKey && FB.apiKey.indexOf('PASTE') !== 0 && FB.databaseURL && FB.databaseURL.indexOf('PASTE') < 0;
const _MEM = {};
const store = {get(k){try{return localStorage.getItem(k)}catch(e){return (k in _MEM)?_MEM[k]:null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){_MEM[k]=v}}};

const ANCHOR_TAGS = ['h1','h2','h3','h4','h5','h6','p','li','blockquote'];
const CHROME_SEL = '.review-banner,.review-sidebar,.review-modal-overlay,.review-floating-pill,[data-review-skip]';

function pageSlug(){
  let p = window.location.pathname.replace(/\/index\.html?$/,'');
  if (p === '' || p === '/') return 'home';
  return p.replace(/^\/|\/$/g,'').replace(/\//g,'-') || 'home';
}
const SLUG = pageSlug();

function reviewer(){
  let n = store.get('credo_reviewer');
  if (!n){ n = (window.prompt(L.namePrompt, '') || 'Anonymous').trim() || 'Anonymous'; store.set('credo_reviewer', n); }
  return n;
}

/* ---- adapter ---- */
function localAdapter(){
  const KEY='credo_review_comments'; let cb=null;
  const read=()=>{try{return JSON.parse(store.get(KEY)||'{}')}catch(e){return {}}};
  const write=o=>store.set(KEY,JSON.stringify(o));
  const ping=()=>cb&&cb(read());
  return { local:true,
    subscribe(fn){cb=fn;fn(read());window.addEventListener('storage',e=>{if(e.key===KEY)fn(read())});return()=>{cb=null}},
    create(rec){const o=read();const id='c'+Date.now()+Math.random().toString(36).slice(2,7);o[id]=rec;write(o);ping();return Promise.resolve(id)},
    update(id,patch){const o=read();o[id]=Object.assign({},o[id],patch);write(o);ping();return Promise.resolve()},
    remove(id){const o=read();delete o[id];write(o);ping();return Promise.resolve()} };
}
async function firebaseAdapter(){
  const A = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
  const D = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');
  const app = (A.getApps && A.getApps().length) ? A.getApp() : A.initializeApp(FB);
  const db = D.getDatabase(app); const root = D.ref(db,'comments');
  return { local:false,
    subscribe(fn){return D.onValue(root,s=>fn(s.val()||{}))},
    create(rec){const r=D.push(root);return D.set(r,rec).then(()=>r.key)},
    update(id,patch){return D.update(D.ref(db,'comments/'+id),patch)},
    remove(id){return D.remove(D.ref(db,'comments/'+id))} };
}

/* ---- helpers ---- */
function el(t,c,h){const e=document.createElement(t);if(c)e.className=c;if(h!=null)e.innerHTML=h;return e}
function esc(s){return (s==null?'':String(s)).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function when(ts){const d=new Date(ts||Date.now());return d.toLocaleDateString()+' '+d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}

/* ---- state ---- */
let SIDE,LIST,COUNT,PILL,ADAPTER,ME,COMMENTS={},curEl=null,curId=null,hideT=null;

/* ---- chrome ---- */
function buildChrome(){
  const ban=el('div','review-banner');
  ban.innerHTML='<span class="rw-title">'+esc(L.bannerTitle)+'</span>'+
    (ADAPTER.local?'<span class="rw-local">'+esc(L.localOnly)+'</span>':'')+
    '<span class="rw-spacer"></span><span class="rw-name">'+esc(ME)+'</span>';
  const exit=el('button',null,esc(L.exit));
  exit.onclick=()=>{const u=new URL(location.href);u.searchParams.delete('review');location.href=u.toString()};
  ban.appendChild(exit); document.body.appendChild(ban);

  SIDE=el('aside','review-sidebar');
  const h=el('h3',null,'<span>'+esc(L.sidebarTitle)+'</span><span class="rw-count">0</span>');
  COUNT=h.querySelector('.rw-count'); SIDE.appendChild(h);
  LIST=el('div','review-list'); SIDE.appendChild(LIST); document.body.appendChild(SIDE);

  PILL=el('button','review-floating-pill',esc(L.add)); PILL.type='button'; PILL.setAttribute('data-review-skip','');
  document.body.appendChild(PILL);
  PILL.addEventListener('mouseenter',()=>clearTimeout(hideT));
  PILL.addEventListener('mouseleave',()=>hidePillSoon());
  PILL.addEventListener('click',()=>{ if(curId&&curEl) openComposer(curId,curEl); });

  document.addEventListener('mouseover',e=>{
    if(e.target.closest(CHROME_SEL)) return;
    const a=e.target.closest('[data-comment-id]');
    if(a){ clearTimeout(hideT); placePill(a); }
  });
  document.addEventListener('mouseout',e=>{
    const to=e.relatedTarget;
    if(to && (to===PILL || (to.closest && to.closest('[data-comment-id]')))) return;
    hidePillSoon();
  });
  window.addEventListener('scroll',()=>{ if(curEl && PILL.style.display==='block') placePill(curEl); }, true);
}
function placePill(elm){
  curEl=elm; curId=elm.getAttribute('data-comment-id');
  PILL.style.display='block';
  const r=elm.getBoundingClientRect();
  let top=Math.max(52, Math.min(r.top+6, window.innerHeight-34));
  let left=Math.max(6, r.right - PILL.offsetWidth - 8);
  PILL.style.top=top+'px'; PILL.style.left=left+'px';
}
function hidePillSoon(){ hideT=setTimeout(()=>{ PILL.style.display='none'; curEl=null; curId=null; },140); }

/* ---- anchoring (ids + outline only; pill is shared/floating) ---- */
function anchorPass(){
  const seen=new Set(), counters={};
  const opt=Array.from(document.querySelectorAll('[data-comment-target]'));
  const tagged=Array.from(document.querySelectorAll(ANCHOR_TAGS.join(',')));
  [...opt,...tagged].forEach(elm=>{
    if(seen.has(elm))return; seen.add(elm);
    if(elm.closest(CHROME_SEL))return;
    if(elm.hasAttribute('data-comment-id'))return;
    if((elm.textContent||'').trim().length<2 && !elm.querySelector('img,video'))return;
    const tag=elm.tagName.toLowerCase();
    counters[tag]=(counters[tag]||0)+1;
    elm.setAttribute('data-comment-id',SLUG+'-'+tag+'-'+counters[tag]);
  });
}

/* ---- composer ---- */
function modal(title,ctx,initText,initRepl,onSave){
  const ov=el('div','review-modal-overlay'); const m=el('div','review-modal');
  m.innerHTML='<h4>'+esc(title)+'</h4><div class="rw-ctx">'+esc(ctx)+'</div>';
  const ta=el('textarea'); ta.placeholder=L.placeholder; ta.value=initText||'';
  const tr=el('textarea'); tr.placeholder=L.replacementPlaceholder; tr.value=initRepl||''; tr.style.minHeight='44px';
  const acts=el('div','rw-modal-acts');
  const cancel=el('button','rw-cancel',esc(L.cancel)); cancel.onclick=()=>ov.remove();
  const save=el('button','rw-save',esc(L.save));
  save.onclick=()=>{const t=ta.value.trim();if(!t)return;onSave(t,tr.value.trim());ov.remove()};
  acts.appendChild(cancel); acts.appendChild(save);
  m.appendChild(ta); m.appendChild(tr); m.appendChild(acts); ov.appendChild(m);
  ov.onclick=e=>{if(e.target===ov)ov.remove()}; document.body.appendChild(ov); ta.focus();
}
function openComposer(anchor,elm){
  const prev=(elm.textContent||'').replace(/\s+/g,' ').trim().slice(0,80) || (elm.querySelector('img,video')?'[creative]':'');
  modal('Add comment',anchor,'','',(text,repl)=>{
    ADAPTER.create({comment:text,replacement:repl||null,anchor:anchor,page:SLUG,author:ME,archived:false,
      timestamp:Date.now(),text_preview:prev,url:location.href,user_agent:navigator.userAgent});
  });
}

/* ---- render + spotlight ---- */
function render(){
  const rows=Object.entries(COMMENTS).filter(([id,c])=>c&&c.page===SLUG&&!c.archived)
    .sort((a,b)=>(a[1].timestamp||0)-(b[1].timestamp||0));
  COUNT.textContent=rows.length;
  document.querySelectorAll('.has-comment').forEach(e=>e.classList.remove('has-comment'));
  rows.forEach(([id,c])=>{const a=document.querySelector('[data-comment-id="'+(window.CSS&&CSS.escape?CSS.escape(c.anchor):c.anchor)+'"]');if(a)a.classList.add('has-comment')});
  LIST.innerHTML='';
  if(!rows.length){LIST.appendChild(el('div','review-empty',esc(L.empty)));return}
  rows.forEach(([id,c])=>{
    const row=el('div','review-row');
    row.innerHTML='<div class="rw-meta"><b>'+esc(c.author||'Anonymous')+'</b><span>'+when(c.timestamp)+(c.edited_at?' · edited':'')+'</span></div>'+
      '<div class="rw-body">'+esc(c.comment)+'</div>'+
      (c.replacement?'<div class="rw-repl">↳ '+esc(c.replacement)+'</div>':'')+
      '<div class="rw-anchor">'+esc(c.anchor)+'</div>';
    const acts=el('div','rw-acts');
    const eb=el('button',null,esc(L.edit)); eb.onclick=ev=>{ev.stopPropagation();
      modal('Edit comment',c.anchor,c.comment,c.replacement||'',(t,r)=>ADAPTER.update(id,{comment:t,replacement:r||null,edited_at:Date.now()}))};
    const db=el('button',null,esc(L.del)); db.onclick=ev=>{ev.stopPropagation();if(confirm('Delete this comment?'))ADAPTER.remove(id)};
    acts.appendChild(eb); acts.appendChild(db); row.appendChild(acts);
    row.onclick=()=>spotlight(c.anchor); LIST.appendChild(row);
  });
}
function spotlight(anchor){
  const a=document.querySelector('[data-comment-id="'+(window.CSS&&CSS.escape?CSS.escape(anchor):anchor)+'"]');
  if(!a)return;
  a.scrollIntoView({behavior:'smooth',block:'center'});
  a.classList.remove('rw-spot'); void a.offsetWidth; a.classList.add('rw-spot');
  setTimeout(()=>a.classList.remove('rw-spot'),1200);
}

/* ---- init (last) ---- */
(async function init(){
  ME=reviewer();
  try{ ADAPTER = FB_OK ? await firebaseAdapter() : localAdapter(); }
  catch(e){ console.warn('[review] firebase init failed, using local',e); ADAPTER=localAdapter(); }
  buildChrome(); anchorPass();
  ADAPTER.subscribe(data=>{COMMENTS=data||{};render()});
})();

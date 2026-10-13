(function(){
const TABS=[
  {id:'hoy',label:'Hoy',icon:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>'},
  {id:'mes',label:'Mes',icon:'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>'},
  {id:'reparto',label:'Reparto',icon:'<path d="M12 3v9l7 4"/><circle cx="12" cy="12" r="9"/>'},
  {id:'deuda',label:'Tarjetas',icon:'<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 15h4"/>'},
  {id:'cuenta',label:'Cuenta',icon:'<circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 5-6 8-6s6.5 2 8 6"/>'}
];
const TIPOS={variable:'Variable',fijo:'Pago fijo',deuda:'Deuda',ahorro:'Ahorro'};
const DEFAULT_SETTINGS={cats:[
  {id:'tarjeta',nombre:'Pago de tarjetas',tipo:'deuda'},
  {id:'internet',nombre:'Internet',tipo:'fijo'},
  {id:'datos',nombre:'Plan de datos',tipo:'fijo'},
  {id:'comida',nombre:'Comida',tipo:'variable'},
  {id:'transporte',nombre:'Transporte',tipo:'variable'},
  {id:'ahorro',nombre:'Ahorro',tipo:'ahorro'},
  {id:'otros',nombre:'Otros',tipo:'variable'}
],presupuesto:{},tarjetas:null};
const DEFAULT_CARDS=[{id:'visa',nombre:'Visa',corte:15,pago:31},{id:'discover',nombre:'Discover',corte:15,pago:1}];
const PROTECTED=['tarjeta','ahorro','otros'];
const CASH={efectivo:'Efectivo',debito:'Débito / transferencia'};

const S={db:null,uid:null,mode:'local',ready:false,settings:null,deuda:null,ahorro:null,months:{},
  tab:'hoy',viewMonth:ym(new Date()),selCat:'comida',selMet:'efectivo',editCard:null,addCard:false,editG:null};
try{const t=localStorage.getItem('mc-tab'); if(t&&TABS.some(x=>x.id===t)) S.tab=t;
  const m=localStorage.getItem('mc-met'); if(m) S.selMet=m;}catch(e){}

// ---------- utilidades ----------
function pad(n){return String(n).padStart(2,'0')}
function ym(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)}
function ymd(d){return ym(d)+'-'+pad(d.getDate())}
function hm(d){return pad(d.getHours())+':'+pad(d.getMinutes())}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function clone(o){return JSON.parse(JSON.stringify(o))}
function r2(n){return Math.round(n*100)/100}
const fmtN=new Intl.NumberFormat('es-EC',{minimumFractionDigits:2,maximumFractionDigits:2});
function $$(n){n=r2(n||0);return (n<0?'−$':'$')+fmtN.format(Math.abs(n))}
function parseMoney(s){if(s==null)return NaN;s=String(s).trim().replace(/\s|\$/g,'');
  if(s.includes(',')&&s.includes('.')) s=s.replace(/\./g,'').replace(',','.'); else s=s.replace(',','.');
  const n=parseFloat(s);return isFinite(n)?r2(n):NaN}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function monthName(k){const [y,m]=k.split('-').map(Number);return new Date(y,m-1,1).toLocaleDateString('es-EC',{month:'long',year:'numeric'})}
function shiftMonth(k,d){const [y,m]=k.split('-').map(Number);return ym(new Date(y,m-1+d,1))}
function parseDay(s){const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)}
function dayLabel(s){return parseDay(s).toLocaleDateString('es-EC',{weekday:'long',day:'numeric',month:'long'})}
function shortDate(d){return d.toLocaleDateString('es-EC',{weekday:'short',day:'numeric',month:'short'})}
function today0(){const n=new Date();return new Date(n.getFullYear(),n.getMonth(),n.getDate())}
function diffDays(a,b){return Math.round((a-b)/864e5)}
function inDays(n){return n===0?'hoy':n===1?'mañana':n<0?`hace ${-n} día${n===-1?'':'s'}`:`en ${n} días`}
function cat(id){const d=DEFAULT_SETTINGS.cats.find(c=>c.id===id);return S.settings.cats.find(c=>c.id===id)||{id,nombre:d?d.nombre:'Sin categoría',tipo:d?d.tipo:'variable'}}
function repairCats(){
  // Gastos cuya categoría fue borrada: si existe otra con el mismo nombre, se reasignan a ella.
  const byName={};S.settings.cats.forEach(c=>byName[c.nombre.trim().toLowerCase()]=c.id);
  const ids=new Set(S.settings.cats.map(c=>c.id));
  Object.entries(S.months).forEach(([k,m])=>{let ch=false;m.gastos.forEach(g=>{if(ids.has(g.cat))return;
    const def=DEFAULT_SETTINGS.cats.find(c=>c.id===g.cat);const to=def&&byName[def.nombre.toLowerCase()];
    if(to){g.cat=to;ch=true}});if(ch)saveMonth(k)});
}
function defaultCat(){const c=S.settings.cats.find(x=>x.id!=='tarjeta'&&x.tipo!=='ahorro');return c?c.id:'otros'}
function cards(){return S.settings.tarjetas}
function card(id){return cards().find(c=>c.id===id)}
function isCard(met){return !!card(met)}
function metName(met){return CASH[met]||(card(met)?card(met).nombre:'Efectivo')}
function gMet(g){return g.metodo||'efectivo'}
function gTs(g){return g.ts||parseDay(g.fecha).getTime()+((g.hora?(+g.hora.slice(0,2)*60+ +g.hora.slice(3)):0)*6e4)}
let toastT;function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>t.hidden=true,2600)}

// ---------- fechas de corte y pago ----------
function dayIn(y,m,d){const last=new Date(y,m+1,0).getDate();return new Date(y,m,Math.min(d,last))}
function lastCorte(c,ref){let d=dayIn(ref.getFullYear(),ref.getMonth(),c.corte);if(d>ref)d=dayIn(ref.getFullYear(),ref.getMonth()-1,c.corte);return d}
function nextCorteAfter(c,corte){return dayIn(corte.getFullYear(),corte.getMonth()+1,c.corte)}
function pagoAfter(c,corte){let p=dayIn(corte.getFullYear(),corte.getMonth(),c.pago);if(p<=corte)p=dayIn(corte.getFullYear(),corte.getMonth()+1,c.pago);return p}
function cycleInfo(c){
  const t=today0();const lc=lastCorte(c,t);const pc=lastCorte(c,new Date(lc.getTime()-864e5));const nc=nextCorteAfter(c,lc);
  const consumos=(from,to)=>r2(allGastos().filter(g=>gMet(g)===c.id&&g.fecha>ymd(from)&&g.fecha<=ymd(to)).reduce((a,g)=>a+g.monto,0));
  let pago=pagoAfter(c,lc),pagoMonto,pagoDe;
  if(pago>=t){pagoMonto=consumos(pc,lc);pagoDe='del corte del '+lc.getDate()+' de '+lc.toLocaleDateString('es-EC',{month:'long'})}
  else{pago=pagoAfter(c,nc);pagoMonto=consumos(lc,t);pagoDe='lo que llevas desde el último corte'}
  const abonadoCiclo=r2(S.deuda.abonos.filter(a=>a.tarjetaId===c.id&&a.fecha>ymd(lc)).reduce((s,a)=>s+a.monto,0));
  return {lc,nc,pago,pagoMonto,pagoDe,cicloActual:consumos(lc,t),abonadoCiclo,diasCorte:diffDays(nc,t),diasPago:diffDays(pago,t)};
}

// ---------- almacenamiento ----------
// Dos modos: 'cloud' (Firebase: tu cuenta, sincroniza entre dispositivos) y 'local' (solo este navegador).
const LP='mcd-';
const Store={
  mode:'local',fs:null,uid:null,
  ref(key){return this.fs.collection('users').doc(this.uid).collection('docs').doc(key)},
  async get(key){
    if(this.mode==='cloud'){const s=await this.ref(key).get();return s.exists?s.data():null}
    const v=localStorage.getItem(LP+key);return v?JSON.parse(v):null;
  },
  set(key,data){
    if(this.mode==='cloud'){
      // Firestore guarda primero en el celular y sincroniza cuando hay internet
      this.ref(key).set(data).catch(e=>toast(e&&e.code==='permission-denied'?'Sin permiso para guardar. Revisa las reglas de Firestore.':'No se pudo sincronizar un cambio.'));
      return;
    }
    localStorage.setItem(LP+key,JSON.stringify(data));
  },
  async all(){
    const out={};
    if(this.mode==='cloud'){const q=await this.fs.collection('users').doc(this.uid).collection('docs').get();q.forEach(d=>out[d.id]=d.data());return out}
    for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith(LP))out[k.slice(LP.length)]=JSON.parse(localStorage.getItem(k))}
    return out;
  }
};
async function loadDoc(key,def){
  try{const v=await Store.get(key);return v?clone(v):clone(def)}
  catch(e){toast('No se pudieron leer tus datos. Revisa tu conexión.');return clone(def)}
}
function saveDoc(key,obj){
  try{Store.set(key,clone(obj))}catch(e){toast('Este navegador no permite guardar datos.')}
}
async function month(k){
  if(!S.months[k]){const m=await loadDoc('m'+k,{ingresos:[],gastos:[]});m.ingresos=m.ingresos||[];m.gastos=m.gastos||[];S.months[k]=m}
  return S.months[k];
}
function allGastos(){return Object.values(S.months).flatMap(m=>m.gastos)}
function saveMonth(k){saveDoc('m'+k,S.months[k])}
function saveSettings(){saveDoc('settings',S.settings)}
function saveDeuda(){saveDoc('deuda',S.deuda)}
function saveAhorro(){saveDoc('ahorro',S.ahorro)}

// ---------- cálculos ----------
function monthTotals(m){
  const ingresos=m.ingresos.reduce((a,x)=>a+x.monto,0);
  let gastado=0,ahorrado=0,salidaCaja=0;const porCat={},porMet={};
  m.gastos.forEach(g=>{porCat[g.cat]=(porCat[g.cat]||0)+g.monto;
    if(cat(g.cat).tipo==='ahorro'){ahorrado+=g.monto;if(!isCard(gMet(g)))salidaCaja+=g.monto;return}
    gastado+=g.monto;const mt=gMet(g);porMet[mt]=(porMet[mt]||0)+g.monto;if(!isCard(mt))salidaCaja+=g.monto});
  return {ingresos:r2(ingresos),gastado:r2(gastado),ahorrado:r2(ahorrado),porCat,porMet,
    conTarjeta:r2(Object.entries(porMet).filter(([k])=>isCard(k)).reduce((a,[,v])=>a+v,0)),disponible:r2(ingresos-salidaCaja)};
}
function cardDebt(c){
  const base=S.deuda.saldos[c.id]||{monto:0,ts:0,sinSaldo:true};const ts=base.ts||0;
  const consumos=r2(allGastos().filter(g=>gMet(g)===c.id&&gTs(g)>ts).reduce((a,g)=>a+g.monto,0));
  const abonos=r2(S.deuda.abonos.filter(a=>a.tarjetaId===c.id&&(a.ts||parseDay(a.fecha).getTime())>ts).reduce((a,x)=>a+x.monto,0));
  return {inicial:base.monto,consumos,abonos,saldo:r2(base.monto+consumos-abonos),sinSaldo:!!base.sinSaldo};
}
function progs(){return S.deuda.programados}
function comprometido(k){return r2(progs().filter(p=>p.mesFondo===k).reduce((a,p)=>a+p.monto,0))}
function ahorroSaldo(){return r2(S.ahorro.movs.reduce((a,x)=>a+x.monto,0))}

// ---------- acciones ----------
async function addGasto(monto,catId,nota,opt){
  opt=opt||{};const d=new Date();const fecha=opt.fecha||ymd(d);const k=fecha.slice(0,7);const m=await month(k);
  const g={id:uid(),monto,cat:catId,nota:nota||'',fecha,hora:fecha===ymd(d)?hm(d):'',ts:Date.now(),metodo:opt.metodo||'efectivo'};
  const tipo=cat(catId).tipo;
  if(tipo==='deuda'&&opt.tarjetaId){const a={id:uid(),monto,fecha:g.fecha,ts:g.ts,origen:'mes',tarjetaId:opt.tarjetaId,gastoId:g.id};S.deuda.abonos.push(a);g.abonoId=a.id;g.tarjetaId=opt.tarjetaId;saveDeuda()}
  if(tipo==='ahorro'){const mv={id:uid(),monto,fecha:g.fecha,nota:nota||'Aporte del mes',gastoId:g.id};S.ahorro.movs.push(mv);g.movId=mv.id;saveAhorro()}
  m.gastos.push(g);saveMonth(k);return g;
}
async function delGasto(k,id){
  const m=await month(k);const g=m.gastos.find(x=>x.id===id);if(!g)return;
  m.gastos=m.gastos.filter(x=>x.id!==id);saveMonth(k);
  if(g.abonoId){S.deuda.abonos=S.deuda.abonos.filter(a=>a.id!==g.abonoId);saveDeuda()}
  if(g.movId){S.ahorro.movs=S.ahorro.movs.filter(a=>a.id!==g.movId);saveAhorro()}
}

// ---------- piezas de vista ----------
function header(title,sub){
  const st=Store.mode==='cloud'?(navigator.onLine?'Sincronizado':'Sin conexión · se sincroniza al volver'):'Solo en este celular';
  return `<div class="top"><div><div class="eyebrow">${esc(sub)}</div><h1>${esc(title)}</h1></div><div class="status">${st}</div></div>`;
}
function monthNav(){return `<div class="monthnav"><button type="button" data-act="prevm" aria-label="Mes anterior">‹</button><b>${esc(monthName(S.viewMonth))}</b><button type="button" data-act="nextm" aria-label="Mes siguiente" ${S.viewMonth>=shiftMonth(ym(new Date()),2)?'disabled':''}>›</button></div>`}
function delBtn(act,args){return `<button type="button" class="ghost" data-act="${act}" ${args} aria-label="Borrar">✕</button>`}
function catChips(){
  return `<div class="chips" role="group" aria-label="Categoría">${S.settings.cats.filter(c=>c.id!=='tarjeta').map(c=>
    `<button type="button" class="chip" data-act="selcat" data-id="${esc(c.id)}" aria-pressed="${c.id===S.selCat}">${esc(c.nombre)}</button>`).join('')}</div>`;
}
function metChips(){
  const cred=isCard(S.selMet);
  const main=[['efectivo','Efectivo'],['debito','Débito / transferencia']];
  if(cards().length)main.push(['credito','Tarjeta de crédito']);
  return `<div class="chips" role="group" aria-label="Forma de pago">${main.map(([o,n])=>
    `<button type="button" class="chip" data-act="selmet" data-id="${o}" aria-pressed="${o==='credito'?cred:o===S.selMet}">${n}</button>`).join('')}</div>
    ${cred?`<div class="eyebrow">¿Con cuál tarjeta?</div><div class="chips" role="group" aria-label="Tarjeta usada">${cards().map(c=>
    `<button type="button" class="chip" data-act="selmet" data-id="${esc(c.id)}" aria-pressed="${c.id===S.selMet}">${esc(c.nombre)}</button>`).join('')}</div>`:''}`;
}
function metPill(met){return `<span class="pill ${isCard(met)?'card':'cash'}">${esc(metName(met))}</span>`}
function editBtn(g){return `<button type="button" class="ghost" data-act="editg" data-id="${g.id}" aria-label="Editar gasto">✎</button>`}
function ddmm(f){return f.slice(8,10)+'/'+f.slice(5,7)}
function gastoItem(g,k,o){
  o=o||{};if(S.editG===g.id)return editForm(g);
  const c=cat(g.cat);let sub=esc(c.nombre);
  if(c.tipo==='deuda')sub+=` · abono ${esc(card(g.tarjetaId)?.nombre||'')}`;
  const when=o.fecha?`${ddmm(g.fecha)}${g.hora?'<br>'+esc(g.hora):''}`:esc(g.hora||'');
  return `<div class="item"><span class="t">${when}</span><div class="d"><b>${esc(g.nota||c.nombre)}</b><small>${o.fecha?(g.nota?sub:'')+(g.nota&&!o.sinMet?' · ':''):sub+' · '}${o.sinMet?'':(c.tipo==='ahorro'&&!isCard(gMet(g))?`<span class="pill ahorro">Ahorro</span>`:metPill(gMet(g)))}</small></div><span class="m">${$$(g.monto)}${o.acum!=null?`<br><small class="muted" style="font-weight:500">acum. ${$$(o.acum)}</small>`:''}</span>${editBtn(g)}</div>`;
}
function editForm(g){
  const c=cat(g.cat);const abono=c.tipo==='deuda';
  const mets=[...Object.keys(CASH),...(abono?[]:cards().map(x=>x.id))];
  return `<form class="card" id="f-edit" data-id="${g.id}" data-k="${g.fecha.slice(0,7)}" autocomplete="off" style="margin:8px 0;background:var(--sunk)">
    <div class="row between"><b>Editar ${abono?'abono':'gasto'}</b><button type="button" class="ghost" data-act="canceledit" aria-label="Cerrar">✕</button></div>
    <div class="row"><label class="grow">Monto<input class="money" id="e-monto" inputmode="decimal" value="${fmtN.format(g.monto)}" required></label>
    <label class="grow">Fecha<input type="date" id="e-fecha" value="${g.fecha}" max="${ymd(new Date())}" required></label></div>
    <div class="row">${abono?'':`<label class="grow">Categoría<select id="e-cat">${S.settings.cats.filter(x=>x.id!=='tarjeta').map(x=>`<option value="${esc(x.id)}" ${x.id===g.cat?'selected':''}>${esc(x.nombre)}</option>`).join('')}</select></label>`}
    <label class="grow">Cómo pagaste<select id="e-met">${mets.map(x=>`<option value="${esc(x)}" ${x===gMet(g)?'selected':''}>${isCard(x)?'Tarjeta de crédito · ':''}${esc(metName(x))}</option>`).join('')}</select></label></div>
    <label>Nota<input id="e-nota" value="${esc(g.nota)}" placeholder="Ej. almuerzo, bus, recarga"></label>
    <div class="row"><button class="primary" type="submit">Guardar cambios</button><button type="button" data-act="canceledit">Cancelar</button><span class="grow"></span>
      <button type="button" class="danger" data-act="delgasto" data-k="${g.fecha.slice(0,7)}" data-id="${g.id}">Borrar ${abono?'abono':'gasto'}</button></div>
  </form>`;
}
function progAlerts(){
  const t=today0();
  return progs().filter(p=>diffDays(parseDay(p.fecha),t)<=3).sort((a,b)=>a.fecha.localeCompare(b.fecha)).map(p=>{const c=card(p.tarjetaId);const n=diffDays(parseDay(p.fecha),t);
    return `<div class="alert"><div class="grow">Pago programado a <b>${esc(c?c.nombre:'tarjeta')}</b> de <b class="num">${$$(p.monto)}</b> ${n<0?'<b>vencido</b> desde':''} ${inDays(n)} (${esc(shortDate(parseDay(p.fecha)))}), con el dinero de ${esc(monthName(p.mesFondo).split(' ')[0])}.</div><button type="button" class="primary" data-act="pagarprog" data-id="${p.id}">Ya pagué</button></div>`}).join('');
}
function cardAlerts(){
  return progAlerts()+cards().map(c=>{const i=cycleInfo(c);const out=[];
    if(i.diasPago>=0&&i.diasPago<=5){const rest=r2(i.pagoMonto-i.abonadoCiclo);
      out.push(`<div class="alert"><div>Pago de <b>${esc(c.nombre)}</b> ${inDays(i.diasPago)} (${esc(shortDate(i.pago))})${i.pagoMonto>0?`: registraste <b class="num">${$$(i.pagoMonto)}</b> en consumos ${esc(i.pagoDe)}${i.abonadoCiclo>0?`, ya abonaste ${$$(i.abonadoCiclo)}`:''}.`:'.'} Revisa el monto exacto en tu estado de cuenta.</div></div>`)}
    if(i.diasCorte<=1)out.push(`<div class="alert soft"><div>Corte de <b>${esc(c.nombre)}</b> ${inDays(i.diasCorte)}. Lo que compres después del corte se paga recién en el siguiente estado de cuenta.</div></div>`);
    return out.join('')}).join('');
}

// ---------- vistas ----------
async function viewHoy(){
  const now=new Date();const k=ym(now);const m=await month(k);const hoy=ymd(now);
  const gs=m.gastos.filter(g=>g.fecha===hoy).sort((a,b)=>(b.hora||'').localeCompare(a.hora||''));
  const gast=gs.filter(g=>cat(g.cat).tipo!=='ahorro');
  const totalHoy=gast.reduce((a,g)=>a+g.monto,0);
  const porMet={};gast.forEach(g=>{porMet[gMet(g)]=(porMet[gMet(g)]||0)+g.monto});
  const ahorroHoy=gs.filter(g=>cat(g.cat).tipo==='ahorro').reduce((a,g)=>a+g.monto,0);
  const t=monthTotals(m);
  return header(dayLabel(hoy),'Hoy')+cardAlerts()+`
  <section class="card hero">
    <div class="eyebrow">Gastaste hoy</div>
    <div class="big">${$$(totalHoy)}</div>
    ${Object.keys(porMet).length?`<div class="split">${Object.entries(porMet).map(([mt,v])=>`<span>${esc(metName(mt))} <b>${$$(v)}</b></span>`).join('')}</div>`:''}
    <div class="note">${gs.length} movimiento${gs.length===1?'':'s'}${ahorroHoy?` · además guardaste ${$$(ahorroHoy)} en ahorro`:''} · te quedan <b class="num">${$$(t.disponible)}</b> en efectivo y cuenta este mes${comprometido(k)>0?`, de eso <b class="num">${$$(comprometido(k))}</b> ya está apartado para tarjetas`:''}</div>
  </section>
  <form class="card" id="f-gasto" autocomplete="off">
    <h2>Registrar un gasto</h2>
    <div class="row"><label class="grow">Monto (USD)<input class="money" id="g-monto" inputmode="decimal" placeholder="0,00" required></label>
    <label class="grow">Fecha de la compra<input type="date" id="g-fecha" value="${hoy}" max="${hoy}" required></label></div>
    <div class="eyebrow">1 · ¿En qué gastaste?</div>
    ${catChips()}
    <div class="eyebrow">2 · ¿Cómo pagaste?</div>
    <div id="g-met" style="display:flex;flex-direction:column;gap:10px">${metChips()}</div>
    <label>Nota (opcional)<input id="g-nota" placeholder="Ej. almuerzo, bus, recarga, nombre del local"></label>
    <button class="primary block" type="submit">Registrar gasto</button>
    <p class="note" style="margin:0">¿Vas a pagar o abonar a tu tarjeta? Eso se registra en la pestaña <b>Tarjetas</b>.</p>
  </form>
  <section class="card"><h2>Movimientos de hoy</h2>
    <div class="list">${gs.length?gs.map(g=>gastoItem(g,k)).join(''):'<div class="empty">Todavía no registras gastos hoy. Cada vez que gastes algo, anótalo arriba y aquí verás el total del día.</div>'}</div>
  </section>`;
}

function dailyChart(m,k){
  const [y,mo]=k.split('-').map(Number);const days=new Date(y,mo,0).getDate();
  const tot=Array(days).fill(0);m.gastos.forEach(g=>{if(cat(g.cat).tipo!=='ahorro'){const d=+g.fecha.slice(8,10);tot[d-1]+=g.monto}});
  const max=Math.max(...tot,1);const W=620,H=170,pl=36,pb=20,pt=10,cw=(W-pl-8)/days;
  const p=Math.pow(10,Math.floor(Math.log10(max)));const nice=[1,2,2.5,5,10].find(s=>s*p>=max/3)*p;
  let grid='';for(let v=0;v<=max;v+=nice){const yy=H-pb-(v/max)*(H-pb-pt);grid+=`<line x1="${pl}" x2="${W-4}" y1="${yy}" y2="${yy}" stroke="var(--line)"/><text x="${pl-6}" y="${yy+3}" text-anchor="end">${v>=1000?(v/1000)+'k':v}</text>`}
  const today=ym(new Date())===k?new Date().getDate():0;
  let bars='';tot.forEach((v,i)=>{const h=(v/max)*(H-pb-pt);const x=pl+i*cw+cw*.15;
    bars+=`<rect x="${x.toFixed(1)}" y="${(H-pb-h).toFixed(1)}" width="${(cw*.7).toFixed(1)}" height="${Math.max(h,v>0?1.5:0).toFixed(1)}" rx="2" fill="${i+1===today?'var(--accent)':'var(--muted)'}" opacity="${i+1===today?1:.55}"><title>Día ${i+1}: ${$$(v)}</title></rect>`;
    if((i+1)%5===0||i===0)bars+=`<text x="${(pl+i*cw+cw/2).toFixed(1)}" y="${H-6}" text-anchor="middle">${i+1}</text>`});
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gasto por día del mes">${grid}${bars}</svg></div>`;
}

async function viewMes(){
  const k=S.viewMonth;const m=await month(k);const t=monthTotals(m);
  const byDay={};m.gastos.forEach(g=>{(byDay[g.fecha]=byDay[g.fecha]||[]).push(g)});
  const days=Object.keys(byDay).sort().reverse();
  const ing=m.ingresos.slice().sort((a,b)=>b.fecha.localeCompare(a.fecha));
  return header('Resumen del mes','Mes')+monthNav()+`
  <div class="stats">
    <div class="stat"><span class="eyebrow">Ingresos</span><span class="v">${$$(t.ingresos)}</span></div>
    <div class="stat"><span class="eyebrow">Gastado</span><span class="v">${$$(t.gastado)}</span></div>
    <div class="stat"><span class="eyebrow">Ahorrado</span><span class="v pos">${$$(t.ahorrado)}</span></div>
    <div class="stat"><span class="eyebrow">Disponible</span><span class="v ${t.disponible<0?'neg':''}">${$$(t.disponible)}</span></div>
  </div>
  ${(()=>{const cp=comprometido(k);if(!cp)return '';const ps=progs().filter(p=>p.mesFondo===k).sort((a,b)=>a.fecha.localeCompare(b.fecha));const libre=r2(t.disponible-cp);
    return `<section class="card"><div class="row between"><h2>Pagos de tarjeta apartados</h2><span class="num">${$$(cp)}</span></div>
      <div class="list">${ps.map(p=>`<div class="item" style="grid-template-columns:auto minmax(0,1fr) auto"><span class="t">${p.fecha.slice(5).split('-').reverse().join('/')}</span><div class="d"><b>${esc(card(p.tarjetaId)?.nombre||'Tarjeta')}</b>${p.nota?`<small>${esc(p.nota)}</small>`:''}</div><span class="m">${$$(p.monto)}</span></div>`).join('')}</div>
      <div class="row between"><span class="note">Libre después de estos pagos</span><b class="num" style="color:${libre<0?'var(--debt)':'inherit'}">${$$(libre)}</b></div>
      ${libre<0&&t.ingresos===0?'<p class="note" style="margin:0">Cuando registres el ingreso de este mes, aquí verás cuánto te queda libre.</p>':''}</section>`})()}
  ${t.gastado>0?`<section class="card"><h2>Cómo pagaste</h2><div class="list">${Object.entries(t.porMet).sort((a,b)=>b[1]-a[1]).map(([mt,v])=>
    `<div class="item" style="grid-template-columns:minmax(0,1fr) auto"><div class="d">${metPill(mt)}</div><span class="m">${$$(v)}</span></div>`).join('')}</div>
    ${t.conTarjeta>0?`<p class="note" style="margin:0">Lo que compraste con tarjeta (${$$(t.conTarjeta)}) no sale de tu disponible ahora: se suma a lo que debes en la tarjeta y lo pagas en su fecha de pago.</p>`:''}</section>`:''}
  <form class="card" id="f-ingreso" autocomplete="off">
    <h2>Ingresos de ${esc(monthName(k).split(' ')[0])}</h2>
    <div class="row">
      <label class="grow">Monto<input class="money" id="i-monto" inputmode="decimal" placeholder="0,00" required></label>
      <label class="grow">De dónde viene<input id="i-desc" placeholder="Sueldo, trabajo extra, venta…"></label>
    </div>
    <label>¿Cómo lo recibiste?<select id="i-met"><option value="efectivo">Efectivo</option><option value="debito">Transferencia o depósito a mi cuenta</option></select></label>
    <button class="primary" type="submit">Agregar ingreso</button>
    <div class="list">${ing.length?ing.map(i=>`<div class="item"><span class="t">${i.fecha.slice(8)}</span><div class="d"><b>${esc(i.desc||'Ingreso')}</b><small>${i.metodo==='debito'?'Transferencia o depósito':'Efectivo'}</small></div><span class="m" style="color:var(--save)">+${$$(i.monto)}</span>${delBtn('delingreso',`data-k="${k}" data-id="${i.id}"`)}</div>`).join(''):'<div class="empty">Registra lo que recibes este mes: sueldo, trabajos extra o cualquier entrada de dinero.</div>'}</div>
  </form>
  <section class="card"><div class="row between"><h2>Gasto por día</h2><span class="note">Sin contar ahorro</span></div>${dailyChart(m,k)}</section>
  <section class="card"><h2>Detalle por día</h2>
    ${days.length?days.map(d=>{const gs=byDay[d].sort((a,b)=>(b.hora||'').localeCompare(a.hora||''));const s=gs.filter(g=>cat(g.cat).tipo!=='ahorro').reduce((a,g)=>a+g.monto,0);
      return `<details${d===ymd(new Date())?' open':''}><summary><span style="text-transform:capitalize">${esc(dayLabel(d))}</span><span class="num">${$$(s)}</span></summary><div class="list">${gs.map(g=>gastoItem(g,k)).join('')}</div></details>`}).join(''):'<div class="empty">Sin gastos registrados en este mes.</div>'}
  </section>`;
}

async function viewReparto(){
  const k=S.viewMonth;const m=await month(k);const t=monthTotals(m);const P=S.settings.presupuesto;
  const asignado=r2(S.settings.cats.reduce((a,c)=>a+(P[c.id]||0),0));const libre=r2(t.ingresos-asignado);
  const pct=t.ingresos>0?Math.min(100,asignado/t.ingresos*100):0;
  return header('Reparto del dinero','Reparto')+monthNav()+`
  <section class="card">
    <div class="row between"><span class="eyebrow">Ingresos del mes</span><span class="num">${$$(t.ingresos)}</span></div>
    <div class="bar ${libre<0?'over':''}"><i style="width:${pct}%"></i></div>
    <div class="row between"><span class="note">Asignado <b class="num">${$$(asignado)}</b></span><span class="note" style="color:${libre<0?'var(--debt)':'inherit'}">${libre<0?'Te pasas por':'Sin asignar'} <b class="num">${$$(Math.abs(libre))}</b></span></div>
    ${t.ingresos===0?'<div class="callout">Agrega tu ingreso del mes en la pestaña <b>Mes</b> y luego reparte cuánto va a cada cosa aquí abajo.</div>':''}
  </section>
  <section class="card"><div class="row between"><h2>Cuánto va a cada cosa</h2><span class="note">Monto al mes</span></div>
    <div>${S.settings.cats.map(c=>{const b=P[c.id]||0;const u=r2(t.porCat[c.id]||0);const over=b>0&&u>b;const w=b>0?Math.min(100,u/b*100):(u>0?100:0);
      return `<div class="cat"><div class="row between"><div class="grow"><b>${esc(c.nombre)}</b> <span class="pill ${c.tipo}">${TIPOS[c.tipo]}</span></div>
        <label class="budget" aria-label="Presupuesto ${esc(c.nombre)}"><input id="b-${esc(c.id)}" data-budget="${esc(c.id)}" inputmode="decimal" value="${b?fmtN.format(b):''}" placeholder="0,00"></label>
        ${PROTECTED.includes(c.id)?'<span style="width:34px"></span>':delBtn('delcat',`data-id="${esc(c.id)}"`)}</div>
        <div class="bar ${over?'over':c.tipo==='ahorro'?'save':''}"><i style="width:${w}%"></i></div>
        <div class="row between note"><span>${c.tipo==='ahorro'?'Guardado':c.tipo==='deuda'?'Abonado':'Usado'} <span class="num">${$$(u)}</span>${c.tipo==='deuda'&&comprometido(k)>0?` · apartado <span class="num">${$$(comprometido(k))}</span>`:''}</span><span>${b?(over?`Te pasaste ${$$(u-b)}`:`Queda <span class="num">${$$(b-u)}</span>`):'Sin monto asignado'}</span></div></div>`}).join('')}</div>
    <p class="note" style="margin:0">El reparto es tu plan para todos los meses. Lo usado cuenta todo lo que gastaste en esa categoría, sin importar si pagaste en efectivo o con tarjeta.</p>
  </section>
  <form class="card" id="f-cat" autocomplete="off"><h2>Nueva categoría</h2>
    <div class="row"><label class="grow">Nombre<input id="c-nombre" placeholder="Ej. Universidad, Salud, Ocio" required></label>
    <label class="grow">Tipo<select id="c-tipo"><option value="variable">Variable</option><option value="fijo">Pago fijo</option></select></label></div>
    <button type="submit">Agregar categoría</button></form>`;
}

function cardForm(c){
  const base=c?S.deuda.saldos[c.id]:null;const deb=c?cardDebt(c):null;
  return `<form class="card" id="f-card" data-id="${c?esc(c.id):''}" autocomplete="off"><h2>${c?'Editar '+esc(c.nombre):'Nueva tarjeta'}</h2>
    <label>Nombre<input id="k-nombre" value="${c?esc(c.nombre):''}" placeholder="Ej. Mastercard" required></label>
    <div class="row"><label class="grow">Día de corte<input id="k-corte" inputmode="numeric" value="${c?c.corte:''}" placeholder="15" required></label>
    <label class="grow">Día de pago<input id="k-pago" inputmode="numeric" value="${c?c.pago:''}" placeholder="1" required></label></div>
    <p class="note" style="margin:0">Para fin de mes escribe 31; en meses más cortos se usa el último día.</p>
    <label>¿Cuánto debes hoy en esta tarjeta? (USD)<input class="money" id="k-saldo" inputmode="decimal" value="${deb?fmtN.format(Math.max(deb.saldo,0)):''}" placeholder="0,00"></label>
    <p class="note" style="margin:0">Desde aquí la app suma lo que compres con la tarjeta y resta tus abonos.</p>
    <div class="row"><button class="primary" type="submit">Guardar</button><button type="button" data-act="cancelcard">Cancelar</button>${c?`<span class="grow"></span>${delBtn('delcard',`data-id="${esc(c.id)}"`)}`:''}</div>
  </form>`;
}

function cardView(c){
  if(S.editCard===c.id)return cardForm(c);
  const i=cycleInfo(c);const deb=cardDebt(c);const saldoA=ahorroSaldo();
  const ab=S.deuda.abonos.filter(a=>a.tarjetaId===c.id).sort((x,y)=>y.fecha.localeCompare(x.fecha));
  const due=i.diasPago>=0&&i.diasPago<=5;
  let debtHtml='';
  if(deb){const tot=deb.inicial+deb.consumos;const pct=tot>0?Math.min(100,deb.abonos/tot*100):0;
    debtHtml=`<div class="hero"><span class="eyebrow">Debes en total</span><span class="big" style="color:${deb.saldo>0?'var(--debt)':'var(--save)'}">${$$(Math.max(deb.saldo,0))}</span></div>
      <div class="bar debt"><i style="width:${pct}%"></i></div>
      <div class="split"><span>Saldo inicial <b>${$$(deb.inicial)}</b></span><span>+ compras <b>${$$(deb.consumos)}</b></span><span>− abonos <b>${$$(deb.abonos)}</b></span></div>
      ${deb.sinSaldo?`<p class="note" style="margin:0">Si ya debías algo en esta tarjeta antes de usar la app, toca <b>Editar</b> y escribe cuánto debes hoy.</p>`:''}`;
  }
  return `<section class="card">
    <div class="row between"><div class="cardname"><span class="chipcard" aria-hidden="true"></span><h2>${esc(c.nombre)}</h2></div><button type="button" class="ghost" data-act="editcard" data-id="${esc(c.id)}">Editar</button></div>
    ${debtHtml}
    <div class="dates">
      <div class="date"><span class="eyebrow">Próximo corte · día ${c.corte}</span><span class="d1">${esc(shortDate(i.nc))}</span><span class="d2 note">${inDays(i.diasCorte)}</span></div>
      <div class="date ${due?'due':''}"><span class="eyebrow">Próximo pago · día ${c.pago>=28?'fin de mes':c.pago}</span><span class="d1">${esc(shortDate(i.pago))}</span><span class="d2 note">${inDays(i.diasPago)}</span></div>
    </div>
    <div class="split"><span>Compras desde el último corte (${i.lc.getDate()}/${i.lc.getMonth()+1}) <b>${$$(i.cicloActual)}</b></span>${i.pagoMonto>0?`<span>Para este pago, ${esc(i.pagoDe)}: <b>${$$(i.pagoMonto)}</b></span>`:''}</div>
    <form class="row" data-abono="${esc(c.id)}" autocomplete="off" style="align-items:flex-end">
      <label class="grow">Abonar a ${esc(c.nombre)}<input class="money" id="ab-monto-${esc(c.id)}" inputmode="decimal" placeholder="0,00" required></label>
      <label class="grow">Pagas con<select id="ab-origen-${esc(c.id)}"><option value="mes">Dinero del mes</option><option value="ahorro">Mis ahorros (${$$(saldoA)})</option></select></label>
      <button class="primary" type="submit">Abonar</button>
    </form>
    ${cardPurchases(c,i)}
    ${progBlock(c,i)}
    ${ab.length?`<details><summary><span>Abonos</span><span class="num">${ab.length}</span></summary><div class="list">${ab.slice(0,15).map(x=>`<div class="item"><span class="t">${x.fecha.slice(5).split('-').reverse().join('/')}</span><div class="d"><b>Abono</b><small>${x.origen==='ahorro'?'Desde ahorros':'Del mes'}</small></div><span class="m">${$$(x.monto)}</span>${x.origen==='ahorro'?delBtn('delabono',`data-id="${x.id}"`):'<span></span>'}</div>`).join('')}</div></details>`:''}
  </section>`;
}

function cardPurchases(c,i){
  const pc=lastCorte(c,new Date(i.lc.getTime()-864e5));
  const all=allGastos().filter(g=>gMet(g)===c.id).sort((a,b)=>a.fecha.localeCompare(b.fecha)||gTs(a)-gTs(b));
  const lc=ymd(i.lc),pcs=ymd(pc);
  const groups=[
    {t:`Este ciclo · desde el ${ddmm(lc)} hasta el corte del ${ddmm(ymd(i.nc))}`,gs:all.filter(g=>g.fecha>lc),open:true},
    {t:`Ciclo anterior · ${ddmm(pcs)} al ${ddmm(lc)}`,gs:all.filter(g=>g.fecha>pcs&&g.fecha<=lc)},
    {t:`Antes del ${ddmm(pcs)}`,gs:all.filter(g=>g.fecha<=pcs)}
  ].filter(x=>x.gs.length);
  if(!all.length)return `<div class="cat" style="border-top:1px solid var(--line);padding-bottom:0"><b>Compras con ${esc(c.nombre)}</b><p class="note" style="margin:0">Aún no hay compras. Al registrar un gasto, elige <b>Tarjeta de crédito</b> y luego <b>${esc(c.nombre)}</b>.</p></div>`;
  return `<div class="cat" style="border-top:1px solid var(--line);padding-bottom:0">
    <div class="row between"><b>Compras con ${esc(c.nombre)}</b><span class="note">${all.length} en total · en orden de fecha</span></div>
    ${groups.map(gr=>{let acc=0;const tot=r2(gr.gs.reduce((a,g)=>a+g.monto,0));
      return `<details ${gr.open?'open':''}><summary><span>${esc(gr.t)}</span><span class="num">${$$(tot)}</span></summary>
        <div class="list">${gr.gs.map(g=>{acc=r2(acc+g.monto);return gastoItem(g,g.fecha.slice(0,7),{fecha:true,acum:acc,sinMet:true})}).join('')}</div></details>`}).join('')}
  </div>`;
}
function progBlock(c,i){
  const ps=progs().filter(p=>p.tarjetaId===c.id).sort((a,b)=>a.fecha.localeCompare(b.fecha));
  const yaProg=r2(ps.reduce((s,p)=>s+p.monto,0));
  const sug=r2(i.pagoMonto-i.abonadoCiclo-yaProg);
  const fondo=ym(i.pago);const now=ym(new Date());
  const meses=[0,1,2].map(n=>shiftMonth(now,n));if(!meses.includes(fondo))meses.push(fondo);
  const t=today0();
  return `<div class="cat" style="border-top:1px solid var(--line);padding-bottom:0">
    <div class="row between"><b>Pagos programados</b>${yaProg?`<span class="num">${$$(yaProg)}</span>`:''}</div>
    ${ps.length?`<div class="list">${ps.map(p=>{const n=diffDays(parseDay(p.fecha),t);return `<div class="item"><span class="t">${p.fecha.slice(5).split('-').reverse().join('/')}</span><div class="d"><b>${$$(p.monto)}</b><small>Con el dinero de ${esc(monthName(p.mesFondo).split(' ')[0])} · ${n<0?'<span style="color:var(--debt)">vencido</span>':inDays(n)}${p.nota?' · '+esc(p.nota):''}</small></div><button type="button" data-act="pagarprog" data-id="${p.id}">Ya pagué</button>${delBtn('delprog',`data-id="${p.id}"`)}</div>`}).join('')}</div>`:
      '<p class="note" style="margin:0">¿No te alcanza este mes? Aparta el pago con el dinero que recibes después; la app te lo recuerda cuando se acerque la fecha.</p>'}
    <form data-prog="${esc(c.id)}" autocomplete="off" style="display:flex;flex-direction:column;gap:10px">
      <div class="row" style="align-items:flex-end">
        <label class="grow">Monto a pagar<input class="money" id="pg-monto-${esc(c.id)}" inputmode="decimal" value="${sug>0?fmtN.format(sug):''}" placeholder="0,00" required></label>
        <label class="grow">Fecha de pago<input type="date" id="pg-fecha-${esc(c.id)}" value="${ymd(i.pago)}" required></label>
      </div>
      <div class="row" style="align-items:flex-end">
        <label class="grow">Con el dinero de<select id="pg-fondo-${esc(c.id)}">${meses.map(m=>`<option value="${m}" ${m===fondo?'selected':''}>${esc(monthName(m))}</option>`).join('')}</select></label>
        <button type="submit">Programar pago</button>
      </div>
    </form>
  </div>`;
}

async function viewDeuda(){
  const a=S.ahorro;const saldoA=ahorroSaldo();
  const debts=cards().map(cardDebt).filter(Boolean);const total=r2(debts.reduce((s,d)=>s+Math.max(d.saldo,0),0));
  const plan=S.settings.presupuesto.tarjeta||0;
  const meses=plan>0&&total>0?Math.ceil(total/plan):null;
  let fin='';if(meses){const n=new Date();fin=new Date(n.getFullYear(),n.getMonth()+meses,1).toLocaleDateString('es-EC',{month:'long',year:'numeric'})}
  const meta=a.meta||0;const movs=a.movs.slice().sort((x,y)=>y.fecha.localeCompare(x.fecha));
  return header('Tarjetas y ahorro','Metas')+cardAlerts()+
  (debts.length?`<section class="card hero"><span class="eyebrow">Deuda total en tarjetas</span><span class="big" style="color:${total>0?'var(--debt)':'var(--save)'}">${$$(total)}</span>
    ${total<=0?'<div class="note">Sin deuda. Lo que asignabas a tarjetas puede ir a tu ahorro.</div>':
      meses?`<div class="note">Abonando ${$$(plan)} al mes (tu reparto) y sin nuevas compras con tarjeta, terminas en unos ${meses} mes${meses===1?'':'es'}, hacia ${esc(fin)}. No incluye intereses.</div>`:
      '<div class="note">Asigna un monto mensual a Pago de tarjetas en Reparto para estimar cuándo terminas de pagar.</div>'}</section>`:'')+
  cards().map(cardView).join('')+
  (S.addCard?cardForm(null):`<button type="button" data-act="addcard">+ Agregar otra tarjeta</button>`)+`
  <section class="card"><h2>Ahorro</h2>
    <div class="hero"><span class="eyebrow">Tienes guardado</span><span class="big" style="color:var(--save)">${$$(saldoA)}</span></div>
    ${meta?`<div class="bar save"><i style="width:${Math.min(100,Math.max(0,saldoA/meta*100))}%"></i></div><div class="row between note"><span>Meta <span class="num">${$$(meta)}</span></span><span>${saldoA>=meta?'Meta cumplida':'Faltan <span class="num">'+$$(meta-saldoA)+'</span>'}</span></div>`:''}
    <form id="f-ahorro" class="row" autocomplete="off" style="align-items:flex-end">
      <label class="grow">Guardar en ahorro<input class="money" id="ah-monto" inputmode="decimal" placeholder="0,00" required></label>
      <button class="primary" type="submit">Guardar</button></form>
    <form id="f-meta" class="row" autocomplete="off" style="align-items:flex-end">
      <label class="grow">Meta de ahorro (opcional)<input id="ah-meta" inputmode="decimal" value="${meta?fmtN.format(meta):''}" placeholder="Ej. 300,00"></label>
      <button type="submit">Fijar meta</button></form>
    <div class="list">${movs.length?movs.slice(0,12).map(x=>`<div class="item"><span class="t">${x.fecha.slice(5).split('-').reverse().join('/')}</span><div class="d"><b>${esc(x.nota||(x.monto<0?'Retiro':'Aporte'))}</b></div><span class="m" style="color:${x.monto<0?'var(--debt)':'var(--save)'}">${x.monto<0?'':'+'}${$$(x.monto)}</span><span></span></div>`).join(''):'<div class="empty">Cada vez que guardes dinero, anótalo aquí. Cuenta como parte de tu categoría Ahorro del mes.</div>'}</div>
  </section>`;
}

// ---------- cuenta, login y respaldo ----------
function viewLogin(){
  const reg=S.loginMode==='registro';
  return `<div class="top"><div><div class="eyebrow">Mis cuentas</div><h1>${reg?'Crea tu cuenta':'Inicia sesión'}</h1></div></div>
  <form class="card" id="f-login" autocomplete="on">
    <p class="note" style="margin:0">${reg?'Con tu cuenta, tus datos se guardan en la nube y los ves igual en el celular y en la compu.':'Entra con el correo y la contraseña de tu cuenta de Mis Cuentas.'}</p>
    <label>Correo<input id="l-email" type="email" autocomplete="email" required></label>
    <label>Contraseña<input id="l-pass" type="password" autocomplete="${reg?'new-password':'current-password'}" minlength="6" required></label>
    <button class="primary block" type="submit">${reg?'Crear cuenta':'Entrar'}</button>
    <div class="row between"><button type="button" class="ghost" data-act="loginmode">${reg?'Ya tengo cuenta':'Crear una cuenta nueva'}</button>${reg?'':'<button type="button" class="ghost" data-act="resetpass">Olvidé mi contraseña</button>'}</div>
  </form>`;
}
async function viewCuenta(){
  const cloud=Store.mode==='cloud';
  return header('Cuenta y respaldo','Cuenta')+`
  <section class="card"><h2>Tu cuenta</h2>
    ${cloud?`<p class="note" style="margin:0">Conectado como <b>${esc(S.email||'')}</b>. Tus datos se sincronizan entre todos tus dispositivos.</p>
      <button type="button" data-act="logout">Cerrar sesión</button>`:
      `<div class="callout">Estás en <b>modo local</b>: los datos viven solo en este navegador. Para sincronizar entre celular y compu, configura Firebase siguiendo la guía (archivo <b>firebase-config.js</b>).</div>`}
  </section>
  <section class="card"><h2>Respaldo</h2>
    <p class="note" style="margin:0">Descarga un archivo con todos tus datos o carga uno anterior. Sirve para pasar tus datos desde la versión de Claude o guardar una copia.</p>
    <div class="row"><button type="button" class="primary" data-act="exportar">Descargar respaldo</button>
    <label class="filebtn">Cargar respaldo<input type="file" id="imp-file" accept="application/json,.json" hidden></label></div>
    <p class="note" style="margin:0">Al cargar un respaldo se reemplazan los datos que tengas ahora.</p>
  </section>
  <p class="note">Mis Cuentas · versión ${APP_VERSION}</p>`;
}
async function exportar(){
  const docs=await Store.all();
  const blob=new Blob([JSON.stringify({app:'mis-cuentas',version:1,exportado:new Date().toISOString(),docs},null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='mis-cuentas-respaldo-'+ymd(new Date())+'.json';
  document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000);
  toast('Respaldo descargado');
}
async function importar(file){
  let data;try{data=JSON.parse(await file.text())}catch(e){toast('Ese archivo no es un respaldo válido');return}
  const docs=data&&data.docs;
  if(!docs||typeof docs!=='object'||!docs.settings){toast('El archivo no tiene datos de Mis Cuentas');return}
  const keys=Object.keys(docs).filter(k=>/^(settings|deuda|ahorro|m\d{4}-\d{2})$/.test(k));
  keys.forEach(k=>Store.set(k,docs[k]));
  toast(`Respaldo cargado: ${keys.filter(k=>k[0]==='m').length} mes(es) de datos`);
  await loadAll();render();
}
document.addEventListener('change',async e=>{
  if(e.target.id!=='imp-file'||!e.target.files[0])return;
  const f=e.target.files[0];e.target.value='';
  S.pendingImport=f;
  const box=e.target.closest('.card');
  if(box&&!box.querySelector('[data-act="confirmimp"]')){box.insertAdjacentHTML('beforeend',`<div class="alert"><div class="grow">¿Reemplazar tus datos actuales con <b>${esc(f.name)}</b>?</div><button type="button" class="primary" data-act="confirmimp">Sí, cargar</button></div>`)}
});

// ---------- render ----------
let renderSeq=0;
async function render(){
  const seq=++renderSeq;
  document.getElementById('tabs').innerHTML=TABS.map(t=>`<button data-tab="${t.id}" ${S.tab===t.id?'aria-current="page"':''}><svg viewBox="0 0 24 24" aria-hidden="true">${t.icon}</svg>${t.label}</button>`).join('');
  document.querySelector('.tabs').hidden=!!S.needLogin;
  if(S.needLogin){document.getElementById('app').innerHTML=viewLogin();return}
  if(!S.ready)return;
  const v={hoy:viewHoy,mes:viewMes,reparto:viewReparto,deuda:viewDeuda,cuenta:viewCuenta}[S.tab];
  const html=await v();if(seq!==renderSeq)return;
  document.getElementById('app').innerHTML=html;
}

// ---------- eventos ----------
document.addEventListener('click',async e=>{
  const tb=e.target.closest('[data-tab]');
  if(tb){S.tab=tb.dataset.tab;try{localStorage.setItem('mc-tab',S.tab)}catch(_){}S.editCard=null;S.addCard=false;S.editG=null;render();window.scrollTo(0,0);return}
  const b=e.target.closest('[data-act]');if(!b)return;const act=b.dataset.act;
  if(act==='selcat'){S.selCat=b.dataset.id;
    document.querySelectorAll('[data-act="selcat"]').forEach(c=>c.setAttribute('aria-pressed',c.dataset.id===S.selCat));return}
  if(act==='selmet'){let v=b.dataset.id;
    if(v==='credito'){if(isCard(S.selMet))return;v=(S.lastCard&&card(S.lastCard))?S.lastCard:cards()[0].id}
    S.selMet=v;if(isCard(v))S.lastCard=v;
    try{localStorage.setItem('mc-met',S.selMet)}catch(_){}
    const gm=document.getElementById('g-met');if(gm)gm.innerHTML=metChips();return}
  if(act==='editg'){S.editG=b.dataset.id;render();return}
  if(act==='exportar'){exportar();return}
  if(act==='confirmimp'){if(S.pendingImport){const f=S.pendingImport;S.pendingImport=null;importar(f)}return}
  if(act==='loginmode'){S.loginMode=S.loginMode==='registro'?'login':'registro';render();return}
  if(act==='resetpass'){const em=(document.getElementById('l-email')||{}).value;if(!em){toast('Escribe tu correo arriba primero');return}
    firebase.auth().sendPasswordResetEmail(em).then(()=>toast('Te enviamos un correo para cambiar la contraseña')).catch(er=>toast(authMsg(er)));return}
  if(act==='logout'){firebase.auth().signOut();return}
  if(act==='canceledit'){S.editG=null;render();return}
  if(act==='prevm'){S.viewMonth=shiftMonth(S.viewMonth,-1);render();return}
  if(act==='nextm'){S.viewMonth=shiftMonth(S.viewMonth,1);render();return}
  if(act==='editcard'){S.editCard=b.dataset.id;S.addCard=false;render();return}
  if(act==='addcard'){S.addCard=true;S.editCard=null;render();return}
  if(act==='cancelcard'){S.addCard=false;S.editCard=null;render();return}
  if(act==='pagarprog'){const p=progs().find(x=>x.id===b.dataset.id);if(!p)return;const c=card(p.tarjetaId);
    S.deuda.programados=progs().filter(x=>x.id!==p.id);
    if(c)await addGasto(p.monto,'tarjeta','Pago programado '+c.nombre,{metodo:'debito',tarjetaId:c.id});else saveDeuda();
    saveDeuda();toast(`Pago de ${$$(p.monto)} registrado`);render();return}
  if(act.startsWith('del')){
    if(!b.classList.contains('armed')){const lab=b.textContent;b.classList.add('armed');b.textContent='Toca otra vez para borrar';setTimeout(()=>{if(b.isConnected){b.classList.remove('armed');b.textContent=lab}},4000);return}
    if(act==='delgasto'){await delGasto(b.dataset.k,b.dataset.id);S.editG=null;toast('Gasto borrado')}
    if(act==='delingreso'){const m=await month(b.dataset.k);m.ingresos=m.ingresos.filter(x=>x.id!==b.dataset.id);saveMonth(b.dataset.k);toast('Ingreso borrado')}
    if(act==='delcat'){S.settings.cats=S.settings.cats.filter(c=>c.id!==b.dataset.id);delete S.settings.presupuesto[b.dataset.id];if(S.selCat===b.dataset.id)S.selCat=defaultCat();saveSettings();toast('Categoría quitada')}
    if(act==='delabono'){const ab=S.deuda.abonos.find(x=>x.id===b.dataset.id);S.deuda.abonos=S.deuda.abonos.filter(x=>x.id!==b.dataset.id);saveDeuda();
      if(ab&&ab.movId){S.ahorro.movs=S.ahorro.movs.filter(x=>x.id!==ab.movId);saveAhorro()}toast('Abono borrado')}
    if(act==='delprog'){S.deuda.programados=progs().filter(x=>x.id!==b.dataset.id);saveDeuda();toast('Pago programado quitado')}
    if(act==='delcard'){const id=b.dataset.id;S.settings.tarjetas=cards().filter(c=>c.id!==id);delete S.deuda.saldos[id];
      if(S.selMet===id)S.selMet='efectivo';S.editCard=null;saveSettings();saveDeuda();toast('Tarjeta quitada')}
    render();
  }
});
document.addEventListener('change',e=>{
  const id=e.target.dataset&&e.target.dataset.budget;if(!id)return;
  const v=e.target.value.trim()===''?0:parseMoney(e.target.value);
  if(isNaN(v)||v<0){toast('Escribe un monto válido, por ejemplo 25,50');return}
  S.settings.presupuesto[id]=v;saveSettings();render();
});
document.addEventListener('submit',async e=>{
  e.preventDefault();const f=e.target;const val=id=>document.getElementById(id).value;
  const need=(id)=>{const n=parseMoney(val(id));if(!(n>0)){toast('Escribe un monto mayor a cero');document.getElementById(id).focus();return null}return n};
  if(f.id==='f-login'){const em=val('l-email').trim(),pw=val('l-pass');const a=firebase.auth();
    const p=S.loginMode==='registro'?a.createUserWithEmailAndPassword(em,pw):a.signInWithEmailAndPassword(em,pw);
    p.catch(er=>toast(authMsg(er)));return}
  if(f.id==='f-gasto'){const n=need('g-monto');if(n==null)return;
    const fecha=val('g-fecha')||ymd(new Date());if(fecha>ymd(new Date())){toast('La fecha no puede ser en el futuro');return}
    await addGasto(n,S.selCat,val('g-nota').trim(),{metodo:S.selMet,fecha});
    toast(`Registrado ${$$(n)} · ${isCard(S.selMet)?'Tarjeta ':''}${metName(S.selMet)}${fecha!==ymd(new Date())?' · '+ddmm(fecha):''}`)}
  else if(f.id==='f-edit'){const n=need('e-monto');if(n==null)return;
    const fecha=val('e-fecha');if(!fecha||fecha>ymd(new Date())){toast('Elige una fecha válida, que no sea futura');return}
    const oldK=f.dataset.k;const m=await month(oldK);const g=m.gastos.find(x=>x.id===f.dataset.id);if(!g){S.editG=null;render();return}
    const ec=document.getElementById('e-cat');
    Object.assign(g,{monto:n,nota:val('e-nota').trim(),metodo:val('e-met')});if(ec)g.cat=ec.value;
    if(g.fecha!==fecha){g.fecha=fecha;g.hora=''}
    const newK=fecha.slice(0,7);
    if(newK!==oldK){m.gastos=m.gastos.filter(x=>x.id!==g.id);saveMonth(oldK);const m2=await month(newK);m2.gastos.push(g);saveMonth(newK)}else saveMonth(oldK);
    if(g.abonoId){const a=S.deuda.abonos.find(x=>x.id===g.abonoId);if(a){a.monto=n;a.fecha=fecha;saveDeuda()}}
    if(g.movId){const mv=S.ahorro.movs.find(x=>x.id===g.movId);if(mv){mv.monto=n;mv.fecha=fecha;saveAhorro()}}
    if(!g.movId&&cat(g.cat).tipo==='ahorro'){const mv={id:uid(),monto:n,fecha,nota:g.nota||'Aporte del mes',gastoId:g.id};S.ahorro.movs.push(mv);g.movId=mv.id;saveAhorro();saveMonth(newK)}
    if(g.movId&&cat(g.cat).tipo!=='ahorro'){S.ahorro.movs=S.ahorro.movs.filter(x=>x.id!==g.movId);delete g.movId;saveAhorro();saveMonth(newK)}
    S.editG=null;toast('Cambios guardados')}
  else if(f.id==='f-ingreso'){const n=need('i-monto');if(n==null)return;const k=S.viewMonth;const m=await month(k);
    const today=new Date();const fecha=k===ym(today)?ymd(today):k+'-01';
    m.ingresos.push({id:uid(),monto:n,desc:val('i-desc').trim(),fecha,metodo:val('i-met')});saveMonth(k);toast('Ingreso agregado')}
  else if(f.id==='f-cat'){const nombre=val('c-nombre').trim();if(!nombre)return;
    S.settings.cats.splice(S.settings.cats.length-1,0,{id:'c'+uid(),nombre,tipo:val('c-tipo')});saveSettings();toast('Categoría agregada')}
  else if(f.id==='f-card'){const nombre=val('k-nombre').trim();const corte=parseInt(val('k-corte'),10),pago=parseInt(val('k-pago'),10);
    if(!nombre){toast('Ponle un nombre a la tarjeta');return}
    if(!(corte>=1&&corte<=31)||!(pago>=1&&pago<=31)){toast('Los días de corte y pago van del 1 al 31');return}
    let id=f.dataset.id;
    if(id){Object.assign(card(id),{nombre,corte,pago})}else{id='t'+uid();S.settings.tarjetas.push({id,nombre,corte,pago})}
    const sraw=val('k-saldo').trim();
    if(sraw!==''){const s=parseMoney(sraw);if(isNaN(s)||s<0){toast('Escribe un saldo válido');return}
      const prev=cardDebt(card(id));if(!prev||Math.abs(prev.saldo-s)>=0.005){S.deuda.saldos[id]={monto:s,ts:Date.now()};saveDeuda()}}
    S.editCard=null;S.addCard=false;saveSettings();toast('Tarjeta guardada')}
  else if(f.dataset.prog){const id=f.dataset.prog;const n=need('pg-monto-'+id);if(n==null)return;
    const fecha=val('pg-fecha-'+id);if(!/^\d{4}-\d{2}-\d{2}$/.test(fecha)){toast('Elige la fecha de pago');return}
    const mesFondo=val('pg-fondo-'+id);
    if(mesFondo>fecha.slice(0,7))toast('Ojo: la fecha de pago es antes de recibir ese dinero');
    S.deuda.programados.push({id:uid(),tarjetaId:id,monto:n,fecha,mesFondo});saveDeuda();
    if(!(mesFondo>fecha.slice(0,7)))toast(`Apartado ${$$(n)} de ${monthName(mesFondo).split(' ')[0]} para ${card(id).nombre}`)}
  else if(f.dataset.abono){const id=f.dataset.abono;const n=need('ab-monto-'+id);if(n==null)return;const c=card(id);
    if(val('ab-origen-'+id)==='ahorro'){if(n>ahorroSaldo()){toast(`Solo tienes ${$$(ahorroSaldo())} ahorrados`);return}
      const mv={id:uid(),monto:-n,fecha:ymd(new Date()),nota:'Abono a '+c.nombre};S.ahorro.movs.push(mv);
      S.deuda.abonos.push({id:uid(),monto:n,fecha:mv.fecha,ts:Date.now(),origen:'ahorro',tarjetaId:id,movId:mv.id});saveAhorro();saveDeuda()}
    else{await addGasto(n,'tarjeta','Abono '+c.nombre,{metodo:'debito',tarjetaId:id})}
    toast(`Abono de ${$$(n)} a ${c.nombre}`)}
  else if(f.id==='f-ahorro'){const n=need('ah-monto');if(n==null)return;await addGasto(n,'ahorro','Aporte al ahorro',{metodo:'debito'});toast(`Guardaste ${$$(n)}`)}
  else if(f.id==='f-meta'){const v=val('ah-meta').trim()===''?0:parseMoney(val('ah-meta'));if(isNaN(v)||v<0){toast('Escribe un monto válido');return}S.ahorro.meta=v;saveAhorro();toast(v?'Meta fijada':'Meta quitada')}
  else return;
  render();
});

// ---------- inicio ----------
const APP_VERSION='1.0.0';
function authMsg(e){const c=e&&e.code||'';
  if(c.includes('invalid-credential')||c.includes('wrong-password')||c.includes('user-not-found'))return 'Correo o contraseña incorrectos';
  if(c.includes('email-already-in-use'))return 'Ese correo ya tiene cuenta. Toca "Ya tengo cuenta".';
  if(c.includes('weak-password'))return 'La contraseña debe tener al menos 6 caracteres';
  if(c.includes('invalid-email'))return 'Revisa el correo, parece incompleto';
  if(c.includes('network'))return 'Sin conexión. Inténtalo cuando tengas internet.';
  if(c.includes('too-many-requests'))return 'Demasiados intentos. Espera un momento.';
  return 'No se pudo: '+(e&&e.message||'error desconocido')}
async function loadAll(){
  S.months={};S.ready=false;
  S.settings=await loadDoc('settings',DEFAULT_SETTINGS);
  S.settings.cats=S.settings.cats||clone(DEFAULT_SETTINGS.cats);S.settings.presupuesto=S.settings.presupuesto||{};
  let settingsChanged=false;
  if(!Array.isArray(S.settings.tarjetas)){S.settings.tarjetas=clone(DEFAULT_CARDS);settingsChanged=true}
  if(!S.settings.cats.some(x=>x.id==='otros')){S.settings.cats.push({id:'otros',nombre:'Otros',tipo:'variable'});settingsChanged=true}
  const d=await loadDoc('deuda',{saldos:{},abonos:[]});
  S.deuda=d;S.deuda.saldos=S.deuda.saldos||{};S.deuda.abonos=S.deuda.abonos||[];S.deuda.programados=S.deuda.programados||[];
  S.ahorro=await loadDoc('ahorro',{meta:0,movs:[]});S.ahorro.movs=S.ahorro.movs||[];
  const now=new Date();let start=new Date(now.getFullYear(),now.getMonth()-2,1);
  Object.values(S.deuda.saldos).forEach(s=>{if(s&&s.ts){const t=new Date(s.ts);const f=new Date(t.getFullYear(),t.getMonth(),1);if(f<start)start=f}});
  const lim=new Date(now.getFullYear(),now.getMonth()-24,1);if(start<lim)start=lim;
  const keys=[];for(let x=new Date(start);x<=now;x=new Date(x.getFullYear(),x.getMonth()+1,1))keys.push(ym(x));
  await Promise.all(keys.map(month));
  if(settingsChanged)saveSettings();
  repairCats();
  if(S.selCat==='tarjeta'||!S.settings.cats.some(x=>x.id===S.selCat))S.selCat=defaultCat();
  if(isCard(S.selMet))S.lastCard=S.selMet;
  if(!CASH[S.selMet]&&!isCard(S.selMet))S.selMet='efectivo';
  S.ready=true;
}
async function init(){
  render();
  const cfg=window.FIREBASE_CONFIG;
  const cloud=cfg&&cfg.apiKey&&!/PEGA/.test(cfg.apiKey)&&window.firebase;
  if(!cloud){Store.mode='local';await loadAll();render();return}
  firebase.initializeApp(cfg);
  const fs=firebase.firestore();
  try{await fs.enablePersistence({synchronizeTabs:true})}catch(e){/* otra pestaña o navegador sin soporte: sigue sin caché */}
  Store.mode='cloud';Store.fs=fs;
  firebase.auth().onAuthStateChanged(async u=>{
    if(!u){S.needLogin=true;S.ready=false;Store.uid=null;render();return}
    S.needLogin=false;Store.uid=u.uid;S.email=u.email;
    document.getElementById('app').innerHTML='<div class="top"><div><div class="eyebrow">Mis cuentas</div><h1>Cargando tus datos…</h1></div></div>';
    await loadAll();render();
  });
}
window.addEventListener('online',()=>render());window.addEventListener('offline',()=>render());
init();
})();

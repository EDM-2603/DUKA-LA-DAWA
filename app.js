// ============================
// SUPABASE CONFIG
// ============================
const SUPABASE_URL = 'https://jbwbqawztnhjppefqcoo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_6n_uIo4d47pFoAQTX-47tA_Ee7fVSUr';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================
// SIMPLE HASH (client-side, lightweight obfuscation)
// NOTE: For production-grade security, password checks should move to a
// server-side function (Supabase Edge Function). This client-side hash
// prevents *casual* exposure of plain-text passwords in the database.
// ============================
async function hashPw(pw){
  const enc=new TextEncoder().encode(pw);
  const buf=await crypto.subtle.digest('SHA-256',enc);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

// ============================
// STATE
// ============================
let lang='sw', role=null, currentUser=null, loginRole='owner';
let shop={id:null,name:'',location:'',phone:'',tin:'',vrn:''};
let accounts=[], drugs=[], sales=[];
let cart={}, oAP='dash', sAP='sell', oTF='day', sTF='day';
let delId=null, delContext='drug', asId=null;
let receiptCounter=1;
let realtimeChannel=null;

// ============================
// INIT
// ============================
async function init(){
  try{
    const{data:shops,error}=await sb.from('shop_settings').select('*').limit(1);
    if(error)throw error;
    if(shops&&shops.length){
      shop=shops[0];
      await loadAllData();
      document.getElementById('loading-screen').classList.add('hidden');
      document.getElementById('login-screen').classList.remove('hidden');
      document.getElementById('ln-shop').textContent=shop.name;
      setupRealtime();
    }else{
      document.getElementById('loading-screen').classList.add('hidden');
      document.getElementById('setup-screen').classList.remove('hidden');
    }
  }catch(e){
    document.getElementById('loading-screen').classList.add('hidden');
    document.getElementById('setup-screen').classList.remove('hidden');
    console.error('Init error:',e);
  }
}

async function loadAllData(){
  const[{data:acc},{data:dr},{data:sl}]=await Promise.all([
    sb.from('accounts').select('*'),
    sb.from('drugs').select('*').order('name'),
    sb.from('sales').select('*').order('created_at',{ascending:true})
  ]);
  accounts=acc||[];
  drugs=dr||[];
  sales=(sl||[]).map(s=>({...s,items:typeof s.items==='string'?JSON.parse(s.items):s.items}));
  receiptCounter=sales.length+1;
}

function setupRealtime(){
  realtimeChannel=sb.channel('db-changes')
    .on('postgres_changes',{event:'*',schema:'public',table:'drugs'},async()=>{
      const{data}=await sb.from('drugs').select('*').order('name');
      drugs=data||[];
      if(role==='owner'){renderOPage(oAP);}else if(role==='seller'){renderSPage(sAP);}
    })
    .on('postgres_changes',{event:'*',schema:'public',table:'sales'},async()=>{
      const{data}=await sb.from('sales').select('*').order('created_at',{ascending:true});
      sales=(data||[]).map(s=>({...s,items:typeof s.items==='string'?JSON.parse(s.items):s.items}));
      if(role==='owner'){renderOPage(oAP);}else if(role==='seller'){renderSPage(sAP);}
    })
    .subscribe(status=>{
      const ok=status==='SUBSCRIBED';
      ['o-sync','s-sync'].forEach(id=>{
        const el=document.getElementById(id);
        if(el){el.className='sync-badge '+(ok?'sync-ok':'sync-bad');el.textContent=ok?'● Live':'● Offline';}
      });
    });
}

// ============================
// TRANSLATIONS
// ============================
const T={
  sw:{onav:['Muhtasari','Dawa','Ripoti','Mipangilio'],snav:['Uza','Ripoti'],
    stockval:'Thamani ya Stock',revenue:'Mapato',profit:'Faida Halisi',alerts:'Tahadhari',
    meds:'Dawa',txns:'Mauzo',ok:'Ipo',low:'Kidogo',out:'Imekwisha',
    empty:'Hakuna data.',nodrug:'Hakuna dawa.',tf:['Leo','Wiki','Mwezi','Mwaka','Mwenyewe'],
    colDrug:'Dawa',colQty:'Idadi',colTotal:'Jumla',colProfit:'Faida',colTime:'Wakati',colCost:'Gharama'},
  en:{onav:['Dashboard','Stock','Reports','Settings'],snav:['Sell','Report'],
    stockval:'Stock Value',revenue:'Revenue',profit:'Net Profit',alerts:'Alerts',
    meds:'Medicines',txns:'Sales',ok:'In Stock',low:'Low',out:'Out of Stock',
    empty:'No data.',nodrug:'No medicines.',tf:['Today','Week','Month','Year','Custom'],
    colDrug:'Medicine',colQty:'Qty',colTotal:'Total',colProfit:'Profit',colTime:'Time',colCost:'Cost'}
};
function t(k){return T[lang][k]||k;}
function fmt(n){return Number(n).toLocaleString();}
function statusOf(d){
  if(d.quantity===0)return{cls:'badge-out',txt:t('out')};
  if(d.quantity<=d.min_quantity)return{cls:'badge-low',txt:t('low')};
  return{cls:'badge-ok',txt:t('ok')};
}
function setLang(l){
  lang=l;
  ['ol-sw','sl-sw'].forEach(id=>{const e=document.getElementById(id);if(e)e.classList.toggle('active',l==='sw');});
  ['ol-en','sl-en'].forEach(id=>{const e=document.getElementById(id);if(e)e.classList.toggle('active',l==='en');});
  if(role==='owner'){applyNavO();renderOPage(oAP);}
  if(role==='seller'){applyNavS();renderSPage(sAP);}
}

// ============================
// SETUP WIZARD
// ============================
let currentStep=1, setupData={};
function showErr(id,msg){const e=document.getElementById(id);e.textContent=msg;e.classList.remove('hidden');}
function hideErr(id){document.getElementById(id).classList.add('hidden');}

function setupNext(step){
  hideErr('setup-err');
  if(step===2){
    const name=document.getElementById('s1-name').value.trim();
    const loc=document.getElementById('s1-loc').value.trim();
    const phone=document.getElementById('s1-phone').value.trim();
    if(!name||!loc||!phone){showErr('setup-err','Jaza sehemu zote zilizo na *');return;}
    setupData.shop={name,location:loc,phone,tin:document.getElementById('s1-tin').value.trim(),vrn:document.getElementById('s1-vrn').value.trim()};
  }
  if(step===3){
    const oname=document.getElementById('s2-oname').value.trim();
    const ouser=document.getElementById('s2-ouser').value.trim().toLowerCase();
    const opw=document.getElementById('s2-opw').value;
    const opw2=document.getElementById('s2-opw2').value;
    const sname=document.getElementById('s2-sname').value.trim();
    const suser=document.getElementById('s2-suser').value.trim().toLowerCase();
    const spw=document.getElementById('s2-spw').value;
    const spw2=document.getElementById('s2-spw2').value;
    if(!oname||!ouser||!opw||!sname||!suser||!spw){showErr('setup-err','Jaza sehemu zote zilizo na *');return;}
    if(opw!==opw2){showErr('setup-err','Nenosiri la mmiliki halifanani!');return;}
    if(spw!==spw2){showErr('setup-err','Nenosiri la mwuzaji halifanani!');return;}
    if(ouser===suser){showErr('setup-err','Username za mmiliki na mwuzaji lazima ziwe tofauti');return;}
    setupData.owner={name:oname,username:ouser,password:opw};
    setupData.seller={name:sname,username:suser,password:spw};
  }
  currentStep=step;
  [1,2,3].forEach(i=>{
    document.getElementById('setup-step'+i).classList.toggle('hidden',i!==step);
    const el=document.getElementById('st'+(i-1));
    if(el)el.className='step'+(i<step?' done':i===step?' active':'');
  });
  document.getElementById('sw-sub').textContent=`Hatua ${step} ya 3`;
}

async function setupFinish(){
  const btn=document.getElementById('finish-btn');
  btn.disabled=true;btn.innerHTML='<span class="spinner"></span> Inasanidi...';
  hideErr('setup-err');
  try{
    const{data:shopRow,error:shopErr}=await sb.from('shop_settings').insert(setupData.shop).select().single();
    if(shopErr)throw shopErr;
    shop=shopRow;

    const ownerHash=await hashPw(setupData.owner.password);
    const sellerHash=await hashPw(setupData.seller.password);
    const{error:accErr}=await sb.from('accounts').insert([
      {name:setupData.owner.name,username:setupData.owner.username,password_hash:ownerHash,role:'owner'},
      {name:setupData.seller.name,username:setupData.seller.username,password_hash:sellerHash,role:'seller'}
    ]);
    if(accErr)throw accErr;

    // Sample starter drugs
    await sb.from('drugs').insert([
      {name:'Panadol 500mg',barcode:'5000168014978',category:'Painkillers',buy_price:500,sell_price:1000,quantity:50,min_quantity:10},
      {name:'Amoxicillin 250mg',category:'Antibiotics',buy_price:800,sell_price:1500,quantity:8,min_quantity:15},
      {name:'Vitamin C 500mg',category:'Vitamins',buy_price:200,sell_price:500,quantity:100,min_quantity:20}
    ]);

    await loadAllData();
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('ln-shop').textContent=shop.name;
    setupRealtime();
  }catch(e){
    showErr('setup-err','Hitilafu: '+(e.message||'Imeshindikana kusanidi. Jaribu tena.'));
    btn.disabled=false;btn.textContent='✅ Maliza Usanidi';
  }
}

// ============================
// LOGIN
// ============================
function switchRole(r){
  loginRole=r;
  document.getElementById('tab-o').classList.toggle('active',r==='owner');
  document.getElementById('tab-s').classList.toggle('active',r==='seller');
}

async function doLogin(){
  hideErr('login-err');
  const u=document.getElementById('li-user').value.trim().toLowerCase();
  const p=document.getElementById('li-pw').value;
  if(!u||!p){showErr('login-err','Jaza username na nenosiri');return;}
  const btn=document.getElementById('login-btn');
  btn.disabled=true;btn.innerHTML='<span class="spinner"></span> Inaingia...';
  try{
    const hash=await hashPw(p);
    const acc=accounts.find(a=>a.username===u&&a.password_hash===hash&&a.role===loginRole);
    if(!acc){showErr('login-err','Jina au nenosiri si sahihi!');btn.disabled=false;btn.textContent='Ingia';return;}
    currentUser=acc;role=acc.role;
    document.getElementById('login-screen').classList.add('hidden');
    if(role==='owner'){
      document.getElementById('owner-app').classList.remove('hidden');
      document.getElementById('o-dn').textContent=shop.name;
      applyNavO();renderOPage('dash');
    }else{
      document.getElementById('seller-app').classList.remove('hidden');
      document.getElementById('s-dn').textContent=shop.name;
      document.getElementById('s-seller-name').textContent=acc.name;
      applyNavS();renderSPage('sell');
    }
  }catch(e){
    showErr('login-err','Hitilafu ya mtandao. Jaribu tena.');
  }
  btn.disabled=false;btn.textContent='Ingia';
}

function logout(){
  role=null;cart={};currentUser=null;
  document.getElementById('owner-app').classList.add('hidden');
  document.getElementById('seller-app').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('li-user').value='';document.getElementById('li-pw').value='';
}

// ============================
// NAV
// ============================
function applyNavO(){
  const nl=t('onav');for(let i=0;i<4;i++){const e=document.getElementById('on'+i);if(e)e.textContent=nl[i];}
  renderTF('o-tf','o',oTF);
}
function applyNavS(){
  const nl=t('snav');for(let i=0;i<2;i++){const e=document.getElementById('sn'+i);if(e)e.textContent=nl[i];}
  renderTF('s-tf','s',sTF);
}
function renderTF(elId,prefix,active){
  const tfs=t('tf');const vals=['day','week','month','year','custom'];
  document.getElementById(elId).innerHTML=tfs.map((l,i)=>`<button class="tf-btn${active===vals[i]?' active':''}" onclick="setTF('${prefix}','${vals[i]}')">${l}</button>`).join('');
}
function setTF(p,v){
  if(p==='o'){oTF=v;renderTF('o-tf','o',v);document.getElementById('o-cr').classList.toggle('hidden',v!=='custom');if(v!=='custom')renderOReport();}
  else{sTF=v;renderTF('s-tf','s',v);document.getElementById('s-cr').classList.toggle('hidden',v!=='custom');if(v!=='custom')renderSReport();}
}
function getRange(f,p){
  const now=new Date();let from=new Date(),to=new Date();to.setHours(23,59,59,999);
  if(f==='day'){from.setHours(0,0,0,0);}
  else if(f==='week'){from.setDate(now.getDate()-now.getDay());from.setHours(0,0,0,0);}
  else if(f==='month'){from=new Date(now.getFullYear(),now.getMonth(),1);}
  else if(f==='year'){from=new Date(now.getFullYear(),0,1);}
  else if(f==='custom'){
    const fv=document.getElementById(p+'-df').value;const tv=document.getElementById(p+'-dt').value;
    if(fv)from=new Date(fv+'T00:00:00');if(tv)to=new Date(tv+'T23:59:59');
  }
  return{from,to};
}
function filterSales(f,p){const{from,to}=getRange(f,p);return sales.filter(s=>new Date(s.created_at)>=from&&new Date(s.created_at)<=to);}

function oP(id,idx){
  document.querySelectorAll('#owner-app .page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('#o-nav .bnav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('op-'+id).classList.add('active');
  document.querySelectorAll('#o-nav .bnav-btn')[idx].classList.add('active');
  oAP=id;applyNavO();renderOPage(id);
}
function renderOPage(id){
  if(id==='dash')renderODash();if(id==='stock')renderOStock();
  if(id==='report')renderOReport();if(id==='settings')renderOSettings();
}
function sP(id,idx){
  document.querySelectorAll('#seller-app .page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('#seller-app .bnav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('sp-'+id).classList.add('active');
  document.querySelectorAll('#seller-app .bnav-btn')[idx].classList.add('active');
  sAP=id;applyNavS();renderSPage(id);
}
function renderSPage(id){if(id==='sell')renderSellPage();if(id==='sreport')renderSReport();}

// ============================
// OWNER DASHBOARD
// ============================
function renderODash(){
  const sv=drugs.reduce((s,d)=>s+d.quantity*d.buy_price,0);
  const rev=sales.reduce((s,m)=>s+Number(m.total),0);
  const cost=sales.reduce((s,m)=>s+m.items.reduce((a,i)=>a+i.buy*i.qty,0),0);
  const prof=rev-cost;
  const lc=drugs.filter(d=>d.quantity>0&&d.quantity<=d.min_quantity).length;
  const oc=drugs.filter(d=>d.quantity===0).length;
  document.getElementById('o-stats').innerHTML=`
    <div class="stat"><div class="stat-label">${t('stockval')}</div><div class="stat-value">TZS ${fmt(sv)}</div><div class="stat-sub">${drugs.length} ${t('meds')}</div></div>
    <div class="stat"><div class="stat-label">${t('revenue')}</div><div class="stat-value">TZS ${fmt(rev)}</div><div class="stat-sub">${sales.length} ${t('txns')}</div></div>
    <div class="stat"><div class="stat-label">${t('profit')}</div><div class="stat-value ${prof>=0?'profit-pos':'profit-neg'}">TZS ${fmt(prof)}</div></div>
    <div class="stat"><div class="stat-label">${t('alerts')}</div><div class="stat-value">${lc+oc}</div><div class="stat-sub">${oc} ${t('out')}, ${lc} ${t('low')}</div></div>`;
  document.getElementById('o-alerts').innerHTML=drugs.filter(d=>d.quantity<=d.min_quantity).map(d=>`
    <div class="alert ${d.quantity===0?'alert-d':'alert-w'}">⚠ <span><strong>${d.name}</strong> — ${d.quantity===0?t('out'):`Iliyobaki: ${d.quantity} (min ${d.min_quantity})`}</span></div>`).join('');
  const recent=[...sales].reverse().slice(0,5);
  document.getElementById('o-recent').innerHTML=recent.length?recent.map(m=>`
    <div class="sale-row"><div><div class="sale-name">${m.items.map(i=>i.name+(i.qty>1?' ×'+i.qty:'')).join(', ')}</div><div class="sale-meta">${m.seller_name||''} · ${new Date(m.created_at).toLocaleString('sw')}</div></div><div class="sale-amt">TZS ${fmt(m.total)}</div></div>`).join(''):`<div class="empty-d">${t('empty')}</div>`;
}

// ============================
// OWNER STOCK
// ============================
function renderOStock(){
  const q=(document.getElementById('o-search')?.value||'').toLowerCase();
  const filtered=drugs.filter(d=>d.name.toLowerCase().includes(q)||(d.category||'').toLowerCase().includes(q)||(d.barcode||'').includes(q));
  document.getElementById('o-stock-list').innerHTML=filtered.length?filtered.map(d=>{
    const s=statusOf(d);
    return`<div class="drug-row">
      <div style="flex:1;min-width:0;"><div class="drug-name">${d.name}${d.barcode?` <span style="font-size:10px;color:#94a3b8;">📦${d.barcode}</span>`:''}</div><div class="drug-meta">${d.category||''} · Uza: TZS ${fmt(d.sell_price)} · Nunua: TZS ${fmt(d.buy_price)}</div></div>
      <div class="drug-right"><span class="badge ${s.cls}">${s.txt}</span><span style="font-size:12px;color:#94a3b8;">${d.quantity}</span>
        <div style="display:flex;gap:4px;"><button class="btn-sm btn-add-s" onclick="openAddStockModal('${d.id}')">+ Stock</button><button class="btn-sm btn-del" onclick="openDelModal('${d.id}','drug')">🗑</button></div>
      </div></div>`;}).join(''):`<div class="empty-w">${t('empty')}</div>`;
}

async function addDrug(){
  const name=document.getElementById('oi-name').value.trim();
  if(!name){alert('Ingiza jina la dawa');return;}
  const drug={name,barcode:document.getElementById('oi-barcode').value.trim()||null,
    category:document.getElementById('oi-cat').value,
    buy_price:parseInt(document.getElementById('oi-buy').value)||0,
    sell_price:parseInt(document.getElementById('oi-sell').value)||0,
    quantity:parseInt(document.getElementById('oi-qty').value)||0,
    min_quantity:parseInt(document.getElementById('oi-min').value)||5};
  const{error}=await sb.from('drugs').insert(drug);
  if(error){alert('Hitilafu: '+error.message);return;}
  ['oi-name','oi-barcode','oi-buy','oi-sell','oi-qty','oi-min'].forEach(id=>document.getElementById(id).value='');
  const{data}=await sb.from('drugs').select('*').order('name');
  drugs=data||[];renderOStock();
}

// ============================
// MODALS
// ============================
function openDelModal(id,ctx){
  delId=id;delContext=ctx;
  const d=ctx==='drug'?drugs.find(x=>x.id===id):accounts.find(x=>x.id===id);
  document.getElementById('del-msg').textContent='Una uhakika wa kufuta "'+(d?.name||'')+'"? Haiwezi kurudishwa.';
  document.getElementById('del-modal').classList.add('open');
}
function openAddStockModal(id){modalAddStockId=id;document.getElementById('as-qty').value='';document.getElementById('add-stock-modal').classList.add('open');}
let modalAddStockId=null;
function openAddAccountModal(){['aa-name','aa-user','aa-pw'].forEach(id=>document.getElementById(id).value='');document.getElementById('add-account-modal').classList.add('open');}
function closeModal(id){document.getElementById(id).classList.remove('open');}

async function confirmDelete(){
  const table=delContext==='drug'?'drugs':'accounts';
  const{error}=await sb.from(table).delete().eq('id',delId);
  if(error){alert('Hitilafu: '+error.message);return;}
  if(delContext==='drug'){drugs=drugs.filter(d=>d.id!==delId);renderOStock();}
  else{accounts=accounts.filter(a=>a.id!==delId);renderOSettings();}
  closeModal('del-modal');
}
async function confirmAddStock(){
  const n=parseInt(document.getElementById('as-qty').value);
  if(isNaN(n)||n<=0)return;
  const d=drugs.find(x=>x.id===modalAddStockId);
  if(!d)return;
  const{error}=await sb.from('drugs').update({quantity:d.quantity+n}).eq('id',modalAddStockId);
  if(error){alert('Hitilafu: '+error.message);return;}
  d.quantity+=n;closeModal('add-stock-modal');renderOStock();
}
async function confirmAddAccount(){
  const name=document.getElementById('aa-name').value.trim();
  const user=document.getElementById('aa-user').value.trim().toLowerCase();
  const pw=document.getElementById('aa-pw').value;
  if(!name||!user||!pw){alert('Jaza sehemu zote');return;}
  if(accounts.find(a=>a.username===user)){alert('Username hii tayari ipo');return;}
  const hash=await hashPw(pw);
  const{error}=await sb.from('accounts').insert({name,username:user,password_hash:hash,role:'seller'});
  if(error){alert('Hitilafu: '+error.message);return;}
  const{data}=await sb.from('accounts').select('*');
  accounts=data||[];closeModal('add-account-modal');renderOSettings();
}

// ============================
// OWNER REPORT
// ============================
function renderOReport(){
  const filtered=filterSales(oTF,'o');
  const rev=filtered.reduce((s,m)=>s+Number(m.total),0);
  const cost=filtered.reduce((s,m)=>s+m.items.reduce((a,i)=>a+i.buy*i.qty,0),0);
  const prof=rev-cost;
  document.getElementById('o-r-stats').innerHTML=`
    <div class="stat"><div class="stat-label">${t('revenue')}</div><div class="stat-value">TZS ${fmt(rev)}</div><div class="stat-sub">${filtered.length} ${t('txns')}</div></div>
    <div class="stat"><div class="stat-label">${t('profit')}</div><div class="stat-value ${prof>=0?'profit-pos':'profit-neg'}">TZS ${fmt(prof)}</div></div>
    <div class="stat"><div class="stat-label">${t('stockval')}</div><div class="stat-value">TZS ${fmt(drugs.reduce((s,d)=>s+d.quantity*d.buy_price,0))}</div></div>
    <div class="stat"><div class="stat-label">${t('colCost')}</div><div class="stat-value">TZS ${fmt(cost)}</div></div>`;
  document.getElementById('o-r-list').innerHTML=[...filtered].reverse().map(m=>{
    const c=m.items.reduce((a,i)=>a+i.buy*i.qty,0);const f=m.total-c;
    return`<div class="report-row"><div><div class="sale-name">${m.items.map(i=>i.name+(i.qty>1?' ×'+i.qty:'')).join(', ')}</div><div class="sale-meta">${m.seller_name||''} · ${new Date(m.created_at).toLocaleString('sw')}</div></div><div style="text-align:right;"><div class="sale-amt">TZS ${fmt(m.total)}</div><div style="font-size:11px;" class="${f>=0?'profit-pos':'profit-neg'}">Faida: TZS ${fmt(f)}</div></div></div>`;
  }).join('')||`<div class="empty-d">${t('empty')}</div>`;
}

// ============================
// OWNER SETTINGS
// ============================
function renderOSettings(){
  document.getElementById('os-name').value=shop.name;
  document.getElementById('os-loc').value=shop.location;
  document.getElementById('os-phone').value=shop.phone;
  document.getElementById('os-tin').value=shop.tin||'';
  const sellers=accounts.filter(a=>a.role==='seller');
  document.getElementById('accounts-list').innerHTML=sellers.map(a=>`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f1f5f9;">
      <div><div style="font-size:13px;font-weight:500;color:#1a2e44;">${a.name}</div><div style="font-size:11px;color:#94a3b8;">@${a.username}</div></div>
      <button class="btn-sm btn-del" onclick="openDelModal('${a.id}','account')">Futa</button>
    </div>`).join('')||'<div class="empty-w">Hakuna wauzaji wengine.</div>';
}
async function saveShopSettings(){
  const update={name:document.getElementById('os-name').value.trim()||shop.name,
    location:document.getElementById('os-loc').value.trim(),
    phone:document.getElementById('os-phone').value.trim(),
    tin:document.getElementById('os-tin').value.trim()};
  const{error}=await sb.from('shop_settings').update(update).eq('id',shop.id);
  if(error){alert('Hitilafu: '+error.message);return;}
  Object.assign(shop,update);
  document.getElementById('o-dn').textContent=shop.name;
  alert('Imehifadhiwa!');
}

// ============================
// SELLER - SELL
// ============================
function renderSellPage(){
  document.getElementById('s-cart-card').style.display='none';
  document.getElementById('s-receipt-card').style.display='none';
  renderSellList();
}
function renderSellList(){
  const q=(document.getElementById('s-search')?.value||'').toLowerCase();
  const avail=drugs.filter(d=>d.quantity>0&&(d.name.toLowerCase().includes(q)||(d.category||'').toLowerCase().includes(q)));
  document.getElementById('s-sell-list').innerHTML=avail.length?avail.map(d=>`
    <div class="sell-item${cart[d.id]?' selected':''}" onclick="toggleCart('${d.id}')">
      <div class="sell-check"><div class="sell-check-inner"></div></div>
      <div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:500;color:#1a2e44;">${d.name}</div><div style="font-size:11px;color:#94a3b8;">${d.category||''}</div></div>
      <div style="text-align:right;"><div style="font-size:13px;font-weight:600;color:#0f4c81;">TZS ${fmt(d.sell_price)}</div><div style="font-size:10px;color:#94a3b8;">Ipo: ${d.quantity}</div></div>
    </div>`).join(''):`<div class="empty-w">${t('nodrug')}</div>`;
}
function toggleCart(id){
  if(cart[id]){delete cart[id];}else{const d=drugs.find(x=>x.id===id);if(d)cart[id]={drug:d,qty:1};}
  renderSellList();updateCart();
}
function updateCart(){
  const items=Object.values(cart);
  const card=document.getElementById('s-cart-card');
  if(!items.length){card.style.display='none';return;}
  card.style.display='block';let total=0;
  document.getElementById('s-cart-list').innerHTML=items.map(({drug,qty})=>{
    const sub=drug.sell_price*qty;total+=sub;
    return`<div class="cart-item">
      <div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:500;color:#1a2e44;">${drug.name}</div><div style="font-size:11px;color:#94a3b8;">TZS ${fmt(drug.sell_price)} × ${qty}</div></div>
      <div style="display:flex;align-items:center;gap:6px;"><button class="qty-btn" onclick="cartQty('${drug.id}',-1)">−</button><div class="qty-num">${qty}</div><button class="qty-btn" onclick="cartQty('${drug.id}',1)">+</button></div>
      <div style="font-size:12px;color:#64748b;text-align:right;min-width:70px;">TZS ${fmt(sub)}</div></div>`;}).join('');
  document.getElementById('s-cart-total').textContent='TZS '+fmt(total);
}
function cartQty(id,delta){
  if(!cart[id])return;const d=cart[id].drug;
  cart[id].qty=Math.max(1,Math.min(d.quantity,cart[id].qty+delta));updateCart();
}

async function confirmSale(){
  const items=Object.values(cart);
  if(!items.length){alert('Chagua dawa kwanza');return;}
  for(const{drug,qty}of items){if(qty>drug.quantity){alert(`Huna ${qty} ya ${drug.name}. Ipo ${drug.quantity} tu.`);return;}}
  const btn=document.getElementById('s-confirm-btn');
  btn.disabled=true;btn.innerHTML='<span class="spinner"></span> Inathibitisha...';

  const saleItems=items.map(({drug,qty})=>({id:drug.id,name:drug.name,qty,sell:Number(drug.sell_price),buy:Number(drug.buy_price),sub:drug.sell_price*qty}));
  const total=saleItems.reduce((s,i)=>s+i.sub,0);
  const vat=Math.round(total*0.18);
  const receiptNo='RCP-'+String(receiptCounter).padStart(6,'0');

  try{
    const{error:saleErr}=await sb.from('sales').insert({
      receipt_no:receiptNo,seller_id:currentUser.id,seller_name:currentUser.name,
      total,items:saleItems
    });
    if(saleErr)throw saleErr;

    for(const i of saleItems){
      const d=drugs.find(x=>x.id===i.id);
      const newQty=d.quantity-i.qty;
      const{error:upErr}=await sb.from('drugs').update({quantity:newQty}).eq('id',i.id);
      if(upErr)throw upErr;
      d.quantity=newQty;
    }
    receiptCounter++;

    const now=new Date();
    const time=now.toLocaleString('sw',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
    document.getElementById('s-receipt-card').style.display='block';
    document.getElementById('s-receipt').innerHTML=`
      <div class="efd-receipt" id="efd-content">
        <div style="text-align:center;border-bottom:1px dashed #333;padding-bottom:8px;margin-bottom:8px;">
          <div style="font-size:14px;font-weight:700;">${shop.name.toUpperCase()}</div>
          <div style="font-size:10px;color:#555;">MAHALI: ${shop.location}</div>
          ${shop.tin?`<div style="font-size:10px;color:#555;">TIN: ${shop.tin}</div>`:''}
          <div style="font-size:10px;color:#555;">TEL: ${shop.phone}</div>
          <div style="font-size:10px;font-weight:700;margin-top:4px;">STAKABADHI YA MAUZO</div>
        </div>
        <div class="r-row"><span>No:</span><span>${receiptNo}</span></div>
        <div class="r-row"><span>Tarehe:</span><span>${time}</span></div>
        <div class="r-row"><span>Mwuzaji:</span><span>${currentUser.name}</span></div>
        <div style="border-top:1px dashed #ccc;margin:5px 0;"></div>
        ${saleItems.map(i=>`<div class="r-row"><span>${i.name}</span><span></span></div><div class="r-row"><span>&nbsp;${i.qty} × TZS ${fmt(i.sell)}</span><span>TZS ${fmt(i.sub)}</span></div>`).join('')}
        <div style="border-top:1px dashed #ccc;margin:5px 0;"></div>
        <div class="r-row"><span>Jumla kabla VAT:</span><span>TZS ${fmt(total-vat)}</span></div>
        <div class="r-row"><span>VAT (18%):</span><span>TZS ${fmt(vat)}</span></div>
        <div class="r-total"><span>JUMLA KUU</span><span>TZS ${fmt(total)}</span></div>
        <div style="text-align:center;font-size:10px;color:#94a3b8;margin-top:6px;">Asante! · ${shop.name}</div>
        <div style="text-align:center;font-size:9px;color:#999;letter-spacing:1px;margin-top:4px;">── ${receiptNo} ── EDM v3.0 ──</div>
      </div>
      <div class="print-btns"><button class="btn-print" onclick="printReceipt()">🖨️ Print</button></div>`;
    cart={};document.getElementById('s-cart-card').style.display='none';renderSellList();
  }catch(e){
    alert('Hitilafu wakati wa kuuza: '+(e.message||'Jaribu tena.'));
  }
  btn.disabled=false;btn.innerHTML='✅ Thibitisha Mauzo';
}

function printReceipt(){
  const content=document.getElementById('efd-content');
  if(!content)return;
  document.getElementById('print-area').innerHTML=content.outerHTML;
  window.print();
}

function renderSReport(){
  const filtered=filterSales(sTF,'s').filter(m=>m.seller_id===currentUser.id);
  const rev=filtered.reduce((s,m)=>s+Number(m.total),0);
  document.getElementById('s-r-stats').innerHTML=`
    <div class="stat"><div class="stat-label">${t('revenue')}</div><div class="stat-value">TZS ${fmt(rev)}</div><div class="stat-sub">${filtered.length} ${t('txns')}</div></div>
    <div class="stat"><div class="stat-label">${t('txns')}</div><div class="stat-value">${filtered.length}</div></div>`;
  document.getElementById('s-r-list').innerHTML=[...filtered].reverse().map(m=>`
    <div class="report-row"><div><div class="sale-name">${m.receipt_no} · ${m.items.map(i=>i.name+(i.qty>1?' ×'+i.qty:'')).join(', ')}</div><div class="sale-meta">${new Date(m.created_at).toLocaleString('sw')}</div></div><div class="sale-amt">TZS ${fmt(m.total)}</div></div>`).join('')||`<div class="empty-d">${t('empty')}</div>`;
}

// ============================
// DOWNLOAD
// ============================
function dlPDF(){
  const filtered=filterSales(oTF,'o');
  if(!filtered.length){alert(t('empty'));return;}
  const{jsPDF}=window.jspdf;const doc=new jsPDF();
  const rev=filtered.reduce((s,m)=>s+Number(m.total),0);
  const cost=filtered.reduce((s,m)=>s+m.items.reduce((a,i)=>a+i.buy*i.qty,0),0);
  const prof=rev-cost;
  doc.setFontSize(14);doc.setFont(undefined,'bold');doc.text(shop.name,105,15,{align:'center'});
  doc.setFontSize(9);doc.setFont(undefined,'normal');doc.text(shop.location+(shop.phone?' | '+shop.phone:''),105,22,{align:'center'});
  doc.setFontSize(12);doc.setFont(undefined,'bold');doc.text('RIPOTI YA MAUZO',105,32,{align:'center'});
  doc.setFontSize(9);doc.setFont(undefined,'normal');doc.text('Tarehe: '+new Date().toLocaleDateString(),14,40);
  doc.line(14,43,196,43);
  doc.setFont(undefined,'bold');doc.text('Bidhaa',14,50);doc.text('Idadi',95,50);doc.text('Jumla',120,50);doc.text('Faida',165,50);
  doc.line(14,53,196,53);doc.setFont(undefined,'normal');let y=60;
  filtered.forEach(m=>{
    const c=m.items.reduce((a,i)=>a+i.buy*i.qty,0);const f=m.total-c;
    const names=m.items.map(i=>i.name+(i.qty>1?' ×'+i.qty:'')).join(', ').substring(0,42);
    doc.text(names,14,y);doc.text(String(m.items.reduce((a,i)=>a+i.qty,0)),95,y);
    doc.text('TZS '+fmt(m.total),120,y);doc.text('TZS '+fmt(f),165,y);
    y+=7;if(y>270){doc.addPage();y=20;}
  });
  doc.line(14,y,196,y);y+=8;doc.setFont(undefined,'bold');
  doc.text('Jumla ya Mapato: TZS '+fmt(rev),14,y);y+=7;
  doc.text('Gharama: TZS '+fmt(cost),14,y);y+=7;
  doc.text('Faida Halisi: TZS '+fmt(prof),14,y);y+=10;
  doc.setFont(undefined,'normal');doc.setFontSize(8);doc.text('Powered by EDM v3.0',105,y,{align:'center'});
  doc.save(shop.name.replace(/\s+/g,'_')+'_ripoti.pdf');
}
function dlExcel(){
  const filtered=filterSales(oTF,'o');
  if(!filtered.length){alert(t('empty'));return;}
  const rows=filtered.map(m=>{const c=m.items.reduce((a,i)=>a+i.buy*i.qty,0);return{
    'Receipt No':m.receipt_no,Bidhaa:m.items.map(i=>i.name+(i.qty>1?' ×'+i.qty:'')).join('; '),
    Idadi:m.items.reduce((a,i)=>a+i.qty,0),'Jumla (TZS)':m.total,'Gharama (TZS)':c,
    'Faida (TZS)':m.total-c,'VAT (TZS)':Math.round(m.total*0.18),Mwuzaji:m.seller_name||'',Wakati:new Date(m.created_at).toLocaleString('sw')};});
  const ws=XLSX.utils.json_to_sheet(rows);const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Mauzo');XLSX.writeFile(wb,shop.name.replace(/\s+/g,'_')+'_ripoti.xlsx');
}

// ============================
// START
// ============================
init();

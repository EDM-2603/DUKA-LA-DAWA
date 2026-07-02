// ============================
// SUPABASE CONFIG
// ============================
const SUPABASE_URL='https://jbwbqawztnhjppefqcoo.supabase.co';
const SUPABASE_KEY='sb_publishable_6n_uIo4d47pFoAQTX-47tA_Ee7fVSUr';
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

// ============================
// SHOP TYPES CONFIG
// ============================
const SHOP_TYPES={
  pharmacy:{icon:'💊',label:'Duka la Dawa',categories:['Painkillers','Antibiotics','Antimalarials','Vitamins','Antihypertensives','Other']},
  spare:{icon:'🔧',label:'Spare Parts',categories:['Mafuta/Oils','Betri/Batteries','Vichujio/Filters','Polishi/Polish','Injini/Engine','Umeme/Electrical','Mwili/Body','Nyingine']},
  grocery:{icon:'🛒',label:'Grocery',categories:['Vyakula/Food','Vinywaji/Drinks','Nafaka/Grains','Mboga/Vegetables','Matunda/Fruits','Nyingine']},
  electronics:{icon:'📱',label:'Electronics',categories:['Simu/Phones','Kompyuta/Computers','Accessories','TV & Audio','Charging','Nyingine']},
  clothing:{icon:'👗',label:'Mavazi',categories:['Nguo za Wanaume','Nguo za Wanawake','Watoto','Viatu/Shoes','Accessories','Nyingine']},
  general:{icon:'🏪',label:'Duka la Jumla',categories:['Bidhaa za Nyumbani','Vifaa','Vyakula','Vinywaji','Nyingine']}
};

// ============================
// HASH
// ============================
async function hashPw(pw){
  const enc=new TextEncoder().encode(pw);
  const buf=await crypto.subtle.digest('SHA-256',enc);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
function genOTP(){return Math.floor(100000+Math.random()*900000).toString();}

// ============================
// STATE
// ============================
let lang='sw',role=null,currentUser=null,loginRole='owner';
let shop={id:null,name:'',location:'',phone:'',tin:'',shop_type:'general'};
let accounts=[],items=[],sales=[];
let cart={},oAP='dash',sAP='sell',oTF='day',sTF='day';
let delId=null,delCtx='item',asId=null;
let rctr=1,resetEmail='',regData={shopType:'pharmacy'};

// ============================
// INIT
// ============================
async function init(){
  try{
    const{data:shops,error}=await sb.from('shop_settings').select('*').limit(1);
    if(error)throw error;
    document.getElementById('loading-screen').classList.add('hidden');
    if(shops&&shops.length){
      // Multi-tenant: go to landing, user picks login or register
      showScreen('landing');
    }else{
      showScreen('landing');
    }
  }catch(e){
    document.getElementById('loading-screen').classList.add('hidden');
    showScreen('landing');
  }
}

async function loadShopData(shopId){
  const[{data:acc},{data:dr},{data:sl}]=await Promise.all([
    sb.from('accounts').select('*').eq('shop_id',shopId),
    sb.from('drugs').select('*').eq('shop_id',shopId).order('name'),
    sb.from('sales').select('*').eq('shop_id',shopId).order('created_at',{ascending:true})
  ]);
  accounts=acc||[];
  items=dr||[];
  sales=(sl||[]).map(s=>({...s,items:typeof s.items==='string'?JSON.parse(s.items):s.items}));
  rctr=sales.length+1;
}

function setupRealtime(shopId){
  sb.channel('shop-'+shopId)
    .on('postgres_changes',{event:'*',schema:'public',table:'drugs',filter:`shop_id=eq.${shopId}`},async()=>{
      const{data}=await sb.from('drugs').select('*').eq('shop_id',shopId).order('name');
      items=data||[];
      if(role==='owner')renderOPage(oAP);else renderSPage(sAP);
    })
    .on('postgres_changes',{event:'*',schema:'public',table:'sales',filter:`shop_id=eq.${shopId}`},async()=>{
      const{data}=await sb.from('sales').select('*').eq('shop_id',shopId).order('created_at',{ascending:true});
      sales=(data||[]).map(s=>({...s,items:typeof s.items==='string'?JSON.parse(s.items):s.items}));
      if(role==='owner')renderOPage(oAP);else renderSPage(sAP);
    })
    .subscribe(status=>{
      const ok=status==='SUBSCRIBED';
      ['o-sync','s-sync'].forEach(id=>{
        const el=document.getElementById(id);
        if(el){el.className='sync-dot'+(ok?'':' off');}
      });
    });
}

// ============================
// SCREEN NAVIGATION
// ============================
const SCREENS=['loading-screen','landing','register-screen','login-screen','owner-app','seller-app'];
function showScreen(id){
  SCREENS.forEach(s=>document.getElementById(s)?.classList.add('hidden'));
  document.getElementById(id)?.classList.remove('hidden');
}

// ============================
// TRANSLATIONS
// ============================
const T={
  sw:{onav:['Muhtasari','Bidhaa','Ripoti','Mipangilio'],snav:['Uza','Ripoti'],
    stockval:'Thamani ya Stock',revenue:'Mapato',profit:'Faida Halisi',alerts:'Tahadhari',
    meds:'Bidhaa',txns:'Mauzo',ok:'Ipo',low:'Kidogo',out:'Imekwisha',
    empty:'Hakuna data.',nodrug:'Hakuna bidhaa.',tf:['Leo','Wiki','Mwezi','Mwaka','Mwenyewe']},
  en:{onav:['Dashboard','Stock','Reports','Settings'],snav:['Sell','Report'],
    stockval:'Stock Value',revenue:'Revenue',profit:'Net Profit',alerts:'Alerts',
    meds:'Items',txns:'Sales',ok:'In Stock',low:'Low',out:'Out of Stock',
    empty:'No data.',nodrug:'No items.',tf:['Today','Week','Month','Year','Custom']}
};
function t(k){return T[lang][k]||k;}
function fmt(n){return Number(n).toLocaleString();}
function stOf(d){
  if(d.quantity===0)return{cls:'bout',txt:t('out')};
  if(d.quantity<=d.min_quantity)return{cls:'blow',txt:t('low')};
  return{cls:'bok',txt:t('ok')};
}
function setLang(l){
  lang=l;
  ['ol-sw','sl-sw'].forEach(id=>{const e=document.getElementById(id);if(e)e.classList.toggle('active',l==='sw');});
  ['ol-en','sl-en'].forEach(id=>{const e=document.getElementById(id);if(e)e.classList.toggle('active',l==='en');});
  if(role==='owner'){applyNavO();renderOPage(oAP);}
  if(role==='seller'){applyNavS();renderSPage(sAP);}
}

// ============================
// HELPERS
// ============================
function showE(id,msg){const e=document.getElementById(id);if(e){e.textContent=msg;e.classList.remove('hidden');}}
function hideE(id){const e=document.getElementById(id);if(e)e.classList.add('hidden');}
function setBtn(id,loading,text){
  const b=document.getElementById(id);if(!b)return;
  b.disabled=loading;
  b.innerHTML=loading?'<span class="spinner" style="width:14px;height:14px;border-width:2px;"></span>':text;
}
function getShopIcon(){return SHOP_TYPES[shop.shop_type]?.icon||'🏪';}

// ============================
// REGISTER
// ============================
let regStep=1;
function selectType(type,icon,name){
  regData.shopType=type;
  document.querySelectorAll('.type-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('type-'+type)?.classList.add('active');
}

function regNext(step){
  hideE('reg-err');
  if(step===2){
    const name=document.getElementById('r1-name').value.trim();
    const loc=document.getElementById('r1-loc').value.trim();
    const phone=document.getElementById('r1-phone').value.trim();
    if(!name||!loc||!phone){showE('reg-err','Jaza sehemu zote zilizo na *');return;}
    regData.shop={name,location:loc,phone,tin:document.getElementById('r1-tin').value.trim(),shop_type:regData.shopType};
  }
  if(step===3){
    const oname=document.getElementById('r2-name').value.trim();
    const ouser=document.getElementById('r2-user').value.trim().toLowerCase();
    const oemail=document.getElementById('r2-email').value.trim().toLowerCase();
    const opw=document.getElementById('r2-pw').value;
    const opw2=document.getElementById('r2-pw2').value;
    const sname=document.getElementById('r2-sname').value.trim();
    const suser=document.getElementById('r2-suser').value.trim().toLowerCase();
    const spw=document.getElementById('r2-spw').value;
    const spw2=document.getElementById('r2-spw2').value;
    if(!oname||!ouser||!oemail||!opw||!sname||!suser||!spw){showE('reg-err','Jaza sehemu zote zilizo na *');return;}
    if(opw!==opw2){showE('reg-err','Nenosiri la mmiliki halifanani!');return;}
    if(spw!==spw2){showE('reg-err','Nenosiri la mwuzaji halifanani!');return;}
    if(ouser===suser){showE('reg-err','Username lazima ziwe tofauti');return;}
    if(!oemail.includes('@')){showE('reg-err','Email si sahihi');return;}
    regData.owner={name:oname,username:ouser,email:oemail,password:opw};
    regData.seller={name:sname,username:suser,password:spw};
    // Show summary
    const icon=SHOP_TYPES[regData.shopType]?.icon||'🏪';
    document.getElementById('reg-summary').innerHTML=`
      <div style="margin-bottom:6px;">${icon} <strong>${regData.shop.name}</strong> — ${regData.shop.location}</div>
      <div style="margin-bottom:4px;">👑 Mmiliki: ${oname} (@${ouser})</div>
      <div>🛒 Mwuzaji: ${sname} (@${suser})</div>`;
  }
  regStep=step;
  [1,2,3].forEach(i=>{
    document.getElementById('reg-step'+i).classList.toggle('hidden',i!==step);
    const el=document.getElementById('rst'+(i-1));
    if(el)el.className='step'+(i<step?' done':i===step?' active':'');
  });
  document.getElementById('reg-sub').textContent=`Hatua ${step} ya 3`;
}

async function registerShop(){
  setBtn('reg-finish-btn',true,'');hideE('reg-err');
  try{
    // Create shop
    const{data:shopRow,error:shopErr}=await sb.from('shop_settings').insert(regData.shop).select().single();
    if(shopErr)throw shopErr;
    const sid=shopRow.id;
    // Create accounts
    const oh=await hashPw(regData.owner.password);
    const sh=await hashPw(regData.seller.password);
    const{error:accErr}=await sb.from('accounts').insert([
      {shop_id:sid,name:regData.owner.name,username:regData.owner.username,email:regData.owner.email,password_hash:oh,role:'owner'},
      {shop_id:sid,name:regData.seller.name,username:regData.seller.username,password_hash:sh,role:'seller'}
    ]);
    if(accErr)throw accErr;
    // Starter items based on shop type
    const cats=SHOP_TYPES[regData.shopType]?.categories||[];
    if(cats.length){
      await sb.from('drugs').insert([
        {shop_id:sid,name:'Bidhaa ya Kwanza (Mfano)',category:cats[0],buy_price:1000,sell_price:2000,quantity:10,min_quantity:3,unit:'PC'}
      ]);
    }
    alert(`✅ Duka "${regData.shop.name}" limesajiliwa! Ingia sasa.`);
    showScreen('login-screen');
    document.getElementById('ln-shop').textContent=regData.shop.name;
  }catch(e){
    showE('reg-err','Hitilafu: '+(e.message||'Jaribu tena.'));
  }
  setBtn('reg-finish-btn',false,'✅ Maliza Usajili');
}

// ============================
// LOGIN
// ============================
function switchRole(r){
  loginRole=r;
  document.getElementById('tab-o').style.cssText='flex:1;padding:9px;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:500;'+(r==='owner'?'background:#fff;color:#0f4c81;box-shadow:0 1px 4px rgba(0,0,0,.12);':'background:transparent;color:#64748b;');
  document.getElementById('tab-s').style.cssText='flex:1;padding:9px;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:500;'+(r==='seller'?'background:#fff;color:#0f4c81;box-shadow:0 1px 4px rgba(0,0,0,.12);':'background:transparent;color:#64748b;');
}

async function doLogin(){
  hideE('login-err');
  const u=document.getElementById('li-user').value.trim().toLowerCase();
  const p=document.getElementById('li-pw').value;
  if(!u||!p){showE('login-err','Jaza username na nenosiri');return;}
  setBtn('login-btn',true,'');
  try{
    const hash=await hashPw(p);
    // Find account across ALL shops for this username+role
    const{data:accs,error}=await sb.from('accounts').select('*').eq('username',u).eq('role',loginRole);
    if(error)throw error;
    const acc=accs?.find(a=>a.password_hash===hash);
    if(!acc){showE('login-err','Jina au nenosiri si sahihi!');setBtn('login-btn',false,'Ingia');return;}
    // Load this account's shop
    const{data:shopData}=await sb.from('shop_settings').select('*').eq('id',acc.shop_id).single();
    if(!shopData){showE('login-err','Duka halipatikani');setBtn('login-btn',false,'Ingia');return;}
    shop=shopData;currentUser=acc;role=acc.role;
    await loadShopData(acc.shop_id);
    setupRealtime(acc.shop_id);
    const icon=getShopIcon();
    if(role==='owner'){
      showScreen('owner-app');
      document.getElementById('o-dn').textContent=shop.name;
      document.getElementById('o-shop-icon').textContent=icon;
      applyNavO();renderOPage('dash');
    }else{
      showScreen('seller-app');
      document.getElementById('s-dn').textContent=shop.name;
      document.getElementById('s-shop-icon').textContent=icon;
      document.getElementById('s-seller-name').textContent=acc.name;
      applyNavS();renderSPage('sell');
    }
  }catch(e){showE('login-err','Hitilafu: '+e.message);}
  setBtn('login-btn',false,'Ingia');
}

function logout(){
  role=null;cart={};currentUser=null;shop={};items=[];sales=[];accounts=[];
  showScreen('landing');
}

// ============================
// FORGOT PASSWORD
// ============================
function showForgot(){
  ['login-form-area','otp-area','newpw-area'].forEach(id=>hideEl(id));
  showEl('forgot-area');hideE('forgot-err');
}
function showLoginForm(){
  ['forgot-area','otp-area','newpw-area'].forEach(id=>hideEl(id));
  showEl('login-form-area');
}
function hideEl(id){document.getElementById(id)?.classList.add('hidden');}
function showEl(id){document.getElementById(id)?.classList.remove('hidden');}

async function sendOTP(){
  hideE('forgot-err');
  const email=document.getElementById('forgot-email').value.trim().toLowerCase();
  if(!email||!email.includes('@')){showE('forgot-err','Ingiza email sahihi');return;}
  setBtn('otp-send-btn',true,'');
  try{
    const{data:ownerAcc}=await sb.from('accounts').select('*').eq('email',email).eq('role','owner');
    if(!ownerAcc||!ownerAcc.length){showE('forgot-err','Email haipatikani.');setBtn('otp-send-btn',false,'📧 Tuma OTP');return;}
    const acc=ownerAcc[0];
    const otp=genOTP();
    const expires=new Date(Date.now()+10*60*1000).toISOString();
    await sb.from('accounts').update({reset_otp:otp,otp_expires_at:expires}).eq('id',acc.id);
    resetEmail=email;
    hideEl('forgot-area');showEl('otp-area');
    document.getElementById('otp-to').textContent=email;
    // Show OTP hint (useful since Edge Function may not be set up)
    const hint=document.getElementById('otp-hint');
    if(hint){hint.textContent=`OTP yako: ${otp} (dakika 10)`;hint.style.display='block';}
  }catch(e){showE('forgot-err','Hitilafu: '+e.message);}
  setBtn('otp-send-btn',false,'📧 Tuma OTP');
}

async function verifyOTP(){
  hideE('otp-err');
  const entered=document.getElementById('otp-input').value.trim();
  if(!entered||entered.length!==6){showE('otp-err','Ingiza OTP ya tarakimu 6');return;}
  setBtn('otp-verify-btn',true,'');
  try{
    const{data:acc}=await sb.from('accounts').select('reset_otp,otp_expires_at,id').eq('email',resetEmail).eq('role','owner').single();
    if(!acc||acc.reset_otp!==entered){showE('otp-err','OTP si sahihi.');setBtn('otp-verify-btn',false,'✅ Thibitisha');return;}
    if(acc.otp_expires_at&&new Date(acc.otp_expires_at)<new Date()){showE('otp-err','OTP imekwisha muda. Tuma tena.');setBtn('otp-verify-btn',false,'✅ Thibitisha');return;}
    hideEl('otp-area');showEl('newpw-area');
  }catch(e){showE('otp-err','Hitilafu: '+e.message);}
  setBtn('otp-verify-btn',false,'✅ Thibitisha');
}

async function resetPassword(){
  hideE('newpw-err');
  const pw=document.getElementById('new-pw').value;
  const pw2=document.getElementById('new-pw2').value;
  if(!pw||pw.length<6){showE('newpw-err','Nenosiri lazima liwe herufi 6+');return;}
  if(pw!==pw2){showE('newpw-err','Nenosiri halifanani');return;}
  setBtn('newpw-btn',true,'');
  try{
    const hash=await hashPw(pw);
    await sb.from('accounts').update({password_hash:hash,reset_otp:null,otp_expires_at:null}).eq('email',resetEmail).eq('role','owner');
    alert('✅ Nenosiri limebadilishwa! Ingia sasa.');
    showLoginForm();
  }catch(e){showE('newpw-err','Hitilafu: '+e.message);}
  setBtn('newpw-btn',false,'🔑 Badilisha Nenosiri');
}

// ============================
// NAV
// ============================
function applyNavO(){
  const nl=t('onav');for(let i=0;i<4;i++){const e=document.getElementById('on'+i);if(e)e.textContent=nl[i];}
  renderTF('o-tf','o',oTF);
  // Populate categories for add item form
  const cats=SHOP_TYPES[shop.shop_type]?.categories||['General'];
  const sel=document.getElementById('oi-cat');
  if(sel)sel.innerHTML=cats.map(c=>`<option value="${c}">${c}</option>`).join('');
}
function applyNavS(){
  const nl=t('snav');for(let i=0;i<2;i++){const e=document.getElementById('sn'+i);if(e)e.textContent=nl[i];}
  renderTF('s-tf','s',sTF);
}
function renderTF(elId,prefix,active){
  const tfs=t('tf');const vals=['day','week','month','year','custom'];
  document.getElementById(elId).innerHTML=tfs.map((l,i)=>`<button class="tfb${active===vals[i]?' active':''}" onclick="setTF('${prefix}','${vals[i]}')">${l}</button>`).join('');
}
function setTF(p,v){
  if(p==='o'){oTF=v;renderTF('o-tf','o',v);document.getElementById('o-cr').classList.toggle('hidden',v!=='custom');if(v!=='custom')renderOReport();}
  else{sTF=v;renderTF('s-tf','s',v);document.getElementById('s-cr').classList.toggle('hidden',v!=='custom');if(v!=='custom')renderSReport();}
}
function getRange(f,p){
  const now=new Date();let from=new Date(),to=new Date();to.setHours(23,59,59,999);
  if(f==='day')from.setHours(0,0,0,0);
  else if(f==='week'){from.setDate(now.getDate()-now.getDay());from.setHours(0,0,0,0);}
  else if(f==='month')from=new Date(now.getFullYear(),now.getMonth(),1);
  else if(f==='year')from=new Date(now.getFullYear(),0,1);
  else if(f==='custom'){
    const fv=document.getElementById(p+'-df')?.value;const tv=document.getElementById(p+'-dt')?.value;
    if(fv)from=new Date(fv+'T00:00:00');if(tv)to=new Date(tv+'T23:59:59');
  }
  return{from,to};
}
function filterSales(f,p){const{from,to}=getRange(f,p);return sales.filter(s=>new Date(s.created_at)>=from&&new Date(s.created_at)<=to);}

function oP(id,idx){
  document.querySelectorAll('#owner-app .page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('#o-nav .bnav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('op-'+id)?.classList.add('active');
  document.querySelectorAll('#o-nav .bnav-btn')[idx]?.classList.add('active');
  oAP=id;applyNavO();renderOPage(id);
}
function renderOPage(id){
  if(id==='dash')renderODash();if(id==='stock')renderOStock();
  if(id==='report')renderOReport();if(id==='settings')renderOSettings();
}
function sP(id,idx){
  document.querySelectorAll('#seller-app .page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('#s-nav .bnav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('sp-'+id)?.classList.add('active');
  document.querySelectorAll('#s-nav .bnav-btn')[idx]?.classList.add('active');
  sAP=id;applyNavS();renderSPage(id);
}
function renderSPage(id){if(id==='sell')renderSellPage();if(id==='sreport')renderSReport();}

// ============================
// OWNER DASHBOARD
// ============================
function renderODash(){
  const sv=items.reduce((s,d)=>s+d.quantity*d.buy_price,0);
  const rev=sales.reduce((s,m)=>s+Number(m.total),0);
  const cost=sales.reduce((s,m)=>s+m.items.reduce((a,i)=>a+(i.buy||0)*i.qty,0),0);
  const prof=rev-cost;
  const lc=items.filter(d=>d.quantity>0&&d.quantity<=d.min_quantity).length;
  const oc=items.filter(d=>d.quantity===0).length;
  document.getElementById('o-stats').innerHTML=`
    <div class="stat"><div class="sl">${t('stockval')}</div><div class="sv">TZS ${fmt(sv)}</div><div class="ss">${items.length} ${t('meds')}</div></div>
    <div class="stat"><div class="sl">${t('revenue')}</div><div class="sv">TZS ${fmt(rev)}</div><div class="ss">${sales.length} ${t('txns')}</div></div>
    <div class="stat"><div class="sl">${t('profit')}</div><div class="sv ${prof>=0?'pp':'pn'}">TZS ${fmt(prof)}</div></div>
    <div class="stat"><div class="sl">${t('alerts')}</div><div class="sv">${lc+oc}</div><div class="ss">${oc} ${t('out')}, ${lc} ${t('low')}</div></div>`;
  document.getElementById('o-alerts').innerHTML=items.filter(d=>d.quantity<=d.min_quantity).map(d=>`
    <div class="alrt ${d.quantity===0?'ad':'aw'}">⚠ <span><strong>${d.name}</strong> — ${d.quantity===0?t('out'):`Iliyobaki: ${d.quantity} (min ${d.min_quantity})`}</span></div>`).join('');
  const recent=[...sales].reverse().slice(0,5);
  document.getElementById('o-recent').innerHTML=recent.length?recent.map(m=>`
    <div class="sr"><div><div class="sn">${m.items.map(i=>i.name+(i.qty>1?' ×'+i.qty:'')).join(', ')}</div><div class="sm">${m.seller_name||''} · ${m.receipt_no} · ${new Date(m.created_at).toLocaleString('sw')}</div></div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;"><div class="sa">TZS ${fmt(m.total)}</div><button onclick="previewReceipt('${m.id}')" style="padding:3px 8px;border:none;background:rgba(255,255,255,.2);color:#fff;border-radius:6px;cursor:pointer;font-size:10px;">👁 Preview</button></div></div>`).join(''):`<div class="ed">${t('empty')}</div>`;
}

// ============================
// OWNER STOCK
// ============================
function renderOStock(){
  const q=(document.getElementById('o-search')?.value||'').toLowerCase();
  const filtered=items.filter(d=>d.name.toLowerCase().includes(q)||(d.category||'').toLowerCase().includes(q)||(d.barcode||'').includes(q));
  document.getElementById('o-stock-list').innerHTML=filtered.length?filtered.map(d=>{
    const s=stOf(d);
    return`<div class="dr">
      <div style="flex:1;min-width:0;"><div class="dn">${d.name}</div><div class="dm">${d.category||''} · ${d.unit||'PC'} · Uza: TZS ${fmt(d.sell_price)} · Nunua: TZS ${fmt(d.buy_price)}</div></div>
      <div class="dr-right"><span class="badge ${s.cls}">${s.txt}</span><span style="font-size:11px;color:#94a3b8;">${d.quantity} ${d.unit||'PC'}</span>
        <div style="display:flex;gap:4px;"><button class="btn-sm badd" onclick="openAddStockModal('${d.id}')">+ Stock</button><button class="btn-sm bdel" onclick="openDelModal('${d.id}','item')">🗑</button></div>
      </div></div>`;}).join(''):`<div class="ew">${t('empty')}</div>`;
}

async function addItem(){
  const name=document.getElementById('oi-name').value.trim();
  if(!name){alert('Ingiza jina la bidhaa');return;}
  const item={
    shop_id:shop.id,name,
    barcode:document.getElementById('oi-barcode').value.trim()||null,
    category:document.getElementById('oi-cat').value,
    buy_price:parseInt(document.getElementById('oi-buy').value)||0,
    sell_price:parseInt(document.getElementById('oi-sell').value)||0,
    quantity:parseInt(document.getElementById('oi-qty').value)||0,
    min_quantity:parseInt(document.getElementById('oi-min').value)||5,
    unit:document.getElementById('oi-unit').value
  };
  const{error}=await sb.from('drugs').insert(item);
  if(error){alert('Hitilafu: '+error.message);return;}
  ['oi-name','oi-barcode','oi-buy','oi-sell','oi-qty','oi-min'].forEach(id=>document.getElementById(id).value='');
  const{data}=await sb.from('drugs').select('*').eq('shop_id',shop.id).order('name');
  items=data||[];renderOStock();
}

// ============================
// MODALS
// ============================
let modalAddStockId=null;
function openDelModal(id,ctx){
  delId=id;delCtx=ctx;
  const d=ctx==='item'?items.find(x=>x.id===id):accounts.find(x=>x.id===id);
  document.getElementById('del-msg').textContent='Una uhakika wa kufuta "'+(d?.name||'')+'"?';
  openModal('del-modal');
}
function openAddStockModal(id){modalAddStockId=id;document.getElementById('as-qty').value='';openModal('add-stock-modal');}
function openModal(id){document.getElementById(id)?.classList.add('open');}
function closeModal(id){document.getElementById(id)?.classList.remove('open');}

async function confirmDel(){
  const table=delCtx==='item'?'drugs':'accounts';
  const{error}=await sb.from(table).delete().eq('id',delId);
  if(error){alert('Hitilafu: '+error.message);return;}
  if(delCtx==='item'){items=items.filter(d=>d.id!==delId);renderOStock();}
  else{accounts=accounts.filter(a=>a.id!==delId);renderOSettings();}
  closeModal('del-modal');
}
async function confirmAddStock(){
  const n=parseInt(document.getElementById('as-qty').value);
  if(isNaN(n)||n<=0)return;
  const d=items.find(x=>x.id===modalAddStockId);if(!d)return;
  await sb.from('drugs').update({quantity:d.quantity+n}).eq('id',modalAddStockId);
  d.quantity+=n;closeModal('add-stock-modal');renderOStock();
}
async function confirmAddSeller(){
  const name=document.getElementById('aa-name').value.trim();
  const user=document.getElementById('aa-user').value.trim().toLowerCase();
  const pw=document.getElementById('aa-pw').value;
  if(!name||!user||!pw){alert('Jaza sehemu zote');return;}
  if(accounts.find(a=>a.username===user)){alert('Username tayari ipo');return;}
  const hash=await hashPw(pw);
  const{error}=await sb.from('accounts').insert({shop_id:shop.id,name,username:user,password_hash:hash,role:'seller'});
  if(error){alert('Hitilafu: '+error.message);return;}
  const{data}=await sb.from('accounts').select('*').eq('shop_id',shop.id);
  accounts=data||[];closeModal('add-seller-modal');renderOSettings();
}

// ============================
// OWNER REPORT
// ============================
function renderOReport(){
  const filtered=filterSales(oTF,'o');
  const rev=filtered.reduce((s,m)=>s+Number(m.total),0);
  const cost=filtered.reduce((s,m)=>s+m.items.reduce((a,i)=>a+(i.buy||0)*i.qty,0),0);
  const prof=rev-cost;
  document.getElementById('o-r-stats').innerHTML=`
    <div class="stat"><div class="sl">${t('revenue')}</div><div class="sv">TZS ${fmt(rev)}</div><div class="ss">${filtered.length} ${t('txns')}</div></div>
    <div class="stat"><div class="sl">${t('profit')}</div><div class="sv ${prof>=0?'pp':'pn'}">TZS ${fmt(prof)}</div></div>
    <div class="stat"><div class="sl">${t('stockval')}</div><div class="sv">TZS ${fmt(items.reduce((s,d)=>s+d.quantity*d.buy_price,0))}</div></div>
    <div class="stat"><div class="sl">Gharama</div><div class="sv">TZS ${fmt(cost)}</div></div>`;
  document.getElementById('o-r-list').innerHTML=[...filtered].reverse().map(m=>{
    const c=m.items.reduce((a,i)=>a+(i.buy||0)*i.qty,0);const f=m.total-c;
    return`<div class="rr">
      <div><div class="sn">${m.receipt_no} · ${m.items.map(i=>i.name+(i.qty>1?' ×'+i.qty:'')).join(', ')}</div><div class="sm">${m.seller_name||''} · ${new Date(m.created_at).toLocaleString('sw')}</div></div>
      <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
        <div class="sa">TZS ${fmt(m.total)}</div>
        <div style="font-size:11px;" class="${f>=0?'pp':'pn'}">Faida: TZS ${fmt(f)}</div>
        <button onclick="previewReceipt('${m.id}')" style="padding:3px 8px;border:none;background:rgba(255,255,255,.15);color:#fff;border-radius:6px;cursor:pointer;font-size:10px;">👁 Preview & Reprint</button>
      </div></div>`;
  }).join('')||`<div class="ed">${t('empty')}</div>`;
}

// ============================
// OWNER SETTINGS
// ============================
function renderOSettings(){
  document.getElementById('os-name').value=shop.name;
  document.getElementById('os-loc').value=shop.location||'';
  document.getElementById('os-phone').value=shop.phone||'';
  document.getElementById('os-tin').value=shop.tin||'';
  const sellers=accounts.filter(a=>a.role==='seller');
  document.getElementById('sellers-list').innerHTML=sellers.map(a=>`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f1f5f9;">
      <div><div style="font-size:13px;font-weight:500;color:#1a2e44;">${a.name}</div><div style="font-size:11px;color:#94a3b8;">@${a.username}</div></div>
      <button class="btn-sm bdel" onclick="openDelModal('${a.id}','account')">Futa</button>
    </div>`).join('')||'<div class="ew">Hakuna wauzaji wengine.</div>';
}
async function saveShop(){
  const update={name:document.getElementById('os-name').value.trim()||shop.name,
    location:document.getElementById('os-loc').value.trim(),
    phone:document.getElementById('os-phone').value.trim(),
    tin:document.getElementById('os-tin').value.trim()};
  const{error}=await sb.from('shop_settings').update(update).eq('id',shop.id);
  if(error){alert('Hitilafu: '+error.message);return;}
  Object.assign(shop,update);document.getElementById('o-dn').textContent=shop.name;alert('Imehifadhiwa!');
}

// ============================
// SELLER — SELL
// ============================
function renderSellPage(){
  document.getElementById('s-cart-card').style.display='none';
  document.getElementById('s-receipt-card').style.display='none';
  renderSellList();
}
function renderSellList(){
  const q=(document.getElementById('s-search')?.value||'').toLowerCase();
  const avail=items.filter(d=>d.quantity>0&&(d.name.toLowerCase().includes(q)||(d.category||'').toLowerCase().includes(q)));
  document.getElementById('s-sell-list').innerHTML=avail.length?avail.map(d=>`
    <div class="sit${cart[d.id]?' sel':''}" onclick="toggleCart('${d.id}')">
      <div class="sc"><div class="sci"></div></div>
      <div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:500;color:#1a2e44;">${d.name}</div><div style="font-size:11px;color:#94a3b8;">${d.category||''} · ${d.unit||'PC'}</div></div>
      <div style="text-align:right;"><div style="font-size:13px;font-weight:600;color:#0f4c81;">TZS ${fmt(d.sell_price)}</div><div style="font-size:10px;color:#94a3b8;">Ipo: ${d.quantity}</div></div>
    </div>`).join(''):`<div class="ew">${t('nodrug')}</div>`;
}
function toggleCart(id){
  if(cart[id]){delete cart[id];}
  else{const d=items.find(x=>x.id===id);if(d)cart[id]={item:d,qty:1};}
  renderSellList();updateCart();
}
function updateCart(){
  const its=Object.values(cart);
  const card=document.getElementById('s-cart-card');
  if(!its.length){card.style.display='none';return;}
  card.style.display='block';let total=0;
  document.getElementById('s-cart-list').innerHTML=its.map(({item,qty})=>{
    const sub=item.sell_price*qty;total+=sub;
    return`<div class="ci">
      <div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:500;color:#1a2e44;">${item.name}</div><div style="font-size:11px;color:#94a3b8;">TZS ${fmt(item.sell_price)} × ${qty} ${item.unit||'PC'}</div></div>
      <div style="display:flex;align-items:center;gap:6px;"><button class="qb" onclick="cartQty('${item.id}',-1)">−</button><div class="qn">${qty}</div><button class="qb" onclick="cartQty('${item.id}',1)">+</button></div>
      <div style="font-size:12px;color:#64748b;text-align:right;min-width:70px;">TZS ${fmt(sub)}</div></div>`;}).join('');
  document.getElementById('s-cart-total').textContent='TZS '+fmt(total);
}
function cartQty(id,delta){
  if(!cart[id])return;const d=cart[id].item;
  cart[id].qty=Math.max(1,Math.min(d.quantity,cart[id].qty+delta));updateCart();
}

// ============================
// RECEIPT BUILDER
// ============================
function buildReceiptHTML(saleData){
  const{receipt_no,seller_name,items:sItems,total,created_at}=saleData;
  const vat=Math.round(total*0.18);
  const time=new Date(created_at||Date.now()).toLocaleString('sw',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const icon=getShopIcon();
  return`<div class="rbox" id="efd-content">
    <div style="text-align:center;border-bottom:1px dashed #333;padding-bottom:8px;margin-bottom:8px;">
      <div style="font-size:20px;margin-bottom:4px;">${icon}</div>
      <div style="font-size:13px;font-weight:700;">${shop.name.toUpperCase()}</div>
      <div style="font-size:10px;color:#555;">MAHALI: ${shop.location||''}</div>
      ${shop.tin?`<div style="font-size:10px;color:#555;">TIN: ${shop.tin}</div>`:''}
      <div style="font-size:10px;color:#555;">TEL: ${shop.phone||''}</div>
      <div style="font-size:10px;font-weight:700;margin-top:4px;">STAKABADHI YA MAUZO</div>
    </div>
    <div class="rrow"><span>No:</span><span>${receipt_no}</span></div>
    <div class="rrow"><span>Tarehe:</span><span>${time}</span></div>
    <div class="rrow"><span>Mwuzaji:</span><span>${seller_name||''}</span></div>
    <div style="border-top:1px dashed #ccc;margin:5px 0;"></div>
    ${sItems.map(i=>`<div class="rrow"><span>${i.name}</span><span></span></div><div class="rrow"><span>&nbsp;${i.qty} × TZS ${fmt(i.sell)}</span><span>TZS ${fmt(i.sub)}</span></div>`).join('')}
    <div style="border-top:1px dashed #ccc;margin:5px 0;"></div>
    <div class="rrow"><span>Jumla kabla VAT:</span><span>TZS ${fmt(total-vat)}</span></div>
    <div class="rrow"><span>VAT (18%):</span><span>TZS ${fmt(vat)}</span></div>
    <div class="rtot"><span>JUMLA KUU</span><span>TZS ${fmt(total)}</span></div>
    <div style="text-align:center;font-size:10px;color:#94a3b8;margin-top:6px;">Asante! · ${shop.name}</div>
    <div style="text-align:center;font-size:9px;color:#999;letter-spacing:1px;margin-top:3px;">── ${receipt_no} ── EDM POS v3.0 ──</div>
  </div>
  <div class="pbtns"><button class="pb1" onclick="printReceipt()">🖨️ Print / Reprint</button></div>`;
}

function printReceipt(){
  const content=document.getElementById('efd-content');
  if(!content)return;
  document.getElementById('print-area').innerHTML=content.outerHTML;
  window.print();
}

// Preview any past receipt by ID (owner & seller)
function previewReceipt(saleId){
  const sale=sales.find(s=>s.id===saleId);
  if(!sale){alert('Risiti haipatikani');return;}
  // Show in a modal overlay
  let overlay=document.getElementById('receipt-preview-overlay');
  if(!overlay){
    overlay=document.createElement('div');
    overlay.id='receipt-preview-overlay';
    overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:400;display:flex;align-items:center;justify-content:center;padding:16px;';
    overlay.onclick=e=>{if(e.target===overlay)overlay.remove();};
    document.body.appendChild(overlay);
  }
  overlay.innerHTML=`
    <div style="background:#fff;border-radius:16px;padding:20px;width:100%;max-width:340px;max-height:90vh;overflow-y:auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div style="font-size:14px;font-weight:700;color:#1a2e44;">🧾 Preview Risiti</div>
        <button onclick="document.getElementById('receipt-preview-overlay').remove()" style="border:none;background:none;font-size:20px;cursor:pointer;color:#64748b;">✕</button>
      </div>
      ${buildReceiptHTML(sale)}
    </div>`;
  overlay.style.display='flex';
}

async function confirmSale(){
  const its=Object.values(cart);
  if(!its.length){alert('Chagua bidhaa kwanza');return;}
  for(const{item,qty}of its){if(qty>item.quantity){alert(`Huna ${qty} ya ${item.name}. Ipo ${item.quantity} tu.`);return;}}
  setBtn('s-confirm-btn',true,'');
  const saleItems=its.map(({item,qty})=>({id:item.id,name:item.name,qty,sell:Number(item.sell_price),buy:Number(item.buy_price),sub:item.sell_price*qty,unit:item.unit||'PC'}));
  const total=saleItems.reduce((s,i)=>s+i.sub,0);
  const receiptNo='RCP-'+String(rctr).padStart(6,'0');
  const now=new Date();
  try{
    const{data:saleRow,error:saleErr}=await sb.from('sales').insert({
      shop_id:shop.id,receipt_no:receiptNo,seller_id:currentUser.id,
      seller_name:currentUser.name,total,items:saleItems
    }).select().single();
    if(saleErr)throw saleErr;
    for(const i of saleItems){
      const d=items.find(x=>x.id===i.id);
      await sb.from('drugs').update({quantity:d.quantity-i.qty}).eq('id',i.id);
      d.quantity-=i.qty;
    }
    rctr++;
    // Add to local sales with created_at
    const newSale={...saleRow,items:saleItems,created_at:saleRow.created_at||now.toISOString()};
    sales.push(newSale);
    document.getElementById('s-receipt-card').style.display='block';
    document.getElementById('s-receipt').innerHTML=buildReceiptHTML(newSale);
    cart={};document.getElementById('s-cart-card').style.display='none';renderSellList();
  }catch(e){alert('Hitilafu: '+(e.message||'Jaribu tena.'));}
  setBtn('s-confirm-btn',false,'✅ Thibitisha Mauzo');
}

// ============================
// SELLER REPORT (with preview)
// ============================
function renderSReport(){
  const filtered=filterSales(sTF,'s').filter(m=>m.seller_id===currentUser.id);
  const rev=filtered.reduce((s,m)=>s+Number(m.total),0);
  document.getElementById('s-r-stats').innerHTML=`
    <div class="stat"><div class="sl">${t('revenue')}</div><div class="sv">TZS ${fmt(rev)}</div><div class="ss">${filtered.length} ${t('txns')}</div></div>
    <div class="stat"><div class="sl">${t('txns')}</div><div class="sv">${filtered.length}</div></div>`;
  document.getElementById('s-r-list').innerHTML=[...filtered].reverse().map(m=>`
    <div class="rr">
      <div><div class="sn">${m.receipt_no}</div><div class="sm">${m.items.map(i=>i.name+(i.qty>1?' ×'+i.qty:'')).join(', ')}</div><div class="sm">${new Date(m.created_at).toLocaleString('sw')}</div></div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
        <div class="sa">TZS ${fmt(m.total)}</div>
        <button onclick="previewReceipt('${m.id}')" style="padding:3px 8px;border:none;background:rgba(255,255,255,.15);color:#fff;border-radius:6px;cursor:pointer;font-size:10px;">👁 Preview & Reprint</button>
      </div>
    </div>`).join('')||`<div class="ed">${t('empty')}</div>`;
}

// ============================
// DOWNLOAD
// ============================
function dlPDF(){
  const filtered=filterSales(oTF,'o');
  if(!filtered.length){alert(t('empty'));return;}
  const{jsPDF}=window.jspdf;const doc=new jsPDF();
  const rev=filtered.reduce((s,m)=>s+Number(m.total),0);
  const cost=filtered.reduce((s,m)=>s+m.items.reduce((a,i)=>a+(i.buy||0)*i.qty,0),0);
  const icon=getShopIcon();
  doc.setFontSize(14);doc.setFont(undefined,'bold');doc.text(icon+' '+shop.name,105,15,{align:'center'});
  doc.setFontSize(9);doc.setFont(undefined,'normal');doc.text((shop.location||'')+(shop.phone?' | '+shop.phone:''),105,22,{align:'center'});
  if(shop.tin)doc.text('TIN: '+shop.tin,105,27,{align:'center'});
  doc.setFontSize(12);doc.setFont(undefined,'bold');doc.text('RIPOTI YA MAUZO',105,34,{align:'center'});
  doc.setFontSize(9);doc.setFont(undefined,'normal');doc.text('Tarehe: '+new Date().toLocaleDateString(),14,42);
  doc.line(14,45,196,45);
  doc.setFont(undefined,'bold');doc.text('Bidhaa',14,52);doc.text('No.',90,52);doc.text('Jumla',115,52);doc.text('Faida',160,52);
  doc.line(14,55,196,55);doc.setFont(undefined,'normal');let y=62;
  filtered.forEach(m=>{
    const c=m.items.reduce((a,i)=>a+(i.buy||0)*i.qty,0);
    doc.text(m.items.map(i=>i.name).join(', ').substring(0,38),14,y);
    doc.text(m.receipt_no,90,y);
    doc.text('TZS '+fmt(m.total),115,y);doc.text('TZS '+fmt(m.total-c),160,y);
    y+=7;if(y>270){doc.addPage();y=20;}
  });
  doc.line(14,y,196,y);y+=8;doc.setFont(undefined,'bold');
  doc.text('Jumla: TZS '+fmt(rev),14,y);y+=7;
  doc.text('Faida: TZS '+fmt(rev-cost),14,y);y+=8;
  doc.setFontSize(8);doc.setFont(undefined,'normal');doc.text('Powered by EDM POS v3.0',105,y,{align:'center'});
  doc.save(shop.name.replace(/\s+/g,'_')+'_ripoti.pdf');
}

function dlExcel(){
  const filtered=filterSales(oTF,'o');
  if(!filtered.length){alert(t('empty'));return;}
  const rows=filtered.map(m=>{const c=m.items.reduce((a,i)=>a+(i.buy||0)*i.qty,0);return{
    'Receipt No':m.receipt_no,
    Bidhaa:m.items.map(i=>i.name+(i.qty>1?' ×'+i.qty:'')).join('; '),
    Idadi:m.items.reduce((a,i)=>a+i.qty,0),
    'Jumla (TZS)':m.total,'Gharama (TZS)':c,
    'Faida (TZS)':m.total-c,'VAT (TZS)':Math.round(m.total*0.18),
    Mwuzaji:m.seller_name||'',
    Wakati:new Date(m.created_at).toLocaleString('sw')};});
  const ws=XLSX.utils.json_to_sheet(rows);const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Mauzo');
  XLSX.writeFile(wb,shop.name.replace(/\s+/g,'_')+'_ripoti.xlsx');
}

// ============================
// PWA
// ============================
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  });
}

// START
init();

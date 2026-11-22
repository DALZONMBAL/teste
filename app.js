'use strict';

/* TESTE — application connectée : profils, portefeuilles et historique sont stockés dans Supabase. */

const $ = id => document.getElementById(id);
const navButtons = [...document.querySelectorAll('[data-screen]')];

function showScreen(id){
  const target=$(id);
  if(!target || !target.classList.contains('screen')) return false;
  document.querySelectorAll('.screen').forEach(screen=>{
    const active=screen===target;
    screen.classList.toggle('active',active);
    screen.style.display=active?'block':'none';
    screen.setAttribute('aria-hidden',String(!active));
  });
  const navSection=({
    send:'home',
    receive:'home',
    withdraw:'home',
    convert:'accounts',
    personal:'profile',
    preferences:'profile',
    security:'profile',
    help:'profile',
    about:'profile'
  })[id]||id;
  navButtons.forEach(button=>{
    const active=button.dataset.screen===navSection;
    button.classList.toggle('active',active);
    if(active) button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
  });
  const heading=target.querySelector('h1');
  if(heading){
    heading.setAttribute('tabindex','-1');
    heading.focus({preventScroll:true});
  }
  window.scrollTo({top:0,left:0,behavior:'auto'});
  return true;
}

document.addEventListener('click',event=>{
  const origin=event.target instanceof Element?event.target:null;
  const button=origin?.closest('[data-go]');
  if(!button) return;
  event.preventDefault();
  showScreen(button.dataset.go);
});
navButtons.forEach(button=>button.addEventListener('click',()=>showScreen(button.dataset.screen)));

let toastTimer=null;
function toast(message){
  const el=$('toast');
  if(!el) return;
  el.textContent=message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>el.classList.remove('show'),2400);
}
document.querySelectorAll('[data-toast]').forEach(button=>{
  button.addEventListener('click',()=>toast(button.dataset.toast));
});

const TESTE_USD_CDF_RATE=2300;
const INITIAL_BALANCES={USD:0,CDF:0};
let hidden=false;
let lastBalanceText='$ 0.00';
let currentUserId=null;
let currentProfile=null;
let demoAccountId='TST0000000000';
let supabaseClient=null;

function money(value,currency){
  const amount=Number(value||0)/(currency==='USD'?100:1);
  return currency==='USD'
    ?'$ '+amount.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
    :Math.round(amount).toLocaleString('fr-FR')+' CDF';
}
function formatMajor(value,currency){
  return currency==='USD'
    ?'$ '+Number(value).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
    :Math.round(Number(value)).toLocaleString('fr-FR')+' CDF';
}
function convert(amount,from,to){
  const value=Math.max(0,Number(amount)||0);
  const converted=from===to?value:(from==='USD'?value*TESTE_USD_CDF_RATE:value/TESTE_USD_CDF_RATE);
  return to==='CDF'
    ?Math.round(converted).toLocaleString('fr-FR')+' CDF'
    :'$ '+converted.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function setRateLabels(){
  const rate=TESTE_USD_CDF_RATE.toLocaleString('fr-FR');
  document.querySelectorAll('[data-rate-display]').forEach(el=>el.textContent=rate);
}
function updateConvert(){
  const amount=$('fullAmount'),from=$('fullFrom'),to=$('fullTo'),result=$('fullResult');
  if(amount&&from&&to&&result) result.textContent=convert(amount.value,from.value,to.value);
}
function updateHomeConversion(){
  const amount=$('homeAmount'),from=$('homeFrom'),to=$('homeTo'),result=$('homeResult');
  if(amount&&from&&to&&result) result.value=convert(amount.value,from.value,to.value);
}
function updateSendQuote(){
  const amount=$('sendAmount'),from=$('sendFrom'),to=$('sendTo'),result=$('sendReceive');
  if(amount&&from&&to&&result) result.value=convert(amount.value,from.value,to.value);
}
['fullAmount','fullFrom','fullTo'].forEach(id=>{
  $(id)?.addEventListener('input',updateConvert);
  $(id)?.addEventListener('change',updateConvert);
});
['homeAmount','homeFrom','homeTo'].forEach(id=>{
  $(id)?.addEventListener('input',updateHomeConversion);
  $(id)?.addEventListener('change',updateHomeConversion);
});
['sendAmount','sendFrom','sendTo'].forEach(id=>{
  $(id)?.addEventListener('input',updateSendQuote);
  $(id)?.addEventListener('change',updateSendQuote);
});
setRateLabels();
updateConvert();
updateHomeConversion();
updateSendQuote();

function renderDemoAccounts(){
  lastBalanceText=formatMajor(INITIAL_BALANCES.USD,'USD');
  const balance=$('balance');
  if(balance) balance.textContent=hidden?'••••••':lastBalanceText;
  const currencyValues=document.querySelectorAll('.currency-value');
  if(currencyValues[0]) currencyValues[0].textContent=formatMajor(INITIAL_BALANCES.USD,'USD');
  if(currencyValues[1]) currencyValues[1].textContent=formatMajor(INITIAL_BALANCES.CDF,'CDF');
  const cards=document.querySelectorAll('#accounts .account-card strong');
  if(cards[0]) cards[0].textContent=formatMajor(INITIAL_BALANCES.USD,'USD');
  if(cards[1]) cards[1].textContent=formatMajor(INITIAL_BALANCES.CDF,'CDF');
  document.querySelectorAll('.account-foot').forEach(el=>el.textContent='Solde du compte');
}
$('toggleBalance')?.addEventListener('click',()=>{
  hidden=!hidden;
  const balance=$('balance');
  if(balance) balance.textContent=hidden?'••••••':lastBalanceText;
  $('toggleBalance')?.setAttribute('aria-label',hidden?'Afficher le solde':'Masquer le solde');
});
renderDemoAccounts();

const demoActivity=[];
const activitySearch=$('activitySearch');
const activityFilter=$('activityFilter');

function renderTransferHistory(){
  const query=(activitySearch?.value||'').trim().toLowerCase();
  const type=activityFilter?.value||'all';
  const visible=demoActivity.filter(item=>{
    const incoming=item.direction==='in';
    const typeMatch=type==='all'||(type==='in'&&incoming)||(type==='out'&&!incoming);
    const searchable=[item.other,item.currency,item.amount_minor,money(item.amount_minor,item.currency),incoming?'entrée':'sortie','exemple'].join(' ').toLowerCase();
    return typeMatch&&searchable.includes(query);
  });
  const build=(items,limit)=>{
    const root=document.createElement('div');
    const shown=typeof limit==='number'?items.slice(0,limit):items;
    if(!shown.length){
      const empty=document.createElement('div');
      empty.className='history-empty';
      empty.textContent='Aucune opération ne correspond à votre recherche.';
      root.append(empty);
      return root;
    }
    let lastMonth='';
    let monthBox=null;
    shown.forEach(item=>{
      const incoming=item.direction==='in';
      const date=new Date(item.created_at);
      const month=date.toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
      if(limit===undefined&&month!==lastMonth){
        monthBox=document.createElement('section');
        monthBox.className='history-month';
        const heading=document.createElement('h3');
        heading.textContent=month;
        monthBox.append(heading);
        root.append(monthBox);
        lastMonth=month;
      }
      const parent=limit===undefined?monthBox:root;
      const row=document.createElement('div');
      row.className='history-item '+(incoming?'incoming':'outgoing');
      const icon=document.createElement('div');
      icon.className='history-icon';
      icon.textContent=incoming?'↙':'↗';
      const main=document.createElement('div');
      main.className='history-main';
      const title=document.createElement('strong');
      title.textContent=(incoming?'Entrée depuis ':'Sortie vers ')+item.other;
      const sub=document.createElement('span');
      sub.textContent=date.toLocaleString('fr-FR',{dateStyle:'medium',timeStyle:'short'})+' · TESTE';
      main.append(title,sub);
      const amount=document.createElement('div');
      amount.className='history-amount';
      amount.textContent=(incoming?'+ ':'− ')+money(item.amount_minor,item.currency);
      const state=document.createElement('small');
      state.textContent='Enregistré';
      amount.append(state);
      row.append(icon,main,amount);
      parent.append(row);
    });
    return root;
  };
  $('activityHistory')?.replaceChildren(build(visible));
  $('homeTransactions')?.replaceChildren(build(demoActivity,4));
}
activitySearch?.addEventListener('input',renderTransferHistory);
activityFilter?.addEventListener('change',renderTransferHistory);
renderTransferHistory();

function initialsFor(name){
  return String(name||'T').trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase()||'T';
}
function setText(id,value){
  const el=$(id);
  if(el) el.textContent=value;
}
function setDemoId(user){
  const raw=String(user?.id||'').replace(/[^a-z0-9]/gi,'').toUpperCase();
  demoAccountId='TST'+(raw+'0000000000').slice(0,10);
  setText('profileAccountLine','Identifiant TESTE · '+demoAccountId);
  const accountField=$('personalAccountNumber');
  if(accountField) accountField.value=demoAccountId;
  const receiveId=$('receive')?.querySelector('.receive-code strong');
  if(receiveId) receiveId.textContent=demoAccountId;
  const qr=$('receiveQr');
  if(qr&&window.QRCode){
    qr.replaceChildren();
    new QRCode(qr,{text:'TESTE|'+demoAccountId,width:190,height:190,colorDark:'#10251e',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
  }
}
async function loadPreferences(){
  let prefs={};
  if(supabaseClient&&currentUserId){
    // Les préférences sont stockées dans public.profiles (clé primaire id).
    const {data,error}=await supabaseClient.from('profiles').select('preferences').eq('id',currentUserId).maybeSingle();
    if(error) throw error;
    prefs=data?.preferences||{};
  }
  const theme=prefs.theme||'light';
  if($('prefTheme')) $('prefTheme').value=theme;
  if($('prefCurrency')) $('prefCurrency').value=prefs.currency||'USD';
  if($('prefLanguage')) $('prefLanguage').value=prefs.language||'fr';
  document.body.classList.toggle('dark',theme==='dark');
}


$('themeToggle')?.addEventListener('click',async()=>{
  const dark=!document.body.classList.contains('dark');
  if(!supabaseClient||!currentUserId){toast('Connectez-vous pour enregistrer le thème.');return;}
  const preferences={theme:dark?'dark':'light',currency:$('prefCurrency')?.value||'USD',language:$('prefLanguage')?.value||'fr'};
  try{
    const {error}=await supabaseClient.rpc('teste_update_preferences',{p_preferences:preferences});
    if(error)throw error;
    document.body.classList.toggle('dark',dark);
    if($('prefTheme'))$('prefTheme').value=preferences.theme;
    currentProfile={...(currentProfile||{}),preferences};
  }catch(error){toast('Thème non enregistré : '+(error.message||'réessayez.'));}
});

const SUPABASE_URL='https://dswomwtdeuuhojchyykd.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_6jAEkzvYz-zvFBeDYn0R8Q_-2kFU9Nc';
const welcomeScreen=$('welcomeScreen');
const authScreen=$('authScreen');
const authSubmit=$('authSubmit');
const authMessage=$('authMessage');
const loginTab=$('loginTab');
const signupTab=$('signupTab');
const nameField=$('nameField');
let authMode='login';

function setAuthMode(mode){
  authMode=mode;
  loginTab?.classList.toggle('selected',mode==='login');
  signupTab?.classList.toggle('selected',mode==='signup');
  if(nameField) nameField.style.display=mode==='signup'?'block':'none';
  setText('authTitle',mode==='signup'?'Créez votre espace TESTE.':'Connectez-vous à votre espace.');
  if(authSubmit) authSubmit.textContent=mode==='signup'?'Créer mon compte':'Se connecter';
  $('localPassword')?.setAttribute('autocomplete',mode==='signup'?'new-password':'current-password');
  if(authMessage) authMessage.textContent=mode==='signup'?'Créez votre accès avec une adresse e-mail.':'Retrouvez votre espace TESTE.';
}

function openAuth(mode='login'){
  welcomeScreen.style.display='none';
  authScreen.classList.add('open');
  setAuthMode(mode);
}
$('getStarted')?.addEventListener('click',()=>openAuth('login'));
$('openAuth')?.addEventListener('click',()=>openAuth('login'));
$('closeAuth')?.addEventListener('click',()=>{
  authScreen.classList.remove('open');
  if(!currentUserId) welcomeScreen.style.display='flex';
});

try{
  if(window.supabase?.createClient){
    supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
    });
  }else{
    authMessage.textContent='Le service de connexion est momentanément indisponible.';
  }
}catch(error){
  authMessage.textContent='Impossible d’initialiser la connexion TESTE.';
}

async function displayProfilePhoto(path){
  const img=$('profilePhoto');
  const initials=$('profileInitials');
  if(!img) return;
  if(!path||!supabaseClient){
    img.removeAttribute('src');
    img.hidden=true;
    if(initials) initials.hidden=false;
    const label=initials?.textContent||'T';
    document.querySelectorAll('.avatar').forEach(el=>el.textContent=label);
    return;
  }
  const {data,error}=await supabaseClient.storage.from('profile-photos').createSignedUrl(path,3600);
  if(error) throw error;
  const safeUrl=new URL(data.signedUrl);
  if(safeUrl.origin!==SUPABASE_URL||!safeUrl.pathname.includes('/storage/v1/object/sign/profile-photos/')){
    throw new Error('Adresse de photo non autorisée.');
  }
  img.src=safeUrl.href;
  img.hidden=false;
  if(initials) initials.hidden=true;
  document.querySelectorAll('.avatar').forEach(el=>{
    const avatarImage=document.createElement('img');
    avatarImage.alt='';
    avatarImage.src=safeUrl.href;
    avatarImage.style.width='100%';
    avatarImage.style.height='100%';
    avatarImage.style.objectFit='cover';
    avatarImage.style.borderRadius='50%';
    el.replaceChildren(avatarImage);
  });
}

async function loadUserData(user){
  if(!user?.id) return;
  if(user.email&&!user.email_confirmed_at&&user.app_metadata?.provider!=='google'){
    await supabaseClient.auth.signOut();
    throw new Error('Confirmez votre adresse e-mail avant de continuer.');
  }
  currentUserId=user.id;
  const metadata=user.user_metadata||{};
  const name=metadata.full_name||metadata.name||(user.email?user.email.split('@')[0]:'Utilisateur TESTE');
  currentProfile={full_name:name,avatar_path:metadata.avatar_path||null};
  const initials=initialsFor(name);
  setText('profileDisplayName',name);
  setText('profileInitials',initials);
  setText('profileEmailLine',user.email||'');
  setText('securityEmail',user.email||'—');
  setText('personalFullName',name);
  const personalName=$('personalFullName');
  if(personalName) personalName.value=name;
  const personalEmail=$('personalEmail');
  if(personalEmail) personalEmail.value=user.email||'';
  document.querySelectorAll('.avatar').forEach(el=>el.textContent=initials);
  const welcomeTitle=document.querySelector('.welcome h1');
  if(welcomeTitle) welcomeTitle.textContent='Bonjour, '+name;
  setDemoId(user);
  renderDemoAccounts();
  renderTransferHistory();
  await loadPreferences();
  await refreshDemoData();
  startWalletRealtime();
  try{await displayProfilePhoto(currentProfile.avatar_path);}catch(error){console.warn('Photo de profil indisponible.',error);}
  welcomeScreen.style.display='none';
  authScreen.classList.remove('open');
  showScreen('home');
}

$('loginTab')?.addEventListener('click',()=>setAuthMode('login'));
$('signupTab')?.addEventListener('click',()=>setAuthMode('signup'));

$('googleAuth')?.addEventListener('click',async()=>{
  const button=$('googleAuth');
  if(!supabaseClient){authMessage.textContent='La connexion n’est pas disponible pour le moment.';return;}
  button.disabled=true;
  authMessage.textContent='Ouverture de Google…';
  try{
    const redirectTo=window.location.origin+window.location.pathname;
    const {error}=await supabaseClient.auth.signInWithOAuth({provider:'google',options:{redirectTo}});
    if(error) throw error;
  }catch(error){
    authMessage.textContent='Connexion Google indisponible : '+(error.message||'vérifiez la configuration du fournisseur Google.');
    button.disabled=false;
  }
});

authSubmit?.addEventListener('click',async()=>{
  if(!supabaseClient){authMessage.textContent='La connexion n’est pas disponible pour le moment.';return;}
  const email=$('localEmail').value.trim().toLowerCase();
  const password=$('localPassword').value;
  const name=$('localName').value.trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){authMessage.textContent='Saisissez une adresse e-mail valide.';return;}
  if(password.length<8){authMessage.textContent='Le mot de passe doit contenir au moins 8 caractères.';return;}
  if(authMode==='signup'&&!name){authMessage.textContent='Saisissez votre nom complet.';return;}
  authSubmit.disabled=true;
  try{
    if(authMode==='signup'){
      const {data,error}=await supabaseClient.auth.signUp({email,password,options:{data:{full_name:name}}});
      if(error) throw error;
      if(!data.session){
        authMessage.textContent='Compte créé. Vérifiez votre boîte e-mail pour confirmer l’inscription, puis connectez-vous.';
        return;
      }
      await loadUserData(data.user);
      toast('Bienvenue sur TESTE.');
    }else{
      const {data,error}=await supabaseClient.auth.signInWithPassword({email,password});
      if(error) throw error;
      await loadUserData(data.user);
      toast('Connexion réussie.');
    }
  }catch(error){
    authMessage.textContent=error.message==='Invalid login credentials'
      ?'Adresse e-mail ou mot de passe incorrect.'
      :'Connexion impossible : '+(error.message||'vérifiez la configuration Supabase.');
  }finally{
    authSubmit.disabled=false;
  }
});

supabaseClient?.auth.onAuthStateChange((event,session)=>{
  if(session?.user&&['SIGNED_IN','USER_UPDATED'].includes(event)&&currentUserId!==session.user.id){
    setTimeout(()=>loadUserData(session.user).catch(error=>{
      authMessage.textContent='Impossible de charger votre espace : '+error.message;
    }),0);
  }else if(event==='SIGNED_OUT'){
    currentUserId=null;
    currentProfile=null;
    demoAccountId='TST0000000000';
    welcomeScreen.style.display='flex';
    authScreen.classList.remove('open');
    showScreen('home');
  }
});

(async()=>{
  if(!supabaseClient){
    welcomeScreen.style.display='flex';
    return;
  }
  const {data,error}=await supabaseClient.auth.getSession();
  if(error){
    authMessage.textContent='Impossible de vérifier votre session.';
    welcomeScreen.style.display='flex';
    return;
  }
  if(data.session?.user){
    try{await loadUserData(data.session.user);}
    catch(loadError){
      welcomeScreen.style.display='none';
      authScreen.classList.add('open');
      authMessage.textContent=loadError.message;
    }
  }else{
    welcomeScreen.style.display='flex';
    setAuthMode('login');
  }
})();

$('profilePhotoInput')?.addEventListener('change',async event=>{
  const file=event.target.files?.[0];
  if(!file) return;
  if(!currentUserId||!supabaseClient){toast('Connectez-vous pour modifier votre photo.');event.target.value='';return;}
  if(!file.type.startsWith('image/')||file.size<1||file.size>10*1024*1024){
    toast('Choisissez une photo de 10 Mo maximum.');event.target.value='';return;
  }
  const rawExtension=(file.name.split('.').pop()||file.type.split('/').pop()||'img').toLowerCase();
  const extension=rawExtension.replace(/[^a-z0-9]/g,'').slice(0,8)||'img';
  const path=currentUserId+'/avatar.'+extension;
  try{
    const {error}=await supabaseClient.storage.from('profile-photos').upload(path,file,{upsert:true,contentType:file.type});
    if(error)throw error;
    const {error:updateError}=await supabaseClient.auth.updateUser({data:{avatar_path:path}});
    if(updateError)throw updateError;
    currentProfile={...(currentProfile||{}),avatar_path:path};
    await displayProfilePhoto(path);
    toast('Photo de profil enregistrée.');
  }catch(error){toast('Photo non enregistrée : '+(error.message||'réessayez.'));}
  finally{event.target.value='';}
});

$('savePersonal')?.addEventListener('click',async()=>{
  if(!supabaseClient){toast('Connexion indisponible.');return;}
  const name=$('personalFullName').value.trim();
  const email=$('personalEmail').value.trim().toLowerCase();
  const message=$('personalMessage');
  const button=$('savePersonal');
  if(!name||name.length>80){message.textContent='Saisissez un nom valide.';return;}
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){message.textContent='Adresse e-mail invalide.';return;}
  const {data:{user},error:getUserError}=await supabaseClient.auth.getUser();
  if(getUserError||!user){message.textContent='Reconnectez-vous pour modifier ces informations.';return;}
  button.disabled=true;
  try{
    const updates={data:{full_name:name}};
    if(email!==user.email) updates.email=email;
    const {error}=await supabaseClient.auth.updateUser(updates);
    if(error) throw error;
    currentProfile.full_name=name;
    setText('profileDisplayName',name);
    setText('profileInitials',initialsFor(name));
    document.querySelectorAll('.avatar').forEach(el=>el.textContent=initialsFor(name));
    const welcomeTitle=document.querySelector('.welcome h1');
    if(welcomeTitle) welcomeTitle.textContent='Bonjour, '+name;
    if(email!==user.email) message.textContent='Nom enregistré. Confirmez la nouvelle adresse depuis l’e-mail reçu.';
    else message.textContent='Informations enregistrées.';
  }catch(error){
    message.textContent='Enregistrement impossible : '+(error.message||'réessayez.');
  }finally{
    button.disabled=false;
  }
});

$('savePreferences')?.addEventListener('click',async()=>{
  const preferences={theme:$('prefTheme').value,currency:$('prefCurrency').value,language:$('prefLanguage').value||'fr'};
  const button=$('savePreferences');button.disabled=true;
  try{
    if(!supabaseClient||!currentUserId)throw new Error('Connectez-vous pour enregistrer vos préférences.');
    const {error}=await supabaseClient.rpc('teste_update_preferences',{p_preferences:preferences});
    if(error)throw error;
    currentProfile={...(currentProfile||{}),preferences};
    document.body.classList.toggle('dark',preferences.theme==='dark');
    $('preferencesMessage').textContent='Préférences enregistrées dans votre compte.';
    toast('Préférences enregistrées.');
  }catch(error){$('preferencesMessage').textContent='Enregistrement impossible : '+(error.message||'réessayez.');}
  finally{button.disabled=false;}
});

$('changePassword')?.addEventListener('click',async()=>{
  const first=$('newPassword').value;
  const second=$('confirmPassword').value;
  const message=$('securityMessage');
  const button=$('changePassword');
  if(first.length<8){message.textContent='Le mot de passe doit contenir au moins 8 caractères.';return;}
  if(first!==second){message.textContent='Les mots de passe ne correspondent pas.';return;}
  if(!supabaseClient){message.textContent='Connexion indisponible.';return;}
  button.disabled=true;
  try{
    const {error}=await supabaseClient.auth.updateUser({password:first});
    if(error) throw error;
    $('newPassword').value='';
    $('confirmPassword').value='';
    message.textContent='Mot de passe mis à jour.';
  }catch(error){
    message.textContent='Mise à jour impossible : '+(error.message||'réessayez.');
  }finally{
    button.disabled=false;
  }
});

async function logoutCurrent(){
  if(!supabaseClient) return;
  const {error}=await supabaseClient.auth.signOut();
  if(error) toast('Déconnexion impossible : '+error.message);
}
$('profileLogout')?.addEventListener('click',logoutCurrent);
$('logoutAll')?.addEventListener('click',logoutCurrent);

const sendButton=$('sendTransferBtn');
sendButton?.addEventListener('click',()=>{
  const recipient=$('recipientAccount')?.value.trim().toUpperCase()||'';
  const amount=Number($('sendAmount')?.value||0);
  const from=$('sendFrom')?.value||'USD';
  const to=$('sendTo')?.value||'CDF';
  if(!/^TST[A-Z0-9]{10}$/.test(recipient)){
    toast('Saisissez un identifiant TESTE valide.');
    return;
  }
  if(!Number.isFinite(amount)||amount<=0){
    toast('Saisissez un montant supérieur à zéro.');
    return;
  }
  const received=from===to?amount:(from==='USD'?amount*TESTE_USD_CDF_RATE:amount/TESTE_USD_CDF_RATE);
  setText('previewRecipient',recipient);
  setText('previewAmount',formatMajor(amount,from));
  setText('previewReceive',formatMajor(received,to));
  const preview=$('sendPreview');
  if(preview){
    preview.hidden=false;
    preview.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'});
  }
  toast('Aperçu prêt.');
});

let qrScanner=null;
let qrBusy=false;
$('openQrScanner')?.addEventListener('click',async()=>{
  const panel=$('qrScannerPanel');
  panel.hidden=false;
  if(qrScanner?.isScanning) return;
  if(!window.Html5Qrcode){
    panel.hidden=true;
    toast('Lecture QR indisponible. Saisissez l’identifiant.');
    return;
  }
  try{
    if(!qrScanner) qrScanner=new Html5Qrcode('qrReader',{verbose:false});
    await qrScanner.start(
      {facingMode:'environment'},
      {fps:8,qrbox:{width:220,height:220}},
      async decodedText=>{
        if(qrBusy) return;
        const match=String(decodedText||'').trim().match(/^TESTE\|(TST[A-Z0-9]{10})$/i);
        if(!match){
          toast('Ce QR code ne correspond pas à un identifiant TESTE.');
          return;
        }
        qrBusy=true;
        $('recipientAccount').value=match[1].toUpperCase();
        try{await qrScanner.stop();}catch(error){}
        panel.hidden=true;
        qrBusy=false;
        toast('Identifiant reconnu.');
      },
      ()=>{}
    );
  }catch(error){
    try{if(qrScanner?.isScanning) await qrScanner.stop();}catch(stopError){}
    panel.hidden=true;
    toast('Caméra inaccessible. Saisissez l’identifiant manuellement.');
  }
});
document.addEventListener('visibilitychange',async()=>{
  if(document.hidden&&qrScanner?.isScanning){
    try{await qrScanner.stop();}catch(error){}
    if($('qrScannerPanel')) $('qrScannerPanel').hidden=true;
  }
});
$('closeQrScanner')?.addEventListener('click',async()=>{
  if(qrScanner?.isScanning){
    try{await qrScanner.stop();}catch(error){}
  }
  $('qrScannerPanel').hidden=true;
});

$('copyReceiveId')?.addEventListener('click',async()=>{
  if(!currentUserId){
    toast('Connectez-vous pour afficher votre identifiant.');
    return;
  }
  try{
    await navigator.clipboard.writeText(demoAccountId);
    toast('Identifiant copié.');
  }catch(error){
    toast(demoAccountId);
  }
});


// TESTE v2 — portefeuille pédagogique Supabase (aucune opération financière réelle).
let serverTransfers=[];
let demoCardLocked=false;
let walletRefreshChannel=null;
function formatMinor(value,currency){
  const n=Number(value||0);
  return currency==='USD'
    ?'$ '+(n/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
    :Math.round(n).toLocaleString('fr-FR')+' CDF';
}
function renderServerHistory(){
  const query=(activitySearch?.value||'').trim().toLowerCase();
  const type=activityFilter?.value||'all';
  const filtered=serverTransfers.filter(item=>{
    const incoming=item.direction==='in';
    return (type==='all'||(type==='in'&&incoming)||(type==='out'&&!incoming))
      && [item.other,item.currency,item.amount_minor,incoming?'réception':'envoi'].join(' ').toLowerCase().includes(query);
  });
  const make=(items,limit)=>{
    const root=document.createElement('div');
    (typeof limit==='number'?items.slice(0,limit):items).forEach(item=>{
      const row=document.createElement('div');row.className='history-item '+(item.direction==='in'?'incoming':'outgoing');
      const ico=document.createElement('div');ico.className='history-icon';ico.textContent=item.direction==='in'?'↙':'↗';
      const main=document.createElement('div');main.className='history-main';
      const title=document.createElement('strong');title.textContent=item.direction==='in'?'Montant reçu':'Envoi';
      const sub=document.createElement('span');sub.textContent=new Date(item.created_at).toLocaleString('fr-FR',{dateStyle:'medium',timeStyle:'short'});
      main.append(title,sub);
      const amount=document.createElement('div');amount.className='history-amount';
      amount.textContent=(item.direction==='in'?'+ ':'− ')+formatMinor(item.amount_minor,item.currency);
      const status=document.createElement('small');status.textContent='Enregistré';amount.append(status);
      row.append(ico,main,amount);root.append(row);
    });
    if(!root.childElementCount){const empty=document.createElement('div');empty.className='history-empty';empty.textContent='Aucune opération enregistrée.';root.append(empty);}
    return root;
  };
  $('activityHistory')?.replaceChildren(make(filtered));
  $('homeTransactions')?.replaceChildren(make(serverTransfers,4));
}
function renderNotifications(rows){
  const root=$('notificationList');if(!root)return;
  root.replaceChildren();
  if(!rows?.length){const e=document.createElement('div');e.className='history-empty';e.textContent='Aucune notification pour le moment.';root.append(e);return;}
  rows.forEach(n=>{
    const row=document.createElement('div');row.className='history-item';
    const ico=document.createElement('div');ico.className='history-icon';ico.textContent=n.is_read?'✓':'•';
    const main=document.createElement('div');main.className='history-main';
    const title=document.createElement('strong');title.textContent=n.title;
    const body=document.createElement('span');body.textContent=n.body;
    const date=document.createElement('span');date.textContent=new Date(n.created_at).toLocaleString('fr-FR',{dateStyle:'medium',timeStyle:'short'});
    main.append(title,body,date);row.append(ico,main);
    if(!n.is_read){
      const mark=document.createElement('button');mark.className='text-btn';mark.type='button';mark.textContent='Lu';
      mark.addEventListener('click',async()=>{
        const {error}=await supabaseClient.from('teste_notifications').update({is_read:true}).eq('id',n.id);
        if(error)toast('Impossible de mettre à jour la notification.');
        else await refreshDemoData();
      });
      row.append(mark);
    }
    root.append(row);
  });
}
async function refreshDemoData(){
  if(!supabaseClient||!currentUserId)return;
  try{
    const [profileRes,walletRes,transferRes,notificationRes,cardRes]=await Promise.all([
      supabaseClient.from('teste_profiles').select('account_id,full_name').eq('user_id',currentUserId).maybeSingle(),
      supabaseClient.from('teste_wallets').select('currency,balance_minor').eq('user_id',currentUserId),
      supabaseClient.from('teste_transfers').select('id,sender_id,recipient_id,sender_currency,recipient_currency,sender_amount_minor,recipient_amount_minor,created_at').or('sender_id.eq.'+currentUserId+',recipient_id.eq.'+currentUserId).order('created_at',{ascending:false}).limit(50),
      supabaseClient.from('teste_notifications').select('id,title,body,is_read,created_at').eq('user_id',currentUserId).order('created_at',{ascending:false}).limit(30),
      supabaseClient.from('teste_cards').select('last4,status').eq('user_id',currentUserId).maybeSingle()
    ]);
    for(const r of [profileRes,walletRes,transferRes,notificationRes,cardRes])if(r.error)throw r.error;
    if(profileRes.data?.account_id){
      demoAccountId=profileRes.data.account_id;
      setText('profileAccountLine','Identifiant TESTE · '+demoAccountId);
      if($('personalAccountNumber'))$('personalAccountNumber').value=demoAccountId;
      const receiveId=$('receive')?.querySelector('.receive-code strong');if(receiveId)receiveId.textContent=demoAccountId;
      const qr=$('receiveQr');if(qr&&window.QRCode){qr.replaceChildren();new QRCode(qr,{text:'TESTE|'+demoAccountId,width:190,height:190,colorDark:'#10251e',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});}
    }
    const usd=walletRes.data?.find(w=>w.currency==='USD')?.balance_minor??0;
    const cdf=walletRes.data?.find(w=>w.currency==='CDF')?.balance_minor??0;
    const total=formatMinor(usd,'USD');
    lastBalanceText=total;
    if($('balance'))$('balance').textContent=hidden?'••••••':total;
    const vals=document.querySelectorAll('.currency-value');
    if(vals[0])vals[0].textContent=formatMinor(usd,'USD');
    if(vals[1])vals[1].textContent=formatMinor(cdf,'CDF');
    const accountAmounts=document.querySelectorAll('#accounts .account-card strong');
    if(accountAmounts[0])accountAmounts[0].textContent=formatMinor(usd,'USD');
    if(accountAmounts[1])accountAmounts[1].textContent=formatMinor(cdf,'CDF');
    document.querySelectorAll('.account-foot').forEach(el=>el.textContent='Solde du compte');
    serverTransfers=(transferRes.data||[]).map(t=>{
      const incoming=t.recipient_id===currentUserId;
      return {id:t.id,direction:incoming?'in':'out',other:'Compte TESTE',currency:incoming?t.recipient_currency:t.sender_currency,amount_minor:incoming?t.recipient_amount_minor:t.sender_amount_minor,created_at:t.created_at};
    });
    renderServerHistory();
    renderNotifications(notificationRes.data||[]);
    demoCardLocked=cardRes.data?.status==='locked';
    // Afficher l'identifiant de carte TESTE complet, sans inventer un numéro bancaire.
    const cardReference=(demoAccountId||('TST'+currentUserId.replace(/-/g,'').slice(0,10))).toUpperCase();
    const formattedCardReference=cardReference.match(/.{1,4}/g)?.join('  ')||cardReference;
    setText('demoCardStatus',demoCardLocked?'VERROUILLÉE':'ACTIVE');
    setText('demoCardStatusText',demoCardLocked?'Verrouillée':'Active');
    setText('demoCardNumber',formattedCardReference);
    setText('homeCardNumber',formattedCardReference);
    setText('homeCardStatus',demoCardLocked?'VERROUILLÉE':'ACTIVE');
    setText('toggleDemoCard',demoCardLocked?'Déverrouiller la carte':'Verrouiller la carte');
  }catch(error){
    console.error('TESTE data load:',error);
    toast('Données TESTE indisponibles : vérifiez la migration SQL.');
  }
}
activitySearch?.addEventListener('input',()=>{if(currentUserId)renderServerHistory();});
activityFilter?.addEventListener('change',()=>{if(currentUserId)renderServerHistory();});

const originalSendButton=$('sendTransferBtn');
if(originalSendButton){
  const activeSendButton=originalSendButton.cloneNode(true);
  originalSendButton.replaceWith(activeSendButton);
  activeSendButton.addEventListener('click',async()=>{
    if(!currentUserId||!supabaseClient){toast('Connectez-vous pour envoyer un montant.');return;}
    const recipient=$('recipientAccount')?.value.trim().toUpperCase()||'';
    const amount=Number($('sendAmount')?.value||0);
    const from=$('sendFrom')?.value||'USD';
    const to=$('sendTo')?.value||'CDF';
    if(!/^TST[A-Z0-9]{10}$/.test(recipient)){toast('Identifiant TESTE invalide.');return;}
    if(!Number.isFinite(amount)||amount<=0){toast('Saisissez un montant supérieur à zéro.');return;}
    activeSendButton.disabled=true;activeSendButton.textContent='Enregistrement…';
    try{
      const {data,error}=await supabaseClient.rpc('teste_demo_send',{
        p_recipient_account:recipient,p_amount:amount,p_sender_currency:from,p_recipient_currency:to
      });
      if(error)throw error;
      $('sendPreview').hidden=true;
      toast('Transfert enregistré.');
      await refreshDemoData();
    }catch(error){toast(error.message||'Envoi impossible. Vérifiez le solde et l’identifiant.');}
    finally{activeSendButton.disabled=false;activeSendButton.textContent='Envoyer';}
  });
}
$('toggleDemoCard')?.addEventListener('click',async()=>{
  if(!currentUserId||!supabaseClient){toast('Connectez-vous pour gérer la carte TESTE.');return;}
  const button=$('toggleDemoCard');button.disabled=true;
  try{
    const {error}=await supabaseClient.rpc('teste_demo_toggle_card',{p_locked:!demoCardLocked});
    if(error)throw error;
    await refreshDemoData();toast(demoCardLocked?'Carte verrouillée.':'Carte déverrouillée.');
  }catch(error){toast(error.message||'Action indisponible. Vérifiez la migration SQL.');}
  finally{button.disabled=false;}
});

function startWalletRealtime(){
  if(!supabaseClient||!currentUserId)return;
  if(walletRefreshChannel){supabaseClient.removeChannel(walletRefreshChannel);walletRefreshChannel=null;}
  walletRefreshChannel=supabaseClient.channel('teste-live-'+currentUserId)
    .on('postgres_changes',{event:'*',schema:'public',table:'teste_wallets',filter:'user_id=eq.'+currentUserId},()=>refreshDemoData())
    .on('postgres_changes',{event:'*',schema:'public',table:'teste_notifications',filter:'user_id=eq.'+currentUserId},()=>refreshDemoData())
    .on('postgres_changes',{event:'*',schema:'public',table:'teste_cards',filter:'user_id=eq.'+currentUserId},()=>refreshDemoData())
    .subscribe();
}
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden&&currentUserId)refreshDemoData();
});
supabaseClient?.auth.onAuthStateChange(event=>{
  if(event==='SIGNED_OUT'&&walletRefreshChannel){
    supabaseClient.removeChannel(walletRefreshChannel);
    walletRefreshChannel=null;
  }
});

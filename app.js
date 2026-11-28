'use strict';

/* TESTE — interface de présentation. Seule l’authentification utilise Supabase. */

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

const TESTE_USD_CDF_RATE=2850;
const INITIAL_BALANCES={USD:1240.5,CDF:3534000};
let hidden=false;
let lastBalanceText='$ 0.00';
let currentUserId=null;
let currentProfile=null;
let profilePhotoObjectUrl=null;
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
      empty.textContent='Aucune activité pour le moment.';
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
function setShareCode(){
  const shareUrl=window.location.origin+window.location.pathname;
  const label=$('receive')?.querySelector('.receive-code strong');
  if(label) label.textContent=window.location.host+window.location.pathname;
  const qr=$('receiveQr');
  if(qr&&window.QRCode){
    qr.replaceChildren();
    new QRCode(qr,{text:shareUrl,width:190,height:190,colorDark:'#10251e',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
  }
}

const PREFERENCES_KEY='teste.preferences.v1';
function readPreferences(){
  try{return JSON.parse(localStorage.getItem(PREFERENCES_KEY)||'{}');}
  catch(error){return {};}
}
function saveLocalPreferences(preferences){
  try{localStorage.setItem(PREFERENCES_KEY,JSON.stringify(preferences));}
  catch(error){toast('Préférences non conservées sur cet appareil.');}
}
function loadPreferences(){
  const prefs=readPreferences();
  const theme=prefs.theme==='dark'?'dark':'light';
  if($('prefTheme')) $('prefTheme').value=theme;
  if($('prefCurrency')) $('prefCurrency').value=prefs.currency==='CDF'?'CDF':'USD';
  if($('prefLanguage')) $('prefLanguage').value='fr';
  document.body.classList.toggle('dark',theme==='dark');
}
loadPreferences();

$('themeToggle')?.addEventListener('click',()=>{
  const dark=!document.body.classList.contains('dark');
  const preferences={...readPreferences(),theme:dark?'dark':'light'};
  saveLocalPreferences(preferences);
  document.body.classList.toggle('dark',dark);
  if($('prefTheme')) $('prefTheme').value=preferences.theme;
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
$('openAuth')?.addEventListener('click',()=>{if(currentUserId)showScreen('profile');else openAuth('login');});
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

function displayProfilePhoto(source){
  const img=$('profilePhoto');
  const initials=$('profileInitials');
  if(!img) return;
  if(!source){
    img.removeAttribute('src');
    img.hidden=true;
    if(initials) initials.hidden=false;
    const label=initials?.textContent||'T';
    document.querySelectorAll('.avatar').forEach(el=>el.textContent=label);
    return;
  }
  img.src=source;
  img.hidden=false;
  if(initials) initials.hidden=true;
  document.querySelectorAll('.avatar').forEach(el=>{
    const avatarImage=document.createElement('img');
    avatarImage.alt='';
    avatarImage.src=source;
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
  currentProfile={full_name:name,avatar_url:profilePhotoObjectUrl};
  const initials=initialsFor(name);
  setText('profileDisplayName',name);
  setText('profileInitials',initials);
  setText('profileEmailLine',user.email||'');
  setText('securityEmail',user.email||'—');
  const personalName=$('personalFullName');
  if(personalName) personalName.value=name;
  const personalEmail=$('personalEmail');
  if(personalEmail) personalEmail.value=user.email||'';
  setText('profileAccountLine','Espace personnel');
  document.querySelectorAll('.avatar').forEach(el=>el.textContent=initials);
  const welcomeTitle=document.querySelector('.welcome h1');
  if(welcomeTitle) welcomeTitle.textContent='Bonjour, '+name;
  renderDemoAccounts();
  renderTransferHistory();
  loadPreferences();
  displayProfilePhoto(currentProfile.avatar_url);
  if($('openAuth')) $('openAuth').textContent='Mon profil';
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
    if($('openAuth')) $('openAuth').textContent='Connexion';
    if(profilePhotoObjectUrl){URL.revokeObjectURL(profilePhotoObjectUrl);profilePhotoObjectUrl=null;}
    displayProfilePhoto(null);
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

$('profilePhotoInput')?.addEventListener('change',event=>{
  const file=event.target.files?.[0];
  if(!file) return;
  if(!currentUserId){toast('Connectez-vous pour personnaliser votre profil.');event.target.value='';return;}
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size<1||file.size>3*1024*1024){
    toast('Choisissez une image JPG, PNG ou WebP de 3 Mo maximum.');
    event.target.value='';
    return;
  }
  if(profilePhotoObjectUrl) URL.revokeObjectURL(profilePhotoObjectUrl);
  profilePhotoObjectUrl=URL.createObjectURL(file);
  currentProfile={...(currentProfile||{}),avatar_url:profilePhotoObjectUrl};
  displayProfilePhoto(profilePhotoObjectUrl);
  toast('Photo affichée dans cet aperçu. Elle n’est pas envoyée.');
  event.target.value='';
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

$('savePreferences')?.addEventListener('click',()=>{
  const preferences={
    theme:$('prefTheme').value==='dark'?'dark':'light',
    currency:$('prefCurrency').value==='CDF'?'CDF':'USD',
    language:'fr'
  };
  saveLocalPreferences(preferences);
  currentProfile={...(currentProfile||{}),preferences};
  document.body.classList.toggle('dark',preferences.theme==='dark');
  $('preferencesMessage').textContent='Préférences conservées sur cet appareil.';
  toast('Préférences enregistrées.');
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
  const amount=Number($('sendAmount')?.value||0);
  const from=$('sendFrom')?.value||'USD';
  const to=$('sendTo')?.value||'CDF';
  if(!Number.isFinite(amount)||amount<=0){
    toast('Saisissez un montant supérieur à zéro.');
    return;
  }
  const received=from===to?amount:(from==='USD'?amount*TESTE_USD_CDF_RATE:amount/TESTE_USD_CDF_RATE);
  setText('previewRecipient','Compte TESTE');
  setText('previewAmount',formatMajor(amount,from));
  setText('previewReceive',formatMajor(received,to));
  const preview=$('sendPreview');
  if(preview){
    preview.hidden=false;
    preview.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'});
  }
  toast('Récapitulatif affiché.');
});

$('copyReceiveId')?.addEventListener('click',async()=>{
  const shareUrl=window.location.origin+window.location.pathname;
  try{
    await navigator.clipboard.writeText(shareUrl);
    toast('Lien TESTE copié.');
  }catch(error){
    toast(window.location.host+window.location.pathname);
  }
});
setShareCode();

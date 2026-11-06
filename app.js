
const navButtons=[...document.querySelectorAll('[data-screen]')];
function showScreen(id){const target=document.getElementById(id);if(!target||!target.classList.contains('screen')){console.warn('Écran TESTE introuvable :',id);return false;}document.querySelectorAll('.screen').forEach(screen=>{const active=screen===target;screen.classList.toggle('active',active);screen.style.display=active?'block':'none';screen.setAttribute('aria-hidden',String(!active));});document.querySelectorAll('[data-screen]').forEach(button=>button.classList.toggle('active',button.dataset.screen===id));document.documentElement.scrollTop=0;document.body.scrollTop=0;window.scrollTo({top:0,left:0,behavior:'auto'});return true;}
document.addEventListener('click',event=>{const button=event.target.closest('[data-go]');if(!button)return;event.preventDefault();showScreen(button.dataset.go);});
navButtons.forEach(button=>button.addEventListener('click',()=>showScreen(button.dataset.screen)));
let hidden=false;let lastBalanceText='$ 0.00';document.getElementById('toggleBalance').addEventListener('click',()=>{hidden=!hidden;const el=document.getElementById('balance');el.textContent=hidden?'••••••':lastBalanceText;});
let toastTimer;function toast(message){const el=document.getElementById('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2200);}
document.querySelectorAll('[data-toast]').forEach(b=>b.addEventListener('click',()=>toast(b.dataset.toast)));
if('serviceWorker' in navigator && location.protocol.startsWith('http')) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));


/* TESTE application logic */

let TESTE_USD_CDF_RATE=null;function convert(n,from,to){n=Number(n)||0;if(from!==to&&!Number.isFinite(TESTE_USD_CDF_RATE))return 'Taux indisponible';let v=from===to?n:(from==='USD'?n*TESTE_USD_CDF_RATE:n/TESTE_USD_CDF_RATE);return to==='CDF'?Math.round(v).toLocaleString('fr-FR')+' CDF':'$ '+v.toFixed(2);}
function updateConvert(){document.getElementById('fullResult').textContent=convert(document.getElementById('fullAmount').value,document.getElementById('fullFrom').value,document.getElementById('fullTo').value);}
['fullAmount','fullFrom','fullTo'].forEach(id=>document.getElementById(id).addEventListener('input',updateConvert));updateConvert();
document.getElementById('loginTab').addEventListener('click',()=>{document.getElementById('loginTab').classList.add('selected');document.getElementById('signupTab').classList.remove('selected');document.getElementById('authTitle').textContent='Connectez-vous à votre espace.';});
document.getElementById('signupTab').addEventListener('click',()=>{document.getElementById('signupTab').classList.add('selected');document.getElementById('loginTab').classList.remove('selected');document.getElementById('authTitle').textContent='Créez votre espace TESTE.';});
document.getElementById('closeAuth').addEventListener('click',()=>document.getElementById('authScreen').classList.remove('open'));
document.getElementById('themeToggle')?.addEventListener('click',()=>document.body.classList.toggle('dark'));
document.getElementById('openAuth')?.addEventListener('click',()=>document.getElementById('authScreen').classList.add('open'));
function updateHomeConversion(){const amount=document.getElementById('homeAmount');if(!amount)return;const from=document.getElementById('homeFrom').value,to=document.getElementById('homeTo').value,n=Number(amount.value)||0;document.getElementById('homeResult').value=convert(n,from,to);}
['homeAmount','homeFrom','homeTo'].forEach(id=>document.getElementById(id)?.addEventListener('input',updateHomeConversion));updateHomeConversion();

const activitySearch=document.getElementById('activitySearch');
const activityFilter=document.getElementById('activityFilter');
function renderTransferHistory(userId){
 const all=Array.isArray(transferHistory)?transferHistory:[];
 const q=(activitySearch?.value||'').trim().toLowerCase();
 const type=activityFilter?.value||'all';
 const visible=all.filter(t=>{
  const incoming=t.recipient_id===userId;
  const matchesType=type==='all'||(type==='in'&&incoming)||(type==='out'&&!incoming);
  const other=incoming?t.sender_account:t.recipient_account;
  const hay=[other,t.currency,t.amount_minor,money(t.amount_minor,t.currency),incoming?'reçu':'envoyé',t.status].join(' ').toLowerCase();
  return matchesType&&hay.includes(q);
 });
 const activity=document.getElementById('activityHistory');
 const home=document.getElementById('homeTransactions');
 const build=(items,limit)=>{
  const root=document.createElement('div');
  const shown=typeof limit==='number'?items.slice(0,limit):items;
  if(!shown.length){const empty=document.createElement('div');empty.className='history-empty';empty.textContent=all.length?'Aucun transfert ne correspond à votre recherche.':'Aucun transfert enregistré pour le moment.';root.append(empty);return root;}
  let lastMonth='';
  let monthBox=null;
  shown.forEach(t=>{
   const incoming=t.recipient_id===userId;
   const date=new Date(t.created_at);
   const month=date.toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
   if(limit===undefined&&month!==lastMonth){monthBox=document.createElement('section');monthBox.className='history-month';const heading=document.createElement('h3');heading.textContent=month;monthBox.append(heading);root.append(monthBox);lastMonth=month;}
   const parent=limit===undefined?monthBox:root;
   const item=document.createElement('div');item.className='history-item '+(incoming?'incoming':'outgoing');
   const icon=document.createElement('div');icon.className='history-icon';icon.textContent=incoming?'↙':'↗';
   const main=document.createElement('div');main.className='history-main';
   const title=document.createElement('strong');title.textContent=(incoming?'Reçu de ':'Envoyé à ')+(incoming?t.sender_account:t.recipient_account);
   const sub=document.createElement('span');sub.textContent=date.toLocaleString('fr-FR',{dateStyle:'medium',timeStyle:'short'})+' · '+(t.status==='completed'?'Terminé':t.status);
   main.append(title,sub);
   const amount=document.createElement('div');amount.className='history-amount';amount.textContent=(incoming?'+ ':'− ')+money(t.amount_minor,t.currency);
   const state=document.createElement('small');state.textContent=incoming?'Reçu':'Envoyé';amount.append(state);
   item.append(icon,main,amount);parent.append(item);
  });
  return root;
 };
 if(activity){activity.replaceChildren(build(visible));}
 if(home){home.replaceChildren(build(all,4));}
}
function filterActivity(){if(currentProfile)renderTransferHistory(currentUserId);}
activitySearch?.addEventListener('input',()=>{if(currentUserId)renderTransferHistory(currentUserId);});
activityFilter?.addEventListener('change',()=>{if(currentUserId)renderTransferHistory(currentUserId);});

/* TESTE interactions */
const sendAmount=document.getElementById('sendAmount');
const sendFrom=document.getElementById('sendFrom');
const sendTo=document.getElementById('sendTo');
const sendReceive=document.getElementById('sendReceive');
function updateSendQuote(){
 if(!sendAmount||!sendFrom||!sendTo||!sendReceive)return;
 const amount=Math.max(0,Number(sendAmount.value)||0);
 const from=sendFrom.value,to=sendTo.value;
 const value=from===to?amount:(Number.isFinite(TESTE_USD_CDF_RATE)?(from==='USD'?amount*TESTE_USD_CDF_RATE:amount/TESTE_USD_CDF_RATE):NaN);
 sendReceive.value=Number.isFinite(value)?(to==='CDF'?Math.round(value).toLocaleString('fr-FR')+' CDF':'$ '+value.toFixed(2)):'Taux indisponible';
}
[sendAmount,sendFrom,sendTo].forEach(el=>el?.addEventListener('input',updateSendQuote));
[sendFrom,sendTo].forEach(el=>el?.addEventListener('change',updateSendQuote));
updateSendQuote();

document.querySelectorAll('#activity .activity-row').forEach(row=>row.addEventListener('click',()=>document.getElementById('detailModal')?.classList.add('open')));
document.getElementById('detailModal')?.addEventListener('click',e=>{if(e.target.id==='detailModal')e.currentTarget.classList.remove('open');});
try{if(localStorage.getItem('teste-theme')==='dark')document.body.classList.add('dark');}catch(e){}
document.getElementById('themeToggle')?.addEventListener('click',()=>{try{localStorage.setItem('teste-theme',document.body.classList.contains('dark')?'dark':'light');}catch(e){}});


/* Connexion Supabase — données synchronisées dans le projet TESTE */
const SUPABASE_URL='https://dswomwtdeuuhojchyykd.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_6jAEkzvYz-zvFBeDYn0R8Q_-2kFU9Nc';
const supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
 auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
});
const welcomeScreen=document.getElementById('welcomeScreen');
const authScreen=document.getElementById('authScreen');
const authSubmit=document.getElementById('authSubmit');
const authMessage=document.getElementById('authMessage');
const loginTab=document.getElementById('loginTab');
const signupTab=document.getElementById('signupTab');
const nameField=document.getElementById('nameField');
let authMode='login';
let currentProfile=null;
let currentUserId=null;
let transferHistory=[];
let pendingTransferMfa=null;
let pendingTransferKey=null;

function setAuthMode(mode){
 authMode=mode;
 loginTab.classList.toggle('selected',mode==='login');
 signupTab.classList.toggle('selected',mode==='signup');
 nameField.style.display=mode==='signup'?'block':'none';
 document.getElementById('authTitle').textContent=mode==='signup'?'Créez votre espace TESTE.':'Connectez-vous à votre espace.';
 authSubmit.textContent=mode==='signup'?'Créer mon compte':'Se connecter';
 document.getElementById('localPassword').autocomplete=mode==='signup'?'new-password':'current-password';
 authMessage.textContent=mode==='signup'?'Votre compte sera synchronisé avec votre espace TESTE.':'Connectez-vous à votre compte TESTE.';
}
function safeText(value){return String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function money(value,currency){
 const n=Number(value||0)/(currency==='USD'?100:1);
 return currency==='USD'?'$ '+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):Math.round(n).toLocaleString('fr-FR')+' CDF';
}
async function displayProfilePhoto(path){
 const img=document.getElementById('profilePhoto'),initials=document.getElementById('profileInitials');
 if(!img)return;
 if(!path){img.removeAttribute('src');img.hidden=true;if(initials)initials.hidden=false;const initialText=initials?.textContent||'T';document.querySelectorAll('.avatar').forEach(el=>{el.replaceChildren(document.createTextNode(initialText));});return;}
 const {data,error}=await supabaseClient.storage.from('profile-photos').createSignedUrl(path,3600);
 if(error)throw error;
 const safeUrl=new URL(data.signedUrl);
 if(safeUrl.origin!=='https://dswomwtdeuuhojchyykd.supabase.co'||!safeUrl.pathname.includes('/storage/v1/object/sign/profile-photos/'))throw new Error('URL de photo non autorisée');
 img.src=safeUrl.href;img.hidden=false;if(initials)initials.hidden=true;
 document.querySelectorAll('.avatar').forEach(el=>{const avatarImage=document.createElement('img');avatarImage.alt='';avatarImage.src=safeUrl.href;avatarImage.style.width='100%';avatarImage.style.height='100%';avatarImage.style.objectFit='cover';avatarImage.style.borderRadius='50%';el.replaceChildren(avatarImage);});
}
document.getElementById('profilePhotoInput')?.addEventListener('change',async e=>{
 const file=e.target.files?.[0];if(!file)return;
 if(!currentUserId){toast('Connectez-vous pour modifier votre photo.');return;}
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size<1||file.size>3*1024*1024){toast('Image JPG, PNG ou WebP de 3 Mo maximum.');e.target.value='';return;}
 const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());
 const isJpeg=bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
 const isPng=bytes.length>=8&&bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47&&bytes[4]===0x0d&&bytes[5]===0x0a&&bytes[6]===0x1a&&bytes[7]===0x0a;
 const isWebp=bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
 if(!(isJpeg||isPng||isWebp)){toast('Le contenu du fichier ne correspond pas à une image autorisée.');e.target.value='';return;}
 const actualMime=isPng?'image/png':isWebp?'image/webp':'image/jpeg';
 if(file.type!==actualMime){toast('Le type déclaré ne correspond pas au contenu réel de l’image.');e.target.value='';return;}
 let bitmap;
 try{bitmap=await createImageBitmap(file);if(bitmap.width>4096||bitmap.height>4096)throw new Error('Dimensions trop grandes');}
 catch(err){toast('Image invalide ou dimensions trop grandes.');e.target.value='';return;}
 finally{if(bitmap)bitmap.close();}
 const ext=isPng?'png':isWebp?'webp':'jpg',path=currentUserId+'/avatar.'+ext;
 try{
  const {error:up}=await supabaseClient.storage.from('profile-photos').upload(path,file,{upsert:true,contentType:actualMime});
  if(up)throw up;
  const {error}=await supabaseClient.rpc('teste_update_profile',{p_full_name:null,p_avatar_path:path,p_update_avatar:true,p_preferences:null});
  if(error)throw error;
  currentProfile.avatar_path=path;await displayProfilePhoto(path);toast('Photo de profil mise à jour.');
 }catch(err){toast('Photo non enregistrée : '+err.message);}finally{e.target.value='';}
});
document.getElementById('savePersonal')?.addEventListener('click',async()=>{const name=document.getElementById('personalFullName').value.trim(),email=document.getElementById('personalEmail').value.trim().toLowerCase(),msg=document.getElementById('personalMessage');if(!name||name.length>80){msg.textContent='Saisissez un nom valide.';return;}if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){msg.textContent='Adresse e-mail invalide.';return;}const btn=document.getElementById('savePersonal');btn.disabled=true;try{const {error}=await supabaseClient.rpc('teste_update_profile',{p_full_name:name,p_avatar_path:null,p_update_avatar:false,p_preferences:null});if(error)throw error;currentProfile.full_name=name;const {data:{user}}=await supabaseClient.auth.getUser();if(email!==user.email){const {error:e}=await supabaseClient.auth.updateUser({email});if(e)throw e;msg.textContent='Nom enregistré. Confirmez la nouvelle adresse depuis l’e-mail reçu.';}else msg.textContent='Informations enregistrées.';document.getElementById('profileDisplayName').textContent=name;document.querySelector('.welcome h1').textContent='Bonjour, '+name;document.getElementById('profileInitials').textContent=name.split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();}catch(err){msg.textContent='Enregistrement impossible : '+err.message;}finally{btn.disabled=false;}});
function loadPreferences(saved){try{const p=saved||JSON.parse(localStorage.getItem('teste-preferences')||'{}');const theme=p.theme||(document.body.classList.contains('dark')?'dark':'light');document.getElementById('prefTheme').value=theme;document.getElementById('prefCurrency').value=p.currency||'USD';document.body.classList.toggle('dark',theme==='dark');}catch(e){}}loadPreferences();
document.getElementById('savePreferences')?.addEventListener('click',async()=>{const p={theme:document.getElementById('prefTheme').value,currency:document.getElementById('prefCurrency').value,language:'fr'};const msg=document.getElementById('preferencesMessage');try{if(!currentUserId)throw new Error('Connectez-vous pour enregistrer vos préférences.');const {error}=await supabaseClient.rpc('teste_update_profile',{p_full_name:null,p_avatar_path:null,p_update_avatar:false,p_preferences:p});if(error)throw error;currentProfile.preferences=p;try{localStorage.setItem('teste-preferences',JSON.stringify(p));}catch(e){}document.body.classList.toggle('dark',p.theme==='dark');msg.textContent='Préférences enregistrées dans votre compte.';toast('Préférences enregistrées.');}catch(err){msg.textContent='Enregistrement impossible : '+err.message;}});
document.getElementById('changePassword')?.addEventListener('click',async()=>{const a=document.getElementById('newPassword').value,b=document.getElementById('confirmPassword').value,msg=document.getElementById('securityMessage');if(a.length<8){msg.textContent='8 caractères minimum.';return;}if(a!==b){msg.textContent='Les mots de passe ne correspondent pas.';return;}const btn=document.getElementById('changePassword');btn.disabled=true;try{const {error}=await supabaseClient.auth.updateUser({password:a});if(error)throw error;document.getElementById('newPassword').value='';document.getElementById('confirmPassword').value='';msg.textContent='Mot de passe mis à jour.';}catch(err){msg.textContent='Erreur : '+err.message;}finally{btn.disabled=false;}});
async function logoutCurrent(){const {error}=await supabaseClient.auth.signOut();if(error)toast('Déconnexion impossible : '+error.message);}
document.getElementById('profileLogout')?.addEventListener('click',logoutCurrent);document.getElementById('logoutAll')?.addEventListener('click',logoutCurrent);
let pendingEnrollmentFactorId=null;
async function refreshMfaStatus(){
 const {data,error}=await supabaseClient.auth.mfa.listFactors();if(error)throw error;
 const verified=(data?.totp||[]).some(f=>f.status==='verified');
 const msg=document.getElementById('mfaStatusMessage');
 if(msg)msg.textContent=verified?'Authentification à deux facteurs activée. Un code sera demandé à chaque transfert.':'Aucun facteur TOTP vérifié. Configurez une application d’authentification avant tout transfert.';
 const button=document.getElementById('enableMfa');
 if(button)button.textContent=verified?'Ajouter une application d’authentification':'Configurer une application d’authentification';
}
document.getElementById('enableMfa')?.addEventListener('click',async()=>{
 const button=document.getElementById('enableMfa');button.disabled=true;
 try{
  const {data,error}=await supabaseClient.auth.mfa.enroll({factorType:'totp',friendlyName:'TESTE authenticator'});
  if(error)throw error;
  pendingEnrollmentFactorId=data.id;
  const qr=document.getElementById('mfaQr');qr.replaceChildren();
  new QRCode(qr,{text:data.totp.uri,width:190,height:190,colorDark:'#10251e',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
  document.getElementById('mfaEnrollment').hidden=false;
  document.getElementById('mfaSetupCode').focus();
 }catch(e){document.getElementById('mfaStatusMessage').textContent='Configuration impossible : '+e.message;}
 finally{button.disabled=false;}
});
document.getElementById('verifyMfaSetup')?.addEventListener('click',async()=>{
 const code=document.getElementById('mfaSetupCode').value.trim(),msg=document.getElementById('mfaStatusMessage'),button=document.getElementById('verifyMfaSetup');
 if(!pendingEnrollmentFactorId||!/^\\d{6}$/.test(code)){msg.textContent='Saisissez le code à 6 chiffres de votre application.';return;}
 button.disabled=true;
 try{
  const {data:challenge,error:challengeError}=await supabaseClient.auth.mfa.challenge({factorId:pendingEnrollmentFactorId});
  if(challengeError)throw challengeError;
  const {error}=await supabaseClient.auth.mfa.verify({factorId:pendingEnrollmentFactorId,challengeId:challenge.id,code});
  if(error)throw error;
  pendingEnrollmentFactorId=null;document.getElementById('mfaEnrollment').hidden=true;document.getElementById('mfaSetupCode').value='';
  await refreshMfaStatus();msg.textContent='Authentification à deux facteurs activée.';
 }catch(e){msg.textContent='Code non vérifié : '+e.message;}
 finally{button.disabled=false;}
});


async function loadServerExchangeRate(){
 const {data,error}=await supabaseClient.from('exchange_rates').select('rate').eq('pair','USD_CDF').single();
 if(error)throw error;
 const rate=Number(data?.rate);
 if(!Number.isFinite(rate)||rate<=0)throw new Error('Taux serveur invalide');
 TESTE_USD_CDF_RATE=rate;
 document.querySelectorAll('[data-rate-display]').forEach(el=>el.textContent=rate.toLocaleString('fr-FR',{maximumFractionDigits:4}));
 updateConvert();updateHomeConversion();updateSendQuote();
}
async function loadUserData(user){
 if(!user?.email_confirmed_at){await supabaseClient.auth.signOut();throw new Error('Confirmez votre adresse e-mail avant d’accéder à TESTE.');}
 const [{data:profile,error:profileError},{data:wallets,error:walletError},{data:cards,error:cardError},{data:transfers,error:transferError}]=await Promise.all([
  supabaseClient.from('profiles').select('full_name,account_number,avatar_path,preferences').eq('id',user.id).single(),
  supabaseClient.from('wallets').select('currency,balance_minor').eq('user_id',user.id),
  supabaseClient.from('test_cards').select('card_reference,label,status').eq('user_id',user.id).order('created_at',{ascending:true}).limit(1),
  supabaseClient.from('transfers').select('id,sender_id,recipient_id,sender_account,recipient_account,currency,amount_minor,status,created_at').or('sender_id.eq.'+user.id+',recipient_id.eq.'+user.id).order('created_at',{ascending:false}).limit(200)
 ]);
 if(profileError) throw profileError;
 if(walletError) throw walletError;
 if(cardError) throw cardError;
 if(transferError) throw transferError;
 try{await loadServerExchangeRate();}catch(rateError){TESTE_USD_CDF_RATE=null;toast('Taux de conversion indisponible depuis le serveur.');}
 currentProfile=profile;
 currentUserId=user.id;
 refreshMfaStatus().catch(()=>{});
 transferHistory=transfers||[];
 renderTransferHistory(user.id);
 const qrBox=document.getElementById('receiveQr');
 if(qrBox&&window.QRCode){qrBox.replaceChildren();if(/^TST[A-Z0-9]{10}$/.test(profile.account_number))new QRCode(qrBox,{text:'TESTE|'+profile.account_number,width:190,height:190,colorDark:'#10251e',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});}
 const name=profile.full_name||user.user_metadata?.full_name||'Utilisateur TESTE';
 const initials=name.split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();
 const welcomeTitle=document.querySelector('.welcome h1');
 if(welcomeTitle)welcomeTitle.textContent='Bonjour, '+name;
 const profileName=document.getElementById('profileDisplayName');if(profileName)profileName.textContent=name;
 const initialsEl=document.getElementById('profileInitials');if(initialsEl)initialsEl.textContent=initials||'T';
 document.querySelectorAll('.avatar').forEach(el=>{el.replaceChildren(document.createTextNode(initials||'T'));});
 const profileSub=document.getElementById('profileAccountLine');if(profileSub)profileSub.textContent='Compte TESTE · '+profile.account_number;
 const emailLine=document.getElementById('profileEmailLine');if(emailLine)emailLine.textContent=user.email||'';
 const personalName=document.getElementById('personalFullName');if(personalName)personalName.value=name;
 const personalEmail=document.getElementById('personalEmail');if(personalEmail)personalEmail.value=user.email||'';
 const personalAccount=document.getElementById('personalAccountNumber');if(personalAccount)personalAccount.value=profile.account_number||'';
 const securityEmail=document.getElementById('securityEmail');if(securityEmail)securityEmail.textContent=user.email||'—';
 await displayProfilePhoto(profile.avatar_path||null);
 loadPreferences(profile.preferences||null);
 const accountId=document.querySelector('#receive .receive-code strong');
 if(accountId)accountId.textContent=profile.account_number;
 const balanceMap=Object.fromEntries(wallets.map(w=>[w.currency,Number(w.balance_minor)]));
 const usd=balanceMap.USD||0,cdf=balanceMap.CDF||0;
 const balance=document.getElementById('balance');
 if(balance){lastBalanceText=money(usd,'USD');balance.textContent=hidden?'••••••':lastBalanceText;}
 const currencyValues=document.querySelectorAll('.currency-value');
 if(currencyValues[0])currencyValues[0].textContent=money(usd,'USD');
 if(currencyValues[1])currencyValues[1].textContent=money(cdf,'CDF');
 const accountCards=document.querySelectorAll('#accounts .account-card strong');
 if(accountCards[0])accountCards[0].textContent=money(usd,'USD');
 if(accountCards[1])accountCards[1].textContent=money(cdf,'CDF');
 const cardRef=cards?.[0]?.card_reference||'Référence indisponible';
 document.querySelectorAll('.mini-card .card-bottom small').forEach(el=>{el.textContent='CARTE DE TEST';});
 const cardDetails=document.querySelector('#cards .mini-card .card-bottom strong');
 if(cardDetails)cardDetails.textContent=cardRef;
 const homeCard=document.querySelector('#home .mini-card .card-bottom strong');
 if(homeCard)homeCard.textContent=cardRef;
 document.querySelectorAll('.account-foot')[0].textContent='N° '+profile.account_number+' · Solde de test';
 document.querySelectorAll('.account-foot')[1].textContent='Portefeuille de test';
 welcomeScreen.style.display='none';
 authScreen.classList.remove('open');
 showScreen('home');
}
document.getElementById('getStarted').addEventListener('click',()=>{
 welcomeScreen.style.display='none';authScreen.classList.add('open');setAuthMode('login');
});
document.getElementById('openAuth')?.addEventListener('click',()=>{authScreen.classList.add('open');setAuthMode('login')});
document.getElementById('closeAuth').addEventListener('click',()=>{authScreen.classList.remove('open');welcomeScreen.style.display='flex'});
loginTab.addEventListener('click',()=>setAuthMode('login'));
signupTab.addEventListener('click',()=>setAuthMode('signup'));
authSubmit.addEventListener('click',async()=>{
 const email=document.getElementById('localEmail').value.trim().toLowerCase();
 const password=document.getElementById('localPassword').value;
 const name=document.getElementById('localName').value.trim();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){authMessage.textContent='Saisissez une adresse e-mail valide.';return}
 if(password.length<8){authMessage.textContent='Le mot de passe doit contenir au moins 8 caractères.';return}
 if(authMode==='signup'&&!name){authMessage.textContent='Saisissez votre nom complet.';return}
 authSubmit.disabled=true;
 try{
  if(authMode==='signup'){
   const {data,error}=await supabaseClient.auth.signUp({email,password,options:{data:{full_name:name}}});
   if(error)throw error;
   if(!data.session){authMessage.textContent='Compte créé. Vérifiez votre boîte e-mail pour confirmer l’inscription, puis connectez-vous.';return;}
   await loadUserData(data.user);
   toast('Compte TESTE créé');
  }else{
   const {data,error}=await supabaseClient.auth.signInWithPassword({email,password});
   if(error)throw error;
   if(!data.user?.email_confirmed_at){await supabaseClient.auth.signOut();throw new Error('Confirmez votre adresse e-mail avant de continuer.');}
   await loadUserData(data.user);
   toast('Connexion réussie');
  }
 }catch(e){
  authMessage.textContent=e.message==='Invalid login credentials'?'Adresse e-mail ou mot de passe incorrect.':('Connexion impossible : '+(e.message||'vérifiez la configuration Supabase.'));
 }finally{authSubmit.disabled=false;}
});
supabaseClient.auth.onAuthStateChange((event,session)=>{
 if(session?.user && event==='SIGNED_IN'){
  setTimeout(()=>loadUserData(session.user).catch(e=>{authMessage.textContent='Données du compte indisponibles : '+e.message;}),0);
 }else if(event==='SIGNED_OUT'){
  currentProfile=null;currentUserId=null;transferHistory=[];welcomeScreen.style.display='flex';authScreen.classList.remove('open');
 }
});
(async()=>{
 const {data:{session},error}=await supabaseClient.auth.getSession();
 if(error){authMessage.textContent='Impossible de vérifier la session Supabase.';return;}
 if(session?.user){
  try{await loadUserData(session.user);}catch(e){welcomeScreen.style.display='none';authScreen.classList.add('open');authMessage.textContent='Le compte est connecté, mais les tables Supabase doivent être configurées : '+e.message;}
 }else{
  welcomeScreen.style.display='flex';setAuthMode('login');
 }
})();

/* QR TESTE : lecture d'un identifiant de compte, puis préremplissage du destinataire */
let testeQrScanner=null,testeQrBusy=false;
document.getElementById('openQrScanner')?.addEventListener('click',async()=>{
 const panel=document.getElementById('qrScannerPanel');
 if(testeQrScanner?.isScanning)return;
 panel.hidden=false;
 if(!window.Html5Qrcode){toast('Scanner indisponible. Saisissez le numéro manuellement.');return;}
 try{
  if(!testeQrScanner)testeQrScanner=new Html5Qrcode('qrReader',{verbose:false});
  const cameras=await Html5Qrcode.getCameras();
  if(!cameras.length)throw new Error('Aucune caméra détectée');
  await testeQrScanner.start({facingMode:'environment'},{fps:8,qrbox:{width:220,height:220}},async(decodedText)=>{
   if(testeQrBusy)return;
   const value=String(decodedText||'').trim();
   if(!/^TESTE\|TST[A-Z0-9]{10}$/i.test(value)){toast('Ce QR code ne correspond pas à un compte TESTE');return;}
   testeQrBusy=true;
   document.getElementById('recipientAccount').value=value.slice(6).toUpperCase();
   try{await testeQrScanner.stop();}catch(e){}
   panel.hidden=true;testeQrBusy=false;
   toast('Compte destinataire reconnu');
  },()=>{});
 }catch(e){try{if(testeQrScanner?.isScanning)await testeQrScanner.stop();}catch(stopError){}panel.hidden=true;toast('Caméra inaccessible. Autorisez son utilisation ou saisissez le numéro.');}
});
document.addEventListener('visibilitychange',async()=>{
 if(document.hidden&&testeQrScanner?.isScanning){try{await testeQrScanner.stop();}catch(e){}document.getElementById('qrScannerPanel').hidden=true;}
});
document.getElementById('closeQrScanner')?.addEventListener('click',async()=>{
 if(testeQrScanner?.isScanning){try{await testeQrScanner.stop();}catch(e){}}
 document.getElementById('qrScannerPanel').hidden=true;
});

const recipientInput=document.querySelector('#send input[placeholder="Nom ou adresse e-mail"]');
if(recipientInput){recipientInput.id='recipientAccount';recipientInput.placeholder='Numéro de compte TESTE';}
const transferButton=document.querySelector('#send button.primary-btn');
if(transferButton){transferButton.removeAttribute('data-toast');transferButton.id='sendTransferBtn';transferButton.textContent='Effectuer le transfert de test';}
document.getElementById('sendTransferBtn')?.addEventListener('click',async()=>{
 const recipient=document.getElementById('recipientAccount')?.value.trim().toUpperCase();
 const amount=Number(document.getElementById('sendAmount')?.value||0);
 const currency=document.getElementById('sendFrom')?.value;
 const receiveCurrency=document.getElementById('sendTo')?.value;
 if(!recipient||!/^TST[A-Z0-9]{10}$/.test(recipient)){toast('Saisissez un identifiant TESTE valide.');return;}
 if(!Number.isFinite(amount)||amount<=0){toast('Saisissez un montant valide');return;}
 if(currency!==receiveCurrency){toast('Pour ce test, choisissez la même devise des deux côtés');return;}
 const amountMinor=Math.round(amount*(currency==='USD'?100:1));
 const btn=document.getElementById('sendTransferBtn');btn.disabled=true;
 const mfaPanel=document.getElementById('transferMfaPanel'),mfaCode=document.getElementById('transferMfaCode'),mfaMessage=document.getElementById('transferMfaMessage');
 const fingerprint=[recipient,amountMinor,currency].join('|');
 try{
  const {data:factorsData,error:factorsError}=await supabaseClient.auth.mfa.listFactors();
  if(factorsError)throw factorsError;
  const factor=(factorsData?.totp||[]).find(item=>item.status==='verified');
  if(!factor){showScreen('security');toast('Activez d’abord l’authentification à deux facteurs.');return;}
  if(!pendingTransferMfa||pendingTransferMfa.fingerprint!==fingerprint){
   const {data:challenge,error:challengeError}=await supabaseClient.auth.mfa.challenge({factorId:factor.id});
   if(challengeError)throw challengeError;
   const key=pendingTransferKey?.fingerprint===fingerprint?pendingTransferKey.key:crypto.randomUUID();
   pendingTransferKey={fingerprint,key};
   pendingTransferMfa={factorId:factor.id,challengeId:challenge.id,fingerprint,key};
   mfaPanel.hidden=false;mfaMessage.textContent='Saisissez le code récent de votre application pour confirmer ce transfert.';mfaCode.value='';mfaCode.focus();
   toast('Un code de vérification est nécessaire.');return;
  }
  const code=(mfaCode.value||'').trim();
  if(!/^\\d{6}$/.test(code)){mfaPanel.hidden=false;mfaMessage.textContent='Saisissez le code à 6 chiffres.';return;}
  const {error:verifyError}=await supabaseClient.auth.mfa.verify({factorId:pendingTransferMfa.factorId,challengeId:pendingTransferMfa.challengeId,code});
  if(verifyError)throw verifyError;
  const {data,error}=await supabaseClient.rpc('teste_send_simulated_transfer',{
   p_recipient_account:recipient,p_amount_minor:amountMinor,p_currency:currency,p_idempotency_key:pendingTransferMfa.key
  });
  if(error)throw error;
  pendingTransferMfa=null;pendingTransferKey=null;mfaCode.value='';mfaPanel.hidden=true;
  toast('Transfert de test enregistré · '+String(data).slice(0,8));
  if(currentProfile){
   const {data:{user}}=await supabaseClient.auth.getUser();
   if(user){try{await loadUserData(user);}catch(refreshError){toast('Transfert enregistré. Actualisation des soldes impossible pour le moment.');}}
  }
 }catch(e){
  pendingTransferMfa=null;mfaPanel.hidden=true;
  toast(e.message||'Transfert refusé par les contrôles de sécurité');
 }finally{btn.disabled=false;}
});
document.getElementById('copyReceiveId')?.addEventListener('click',async()=>{
 const value=currentProfile?.account_number||'Connectez-vous pour afficher votre numéro';
 try{await navigator.clipboard.writeText(value);toast('Numéro de compte copié');}catch(e){toast(value);}
});

// Retraits Mobile Money : mouvement comptable atomique vers le compte central TESTE.
let pendingWithdrawal=null;
document.getElementById('withdrawSubmit')?.addEventListener('click',async()=>{
 const operator=document.querySelector('input[name="withdrawOperator"]:checked')?.value;
 const phone=(document.getElementById('withdrawPhone')?.value||'').replace(/[\\s().-]/g,'');
 const amount=Number(document.getElementById('withdrawAmount')?.value||0);
 const currency=document.getElementById('withdrawCurrency')?.value;
 const panel=document.getElementById('withdrawMfaPanel');
 const codeInput=document.getElementById('withdrawMfaCode');
 const message=document.getElementById('withdrawMfaMessage');
 const button=document.getElementById('withdrawSubmit');
 if(!/^\\+?[0-9]{9,15}$/.test(phone)){toast('Saisissez un numéro Mobile Money valide.');return;}
 if(!Number.isFinite(amount)||amount<=0){toast('Saisissez un montant valide.');return;}
 const amountMinor=Math.round(amount*(currency==='USD'?100:1));
 const fingerprint=[operator,phone,amountMinor,currency].join('|');
 button.disabled=true;
 try{
  const {data:factorsData,error:factorsError}=await supabaseClient.auth.mfa.listFactors();
  if(factorsError)throw factorsError;
  const factor=(factorsData?.totp||[]).find(item=>item.status==='verified');
  if(!factor){showScreen('security');toast('Activez d’abord l’authentification à deux facteurs.');return;}
  if(!pendingWithdrawal||pendingWithdrawal.fingerprint!==fingerprint){
   const {data:challenge,error:challengeError}=await supabaseClient.auth.mfa.challenge({factorId:factor.id});
   if(challengeError)throw challengeError;
   pendingWithdrawal={factorId:factor.id,challengeId:challenge.id,fingerprint,key:crypto.randomUUID()};
   panel.hidden=false;message.textContent='Saisissez le code récent de votre application pour confirmer le retrait.';codeInput.value='';codeInput.focus();
   toast('Un code de sécurité est nécessaire.');return;
  }
  const code=(codeInput.value||'').trim();
  if(!/^\\d{6}$/.test(code)){panel.hidden=false;message.textContent='Saisissez le code à 6 chiffres.';return;}
  const {error:verifyError}=await supabaseClient.auth.mfa.verify({factorId:pendingWithdrawal.factorId,challengeId:pendingWithdrawal.challengeId,code});
  if(verifyError)throw verifyError;
  const {data,error}=await supabaseClient.rpc('teste_mobile_money_withdrawal',{
   p_operator:operator,p_phone_number:phone,p_amount_minor:amountMinor,p_currency:currency,p_idempotency_key:pendingWithdrawal.key
  });
  if(error)throw error;
  pendingWithdrawal=null;panel.hidden=true;codeInput.value='';
  const labels={airtel_money:'Airtel Money',orange_money:'Orange Money',mpesa:'M-Pesa'};
  document.getElementById('withdrawReceiptOperator').textContent=labels[operator]||operator;
  document.getElementById('withdrawReceiptAmount').textContent=money(amountMinor,currency);
  document.getElementById('withdrawSuccess').hidden=false;
  toast('Demande de retrait enregistrée · '+String(data).slice(0,8));
  const {data:{user}}=await supabaseClient.auth.getUser();
  if(user){try{await loadUserData(user);}catch(refreshError){toast('Retrait enregistré. Actualisation des soldes indisponible.');}}
 }catch(e){
  pendingWithdrawal=null;panel.hidden=true;
  toast(e.message||'Demande de retrait refusée.');
 }finally{button.disabled=false;}
});

import {SupervisorSession} from './protected-session.js';
import {createProtectedApi} from './protected-api.js';
const session=new SupervisorSession(),$=s=>document.querySelector(s);let started=false,checking=false;
function lock(message){$('.app-layout').hidden=true;$('#message-dialog').close();$('#clients').replaceChildren();$('#message-text').value='';$('#auth-panel').hidden=false;$('#auth-message').textContent=message;$('#logout').hidden=true;$('#reload').hidden=true;delete globalThis.vpSupervisorApi;}
async function enter(){await session.manifest();globalThis.vpSupervisorApi=createProtectedApi(session);$('#auth-panel').hidden=true;$('.app-layout').hidden=false;$('#logout').hidden=false;$('#reload').hidden=false;if(!started){started=true;await import('./app.js');}else location.reload();}
$('#auth-form').addEventListener('submit',async e=>{e.preventDefault();$('#auth-submit').disabled=true;$('#auth-message').textContent='Verificando tu acceso…';try{await session.login($('#auth-email').value.trim(),$('#auth-password').value);await enter();}catch(e){lock(e.message);}finally{$('#auth-password').value='';$('#auth-submit').disabled=false;}});
$('#logout').addEventListener('click',async()=>{lock('Sesión cerrada.');await session.logout();location.reload();});
function revoke(message){lock(message);session.clear();sessionStorage.setItem('vps-access-message',message);location.reload();}
addEventListener('vp-access-lost',e=>revoke(e.detail||'Tu acceso cambió. Ingresa nuevamente.'));
async function check(){if(!started||checking||!session.session)return;checking=true;try{await session.manifest();}catch(e){revoke(e.message);}finally{checking=false;}}
setInterval(check,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});
if(session.session)enter().catch(e=>{session.clear();lock(e.message);});
else if(sessionStorage.getItem('vps-access-message')){lock(sessionStorage.getItem('vps-access-message'));sessionStorage.removeItem('vps-access-message');}

(function(root){
 'use strict';
 const C=root.WordspaceCore,$=id=>document.getElementById(id),copy=x=>JSON.parse(JSON.stringify(x));
 class ApiError extends Error {constructor(status,message,code){super(message);this.status=status;this.code=code}}
 function create({config,catalog,hooks,storage,fetch=root.fetch.bind(root)}) {
  if(!storage){try{storage=root.localStorage}catch{storage={getItem:()=>null,setItem:()=>{throw Error('storage_unavailable')},removeItem:()=>{}}}}
  const cloud=config.mode==='cloud';let session=null,user=null,profile=null,epoch=0,revision=0,dirty=false,changes=0,ready=false;
  let evidence=[];let cacheOK=true;let syncPromise=null,refreshPromise=null,timer=null,pendingEvents=[],syncedAt='',message='',conflict=null,adminPage=1,question=null,adopting=false;
  const SESSION='wordspace:session',localKey='wordspace:local:v3',cacheKey=id=>`wordspace:account:${id}`;
  const read=k=>{try{return JSON.parse(storage.getItem(k)||'null')}catch{return null}};
  const write=(k,v)=>{try{storage.setItem(k,JSON.stringify(v));return true}catch{return false}};
  const remove=k=>{try{storage.removeItem(k)}catch{}};
  const display=(id,text)=>{$(id).textContent=text};
  const notify=text=>{message=cloud&&!cacheOK?('浏览器存储不可用，未同步修改在关闭后可能丢失。 '+text.replace('本机记录已保留。','')):text;display('account-status',message);hooks.status?.()};
  function cache(extra={}){if(user&&ready){const previous=read(cacheKey(user.id));const backup=extra.conflictBackup||previous?.conflictBackup;cacheOK=write(cacheKey(user.id),{state:copy(hooks.getPlan()),revision,dirty,pendingEvents:copy(pendingEvents),syncedAt,...(backup?{conflictBackup:backup}:{}),...extra});$('download-backup').hidden=!backup;}}
  function setStudyBusy(value){adopting=value;$('known').disabled=value;$('unknown').disabled=value;}
  function lock(text=''){
   setStudyBusy(false);evidence=[];display('assessment-stats','检测记录尚未加载。');
   ready=false;question=null;hooks.stop();$('assessment-options').replaceChildren();display('assessment-word','');display('assessment-feedback','');$('proposal-list').replaceChildren();$('download-backup').hidden=true;$('study-main').hidden=true;$('account-gate').hidden=false;$('admin-panel').hidden=true;
   $('admin-users').replaceChildren();$('manage-users').hidden=true;$('open-coach').hidden=true;display('auth-message',text);
  }
  function choice(text,buttons){lock();$('auth-form').hidden=true;$('auth-choice').hidden=false;display('choice-message',text);
   for(const id of ['import-legacy','start-fresh','conflict-cloud','conflict-local'])$(id).hidden=!buttons.includes(id);
  }
  function showStudy(state){
   if(!C.validatePlan(state,catalog))throw Error('云端进度格式不正确，已保留本机记录，请联系管理员。');
   ready=true;hooks.setPlan(C.migratePlan(state,catalog));$('account-gate').hidden=true;$('auth-choice').hidden=true;$('auth-form').hidden=false;$('study-main').hidden=false;
   $('logout').hidden=!cloud;$('sync-now').hidden=!cloud;$('proposal-panel').hidden=!cloud;
   $('manage-users').hidden=profile?.role!=='admin';$('open-coach').hidden=!cloud||profile?.role!=='admin'||(config.ownerId&&config.ownerId!==user?.id)||!validCoachURL(config.coachUrl);
   display('account-label',cloud?user.email:'本地学习');hooks.render();cache();void refreshEvidence();
  }
  function validCoachURL(value){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='chatgpt.com'&&u.pathname.startsWith('/g/')}catch{return false}}
  async function publicRequest(path,payload,token){
   const response=await fetch(config.supabaseUrl+path,{method:payload===undefined?'GET':'POST',headers:{apikey:config.publicKey,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(payload===undefined?{}:{body:JSON.stringify(payload)}),signal:AbortSignal.timeout(12000)});
   let data;try{data=await response.json()}catch{data=null}
   if(!response.ok)throw new ApiError(response.status,data?.message||data?.error_description||data?.msg||data?.error||'请求未成功',data?.error_code||data?.code);return data;
  }
  async function freshToken(){
   if(!session)throw new ApiError(401,'请重新登录');
   if(session.expiresAt>Date.now()+60000)return session.access_token;
   if(!refreshPromise){const e=epoch,previous=session;refreshPromise=publicRequest('/auth/v1/token?grant_type=refresh_token',{refresh_token:previous.refresh_token}).then(data=>{
    if(epoch!==e)throw Error('账号已切换');if((user?.id||previous.userId)&&data.user?.id!==(user?.id||previous.userId))throw new ApiError(401,'登录会话身份变化，请重新登录。');storeSession(data);return session.access_token;
   }).catch(error=>{if(['refresh_token_not_found','refresh_token_already_used','refresh_token_expired','invalid_refresh_token','session_not_found','session_expired','user_not_found','user_banned','bad_jwt'].includes(error.code))throw new ApiError(401,'登录已失效，请重新登录。');throw error}).finally(()=>{if(epoch===e)refreshPromise=null})}
   return refreshPromise;
  }
  async function api(path,payload){const e=epoch,token=await freshToken();const data=await publicRequest(path,payload,token);if(e!==epoch)throw Error('账号已切换');return data}
  function storeSession(data){if(!data?.access_token||!data?.refresh_token)throw Error('登录会话不完整');
   session={userId:data.user?.id||session?.userId,access_token:data.access_token,refresh_token:data.refresh_token,expiresAt:data.expires_at?data.expires_at*1000:Date.now()+(data.expires_in||3600)*1000};write(SESSION,session);
  }
  function authError(error){
   const text=error?.message||'网络暂不可用，请重试';
   if(/account_disabled|access_denied/.test(text)||error.status===403)return '账号已停用或无权限，请联系管理员。';
   if(/Email not confirmed/i.test(text))return '请先打开验证邮件，验证邮箱后再登录。';
   if(/Invalid login credentials/i.test(text))return '邮箱或密码不正确。';return text;
  }
  async function loadUser(){
   const e=epoch;user=await api('/auth/v1/user');if(e!==epoch)return;
   if(session&&user?.id){session.userId=user.id;write(SESSION,session);}
   if(!user?.id||!user.email_confirmed_at)throw Error('请先验证邮箱后登录。');
   const profiles=await api(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,email,role,enabled`);profile=profiles[0];
   if(!profile?.enabled)throw new ApiError(403,'account_disabled');
   const rows=await api('/rest/v1/word_catalog?select=*&reviewed=eq.true&order=id&limit=1000');hooks.mergeCatalog(rows);
   const remote=(await api(`/rest/v1/study_progress?user_id=eq.${encodeURIComponent(user.id)}&select=state,revision,updated_at`))[0]||null;
   const saved=read(cacheKey(user.id));revision=remote?.revision||0;syncedAt=remote?.updated_at||'';pendingEvents=Array.isArray(saved?.pendingEvents)?saved.pendingEvents.filter(e=>e&&typeof e.p_event_id==='string'&&typeof e.p_word_id==='string'&&typeof e.p_choice_id==='string'&&typeof e.p_assisted==='boolean'):[];
   if(saved?.dirty&&C.validatePlan(saved.state,catalog)){
    if(saved.revision!==revision){conflict={local:copy(saved.state),remote};choice('另一台设备的进度已更新。本机进度会保留备份，请选择要继续的版本。',['conflict-cloud','conflict-local']);return}
    dirty=true;showStudy(saved.state);notify('待同步本机进度');void flush();return;
   }
   if(remote){if(!C.validatePlan(remote.state,catalog))throw Error('云端进度暂不能读取，未覆盖本机记录。');dirty=false;showStudy(remote.state);if(pendingEvents.length){notify('待同步检测结果');void flush()}else notify(`已同步 · ${new Date(syncedAt).toLocaleString()}`);void refreshProposals();return}
   if(saved?.revision>0){conflict={local:saved.state,remote:null};choice('云端记录暂未找到，本机备份已保留。',['conflict-cloud','conflict-local']);return}
   const owner=read('wordspace:legacyOwner');
   if(hooks.legacyExists()&&(!owner||owner===user.id)){
    choice('本浏览器有旧学习记录。仅在这是你本人的记录时导入，避免共用设备串入他人进度。',['import-legacy','start-fresh']);return;
   }
   beginNew(false);
  }
  function beginNew(importOld){
   const state=importOld?hooks.loadLegacy():hooks.emptyPlan();
   if(importOld)write('wordspace:legacyOwner',user.id);dirty=true;changes++;
   showStudy(state);notify('待同步');void flush();
  }
  function persist(state){
   if(!cloud){if(!write(localKey,state))notify('本地存储不可用，刷新后可能丢失。');else notify('本地模式 · 仅保存在当前浏览器，云端账号尚未配置。');return}
   if(!ready||!user)return;dirty=true;changes++;cache();notify('待同步 · 正在保存本机记录');clearTimeout(timer);timer=setTimeout(()=>void flush(),300);
  }
  async function flush(){
   if(!cloud||!ready||!user||conflict)return false;
   if(syncPromise)return syncPromise;
   if(!dirty&&!pendingEvents.length)return true;
   const e=epoch;let success=false;syncPromise=(async()=>{
    try{
     if(dirty){const change=changes,state=copy(hooks.getPlan());const result=await api('/rest/v1/rpc/save_progress',{p_expected_revision:revision,p_state:state});
      if(e!==epoch)return false;revision=result.revision;syncedAt=result.updated_at;dirty=changes!==change;cache();
     }
     while(pendingEvents.length){const event=pendingEvents[0];await api('/rest/v1/rpc/submit_assessment',event);if(e!==epoch)return false;pendingEvents.shift();cache()}
     success=true;if(!dirty)notify(`已同步 · ${new Date(syncedAt||Date.now()).toLocaleString()}`);else notify('待同步 · 还有新作答');return !dirty;
    }catch(error){
     if(e!==epoch)return false;
     if(error.status===409){
      const remote=(await api(`/rest/v1/study_progress?user_id=eq.${encodeURIComponent(user.id)}&select=state,revision,updated_at`))[0]||null;
      const local=copy(hooks.getPlan());cache({conflictBackup:local});conflict={local,remote};choice('云端已被其他设备更新。本机进度已保留备份，请选择。',['conflict-cloud','conflict-local']);notify('同步冲突 · 等待选择');
     }else if(error.status===403){cache();lock(authError(error));notify('账号无权限，已停止云端同步');}
     else if(error.status===401){cache();remove(SESSION);session=null;lock('登录已失效，请重新登录；本机待同步记录已保留。');}
     else{cache();notify('待同步 · 网络或服务暂不可用，本机记录已保留。')}
     return false;
    }finally{if(e===epoch){syncPromise=null;if(dirty&&ready&&!conflict&&success){clearTimeout(timer);timer=setTimeout(()=>void flush(),50)}}}
   })();return syncPromise;
  }
  async function resolveConflict(useLocal){
   if(!conflict)return;const {local,remote}=conflict;
   if(!useLocal&&remote&&!C.validatePlan(remote.state,catalog)){display('auth-message','云端格式不正确，请保留本机备份并联系管理员。');return}
   revision=remote?.revision||0;const backup=copy(local);conflict=null;dirty=useLocal;changes++;
   showStudy(useLocal?local:remote?.state||hooks.emptyPlan());cache({conflictBackup:backup});notify(useLocal?'待同步 · 使用本机版本':'已加载云端，本机版本另存备份');if(useLocal)await flush();
  }
  async function logout(){
   cache();const token=session?.access_token;epoch++;clearTimeout(timer);syncPromise=null;refreshPromise=null;user=null;profile=null;session=null;conflict=null;dirty=false;pendingEvents=[];remove(SESSION);lock();
   $('auth-form').hidden=false;$('auth-choice').hidden=true;$('password-form').hidden=true;display('account-label','尚未登录');$('logout').hidden=true;$('sync-now').hidden=true;notify('已退出，本机未同步副本保留在原账号下。');
   if(token)publicRequest('/auth/v1/logout?scope=local',{},token).catch(()=>{});
  }
  async function signIn(event){
   event?.preventDefault();if(!$('auth-form').reportValidity())return;
   const e=++epoch;$('auth-signin').disabled=true;display('auth-message','正在登录…');
   try{const data=await publicRequest('/auth/v1/token?grant_type=password',{email:$('auth-email').value.trim(),password:$('auth-password').value});if(e!==epoch)return;storeSession(data);await loadUser()}
   catch(error){if(e===epoch)lock(authError(error))}finally{$('auth-password').value='';$('auth-signin').disabled=false}
  }
  async function resume(){
   const operationEpoch=epoch;
   if(!cloud){hooks.rollover();return}
   if(!ready||!session||!user||adopting)return;
   try{const row=(await api(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,email,role,enabled`))[0];if(!row?.enabled){cache();lock('账号已停用，请联系管理员。');return}
    if(adopting)return;profile=row;if(dirty||pendingEvents.length){await flush();if(!ready)return}
    const remote=(await api(`/rest/v1/study_progress?user_id=eq.${encodeURIComponent(user.id)}&select=state,revision,updated_at`))[0];
    if(adopting)return;
    if(remote&&remote.revision!==revision){if(dirty)return;revision=remote.revision;syncedAt=remote.updated_at;showStudy(remote.state);notify('已同步最新云端进度')}
    hooks.rollover();void refreshProposals();
   }catch(error){if(operationEpoch!==epoch)return;if(error.status===401){cache();remove(SESSION);session=null;lock('登录已失效，请重新登录；本机待同步记录已保留。')}else notify('网络暂不可用，继续保留本机进度。')}
  }
  async function manageUsers(){
   if(profile?.role!=='admin')return;$('admin-panel').hidden=false;$('study-main').hidden=true;
   try{const result=await api(`/functions/v1/admin/users?page=${adminPage}&search=${encodeURIComponent($('admin-search').value.trim())}`);$('admin-users').replaceChildren();
    for(const person of result.users){const row=document.createElement('div');row.className='admin-person';const label=document.createElement('p');label.textContent=`${person.email} · ${person.enabled?'正常':'已停用'}${person.role==='admin'?' · 管理员':''}`;
     const button=document.createElement('button');button.textContent=person.enabled?'停用账号':'恢复账号';button.disabled=person.role==='admin'||person.id===user.id;
     button.addEventListener('click',async()=>{button.disabled=true;try{await api('/functions/v1/admin/status',{user_id:person.id,enabled:!person.enabled});await manageUsers()}catch(error){display('admin-message',authError(error));button.disabled=false}});row.append(label,button);$('admin-users').append(row)
    }
    display('admin-page',`第 ${result.page} 页 · 共 ${result.total} 人`);$('admin-prev').disabled=adminPage===1;$('admin-next').disabled=adminPage*20>=result.total;display('admin-message','');
   }catch(error){display('admin-message',authError(error))}
  }
  async function refreshEvidence(){
   const evidenceEpoch=epoch;
   if(cloud){if(!ready||!user)return;evidence=[];display('assessment-stats','正在读取本账号的检测记录…');try{const rows=await api('/rest/v1/assessment_events?select=word_id,correct,assisted,created_at&order=created_at.desc&limit=100');if(evidenceEpoch!==epoch||!ready)return;evidence=rows}catch{if(evidenceEpoch===epoch&&ready){evidence=[];display('assessment-stats','检测记录暂不可用，可继续学习或稍后重试。')}return}}
   else evidence=read('wordspace:local:evidence')||[];
   const stats=C.evidenceStats(evidence);
   display('assessment-stats',`近期检测：最新答对 ${stats.tested_correct_count} 词，延迟复测通过 ${stats.delayed_pass_count} 词，待复测 ${stats.due_ids.length} 词。仅反映已有样本。`);
  }
  function startAssessment(){
   if(cloud&&(!ready||adopting))return;const pool=catalog.filter(w=>w.reviewed!==false);const due=C.evidenceStats(evidence).due_ids.find(id=>id!==question?.word?.id);const chosen=pool.find(w=>w.id===due)||pool[Math.floor(Math.random()*pool.length)];const options=[chosen,...pool.filter(w=>w.id!==chosen.id).sort(()=>Math.random()-.5).slice(0,3)].sort(()=>Math.random()-.5);
   question={id:crypto.randomUUID(),word:chosen,done:false};display('assessment-word',chosen.word);display('assessment-feedback','请选择中文释义；选定后再显示答案。');$('assessment-options').replaceChildren();
   for(const option of options){const button=document.createElement('button');button.textContent=option.meaning;button.addEventListener('click',()=>void answerAssessment(option));$('assessment-options').append(button)}
  }
  async function answerAssessment(option){
   if(!question||question.done||(cloud&&(!ready||adopting)))return;question.done=true;const result=C.scoreAssessment(catalog,question.word.id,option.id);$('assessment-options').querySelectorAll('button').forEach(b=>b.disabled=true);
   const payload={p_event_id:question.id,p_word_id:question.word.id,p_choice_id:option.id,p_assisted:false};
   display('assessment-feedback',`${result.correct?'答对了':'再记一遍'}：${question.word.meaning}。${cloud?'检测结果待同步。':'检测只保存在本机。'}`);
   if(cloud){pendingEvents.push(payload);cache();notify('待同步检测结果');await flush();await refreshEvidence()}
   else{const saved=read('wordspace:local:evidence')||[];saved.push({...result,id:question.id,created_at:new Date().toISOString(),assisted:false});write('wordspace:local:evidence',saved.slice(-1000));void refreshEvidence()}
  }
  async function refreshProposals(){
   if(!cloud||!ready)return;
   try{const rows=await api(`/rest/v1/recommendations?select=id,status,progress_revision,word_ids,rationale,expires_at&status=eq.pending&order=created_at.desc&limit=10`);
    $('proposal-list').replaceChildren();display('proposal-message',rows.length?'推荐只在你采用后用于下一学习日。':'暂未收到推荐。可前往专属 GPT 请求安排下一次学习。');
    for(const proposal of rows){const block=document.createElement('div'),text=document.createElement('p');text.textContent=`${proposal.word_ids.join(' · ')}\n${proposal.rationale}`;const adopt=document.createElement('button');adopt.textContent='采用到下一学习日';const ignore=document.createElement('button');ignore.textContent='忽略';
     adopt.disabled=proposal.progress_revision!==revision||new Date(proposal.expires_at)<new Date();if(adopt.disabled){const stale=document.createElement('p');stale.textContent='进度已变化或建议过期，请让助手重新生成。';block.append(stale)}
     adopt.addEventListener('click',async()=>{if(adopting)return;const e=epoch;adopt.disabled=true;setStudyBusy(true);try{if(!await flush())throw Error('请先同步当前作答');const updated=await api('/rest/v1/rpc/adopt_recommendation',{p_id:proposal.id,p_expected_revision:revision});if(e!==epoch)return;revision=updated.revision;syncedAt=updated.updated_at;dirty=false;showStudy(updated.state);notify('已同步 · 推荐将在下一学习日生效');await refreshProposals()}catch(error){if(e===epoch)display('proposal-message',error.status===409?'建议已过期，请重新生成。':authError(error))}finally{if(e===epoch)setStudyBusy(false)}});
     ignore.addEventListener('click',async()=>{try{await api('/rest/v1/rpc/dismiss_recommendation',{p_id:proposal.id});await refreshProposals()}catch(error){display('proposal-message',authError(error))}});
     block.append(text,adopt,ignore);$('proposal-list').append(block)
    }
   }catch(error){display('proposal-message','暂时无法读取推荐，现有学习任务保留。')}
  }
  async function boot(){
   const bootEpoch=epoch;
   $('download-backup').addEventListener('click',()=>{if(!user||!ready)return;const backup=read(cacheKey(user.id))?.conflictBackup;if(!backup)return;const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='wordspace-progress-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
   $('auth-form').addEventListener('submit',signIn);$('logout').addEventListener('click',logout);$('sync-now').addEventListener('click',()=>void flush());
   $('import-legacy').addEventListener('click',()=>beginNew(true));$('start-fresh').addEventListener('click',()=>beginNew(false));
   $('conflict-cloud').addEventListener('click',()=>void resolveConflict(false));$('conflict-local').addEventListener('click',()=>{if(confirm('确认用本机记录替换云端？两份记录会先保留本机备份。'))void resolveConflict(true)});
   $('auth-signup').addEventListener('click',async()=>{if(!$('auth-form').reportValidity())return;try{await publicRequest(`/auth/v1/signup?redirect_to=${encodeURIComponent(config.siteUrl||location.origin+location.pathname)}`,{email:$('auth-email').value.trim(),password:$('auth-password').value});display('auth-message','注册请求已提交，请检查邮箱中的确认邮件，验证后登录。')}catch(e){display('auth-message',authError(e))}finally{$('auth-password').value=''}});
   $('auth-recover').addEventListener('click',async()=>{if(!$('auth-email').reportValidity())return;try{await publicRequest(`/auth/v1/recover?redirect_to=${encodeURIComponent(config.siteUrl||location.origin+location.pathname)}`,{email:$('auth-email').value.trim()});display('auth-message','如果邮箱已注册，将收到重置邮件。')}catch(e){display('auth-message',authError(e))}});
   $('password-form').addEventListener('submit',async event=>{event.preventDefault();if(!$('password-form').reportValidity())return;try{const token=await freshToken();const response=await fetch(config.supabaseUrl+'/auth/v1/user',{method:'PUT',headers:{apikey:config.publicKey,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({password:$('new-password').value})});if(!response.ok)throw Error('密码未能更新，请重试。');$('new-password').value='';$('password-form').hidden=true;$('auth-form').hidden=false;await loadUser()}catch(e){display('auth-message',authError(e))}});
   $('manage-users').addEventListener('click',()=>{adminPage=1;void manageUsers()});$('admin-search-btn').addEventListener('click',()=>{adminPage=1;void manageUsers()});$('admin-prev').addEventListener('click',()=>{adminPage--;void manageUsers()});$('admin-next').addEventListener('click',()=>{adminPage++;void manageUsers()});$('admin-close').addEventListener('click',()=>{$('admin-panel').hidden=true;if(ready)$('study-main').hidden=false});
   $('open-coach').addEventListener('click',async()=>{const tab=window.open('about:blank','_blank');if(tab)tab.opener=null;try{if(!await flush())throw Error('尚未同步成功，请先同步再打开学习助手。');if(validCoachURL(config.coachUrl)){if(tab)tab.location.href=config.coachUrl;else notify('浏览器拦截了新窗口，请允许弹出后再试。')}}catch(e){tab?.close();notify(authError(e))}});
   $('assessment-start').addEventListener('click',startAssessment);$('proposal-refresh').addEventListener('click',()=>void refreshProposals());
   if(!cloud){ready=true;hooks.setPlan(hooks.loadLegacy());$('study-main').hidden=false;display('account-label','本地学习');notify('本地模式 · 仅保存在当前浏览器，云端账号尚未配置。');hooks.render();hooks.rollover();persist(hooks.getPlan());void refreshEvidence();return}
   lock('');display('account-label','尚未登录');
   if(!/^https:\/\//.test(config.supabaseUrl||'')||!config.publicKey){display('auth-message','云端配置未完成，未进行登录或上传。');$('auth-signin').disabled=true;return}
   const params=new URLSearchParams(location.hash.slice(1)),isRecovery=params.get('type')==='recovery';
   if(params.has('access_token')&&params.has('refresh_token')){storeSession({access_token:params.get('access_token'),refresh_token:params.get('refresh_token'),expires_in:Number(params.get('expires_in'))||3600});history.replaceState(null,'',location.pathname+location.search)}else session=read(SESSION);
   if(!session)return;
   try{if(isRecovery){user=await api('/auth/v1/user');$('password-form').hidden=false;$('auth-form').hidden=true;display('auth-message','请设置新密码。');return}await loadUser()}catch(e){if(bootEpoch!==epoch)return;lock(authError(e));if(e.status===401){session=null;remove(SESSION)}}
  }
  return {boot,persist,flush,resume,status:()=>message,canStudy:()=>ready&&!adopting};
 }
 root.WordspaceAccount={create};
})(globalThis);

import {scopedQuery} from './scoped-query.js';
export function createProtectedApi(session){
 const cache=new Map();
 return async(path,options={})=>{
  let authorized=false;
  try{
   const manifest=await session.manifest(),u=new URL(path,'https://local.invalid');
   authorized=true;
   if(u.pathname==='/api/context')return manifest.context;
   if(u.pathname==='/api/reload'){cache.clear();return {ok:true};}
   if(u.pathname==='/api/lists'&&options.method==='POST'){const body=JSON.parse(options.body);u.searchParams.set('scope',body.scopeId);u.searchParams.set('seller',body.seller);}
   const scope=u.searchParams.get('scope'),row=manifest.scopeRows.find(r=>r.scope_id===scope);
   if(!row)throw Error('Equipo fuera de tu acceso');
   const key=manifest.releaseId+'|'+scope+'|'+row.sha256;
   if(!cache.has(key)){const data=await session.snapshot(scope,manifest);cache.clear();cache.set(key,data);}
   return scopedQuery(cache.get(key),u.pathname+'?'+u.searchParams,options);
  }catch(e){cache.clear();if(!authorized&&typeof dispatchEvent==='function')dispatchEvent(new CustomEvent('vp-access-lost',{detail:e.message}));throw e;}
 };
}

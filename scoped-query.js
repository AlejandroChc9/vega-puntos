import {normal,currentAccount,filterOpportunities,collectionReport,capture,generateMessages,portfolioSummary} from './core.mjs';
export function scopedQuery(model,path,options={}){
 const u=new URL(path,'https://local.invalid'),scope=u.searchParams.get('scope'),seller=u.searchParams.get('seller')||'';
 const allowed=model.catalog.scopes;
 if(!allowed.some(s=>s.id===scope))throw Error('Equipo fuera de tu acceso');
 const s=allowed.find(s=>s.id===scope);
 if(seller&&!s.sellers.includes(seller))throw Error('Vendedor fuera de tu equipo');
 const unique=new Map();
 for(const a of model.catalog.assignments.filter(a=>a.scopeId===scope&&(!seller||a.seller===seller))){
  const c=currentAccount(model.catalog,model.history,a.code);if(!c)continue;
  if(!unique.has(a.code))unique.set(a.code,{...c,seller:a.seller,days:[...a.days],zone:a.zone});
  else unique.get(a.code).days=[...new Set([...unique.get(a.code).days,...a.days])];
 }
 let rows=[...unique.values()];
 const q=u.searchParams,day=q.get('day'),filters={pointsOnly:q.get('pointsOnly')==='1',minPct:q.has('minPct')?Number(q.get('minPct')):null,maxPct:q.has('maxPct')?Number(q.get('maxPct')):null,day:day==null||day===''?null:Number(day)};
 if(u.pathname==='/api/clients'||u.pathname==='/api/client-codes'){
  const portfolio=portfolioSummary(rows);
  const fold=v=>v.normalize('NFD').replace(/\p{Diacritic}/gu,'').toUpperCase(),search=fold(q.get('q')||'');
  rows=filterOpportunities(rows,filters).filter(c=>fold(c.code+' '+c.name).includes(search));
  rows.sort((a,b)=>(b.points?.remaining>0)-(a.points?.remaining>0)||(b.points?.remaining??0)-(a.points?.remaining??0)||(a.gap??Infinity)-(b.gap??Infinity)||a.name.localeCompare(b.name,'es'));
  if(u.pathname==='/api/client-codes')return {codes:rows.map(c=>c.code),total:rows.length};
  const offset=Math.max(0,Number(q.get('offset'))||0);
  return {rows:rows.slice(offset,offset+30),total:rows.length,hasMore:offset+30<rows.length,portfolioSummary:portfolio,summary:{uniqueClients:rows.length,pointsClients:rows.filter(c=>c.points?.remaining>0).length,remainingReported:rows.reduce((n,c)=>n+(c.points?.remaining??0),0)}};
 }
 if(u.pathname==='/api/point-tracking'){
  const report=collectionReport(model.history,rows,{day:q.get('cut'),result:q.get('result')||'used'}),offset=Math.max(0,Number(q.get('offset'))||0);
  return {...report,rows:report.rows.slice(offset,offset+30),hasMore:offset+30<report.rows.length};
 }
 if(u.pathname==='/api/lists'&&options.method==='POST'){
  const b=JSON.parse(options.body||'{}');
  if(b.scopeId!==scope||b.seller!==seller||!s.sellers.includes(seller))throw Error('Preparación fuera de tu equipo');
  const filtered=filterOpportunities(rows,b.filters||{}),map=new Map(filtered.map(c=>[normal(c.code),c]));
  if(!Array.isArray(b.codes)||!b.codes.length||b.codes.some(c=>!map.has(normal(c))))throw Error('Clientes fuera del filtro o equipo');
  const chosen=[...new Set(b.codes.map(normal))].map(c=>capture(map.get(c))).sort((a,b)=>(b.points?.remaining??0)-(a.points?.remaining??0));
  const messages=generateMessages({seller,rows:chosen,meta:model.catalog.meta,filters:b.filters||{}});
  return {id:crypto.randomUUID(),seller,rows:chosen,messages};
 }
 throw Error('Operación no disponible');
}

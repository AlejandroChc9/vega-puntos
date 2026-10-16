import {formatPoints} from './point-format.js';
export const normal=v=>String(v??'').trim().replace(/^0+(?=\d)/,'');
export const money=v=>v==null?'Sin dato':'S/ '+Number(v).toLocaleString('es-PE',{minimumFractionDigits:0,maximumFractionDigits:2});
export const points=formatPoints;
export const advancePercent=c=>Number.isFinite(c.advance)&&Number.isFinite(c.quota)&&c.quota>0?Math.round(c.advance/c.quota*10000)/100:null;
export function portfolioSummary(rows){
 const all=[...new Map(rows.map(c=>[normal(c.code),c])).values()],known=all.filter(c=>Number.isFinite(c.points?.remaining));
 return {uniqueClients:all.length,pointsClients:all.filter(c=>c.points?.remaining>0).length,remainingReported:!all.length?0:known.length?Math.round(known.reduce((n,c)=>n+Math.max(0,c.points.remaining),0)*10000)/10000:null,missingPointsClients:all.length-known.length};
}
export function at(snapshots,cut){return snapshots.filter(s=>s.cut<=cut).at(-1)??null;}
export function currentAccount(catalog,history,key){
 const a=catalog.accounts[normal(key)];if(!a)return null;
 const sales=history.sales.at(-1),point=history.points.at(-1),s=sales.rows[normal(key)],p=point.rows[normal(key)];
 const projectionPct=Number.isFinite(a.projectedPurchase)&&Number.isFinite(a.quota)&&a.quota>0?Math.round(a.projectedPurchase/a.quota*10000)/100:null;
 const [year,month,day]=sales.cut.split('-').map(Number),remainingDays=new Date(Date.UTC(year,month,0)).getUTCDate()-day;
 const daily={requiredDaily:a.quota!=null&&s?.[0]!=null?(a.requiredDaily??null):null,remainingDays};
 return {...a,...daily,projectionPct,advancePct:advancePercent({advance:s?.[0]??null,quota:a.quota}),basePointsAtQuota:Number.isFinite(a.quota)&&a.quota>0?Math.floor(a.quota/100):null,advance:s?.[0]??null,reportedPoints:s?.[1]??null,points:p?{earned:p[0],used:p[1],remaining:p[2]}:null,salesCut:sales.cut,pointsCut:point.cut,salesHash:sales.sha256,pointsHash:point.sha256,cycle:sales.cycle,pointsCycle:point.cycle,balanceConfirmed:false,gap:a.quota==null||s?.[0]==null?null:Math.max(0,a.quota-s[0])};
}
export function filterOpportunities(rows,{pointsOnly=false,minPct=null,maxPct=null,day=null}={}){
 if((minPct!=null&&(!Number.isFinite(minPct)||minPct<0||minPct>100))||(maxPct!=null&&(!Number.isFinite(maxPct)||maxPct<0||maxPct>100))||(minPct!=null&&maxPct!=null&&minPct>maxPct))throw Error('Rango de avance inválido');
 if(day!=null&&(!Number.isInteger(day)||day<0||day>6))throw Error('Día de visita inválido');
 return rows.filter(c=>{const pct=advancePercent(c);return (!pointsOnly||c.points?.remaining>0)&&(minPct==null||(pct!=null&&pct>=minPct))&&(maxPct==null||(pct!=null&&pct<=maxPct))&&(day==null||c.days?.includes(day));});
}
export function difference(old,current){
 if(old.cycle!==current.cycle||old.pointsCycle!==current.pointsCycle)return {status:'cycle-changed',advance:null,used:null,balance:null,salesStatus:'cycle-changed',pointsStatus:'cycle-changed'};
 const comparableSales=current.salesCut>old.salesCut,comparablePoints=current.pointsCut>old.pointsCut;
 const numeric=(a,b)=>Number.isFinite(a)&&Number.isFinite(b);
 const advance=comparableSales&&numeric(old.advance,current.advance)?Math.round((current.advance-old.advance)*100)/100:null;
 const used=comparablePoints&&numeric(old.points?.used,current.points?.used)?Math.round((current.points.used-old.points.used)*10000)/10000:null;
 const balance=comparablePoints&&numeric(old.points?.remaining,current.points?.remaining)?Math.round((current.points.remaining-old.points.remaining)*10000)/10000:null;
 const salesStatus=!comparableSales?'waiting':advance==null?'missing':advance<0?'adjustment':advance>0?'progress':'unchanged';
 const pointsStatus=!comparablePoints?'waiting':used==null?'missing':used<0?'adjustment':used>0?'used':'unchanged';
 const salesRevision=old.salesCut===current.salesCut&&old.salesHash&&current.salesHash&&old.salesHash!==current.salesHash;
 const pointsRevision=old.pointsCut===current.pointsCut&&old.pointsHash&&current.pointsHash&&old.pointsHash!==current.pointsHash;
 return {status:salesStatus==='waiting'&&pointsStatus==='waiting'&&!salesRevision&&!pointsRevision?'waiting':'updated',advance,used,balance,salesStatus:salesRevision?'revision':salesStatus,pointsStatus:pointsRevision?'revision':pointsStatus,quotaChanged:old.quota!==current.quota,reached:current.quota!=null&&current.advance!=null&&current.advance>=current.quota,newlyReached:old.quota!=null&&old.advance!=null&&old.advance<old.quota&&current.advance>=current.quota&&old.quota===current.quota};
}
export function generateMessage({seller,rows,meta,filters={}}){
 const weekdays=['lunes','martes','miércoles','jueves','viernes','sábado','domingo'];
 const out=[`*VEGA PUNTOS · ${seller}*`,filters.day!=null?`*Oportunidades para tu visita del ${weekdays[filters.day]}*`:'*Oportunidades para tu recorrido*',`Compra al ${meta.salesCut} · puntos al ${meta.pointsCut}`,''];
 const pending=rows.filter(c=>c.points?.remaining>0),rest=rows.filter(c=>!(c.points?.remaining>0));
 if(pending.length){out.push('*PRIMERO: REVISAR PUNTOS POR COBRAR*','Setiembre / ajuste x2: vigencia hasta 31/10. Confirmar saldo canjeable antes de ofrecerlo.','');}
 const add=c=>{
  out.push(`*${c.name} · ${c.code}*`);
  if(c.points?.remaining>0)out.push(`Saldo reportado: *${points(c.points.remaining)}*, equivalente a ${money(c.points.remaining)} de descuento si se confirma vigente.`);
  const actual=advancePercent(c);if(actual!=null)out.push(`Avance ${actual.toLocaleString('es-PE',{maximumFractionDigits:2})}% de cuota.`);
  if(c.gap==null)out.push('Avance de cuota sin dato oficial; revisar.');
  else if(c.gap>0){
   out.push(`Compra: ${money(c.advance)} / cuota ${money(c.quota)}.`,`Faltan *${money(c.gap)}*.`);
   if(c.basePointsAtQuota!=null)out.push(`*${points(c.basePointsAtQuota)} base si cierra cuota Oct.*`);
  }else out.push(`Cuota Oct. alcanzada · ${points(c.reportedPoints)} reportados en el nuevo ciclo.`);
  out.push('');
 };
 pending.forEach(add);if(rest.length){out.push('*AVANZAR HACIA LA CUOTA DE OCTUBRE*','');rest.forEach(add);}
 out.push('VP mostrados redondeados a enteros. VP al cierre: estimados, sujetos a validación y aún no disponibles. Compra válida con IGV. Canje hasta 50% de la compra elegible. No participan P&G, arroz/azúcar a granel ni Panetón Vega.');
 return out.join('\n');
}
export function capture(a){return {code:a.code,name:a.name,quota:a.quota,advance:a.advance,projectedPurchase:a.projectedPurchase??null,projectionPct:a.projectionPct??null,requiredDaily:a.requiredDaily??null,remainingDays:a.remainingDays??null,basePointsAtQuota:a.basePointsAtQuota??null,reportedPoints:a.reportedPoints,points:a.points,salesCut:a.salesCut,pointsCut:a.pointsCut,salesHash:a.salesHash,pointsHash:a.pointsHash,cycle:a.cycle,pointsCycle:a.pointsCycle,gap:a.gap};}

// Readability target for each copyable message, not a WhatsApp service limit.
export function generateMessages({seller,rows,meta,filters={},targetChars=3500}){
 if(!rows.length)throw Error('Selecciona al menos un cliente');
 const unique=new Set(rows.map(r=>normal(r.code)));if(unique.size!==rows.length)throw Error('Cliente duplicado en el envío');
 const groups=[];let group=[];
 const text=rs=>generateMessage({seller,rows:rs,meta,filters});
 for(const row of rows){if(group.length&&text([...group,row]).length>targetChars-100){groups.push(group);group=[];}group.push(row);}
 if(group.length)groups.push(group);
 const messages=groups.map((rs,i)=>{const value=`*Mensaje ${i+1} de ${groups.length} · ${rs.length} clientes*\n`+text(rs);return {index:i+1,total:groups.length,codes:rs.map(r=>r.code),text:value,oversized:value.length>targetChars};});
 const codes=messages.flatMap(m=>m.codes);if(codes.length!==rows.length||new Set(codes.map(normal)).size!==rows.length)throw Error('El envío no conserva todos los clientes');
 return messages;
}

const pointValue=row=>row?{earned:row[0]??null,used:row[1]??null,remaining:row[2]??null}:null;
const round4=n=>{const value=Math.round(n*10000)/10000;return Object.is(value,-0)?0:value;};
export function pointMovement(history,key,cut){
 const rows=[...history.points].filter(s=>s.cut<=cut).sort((a,b)=>a.cut.localeCompare(b.cut));
 const current=rows.at(-1);if(!current)return {status:'missing',current:null,previous:null,usedDelta:null,balanceDrop:null,lastUsage:null,lastBalanceDrop:null};
 const code=normal(key),currentPoints=pointValue(current.rows[code]),previous=rows.at(-2)??null;
 const compare=(a,b)=>{
  const x=pointValue(a.rows[code]),y=pointValue(b.rows[code]);
  const delta=(n,m)=>Number.isFinite(n)&&Number.isFinite(m)?round4(m-n):null;
  if(a.cycle!==b.cycle)return {status:'cycle-changed',usedDelta:null,balanceDrop:null,earnedDelta:null,fromCut:a.cut,toCut:b.cut};
  const usedDelta=delta(x?.used,y?.used),balanceDelta=delta(x?.remaining,y?.remaining),earnedDelta=delta(x?.earned,y?.earned),balanceDrop=balanceDelta==null?null:round4(-balanceDelta);
  const status=usedDelta<0?'adjustment':usedDelta>0?'used':balanceDrop>0?'balance-drop':usedDelta===0&&balanceDelta!=null?'unchanged':'missing';
  return {status,usedDelta,balanceDrop,earnedDelta,fromCut:a.cut,toCut:b.cut,intervalDays:Math.round((Date.parse(b.cut)-Date.parse(a.cut))/86400000),before:x,after:y};
 };
 const interval=previous?compare(previous,current):{status:'no-baseline',usedDelta:null,balanceDrop:null,earnedDelta:null,fromCut:null,toCut:current.cut};
 let lastUsage=null,lastBalanceDrop=null;
 for(let i=1;i<rows.length;i++){
  if(rows[i].cycle!==current.cycle||rows[i-1].cycle!==current.cycle)continue;
  const d=compare(rows[i-1],rows[i]);
  if(d.usedDelta>0)lastUsage={amount:d.usedDelta,fromCut:d.fromCut,toCut:d.toCut,intervalDays:d.intervalDays};
  if(d.balanceDrop>0)lastBalanceDrop={amount:d.balanceDrop,fromCut:d.fromCut,toCut:d.toCut,intervalDays:d.intervalDays};
 }
 return {...interval,current:currentPoints,previous:previous?pointValue(previous.rows[code]):null,cut:current.cut,cycle:current.cycle,lastUsage,lastBalanceDrop};
}

// A detected collection belongs to its reporting day, never to an invented
// transaction date inside an interval without daily observations.
export function collectionReport(history,accounts,{day=null,result='used'}={}){
 const cuts=history.points.map(s=>s.cut).sort(),allDays=day==='all',cut=allDays||day==null?cuts.at(-1):day;
 if(!cuts.includes(cut))throw Error('Día de puntos no disponible');
 if(!['all','used','pending','none','review','drop'].includes(result))throw Error('Filtro de cobros no válido');
 const previousCut=cuts.filter(c=>c<cut).at(-1)??null;
 const all=accounts.map(c=>{
  const movement=pointMovement(history,c.code,cut);
  const collection=allDays?movement.lastUsage:movement.usedDelta>0?movement.lastUsage:null;
  return {...c,movement,collection};
 });
 const needsReview=c=>['missing','no-baseline','cycle-changed','adjustment','balance-drop'].includes(c.movement.status);
 const summary={clients:all.length,comparableClients:all.filter(c=>c.movement.usedDelta!=null).length,usedClients:all.filter(c=>c.movement.usedDelta>0).length,usedPoints:round4(all.reduce((s,c)=>s+Math.max(0,c.movement.usedDelta??0),0)),balanceDropClients:all.filter(c=>c.movement.balanceDrop>0).length,pendingClients:all.filter(c=>c.movement.current?.remaining>0).length,missingClients:all.filter(c=>['missing','no-baseline','cycle-changed','adjustment'].includes(c.movement.status)).length,collectedClients:all.filter(c=>c.collection).length,collectedPoints:round4(all.reduce((s,c)=>s+(c.collection?.amount??0),0)),uncertainDayClients:all.filter(c=>c.collection?.intervalDays>1).length};
 const rows=all.filter(c=>result==='all'||(result==='used'&&c.collection)||(result==='pending'&&c.movement.current?.remaining>0)||(result==='none'&&!c.collection&&c.movement.status==='unchanged')||(result==='review'&&needsReview(c))||(result==='drop'&&c.movement.balanceDrop>0));
 rows.sort((a,b)=>(b.collection!=null)-(a.collection!=null)||(b.collection?.toCut??'').localeCompare(a.collection?.toCut??'')||(b.collection?.amount??0)-(a.collection?.amount??0)||(b.movement.current?.remaining??0)-(a.movement.current?.remaining??0)||a.name.localeCompare(b.name,'es'));
 return {day:allDays?'all':cut,allDays,cut,previousCut,summary,rows,total:rows.length};
}

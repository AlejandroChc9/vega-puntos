export function createPointTracking({api,params,status,error,date,money,vp,esc,stat}){
 const $=s=>document.querySelector(s);let rows=[],request=0,report=null;
 function init(context){
  const cuts=[...context.pointsCuts].sort().reverse(),latest=cuts[0];
  $('#tracking-cut').innerHTML=cuts.map(c=>`<option value="${c}">${date(c)}${c===latest?' · último':''}</option>`).join('')+'<option value="all">Todos los días · últimos cobros</option>';
  $('#tracking-cut').value=latest;$('#tracking-result').value='used';
 }
 function label(c){
  if(c.collection)return ['Cobro reportado','positive'];
  if(report.allDays&&c.movement.status==='unchanged')return ['Sin cobro detectado',''];
  return {unchanged:['Sin cobro detectado en el día',''],'balance-drop':['Saldo menor · cobro sin confirmar','warning'],adjustment:['Movimiento por revisar','warning'],missing:['Faltan datos para confirmar','warning'],'no-baseline':['Aún sin información anterior',''],'cycle-changed':['Cambio de ciclo · revisar','warning']}[c.movement.status]??['Sin cobro detectado',''];
 }
 function render(){
  $('#tracking-clients').innerHTML=rows.map(c=>{
   const m=c.movement,event=c.collection,last=m.lastUsage,[text,variant]=label(c);
   const hero=event?`<div class="collection-hero"><span>${report.allDays?'Último cobro detectado':'Cobro detectado el'}</span><strong>${date(event.toCut)}</strong><p>${vp(event.amount)} cobrados</p>${event.intervalDays>1?'<small class="uncertain-date">Día exacto sin precisar · reportes no diarios</small>':''}</div>`:`<div class="collection-empty">${['missing','no-baseline','cycle-changed','adjustment','balance-drop'].includes(m.status)?'No se puede confirmar un cobro para esta fecha.':report.allDays?'Sin cobros detectados en los reportes disponibles.':'Sin cobro detectado para esta fecha.'}</div>`;
   const prior=!event&&last?`<p class="prior-collection">Último cobro detectado: <strong>${date(last.toCut)} · ${vp(last.amount)}</strong>${last.intervalDays>1?'<small>Día exacto sin precisar · reportes no diarios</small>':''}</p>`:'';
   return `<article class="client-card collection-card" data-code="${esc(c.code)}"><div class="client-name"><h3>${esc(c.name)}</h3><p>${esc(c.code)}</p></div><div class="badges"><span class="badge ${variant}">${text}</span></div>${hero}<div class="collection-balance"><span>Saldo por cobrar</span><strong>${vp(m.current?.remaining)}</strong><small>Reportado al ${date(m.cut)} · validar vigencia</small></div>${prior}<details><summary>Ver detalle y cuota</summary>${event?`<p>Uso detectado entre ${date(event.fromCut)} y ${date(event.toCut)}.${event.intervalDays>1?' Los reportes disponibles no identifican el día exacto del cobro.':''}</p>`:''}<div class="evidence-row"><span>Utilizados acumulados al ${date(m.cut)}</span><strong>${vp(m.current?.used)}</strong></div><div class="evidence-row"><span>Puntos ganados reportados</span><strong>${vp(m.current?.earned)}</strong></div><p>Una bajada de saldo por sí sola no confirma cobro. Ajustes y nuevas acreditaciones pueden cambiar el saldo.</p><p>Compra Oct.: ${money(c.advance)} / cuota ${money(c.quota)}, al ${date(c.salesCut)}. Faltan ${money(c.gap)}.</p></details></article>`;
  }).join('')||`<div class="empty"><h3>${$('#tracking-result').value==='used'?'No hay cobros detectados para esta selección':'No hay clientes con este filtro'}</h3><p>${!report.previousCut?'Falta un reporte anterior para detectar el movimiento.':'Puedes consultar los últimos cobros de días anteriores o cambiar el vendedor.'}</p>${!report.allDays?'<button type="button" class="secondary" id="show-past-collections">Ver cobros de días anteriores</button>':''}</div>`;
  $('#show-past-collections')?.addEventListener('click',()=>{$('#tracking-cut').value='all';$('#tracking-result').value='used';load();});
 }
 async function load(append=false){
  const ticket=++request,key=params({cut:$('#tracking-cut').value,result:$('#tracking-result').value});status('Buscando cobros de puntos…');error('');
  try{
   const result=await api('/api/point-tracking?'+key+'&offset='+(append?rows.length:0));
   if(ticket!==request||key!==params({cut:$('#tracking-cut').value,result:$('#tracking-result').value}))return;
   report=result;rows=append?[...rows,...result.rows]:result.rows;const s=result.summary;
   $('#tracking-interval').textContent=result.allDays?`Último cobro detectado por cliente · datos al ${date(result.cut)}.`:result.previousCut?`Fecha de detección: ${date(result.cut)}.`:`Reporte ${date(result.cut)} · falta información anterior para detectar cobros.`;
   $('#tracking-date-note').hidden=s.uncertainDayClients===0;
   $('#tracking-date-note').textContent='Algunos cobros se detectaron tras varios días sin reporte. En esas tarjetas se indica que el día exacto no se puede precisar.';
   $('#tracking-stats').innerHTML=stat(s.collectedClients,'clientes que cobraron',result.allDays?'En los días disponibles':'Detectados')+stat(vp(s.collectedPoints),'puntos cobrados',result.allDays?'Último por cliente':'Según reporte')+stat(s.pendingClients,'con puntos por cobrar',`Al ${date(result.cut)}`);
   $('#tracking-count').textContent=`${rows.length} de ${result.total} clientes · cartera total ${s.clients}${s.missingClients?' · '+s.missingClients+' por revisar':''}`;
   $('#tracking-more').hidden=!result.hasMore;render();status();
  }catch(e){if(ticket===request){status();error(e.message);}}
 }
 $('#tracking-cut').addEventListener('change',()=>load());$('#tracking-result').addEventListener('change',()=>load());$('#tracking-more').addEventListener('click',()=>load(true));
 return {init,load};
}

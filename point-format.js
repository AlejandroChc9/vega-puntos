// Presentation only: comparisons and saved snapshots keep source precision.
export function formatPoints(value){
 if(value==null||!Number.isFinite(Number(value)))return 'Sin dato';
 const n=Number(value);
 if(n!==0&&Math.abs(n)<1)return (n<0?'-':'')+'<1 VP';
 return (Object.is(n,-0)?0:n).toLocaleString('es-PE',{maximumFractionDigits:0})+' VP';
}

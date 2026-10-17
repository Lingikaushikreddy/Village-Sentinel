import { BUILDINGS, command, defense, freeLand, upgradeCost } from './strategy-state.mjs?v=9fe5a700fe75';

export const CREW = [
 {id:'mira',name:'Mira',job:'Farmer',resource:'food',site:'farm',x:4,y:6},
 {id:'pip',name:'Pip',job:'Scout',resource:'wood',site:'lumber',x:5,y:4},
 {id:'bea',name:'Bea',job:'Quartermaster',resource:'food',site:'farm',x:3,y:5},
 {id:'gus',name:'Gus',job:'Builder',resource:'wood',site:'lumber',x:6,y:3},
 {id:'luna',name:'Luna',job:'Trader',resource:'gold',site:'market',x:7,y:6},
 {id:'nimbus',name:'Nimbus',job:'Courier',resource:'gold',site:'market',x:4,y:7},
];
export const ORDERS = {
 grow:{name:'Grow the village',description:'Build a farm, timber camp and watchtower.',gold:200,wood:120},
 restock:{name:'Restock supplies',description:'Your six helpers bring home 12 deliveries.',gold:0,wood:0},
 fortify:{name:'Fortify the village',description:'Reach 42 defense and repair the walls.',gold:240,wood:180},
};
const neighbors=({x,y})=>[[x-1,y],[x+1,y],[x,y-1],[x,y+1]].map(([x,y])=>({x,y}));
const same=(a,b)=>a.x===b.x&&a.y===b.y;
const key=p=>`${p.x},${p.y}`;
function pathTo(v,from,to){
 if(!freeLand(v,to.x,to.y))return null;
 const queue=[[{x:from.x,y:from.y}]],seen=new Set([key(from)]);
 for(let i=0;i<queue.length;i++){
  const path=queue[i],last=path.at(-1);if(same(last,to))return path;
  for(const next of neighbors(last))if(!seen.has(key(next))&&freeLand(v,next.x,next.y)){seen.add(key(next));queue.push([...path,next]);}
 }
 return null;
}
const entry=(c,tick,text)=>{c.history=[{tick,text},...c.history].slice(0,12);};
export function newCrew(){return {schema:1,order:null,actors:CREW.map(a=>({id:a.id,x:a.x,y:a.y,job:null,deliveries:0,restUntil:0,note:'Ready for a village order.'})),history:[{tick:0,text:'Six friends, one village. Choose an order to begin.'}]};}
export function chooseOrder(crew,kind){
 if(kind!=='stop'&&!Object.hasOwn(ORDERS,kind))throw Error('Choose a village order.');
 const c=structuredClone(crew);c.order=kind==='stop'?null:{kind,status:'active',buildIndex:0,deliveries:0,spent:{gold:0,wood:0}};
 for(const a of c.actors){a.job=null;a.note=kind==='stop'?'Order stopped. Ready when you are.':'Finding useful work…';}
 return c;
}
export function restCrew(crew,id,tick){
 const c=structuredClone(crew),a=c.actors.find(a=>a.id===id);if(!a)throw Error('Choose a resident.');
 a.restUntil=tick+20;a.job=null;a.note='Resting for 20 game seconds.';return c;
}
function nearBuilding(v,a,b){
 return neighbors(b).map(p=>({target:p,path:pathTo(v,a,p)})).filter(x=>x.path).sort((a,b)=>a.path.length-b.path.length)[0]?.target;
}
function builderJob(v,c,a){
 let action;
 if(c.order.kind==='grow'&&c.order.buildIndex<3){
  const kind=['farm','lumber','tower'][c.order.buildIndex],wanted=[[2,6],[7,2],[2,3]][c.order.buildIndex],cells=[];
  for(let x=2;x<=9;x++)for(let y=2;y<=9;y++)if(freeLand(v,x,y))cells.push({x,y});
  cells.sort((a,b)=>(Math.abs(a.x-wanted[0])+Math.abs(a.y-wanted[1]))-(Math.abs(b.x-wanted[0])+Math.abs(b.y-wanted[1])));
  const target=cells.find(p=>pathTo(v,a,p));
  if(!target){a.note='No reachable building site. Open a route or build manually.';return null;}
  action={type:'build',kind,target};
 } else if(c.order.kind==='fortify'){
  const tower=v.buildings.find(b=>b.kind==='tower'&&b.level<3);
  if(defense(v)<42&&tower){const target=nearBuilding(v,a,tower);if(target)action={type:'upgrade',id:tower.id,target};}
  else if(v.integrity<100){const target=nearBuilding(v,a,v.buildings.find(b=>b.kind==='hall'));if(target)action={type:'repair',target};}
 }
 if(!action){a.note='Waiting for reachable work.';return null;}
 return {...action,progress:0};
}
function gatherJob(v,a){
 const spec=CREW.find(s=>s.id===a.id),sites=v.buildings.filter(b=>b.kind===spec.site);
 const reachable=sites.map(b=>({b,target:nearBuilding(v,a,b)})).filter(x=>x.target);
 if(!reachable.length){a.note='Route blocked. Waiting for a reachable workplace.';return null;}
 const {b,target}=reachable.sort((x,y)=>pathTo(v,a,x.target).length-pathTo(v,a,y.target).length)[a.deliveries%reachable.length];
 return{type:'gather',resource:spec.resource,id:b.id,target,progress:0};
}
function costFor(v,job){
 if(job.type==='build')return BUILDINGS[job.kind];
 if(job.type==='repair')return{gold:10,wood:20};
 const b=v.buildings.find(b=>b.id===job.id);return b&&b.level<3?upgradeCost(b):null;
}
function finishOrder(v,c){
 const o=c.order;if(!o||o.status!=='active')return;
 if((o.kind==='restock'&&o.deliveries>=12)||(o.kind==='grow'&&o.buildIndex===3)||(o.kind==='fortify'&&defense(v)>=42&&v.integrity===100)){
  o.status='done';for(const a of c.actors){a.job=null;a.note='Order complete. Ready for the next adventure.';}
  entry(c,v.tick,`${ORDERS[o.kind].name}: complete!`);
 }
}
export function tickCrew(village,crew){
 if(!crew.order||crew.order.status!=='active'||village.status!=='playing')return {village,crew};
 let v=structuredClone(village);const c=structuredClone(crew);finishOrder(v,c);
 for(const a of c.actors){
  if(c.order.status!=='active'||v.status!=='playing')break;
  if(a.restUntil>v.tick){a.note=`Resting: ${a.restUntil-v.tick} game seconds left.`;continue;}
  // Manual construction may occupy a resident's standing tile; step to open adjacent land.
  if(!freeLand(v,a.x,a.y)){const open=neighbors(a).find(p=>freeLand(v,p.x,p.y));if(!open){a.note='Route blocked by buildings.';continue;}a.x=open.x;a.y=open.y;a.job=null;}
  if(a.job&&!freeLand(v,a.job.target.x,a.job.target.y))a.job=null;
  // A manual tower may satisfy the order while Gus is walking or working.
  if(c.order.kind==='fortify'&&a.job?.type==='upgrade'&&defense(v)>=42)a.job=null;
  if(!a.job)a.job=a.id==='gus'&&c.order.kind!=='restock'?builderJob(v,c,a):gatherJob(v,a);
  const job=a.job;if(!job)continue;
  const path=pathTo(v,a,job.target);
  if(!path){a.note='Route blocked. Replanning next tick.';a.job=null;continue;}
  const verb=job.type==='gather'?`Collect ${job.resource==='gold'?'coins':job.resource==='wood'?'timber':'food'}`:job.type==='build'?`Build ${BUILDINGS[job.kind].name}`:job.type==='upgrade'?'Upgrade the watchtower':'Repair village walls';
  if(path.length>1){a.x=path[1].x;a.y=path[1].y;a.note=`${verb} · walking (${path.length-2} steps left)`;continue;}
  a.note=`${verb} · working ${Math.min(job.progress+1,3)}/3`;
  if(++job.progress<3)continue;
  if(job.type==='gather'){
   const amount={gold:5,wood:6,food:8}[job.resource],actual=Math.min(amount,99999-v[job.resource]);v[job.resource]+=actual;
   a.deliveries=Math.min(99999,a.deliveries+1);c.order.deliveries=Math.min(99999,c.order.deliveries+1);
   a.note=`Delivered ${actual} ${job.resource==='gold'?'coins':job.resource==='wood'?'timber':'food'}.`;
   entry(c,v.tick,`${CREW.find(s=>s.id===a.id).name}: ${a.note}`);a.job=null;
  }else{
   const cost=costFor(v,job),limit=ORDERS[c.order.kind];
   if(!cost){a.job=null;continue;}
   if(c.order.spent.gold+cost.gold>limit.gold||c.order.spent.wood+cost.wood>limit.wood){a.note='Order spending ceiling reached. Choose another order or finish manually.';continue;}
   if(v.gold-cost.gold<20||v.wood-cost.wood<20){a.note='Waiting for supplies; keeping 20 coins and 20 timber in reserve.';continue;}
   try{v=command(v,{...job,...job.target});c.order.spent.gold+=cost.gold;c.order.spent.wood+=cost.wood;if(c.order.kind==='grow')c.order.buildIndex++;a.note=`${verb}: done.`;entry(c,v.tick,`Gus: ${a.note} Spent ${cost.gold} coins + ${cost.wood} timber.`);a.job=null;}
   catch{a.job=null;a.note='Village changed. Replanning this job.';}
  }
  finishOrder(v,c);
 }
 return{village:v,crew:c};
}
export function restoreCrew(raw,village){
 try{
  const c=JSON.parse(raw),validInt=(v,max=99999)=>Number.isSafeInteger(v)&&v>=0&&v<=max;
  if(!c||c.schema!==1||!Array.isArray(c.actors)||c.actors.length!==6||new Set(c.actors.map(a=>a.id)).size!==6)return null;
  if(c.actors.some(a=>!CREW.some(s=>s.id===a.id)||!validInt(a.x,9)||a.x<2||!validInt(a.y,9)||a.y<2||!validInt(a.deliveries)||!validInt(a.restUntil,village.tick+20)))return null;
  if(c.order){const o=c.order,limit=ORDERS[o.kind];if(!limit||!['active','done'].includes(o.status)||!validInt(o.buildIndex,3)||!validInt(o.deliveries)||!o.spent||!validInt(o.spent.gold,limit.gold)||!validInt(o.spent.wood,limit.wood))return null;}
  if(!Array.isArray(c.history)||c.history.length>12||c.history.some(e=>!e||!validInt(e.tick,village.tick)||typeof e.text!=='string'||e.text.length>300))return null;
  for(const a of c.actors){a.job=null;a.note='Village loaded. Rechecking the route.';}
  return c;
 }catch{return null;}
}

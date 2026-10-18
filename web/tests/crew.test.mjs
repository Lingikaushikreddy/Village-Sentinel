import test from 'node:test';
import assert from 'node:assert/strict';
import { newVillage, advance, command, restoreVillage, defense } from '../public/strategy-state.mjs';
import { newCrew, chooseOrder, tickCrew, restCrew, restoreCrew } from '../public/crew-state.mjs';
function run(village,crew,steps=120){for(let i=0;i<steps&&crew.order?.status==='active'&&village.status==='playing';i++)({village,crew}=tickCrew(advance(village),crew));return{village,crew};}
test('all six residents complete a finite restock order with actual bounded resource deliveries',()=>{
 const v=newVillage(),c=chooseOrder(newCrew(),'restock');const result=run(v,c);
 assert.equal(result.crew.order.status,'done');assert.equal(result.crew.order.deliveries,12);
 assert.ok(result.crew.actors.every(a=>a.deliveries>0));assert.ok(result.village.gold>v.gold&&result.village.wood>v.wood&&result.village.food>v.food);
 assert.deepEqual(v,newVillage());assert.equal(c.order.deliveries,0);
 const cap=run({...v,gold:99999,wood:99999,food:99999},chooseOrder(newCrew(),'restock'));
 assert.ok(restoreVillage(JSON.stringify(cap.village)));
});
test('grow builds exactly one farm, camp and tower through paid commands and stays within its ceiling',()=>{
 const {village,crew}=run(newVillage(),chooseOrder(newCrew(),'grow'));
 assert.equal(crew.order.status,'done');assert.equal(village.buildings.length,8);
 assert.deepEqual(crew.order.spent,{gold:200,wood:120});assert.equal(crew.order.buildIndex,3);
 assert.deepEqual(tickCrew(village,crew),{village,crew});assert.ok(village.gold>=20&&village.wood>=20);
});
test('fortify upgrades the tower and repairs damage with real costs',()=>{
 const {village,crew}=run({...newVillage(),integrity:75},chooseOrder(newCrew(),'fortify'));
 assert.equal(crew.order.status,'done');assert.equal(village.buildings.find(b=>b.kind==='tower').level,3);assert.equal(village.integrity,100);
 assert.ok(crew.order.spent.gold<=240&&crew.order.spent.wood<=180);assert.ok(crew.order.spent.gold>=190);
});
test('fortify cancels an obsolete pending tower upgrade after manual defenses meet the target',()=>{
 for(const progress of [0,2]){
  let v={...newVillage(),integrity:75,gold:1000,wood:1000},c=chooseOrder(newCrew(),'fortify');
  ({village:v,crew:c}=tickCrew(v,c));
  let gus=c.actors.find(a=>a.id==='gus');assert.equal(gus.job.type,'upgrade');
  if(progress){gus.x=gus.job.target.x;gus.y=gus.job.target.y;gus.job.progress=progress;}
  for(const [x,y] of [[2,6],[8,7]])v=command(v,{type:'build',kind:'tower',x,y});
  assert.equal(defense(v),42);
  for(let i=0;i<30&&c.order.status==='active';i++)({village:v,crew:c}=tickCrew(v,c));
  assert.equal(c.order.status,'done');assert.equal(v.integrity,100);
  assert.equal(defense(v),42);assert.deepEqual(c.order.spent,{gold:10,wood:20});
 }
});
test('low funds wait without negative balances and resting actors do not work',()=>{
 let v={...newVillage(),gold:0,wood:0},c=restCrew(chooseOrder(newCrew(),'grow'),'gus',0);
 for(let i=0;i<19;i++){({village:v,crew:c}=tickCrew(advance(v),c));assert.equal(v.buildings.length,5);assert.ok(v.gold>=0&&v.wood>=0);}
 assert.match(c.actors.find(a=>a.id==='gus').note,/Resting/);
 const stopped=chooseOrder(c,'stop');assert.deepEqual(tickCrew(v,stopped),{village:v,crew:stopped});
});
test('a blocked resident waits without crossing occupied land',()=>{
 let v=newVillage();for(const [x,y] of [[3,4],[5,4],[4,3],[4,5]])v=command({...v,gold:9999,wood:9999},{type:'build',kind:'farm',x,y});
 const c=chooseOrder(newCrew(),'restock');const gus=c.actors.find(a=>a.id==='gus');gus.x=4;gus.y=4;const out=tickCrew(advance(v),c).crew.actors.find(a=>a.id==='gus');
 assert.equal(out.x,gus.x);assert.equal(out.y,gus.y);assert.match(out.note,/route|blocked/i);
});
test('manual construction on a crew destination replans without charging twice',()=>{
 let v=newVillage(),c=chooseOrder(newCrew(),'grow');({village:v,crew:c}=tickCrew(advance(v),c));
 const job=c.actors.find(a=>a.id==='gus').job;assert.equal(job.type,'build');
 v=command({...v,gold:9999,wood:9999},{type:'build',kind:'market',x:job.target.x,y:job.target.y});
 ({village:v,crew:c}=run(v,c));assert.equal(c.order.status,'done');assert.equal(v.buildings.length,9);assert.deepEqual(c.order.spent,{gold:200,wood:120});
});
test('reload mid-order preserves spending and completion while rebuilding safe jobs',()=>{
 let v=newVillage(),c=chooseOrder(newCrew(),'grow');for(let i=0;i<6;i++)({village:v,crew:c}=tickCrew(advance(v),c));
 c=restoreCrew(JSON.stringify(c),v);assert.ok(c);({village:v,crew:c}=run(v,c));
 assert.equal(v.buildings.length,8);assert.deepEqual(c.order.spent,{gold:200,wood:120});
 assert.equal(restoreCrew('{broken',v),null);
 assert.equal(restoreCrew(JSON.stringify({...c,actors:[]}),v),null);
 const corrupt=structuredClone(c);corrupt.actors[0].x=999;assert.equal(restoreCrew(JSON.stringify(corrupt),v),null);
});

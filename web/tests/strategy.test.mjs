import test from 'node:test';
import assert from 'node:assert/strict';
import { newVillage, command, advance, restoreVillage, defense } from '../public/strategy-state.mjs';

test('placing a building charges resources once and rejects occupied or out-of-bounds land', () => {
 const initial=newVillage();
 const next=command(initial,{type:'build',kind:'farm',x:4,y:4});
 assert.equal(next.buildings.length,initial.buildings.length+1);
 assert.equal(next.gold,initial.gold-60); assert.equal(next.wood,initial.wood-40);
 assert.equal(initial.buildings.length,5);
 assert.throws(()=>command(next,{type:'build',kind:'tower',x:4,y:4}),/occupied/);
 for(const x of [-1,12,1.5,NaN]) assert.throws(()=>command(initial,{type:'build',kind:'farm',x,y:4}),/land/);
 assert.throws(()=>command({...initial,gold:0},{type:'build',kind:'farm',x:4,y:4}),/resources/);
});
test('upgrades improve defenses and stop at the maximum level', () => {
 let s={...newVillage(),gold:1000,wood:1000}; const tower=s.buildings.find(b=>b.kind==='tower');
 const old=defense(s); s=command(s,{type:'upgrade',id:tower.id}); assert.ok(defense(s)>old);
 s=command(s,{type:'upgrade',id:tower.id}); assert.throws(()=>command(s,{type:'upgrade',id:tower.id}),/maximum/);
});
test('production advances deterministically and weak defenses lose integrity', () => {
 const s=newVillage(); const next=advance(s,5); assert.ok(next.wood>s.wood); assert.ok(next.food>s.food);
 assert.equal(s.tick,0); assert.deepEqual(advance(s,10),advance(advance(s,5),5));
 const weak={...s,buildings:s.buildings.filter(b=>b.kind!=='tower')};
 const attacked=advance(weak,30); assert.ok(attacked.integrity<100); assert.equal(attacked.wave,1);
 assert.equal(advance({...weak,integrity:1},30).status,'lost');
});
test('trade and repairs charge real resources and cannot exceed integrity capacity', () => {
 const s=newVillage(); const traded=command(s,{type:'trade'}); assert.equal(traded.gold,s.gold-16); assert.equal(traded.food,s.food+8);
 assert.throws(()=>command(s,{type:'repair'}),/healthy/);
 const repaired=command({...s,integrity:90},{type:'repair'}); assert.equal(repaired.integrity,100); assert.equal(repaired.wood,s.wood-20);
});
test('mission rewards require completion and cannot be farmed by restarting a scenario', () => {
 const s=newVillage(); assert.throws(()=>command(s,{type:'mission',scene:'notice',completed:false}),/complete/);
 const won=command(s,{type:'mission',scene:'notice',completed:true}); assert.equal(won.gold,s.gold+40);
 assert.deepEqual(command(won,{type:'mission',scene:'notice',completed:true}),won);
 assert.throws(()=>command(s,{type:'mission',scene:'invented',completed:true}),/mission/);
});
test('save restoration rejects corrupt resources, overlapping buildings and hostile IDs', () => {
 const s=newVillage(); assert.deepEqual(restoreVillage(JSON.stringify(s)),s);
 for(const broken of [{...s,gold:-1},{...s,tick:'bad'},{...s,buildings:[...s.buildings,s.buildings[0]]},{...s,buildings:[{...s.buildings[0],id:'<img>'}]}]) assert.equal(restoreVillage(JSON.stringify(broken)),null);
 assert.equal(restoreVillage('{'),null);
});
test('a defended village wins only after its building and mission goals are met', () => {
 let s={...newVillage(),gold:1000,wood:1000};
 for(const [x,y] of [[4,4],[6,6],[8,8]])s=command(s,{type:'build',kind:'tower',x,y});
 s=advance(advance(advance(s,30),30),30);assert.equal(s.defended,3);assert.equal(s.status,'playing');
 s=command(s,{type:'mission',scene:'fair-trade',completed:true});assert.equal(s.status,'won');
 assert.deepEqual(advance(s,30),s);assert.throws(()=>command(s,{type:'trade'}),/complete/);
});
test('commands at the resource cap always produce reloadable saves', () => {
 const s={...newVillage(),gold:99999,wood:99999,food:99999};
 for(const action of [{type:'trade'},{type:'mission',scene:'notice',completed:true}]){
  const next=command(s,action);assert.ok(next.gold<=99999&&next.wood<=99999&&next.food<=99999);
  assert.deepEqual(restoreVillage(JSON.stringify(next)),next);
 }
 assert.equal(restoreVillage(JSON.stringify({...s,log:[]})),null);
});

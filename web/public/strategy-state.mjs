export const BUILDINGS = {
 hall: { name: 'Village hall', gold: 0, wood: 0, description: 'The heart of your settlement.' },
 farm: { name: 'Sunfield farm', gold: 60, wood: 40, description: '+5 food every 5 seconds per level.' },
 lumber: { name: 'Timber camp', gold: 50, wood: 20, description: '+6 timber every 5 seconds per level.' },
 tower: { name: 'Watchtower', gold: 90, wood: 60, description: '+12 defense per level. Protects the whole village.' },
 market: { name: 'Trading post', gold: 70, wood: 45, description: '+5 coins every 5 seconds per level.' },
};
export const SCENE_IDS = ['notice','messenger','fair-trade'];
const building = (id,kind,x,y) => ({id,kind,x,y,level:1});
export function newVillage() {
 return {schema:1,tick:0,gold:220,wood:160,food:50,integrity:100,wave:0,defended:0,status:'playing',missions:[],nextId:6,
 buildings:[building('b1','hall',5,5),building('b2','farm',3,6),building('b3','lumber',7,3),building('b4','market',7,7),building('b5','tower',3,3)],
 log:[{tick:0,text:'Welcome, chief! Build your village and help Pip solve a mission.'}]};
}
const note=(s,text)=>{s.log=[{tick:s.tick,text},...s.log].slice(0,12);};
export const defense = s => 6+s.buildings.filter(b=>b.kind==='tower').reduce((n,b)=>n+b.level*12,0);
export const upgradeCost = b => ({gold:60*b.level,wood:30*b.level});
export const freeLand = (s,x,y) => Number.isInteger(x)&&Number.isInteger(y)&&x>=2&&x<=9&&y>=2&&y<=9&&!s.buildings.some(b=>b.x===x&&b.y===y);
function pay(s,gold,wood=0) { if(s.gold<gold||s.wood<wood) throw Error('Not enough resources. Let your farms, camp and trading post produce more.'); s.gold-=gold; s.wood-=wood; }
function outcome(s) {
 if(s.integrity<=0){s.status='lost';note(s,'The village fell. Start a new village and build more watchtowers.');}
 else if(s.buildings.length>=8&&s.defended>=3&&s.missions.length>=1){s.status='won';note(s,'Village secured! Your settlement earned its Sentinel banner.');}
 return s;
}
export function command(state,action) {
 if(state.status!=='playing') throw Error('This village is complete. Start a new village to play again.');
 const s=structuredClone(state);
 if(action.type==='build') {
  const spec=BUILDINGS[action.kind]; if(!spec||action.kind==='hall')throw Error('Choose a building from the build bar.');
  if(!Number.isInteger(action.x)||!Number.isInteger(action.y)||action.x<2||action.x>9||action.y<2||action.y>9)throw Error('Choose open land inside the village walls.');
  if(!freeLand(s,action.x,action.y))throw Error('That land is occupied. Choose another tile.');
  pay(s,spec.gold,spec.wood); s.buildings.push(building(`b${s.nextId++}`,action.kind,action.x,action.y)); note(s,`${spec.name} built. Your village is growing!`);
 } else if(action.type==='upgrade') {
  const b=s.buildings.find(b=>b.id===action.id); if(!b)throw Error('Select a building first.');
  if(b.level>=3)throw Error('This building is at its maximum level.');
  const cost=upgradeCost(b); pay(s,cost.gold,cost.wood); b.level++;note(s,`${BUILDINGS[b.kind].name} upgraded to level ${b.level}.`);
 } else if(action.type==='trade') {
  pay(s,16); s.food+=8;note(s,'Fair trade: 16 coins bought 8 food.');
 } else if(action.type==='repair') {
  if(s.integrity>=100)throw Error('The village is already healthy.');
  pay(s,10,20);s.integrity=Math.min(100,s.integrity+25);note(s,'Village repaired with 20 timber and 10 coins.');
 } else if(action.type==='mission') {
  if(!SCENE_IDS.includes(action.scene))throw Error('Unknown mission.');
  if(!action.completed)throw Error('Finish the complete mission before claiming supplies.');
  if(s.missions.includes(action.scene))return s;
  s.missions.push(action.scene);s.gold+=40;s.wood+=25;note(s,'AI mission complete! Construction reward: 40 coins and 25 timber.');
 } else throw Error('Unknown village command.');
 return outcome(s);
}
export function advance(state,steps=1) {
 if(!Number.isInteger(steps)||steps<1||steps>30)throw Error('Advance between 1 and 30 ticks.');
 const s=structuredClone(state);
 for(let i=0;i<steps&&s.status==='playing';i++) {
  s.tick++;
  if(s.tick%5===0)for(const b of s.buildings){if(b.kind==='farm')s.food+=5*b.level;if(b.kind==='lumber')s.wood+=6*b.level;if(b.kind==='market')s.gold+=5*b.level;}
  if(s.tick%10===0){s.food=Math.max(0,s.food-4);if(s.food===0){s.integrity=Math.max(0,s.integrity-5);note(s,'Food is low. Build a farm or buy supplies.');}}
  if(s.tick%30===0){s.wave++;const threat=12+s.wave*8;if(defense(s)>=threat){s.defended++;s.gold+=15;note(s,`Raid ${s.wave} repelled! Your watchtowers earned 15 coins.`);}else{const loss=Math.min(35,10+threat-defense(s));s.integrity=Math.max(0,s.integrity-loss);note(s,`Raid ${s.wave} breached the walls: −${loss} integrity. Build or upgrade watchtowers.`);}}
  s.gold=Math.min(99999,s.gold);s.wood=Math.min(99999,s.wood);s.food=Math.min(99999,s.food);outcome(s);
 }
 return s;
}
export function restoreVillage(raw) {
 try {
  const s=JSON.parse(raw);const number=(v,max=99999)=>Number.isSafeInteger(v)&&v>=0&&v<=max;
  if(!s||s.schema!==1||!['playing','won','lost'].includes(s.status)||!number(s.tick,10000000)||!number(s.gold)||!number(s.wood)||!number(s.food)||!number(s.integrity,100)||!number(s.wave,333334)||!number(s.defended,s.wave)||!number(s.nextId,1000))return null;
  if(!Array.isArray(s.buildings)||s.buildings.length<5||s.buildings.length>64||!Array.isArray(s.missions)||s.missions.some(id=>!SCENE_IDS.includes(id))||new Set(s.missions).size!==s.missions.length)return null;
  const cells=new Set(),ids=new Set();let halls=0;
  for(const b of s.buildings){if(!b||!/^b[1-9]\d{0,2}$/.test(b.id)||!Object.hasOwn(BUILDINGS,b.kind)||!Number.isInteger(b.x)||!Number.isInteger(b.y)||b.x<2||b.x>9||b.y<2||b.y>9||!Number.isInteger(b.level)||b.level<1||b.level>3)return null;
   const cell=`${b.x},${b.y}`;if(cells.has(cell)||ids.has(b.id)||Number(b.id.slice(1))>=s.nextId)return null;cells.add(cell);ids.add(b.id);if(b.kind==='hall')halls++;
  }
  if(halls!==1||!Array.isArray(s.log)||s.log.length>12||s.log.some(e=>!e||!number(e.tick,s.tick)||typeof e.text!=='string'||e.text.length>240))return null;
  return s;
 }catch{return null;}
}

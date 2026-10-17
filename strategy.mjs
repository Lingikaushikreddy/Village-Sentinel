import { newVillage, command, advance, restoreVillage, BUILDINGS, defense, upgradeCost, freeLand } from './strategy-state.mjs?v=9fe5a700fe75';
import { buildingArt, renderStrategyMap } from './strategy-map.mjs?v=9fe5a700fe75';
import { escapeHTML as esc, portrait } from './characters.mjs?v=9fe5a700fe75';
import { newCrew, chooseOrder, tickCrew, restCrew, restoreCrew } from './crew-state.mjs?v=9fe5a700fe75';
import { orderMarkup, railMarkup, detailMarkup, renderCrew } from './crew-view.mjs?v=9fe5a700fe75';
const KEY='village-sentinel-strategy-v1';
const icons={gold:'◈',wood:'▰',food:'✦'};
export function startStrategy(){
 let missionOpen=false,missionRun=null,missionBusy=false;
 let s=newVillage(),crew=newCrew(),selectedCrew='mira',paused=false,speed=1,selected=null,placing=null,storageMessage='Saved on this device';
 try{const raw=localStorage.getItem(KEY);if(raw){const saved=JSON.parse(raw);const restored=restoreVillage(JSON.stringify(saved.village));if(restored){s=restored;crew=restoreCrew(JSON.stringify(saved.crew),s)??newCrew();paused=typeof saved.paused==='boolean'?saved.paused:false;speed=saved.speed===2?2:1;}else storageMessage='Old save could not load. A new village is ready.';}}catch{storageMessage='Session only: local saving is unavailable.';}
 const root=document.createElement('section');root.className='strategy-shell';root.id='village-play';root.setAttribute('aria-label','Village strategy game');
 root.innerHTML=`<div class="chief-bar"><div class="chief-identity"><span class="chief-shield">V</span><div><small>Your living village</small><h2>Willowcrest</h2></div></div><div class="resource-bar">${Object.entries(icons).map(([id,icon])=>`<div class="resource resource-${id}"><span class="resource-icon" aria-hidden="true">${icon}</span><div><small>${{gold:'Coins',wood:'Timber',food:'Food'}[id]}</small><strong id="resource-${id}">0</strong></div></div>`).join('')}<div class="resource integrity-resource"><span aria-hidden="true">♥</span><div><small>Integrity</small><strong id="resource-integrity">100%</strong></div></div></div><div class="time-controls"><button id="village-pause" aria-label="Pause village">Ⅱ</button><button id="village-speed" aria-label="Set village speed to 2 times">1×</button></div></div>
 <div class="strategy-stage"><div id="strategy-map" tabindex="0" aria-label="Village camera. Drag empty ground or use arrow keys to pan."></div><div class="village-objective"><span class="objective-eyebrow">Sentinel challenge</span><strong>Build a village that lasts.</strong><ul id="village-objectives"></ul><a href="#mission-center" class="mission-shortcut">${portrait('pip')}<span>Help Pip solve a mission<small>Earn 40 coins + 25 timber</small></span><b>↗</b></a></div><div class="raid-meter"><span class="raid-icon">⚑</span><div><strong id="raid-label">Raid approaching</strong><small id="raid-timer"></small></div><span id="defense-count"></span></div>${orderMarkup()}<div class="camera-controls" aria-label="Village camera controls"><button id="map-zoom-out" aria-label="Zoom out">−</button><button id="map-fit" aria-label="Center village">◎</button><button id="map-zoom-in" aria-label="Zoom in">+</button><span>Drag to explore · choose a friend</span></div><div id="village-outcome" hidden></div><div class="map-instruction" id="map-instruction">Select a building to upgrade it. Choose a new building below.</div></div>
 ${railMarkup()}${detailMarkup()}<div class="construction-dock"><div class="dock-label"><strong>Build your village</strong><span>Choose, then place on open land.</span></div><div class="building-shop">${['farm','lumber','tower','market'].map(kind=>`<button data-build-kind="${kind}" class="build-card" aria-label="Build ${BUILDINGS[kind].name}"><svg viewBox="-55 -115 110 170" aria-hidden="true">${buildingArt(kind)}</svg><span><strong>${BUILDINGS[kind].name}</strong><small>${BUILDINGS[kind].gold} coins · ${BUILDINGS[kind].wood} timber</small></span></button>`).join('')}</div></div>
 <div class="village-bottom"><label class="building-manager">Manage a building<select id="building-selector" aria-label="Manage a building"></select></label><div id="building-detail"><strong>Every building has a job.</strong><span>Farms feed villagers. Timber camps and trading posts supply construction. Towers defend everyone.</span></div><div class="economy-actions"><button id="trade-food" aria-label="Trade 16 coins for 8 food">Trade <small>16 ◈ → 8 food</small></button><button id="repair-village">Repair <small>10 ◈ + 20 timber</small></button></div></div><div class="village-feed"><span class="feed-icon">✧</span><p id="village-event" role="status"></p><button id="new-village">New village</button></div><p class="strategy-disclosure">Village orders and building simulation use local game AI on this device. Mission cases use saved scenario observations; recorded choices do not evaluate your custom buildings. Complete cases to earn supplies here. <span id="save-status"></span></p>`;
 document.querySelector('.intro').after(root);
 const panel=document.querySelector('#mission-panel');
 root.querySelector('.strategy-stage').append(panel);
 panel.querySelector('.mission-intro').after(document.querySelector('.mode-controls'));
 const missionStatus=document.createElement('div');missionStatus.id='mission-map-status';missionStatus.setAttribute('role','status');missionStatus.hidden=true;root.querySelector('.strategy-stage').append(missionStatus);
 function focusMission(open){missionOpen=open;placing=null;root.classList.toggle('mission-open',open);panel.hidden=!open;missionStatus.hidden=!open;render();}
 function missionCrew(){
  if(!missionOpen||!missionRun)return crew;
  const staged=structuredClone(crew),entry=missionRun.history.at(-1),action=entry?.returnedAction;
  const destination=s.buildings.find(b=>b.kind===(action==='check_evidence'||action==='accept_claim'?'market':'hall'));
  const mira=staged.actors.find(a=>a.id==='mira');
  const spot=[[destination.x-1,destination.y],[destination.x,destination.y+1],[destination.x+1,destination.y],[destination.x,destination.y-1]].find(([x,y])=>freeLand(s,x,y));
  if(spot){mira.x=spot[0];mira.y=spot[1];}
  for(const a of staged.actors){a.job=null;a.restUntil=0;}
  return staged;
 }
 const reset=document.createElement('dialog');reset.id='reset-village-dialog';reset.innerHTML='<h2>Start a new village?</h2><p>This replaces the village saved on this device. Your AI mission evidence stays available.</p><div class="reset-actions"><button id="cancel-village-reset">Keep playing</button><button id="confirm-village-reset" class="primary-button">Start fresh</button></div>';document.body.append(reset);
 const $=q=>root.querySelector(q);
 function save(){try{localStorage.setItem(KEY,JSON.stringify({village:s,crew,paused,speed}));}catch{storageMessage='Session only: local saving is unavailable.';}}
 function render(){
  for(const key of ['gold','wood','food'])$(`#resource-${key}`).textContent=s[key];$('#resource-integrity').textContent=`${s.integrity}%`;
  const waiting=paused||missionOpen||s.status!=='playing';$('#village-pause').textContent=waiting?'▶':'Ⅱ';$('#village-pause').setAttribute('aria-label',waiting?'Resume village':'Pause village');$('#village-pause').disabled=missionOpen||s.status!=='playing';
  $('#village-speed').textContent=`${speed}×`;$('#village-speed').setAttribute('aria-label',`Set village speed to ${speed===1?2:1} times`);
  $('#raid-label').textContent=`Raid ${s.wave+1} · Strength ${12+(s.wave+1)*8}`;$('#raid-timer').textContent=missionOpen?'Village time held for mission':waiting?'Village paused':`Arrives in ${30-s.tick%30} game seconds`;
  root.querySelector('.raid-meter').classList.toggle('raid-imminent',s.tick%30>=24&&s.status==='playing');
  $('#defense-count').textContent=`${defense(s)} defense`;
  $('#village-objectives').innerHTML=[[s.buildings.length>=8,`${Math.min(s.buildings.length,8)}/8 buildings`],[s.defended>=3,`${Math.min(s.defended,3)}/3 raids defended`],[s.missions.length>=1,`${Math.min(s.missions.length,1)}/1 AI mission completed`]].map(([done,label])=>`<li class="${done?'objective-done':''}"><span>${done?'✓':'○'}</span>${label}</li>`).join('');
  const selector=$('#building-selector');
  const optionsSignature=JSON.stringify(s.buildings.map(b=>[b.id,b.level]));
  if(selector.dataset.signature!==optionsSignature){selector.dataset.signature=optionsSignature;selector.innerHTML='<option value="">Choose a building</option>'+s.buildings.map(b=>`<option value="${b.id}">${esc(BUILDINGS[b.kind].name)} · ${b.x},${b.y} · Lv ${b.level}</option>`).join('');}
  selector.value=selected??'';
  const b=s.buildings.find(b=>b.id===selected),cost=b?upgradeCost(b):null;
  const signature=JSON.stringify([b,s.status]);
  if($('#building-detail').dataset.signature!==signature){$('#building-detail').dataset.signature=signature;$('#building-detail').innerHTML=b?`<div><strong>${esc(BUILDINGS[b.kind].name)} <em>Level ${b.level}</em></strong><span>${esc(BUILDINGS[b.kind].description)}</span></div>${b.level<3?`<button id="upgrade-building" ${s.status!=='playing'?'disabled':''}>Upgrade to level ${b.level+1}<small>${cost.gold} coins + ${cost.wood} timber</small></button>`:'<b class="max-level">Maximum level</b>'}`:'<strong>Every building has a job.</strong><span>Farms feed villagers. Timber camps and trading posts supply construction. Towers defend everyone.</span>';}
  for(const button of root.querySelectorAll('[data-build-kind]')){button.classList.toggle('selected',button.dataset.buildKind===placing);button.setAttribute('aria-pressed',String(button.dataset.buildKind===placing));button.disabled=s.status!=='playing';}
  $('#map-instruction').textContent=placing?`Place ${BUILDINGS[placing].name}: choose a highlighted tile. Escape cancels.`:(window.innerWidth<540?'Swipe to explore. Select a building, or build on open land.':'Select a building to upgrade it. Choose a new building below.');
  $('#village-event').textContent=s.log[0].text;$('#save-status').textContent=storageMessage;
  $('#trade-food').disabled=s.status!=='playing';$('#repair-village').disabled=s.status!=='playing';
  const outcome=$('#village-outcome');outcome.hidden=s.status==='playing';outcome.innerHTML=s.status==='won'?'<span>✦</span><h3>Village secured!</h3><p>Eight buildings. Three defended raids. One AI mission.</p>':'<span>⚑</span><h3>Your village needs a fresh start.</h3><p>Build watchtowers early, keep food stocked, and repair after raids.</p>';
  const entry=missionRun?.history.at(-1);
  const active=missionBusy?'pip':entry?.trace?.bedrock?.action?'bea':entry?'gus':'mira';
  renderStrategyMap($('#strategy-map'),s,selected,placing,missionCrew(),missionOpen?active:selectedCrew);
  if(missionOpen){
   const action=entry?.returnedAction;
   missionStatus.textContent=missionBusy?'Pip is reading the case…':missionRun?.status==='completed'?(s.missions.includes(missionRun.scene)?'Case complete · reward recorded in your village':'Case complete · no supplies awarded to a finished village'):action==='check_evidence'?'Mira checks the evidence at your trading post':action==='accept_claim'?'Mira visits the trading post · Gus records the outcome':action==='reject_claim'?'Mira returns to the hall · the claim was declined':'Mira brings a case to your village team';
  }
  for(const q of ['.crew-orders','#crew-detail','.construction-dock','.village-bottom','.village-objective','.map-instruction'])$(q).hidden=missionOpen;
  $('#village-speed').disabled=missionOpen;$('#new-village').disabled=missionOpen;
  root.querySelector('.roster-heading>span').textContent=missionOpen?'Choose a helper to see their AI role':'Choose a character to see their work';
  renderCrew(root,crew,s,selectedCrew);
 }
 function act(action){try{s=command(s,action);save();render();return true;}catch(error){$('#village-event').textContent=error.message;return false;}}
 root.addEventListener('click',event=>{
  const resident=event.target.closest('[data-crew]');if(resident){selectedCrew=resident.dataset.crew;render();return;}
  const order=event.target.closest('[data-order]');if(order){crew=chooseOrder(crew,order.dataset.order);save();render();return;}
  if(event.target.closest('#rest-resident')){crew=restCrew(crew,selectedCrew,s.tick);save();render();return;}
  const shop=event.target.closest('[data-build-kind]');if(shop){placing=placing===shop.dataset.buildKind?null:shop.dataset.buildKind;render();return;}
  const building=event.target.closest('[data-building]');if(building){selected=building.dataset.building;placing=null;render();return;}
  const tile=event.target.closest('[data-tile]');if(tile&&placing){const[x,y]=tile.dataset.tile.split(',').map(Number);if(act({type:'build',kind:placing,x,y})){selected=s.buildings.at(-1).id;placing=null;render();}return;}
  if(event.target.closest('#upgrade-building'))act({type:'upgrade',id:selected});
 });
 root.addEventListener('keydown',event=>{if(event.key==='Escape'){placing=null;render();}if(['Enter',' '].includes(event.key)&&event.target.matches('[data-tile],[data-building],[data-crew]')){event.preventDefault();event.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});
 $('#building-selector').onchange=event=>{selected=event.target.value||null;placing=null;render();};
 $('#village-pause').onclick=()=>{paused=!paused;save();render();};$('#village-speed').onclick=()=>{speed=speed===1?2:1;save();render();};
 $('#trade-food').onclick=()=>act({type:'trade'});$('#repair-village').onclick=()=>act({type:'repair'});
 $('#new-village').onclick=()=>reset.showModal();reset.querySelector('#cancel-village-reset').onclick=()=>reset.close();
 reset.querySelector('#confirm-village-reset').onclick=()=>{s=newVillage();crew=newCrew();selectedCrew='mira';paused=false;selected=null;placing=null;save();render();reset.close();};
 const timer=setInterval(()=>{if(!paused&&!missionOpen&&!document.hidden&&s.status==='playing'){for(let i=0;i<speed;i++){s=advance(s);({village:s,crew}=tickCrew(s,crew));}save();render();}},1000);
 let narrow=false;const map=$('#strategy-map');
 let zoom=1,cx=768,cy=512,drag=null;
 const camera=()=>{const w=1536/zoom,h=1024/zoom;map.querySelector('svg')?.setAttribute('viewBox',`${cx-w/2} ${cy-h/2} ${w} ${h}`);};
 $('#map-zoom-in').onclick=()=>{zoom=Math.min(1.8,zoom+.2);camera();};
 $('#map-zoom-out').onclick=()=>{zoom=Math.max(.8,zoom-.2);camera();};
 $('#map-fit').onclick=()=>{zoom=1;cx=768;cy=512;camera();map.scrollLeft=(map.scrollWidth-map.clientWidth)/2;};
 map.addEventListener('pointerdown',event=>{if(placing||event.pointerType==='touch'||event.target.closest('[data-building],[data-crew]'))return;drag={x:event.clientX,y:event.clientY,cx,cy};map.setPointerCapture(event.pointerId);});
 map.addEventListener('pointermove',event=>{if(!drag)return;const ratio=1536/zoom/map.querySelector('svg').clientWidth;cx=Math.max(350,Math.min(1186,drag.cx-(event.clientX-drag.x)*ratio));cy=Math.max(250,Math.min(774,drag.cy-(event.clientY-drag.y)*ratio));camera();});
 const endDrag=()=>{drag=null;};map.addEventListener('pointerup',endDrag);map.addEventListener('pointercancel',endDrag);
 map.addEventListener('keydown',event=>{if(event.target!==map)return;const move={ArrowLeft:[-45,0],ArrowRight:[45,0],ArrowUp:[0,-45],ArrowDown:[0,45]}[event.key];if(move){event.preventDefault();cx=Math.max(350,Math.min(1186,cx+move[0]));cy=Math.max(250,Math.min(774,cy+move[1]));camera();}if(event.key==='Home')$('#map-fit').click();});
 const resize=new ResizeObserver(()=>{const next=map.clientWidth<540;if(next&&!narrow)map.scrollLeft=(map.scrollWidth-map.clientWidth)/2;narrow=next;});
 resize.observe(map);
 window.addEventListener('pagehide',event=>{if(!event.persisted){clearInterval(timer);resize.disconnect();}});render();
 return { focusMission, isMissionOpen:()=>missionOpen, missionBusy(busy){missionBusy=busy;if(missionOpen)render();}, mission(run){missionRun=run;if(run.status==='completed'&&!s.missions.includes(run.scene)&&s.status==='playing')act({type:'mission',scene:run.scene,completed:true});else if(missionOpen)render();} };
}

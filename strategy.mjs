import { newVillage, command, advance, restoreVillage, BUILDINGS, defense, upgradeCost } from './strategy-state.mjs?v=f00c8328efa6';
import { buildingArt, renderStrategyMap } from './strategy-map.mjs?v=f00c8328efa6';
import { escapeHTML as esc, portrait } from './characters.mjs?v=f00c8328efa6';
const KEY='village-sentinel-strategy-v1';
const icons={gold:'◈',wood:'▰',food:'✦'};
export function startStrategy(){
 let s=newVillage(),paused=false,speed=1,selected=null,placing=null,storageMessage='Saved on this device';
 try{const raw=localStorage.getItem(KEY);if(raw){const saved=JSON.parse(raw);const restored=restoreVillage(JSON.stringify(saved.village));if(restored){s=restored;paused=typeof saved.paused==='boolean'?saved.paused:false;speed=saved.speed===2?2:1;}else storageMessage='Old save could not load. A new village is ready.';}}catch{storageMessage='Session only: local saving is unavailable.';}
 const root=document.createElement('section');root.className='strategy-shell';root.setAttribute('aria-label','Village strategy game');
 root.innerHTML=`<div class="chief-bar"><div class="chief-identity"><span class="chief-shield">V</span><div><small>Your settlement</small><h2>Willowcrest</h2></div></div><div class="resource-bar">${Object.entries(icons).map(([id,icon])=>`<div class="resource resource-${id}"><span class="resource-icon" aria-hidden="true">${icon}</span><div><small>${{gold:'Coins',wood:'Timber',food:'Food'}[id]}</small><strong id="resource-${id}">0</strong></div></div>`).join('')}<div class="resource integrity-resource"><span aria-hidden="true">♥</span><div><small>Integrity</small><strong id="resource-integrity">100%</strong></div></div></div><div class="time-controls"><button id="village-pause" aria-label="Pause village">Ⅱ</button><button id="village-speed" aria-label="Set village speed to 2 times">1×</button></div></div>
 <div class="strategy-stage"><div id="strategy-map"></div><div class="village-objective"><span class="objective-eyebrow">Sentinel challenge</span><strong>Build a village that lasts.</strong><ul id="village-objectives"></ul><a href="#mission-center" class="mission-shortcut">${portrait('pip')}<span>Help Pip solve a mission<small>Earn 40 coins + 25 timber</small></span><b>↗</b></a></div><div class="raid-meter"><span class="raid-icon">⚑</span><div><strong id="raid-label">Raid approaching</strong><small id="raid-timer"></small></div><span id="defense-count"></span></div><div id="village-outcome" hidden></div><div class="map-instruction" id="map-instruction">Select a building to upgrade it. Choose a new building below.</div></div>
 <div class="construction-dock"><div class="dock-label"><strong>Build your village</strong><span>Choose, then place on open land.</span></div><div class="building-shop">${['farm','lumber','tower','market'].map(kind=>`<button data-build-kind="${kind}" class="build-card" aria-label="Build ${BUILDINGS[kind].name}"><svg viewBox="-55 -115 110 170" aria-hidden="true">${buildingArt(kind)}</svg><span><strong>${BUILDINGS[kind].name}</strong><small>${BUILDINGS[kind].gold} coins · ${BUILDINGS[kind].wood} timber</small></span></button>`).join('')}</div></div>
 <div class="village-bottom"><label class="building-manager">Manage a building<select id="building-selector" aria-label="Manage a building"></select></label><div id="building-detail"><strong>Every building has a job.</strong><span>Farms feed villagers. Timber camps and trading posts supply construction. Towers defend everyone.</span></div><div class="economy-actions"><button id="trade-food" aria-label="Trade 16 coins for 8 food">Trade <small>16 ◈ → 8 food</small></button><button id="repair-village">Repair <small>10 ◈ + 20 timber</small></button></div></div><div class="village-feed"><span class="feed-icon">✧</span><p id="village-event" role="status"></p><button id="new-village">New village</button></div><p class="strategy-disclosure">Your building simulation runs on this device. AI missions below use their own village scenarios; recorded decisions do not read your custom buildings. <span id="save-status"></span></p>`;
 document.querySelector('.intro').after(root);
 const reset=document.createElement('dialog');reset.id='reset-village-dialog';reset.innerHTML='<h2>Start a new village?</h2><p>This replaces the village saved on this device. Your AI mission evidence stays available.</p><div class="reset-actions"><button id="cancel-village-reset">Keep playing</button><button id="confirm-village-reset" class="primary-button">Start fresh</button></div>';document.body.append(reset);
 const $=q=>root.querySelector(q);
 function save(){try{localStorage.setItem(KEY,JSON.stringify({village:s,paused,speed}));}catch{storageMessage='Session only: local saving is unavailable.';}}
 function render(){
  for(const key of ['gold','wood','food'])$(`#resource-${key}`).textContent=s[key];$('#resource-integrity').textContent=`${s.integrity}%`;
  const waiting=paused||s.status!=='playing';$('#village-pause').textContent=waiting?'▶':'Ⅱ';$('#village-pause').setAttribute('aria-label',waiting?'Resume village':'Pause village');$('#village-pause').disabled=s.status!=='playing';
  $('#village-speed').textContent=`${speed}×`;$('#village-speed').setAttribute('aria-label',`Set village speed to ${speed===1?2:1} times`);
  $('#raid-label').textContent=`Raid ${s.wave+1} · Strength ${12+(s.wave+1)*8}`;$('#raid-timer').textContent=waiting?'Village paused':`Arrives in ${30-s.tick%30} game seconds`;
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
  renderStrategyMap($('#strategy-map'),s,selected,placing);
 }
 function act(action){try{s=command(s,action);save();render();return true;}catch(error){$('#village-event').textContent=error.message;return false;}}
 root.addEventListener('click',event=>{
  const shop=event.target.closest('[data-build-kind]');if(shop){placing=placing===shop.dataset.buildKind?null:shop.dataset.buildKind;render();return;}
  const building=event.target.closest('[data-building]');if(building){selected=building.dataset.building;placing=null;render();return;}
  const tile=event.target.closest('[data-tile]');if(tile&&placing){const[x,y]=tile.dataset.tile.split(',').map(Number);if(act({type:'build',kind:placing,x,y})){selected=s.buildings.at(-1).id;placing=null;render();}return;}
  if(event.target.closest('#upgrade-building'))act({type:'upgrade',id:selected});
 });
 root.addEventListener('keydown',event=>{if(event.key==='Escape'){placing=null;render();}if(['Enter',' '].includes(event.key)&&event.target.matches('[data-tile],[data-building]')){event.preventDefault();event.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});
 $('#building-selector').onchange=event=>{selected=event.target.value||null;placing=null;render();};
 $('#village-pause').onclick=()=>{paused=!paused;save();render();};$('#village-speed').onclick=()=>{speed=speed===1?2:1;save();render();};
 $('#trade-food').onclick=()=>act({type:'trade'});$('#repair-village').onclick=()=>act({type:'repair'});
 $('#new-village').onclick=()=>reset.showModal();reset.querySelector('#cancel-village-reset').onclick=()=>reset.close();
 reset.querySelector('#confirm-village-reset').onclick=()=>{s=newVillage();paused=false;selected=null;placing=null;save();render();reset.close();};
 const timer=setInterval(()=>{if(!paused&&!document.hidden&&s.status==='playing'){s=advance(s,speed);save();render();}},1000);
 let narrow=false;const map=$('#strategy-map');
 const resize=new ResizeObserver(()=>{const next=map.clientWidth<540;if(next&&!narrow)map.scrollLeft=(map.scrollWidth-map.clientWidth)/2;narrow=next;});
 resize.observe(map);
 window.addEventListener('pagehide',event=>{if(!event.persisted){clearInterval(timer);resize.disconnect();}});render();
 return { mission(run){if(run.status==='completed'&&!s.missions.includes(run.scene)&&s.status==='playing')act({type:'mission',scene:run.scene,completed:true});} };
}

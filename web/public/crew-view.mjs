import { CREW, ORDERS } from './crew-state.mjs';
import { CAST, escapeHTML as esc } from './characters.mjs';
import { castPortrait } from './game-art.mjs';
export function orderMarkup(){return `<aside class="crew-orders" aria-label="Village orders"><div class="order-heading"><span>Village orders</span><small>6 residents</small></div><h3>Six friends.<br>One village.</h3><p>Choose the goal. Watch your crew get to work.</p><div class="order-buttons">${Object.entries(ORDERS).map(([kind,o])=>`<button data-order="${kind}" aria-label="${o.name}"><span class="order-icon" aria-hidden="true">${{grow:'⌂',restock:'❧',fortify:'♜'}[kind]}</span><span><strong>${o.name}</strong><small>${o.description}</small></span></button>`).join('')}</div><div id="crew-progress" role="status">Choose an order to begin.</div><p id="crew-budget"></p><button data-order="stop" id="stop-order" hidden>Stop order</button><small class="crew-mode">Local game AI · no model calls</small></aside>`;}
export function railMarkup(){return `<div class="crew-roster"><div class="roster-heading"><strong>Your village crew</strong><span>Choose a character to see their work</span></div><div id="crew-rail">${CREW.map(c=>`<button data-crew="${c.id}" aria-label="Inspect ${c.name}">${castPortrait(c.id)}<strong>${c.name}</strong><span>${c.job}</span></button>`).join('')}</div></div>`;}
export function detailMarkup(){return `<section id="crew-detail" aria-label="Selected resident"><div id="crew-large-portrait"></div><div class="crew-bio"><div><h3 id="crew-name"></h3><span id="crew-job"></span><span class="local-job-badge">Village job</span></div><p id="crew-note" role="status"></p><small id="crew-role"></small></div><div class="crew-stats"><strong id="crew-deliveries"></strong><span>completed deliveries</span><button id="rest-resident"></button></div></section>`;}
export function renderCrew(root,crew,village,selected){
 const $=s=>root.querySelector(s),a=crew.actors.find(a=>a.id===selected)??crew.actors[0],spec=CREW.find(s=>s.id===a.id),o=crew.order;
 for(const button of root.querySelectorAll('#crew-rail [data-crew]')){button.classList.toggle('selected',button.dataset.crew===a.id);button.setAttribute('aria-pressed',String(button.dataset.crew===a.id));}
 if($('#crew-large-portrait').dataset.id!==a.id){$('#crew-large-portrait').innerHTML=castPortrait(a.id);$('#crew-large-portrait').dataset.id=a.id;}
 $('#crew-name').textContent=spec.name;$('#crew-job').textContent=spec.job;
 $('#crew-note').textContent=village.status!=='playing'?'Village challenge finished. Start a new village to work again.':a.note;
 $('#crew-role').textContent=`In AI missions: ${CAST.find(s=>s.id===a.id).role}. Village orders use local rules.`;
 $('#crew-deliveries').textContent=a.deliveries;
 const rest=$('#rest-resident');rest.textContent=a.restUntil>village.tick?`Resting · ${a.restUntil-village.tick}s`:'Give a 20-second rest';rest.setAttribute('aria-label',`Rest ${spec.name} for 20 seconds`);rest.disabled=a.restUntil>village.tick||village.status!=='playing';
 $('#crew-progress').textContent=!o?'Choose an order to begin.':o.status==='done'?`${ORDERS[o.kind].name}: complete!`:o.kind==='grow'?`Growing: ${o.buildIndex}/3 buildings complete`:o.kind==='restock'?`Restocking: ${o.deliveries}/12 deliveries`:'Gus is strengthening your defenses.';
 $('#crew-budget').textContent=o&&o.kind!=='restock'?`Spent ${o.spent.gold}/${ORDERS[o.kind].gold} coins · ${o.spent.wood}/${ORDERS[o.kind].wood} timber. Keep 20 of each in reserve.`:'Crew deliveries add to your building production.';
 $('#stop-order').hidden=!o||o.status!=='active';
 for(const button of root.querySelectorAll('[data-order]')){button.disabled=village.status!=='playing';button.classList.toggle('active',button.dataset.order===o?.kind&&o.status==='active');}
}

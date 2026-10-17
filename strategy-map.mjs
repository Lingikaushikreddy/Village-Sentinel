import { BUILDINGS, freeLand } from './strategy-state.mjs?v=c141c8b983cd';
import { escapeHTML as esc } from './characters.mjs?v=c141c8b983cd';
import { CREW } from './crew-state.mjs?v=c141c8b983cd';
import { buildingArt, characterArt, terrainURL } from './game-art.mjs?v=c141c8b983cd';
export { buildingArt } from './game-art.mjs?v=c141c8b983cd';
export const point=(x,y)=>[768+(x-y)*66,135+(x+y)*34];
const diamond=(x,y)=>`${x},${y-34} ${x+66},${y} ${x},${y+34} ${x-66},${y}`;
function terrain(){let tiles='';
 for(let x=2;x<=9;x++)for(let y=2;y<=9;y++){const[px,py]=point(x,y);tiles+=`<path class="land-tile" data-tile="${x},${y}" d="M${diamond(px,py).replaceAll(' ',' L')}Z" tabindex="0" role="button" aria-label="Land ${x}, ${y}"/>`;}
 return `<svg preserveAspectRatio="xMidYMid slice" viewBox="0 0 1536 1024" class="strategy-svg" aria-label="Painted village with six working characters" role="group"><image href="${terrainURL}" width="1536" height="1024"/><g id="village-paths" pointer-events="none"></g><g id="land-layer">${tiles}</g><g id="builder-buildings"></g><g id="crew-route" pointer-events="none"></g><g id="builder-workers"></g><g id="builder-raiders" pointer-events="none"></g></svg>`;
}
export function renderStrategyMap(container,s,selected,placing,crew,selectedCrew){
 if(!container.querySelector('svg'))container.innerHTML=terrain();container.classList.toggle('placing',Boolean(placing));
 const layer=container.querySelector('#builder-buildings'),signature=JSON.stringify([s.buildings,selected]);
 if(layer.dataset.signature!==signature){layer.dataset.signature=signature;
  layer.innerHTML=[...s.buildings].sort((a,b)=>(a.x+a.y)-(b.x+b.y)).map(b=>{const[x,y]=point(b.x,b.y),scale=b.kind==='hall'?1.65:1.35;return `<g transform="translate(${x} ${y})" class="map-building ${selected===b.id?'is-selected':''}"><title>${esc(BUILDINGS[b.kind].name)} · Level ${b.level}</title>${selected===b.id?'<ellipse cy="4" rx="66" ry="30" fill="#ffe29d66" stroke="#fff4b0" stroke-width="3"/>':''}<g transform="scale(${scale})">${buildingArt(b.kind,b.level)}</g><text class="building-label" y="34" text-anchor="middle">${esc(BUILDINGS[b.kind].name)} · ${b.level}</text><rect class="building-hit" x="-70" y="-145" width="140" height="180" data-building="${b.id}" role="button" tabindex="0" aria-label="${esc(BUILDINGS[b.kind].name)}, level ${b.level}"/></g>`;}).join('');
  const hall=s.buildings.find(b=>b.kind==='hall'),[hx,hy]=point(hall.x,hall.y);container.querySelector('#village-paths').innerHTML=s.buildings.filter(b=>b.kind!=='hall').map(b=>{const[x,y]=point(b.x,b.y);return `<path d="M${hx} ${hy}L${x} ${y}" stroke="#d1bd80" stroke-width="17" stroke-dasharray="3 2" opacity=".7"/>`;}).join('');
 }
 const workers=container.querySelector('#builder-workers');
 if(!workers.children.length)workers.innerHTML=CREW.map(a=>`<g class="builder-worker cast-worker"><ellipse class="crew-shadow" rx="25" ry="9" fill="#294c34" opacity=".25"/>${characterArt(a.id)}<text y="21" text-anchor="middle" class="resident-name">${a.name}</text><circle class="work-dot" cx="29" cy="-22" r="6"/><rect class="crew-hit" x="-40" y="-92" width="80" height="118" data-crew="${a.id}" role="button" tabindex="0" aria-label="Inspect ${a.name} on the map"/></g>`).join('');
 for(const a of crew.actors){const hit=workers.querySelector(`[data-crew="${a.id}"]`),node=hit.parentElement,i=CREW.findIndex(c=>c.id===a.id);const[x,y]=point(a.x,a.y);const offsets=[[-38,0],[40,0],[38,12],[-38,12],[40,0],[-40,12]];node.style.transform=`translate(${x+offsets[i][0]}px,${y+offsets[i][1]}px)`;node.classList.toggle('selected',a.id===selectedCrew);node.classList.toggle('is-working',Boolean(a.job));node.classList.toggle('is-resting',a.restUntil>s.tick);hit.setAttribute('aria-label',`Inspect ${CREW[i].name} on the map`);}
 const chosen=crew.actors.find(a=>a.id===selectedCrew),route=container.querySelector('#crew-route');
 // The destination marker shows intent; movement follows the reducer's walkable grid route.
 route.innerHTML=chosen?.job?(()=>{const[x,y]=point(chosen.job.target.x,chosen.job.target.y);return `<ellipse cx="${x}" cy="${y}" rx="25" ry="13" fill="#fff2a544" stroke="#fff4b0" stroke-width="3" stroke-dasharray="5 5"/>`;})():'';
 const raidLayer=container.querySelector('#builder-raiders'),approaching=s.status==='playing'&&s.tick%30>=24;
 if(approaching&&!raidLayer.children.length)raidLayer.innerHTML=Array.from({length:3},()=>'<g class="builder-worker raider"><ellipse rx="12" ry="6" fill="#664129" opacity=".5"/><path d="M-9-26h18l4 21h-26Z" fill="#8d4638"/><circle cy="-35" r="11" fill="#b08056"/><path d="M-12-35q12-24 24 0Z" fill="#4c4d50"/><path d="M11-4 19-31" stroke="#766043" stroke-width="5"/></g>').join('');
 if(!approaching)raidLayer.innerHTML='';
 if(approaching)for(let i=0;i<3;i++){const t=(s.tick%30-24)/6,[x,y]=point(10.8-t*1.5+i*.3,5+i*.5);raidLayer.children[i].style.transform=`translate(${x}px,${y}px)`;}
 for(const tile of container.querySelectorAll('[data-tile]')){const[x,y]=tile.dataset.tile.split(',').map(Number);tile.classList.toggle('buildable',Boolean(placing)&&freeLand(s,x,y));tile.setAttribute('tabindex',placing?'0':'-1');}
}

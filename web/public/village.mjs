import { escapeHTML } from './characters.mjs';

const POINTS = { granary: [185, 202], farm: [660, 195], market: [424, 326], well: [690, 400], workshop: [187, 417] };
const tree = (x, y, scale = 1) => `<g transform="translate(${x} ${y}) scale(${scale})"><ellipse cy="24" rx="26" ry="9" fill="#728e54" opacity=".18"/><path d="M-5 5h10v27H-5z" fill="#997051"/><path d="M0-49C-42-52-46-9-24 2c-18 17 1 38 24 23C30 38 48 10 25 0 49-23 26-53 0-49Z" fill="#65a56d"/><path d="M-7-43C-30-35-32-12-16-8" fill="none" stroke="#8fbd75" stroke-width="9" stroke-linecap="round"/></g>`;
const building = (x, y, color, label, kind) => `<g transform="translate(${x} ${y})"><ellipse cy="57" rx="70" ry="17" fill="#6f945c" opacity=".2"/><path d="M-54-11H54v67H-54Z" fill="${color}" stroke="#805e42" stroke-width="2"/><path d="m-68-12 68-57 68 57Z" fill="${kind === 'barn' ? '#b85f48' : '#ca8a52'}" stroke="#805e42" stroke-width="3"/><path d="m-45-22 45-37 45 37" fill="none" stroke="#e9ac70" stroke-width="7"/><path d="M-15 17q15-13 30 0v39h-30Z" fill="#97724d"/><rect x="-43" y="5" width="20" height="21" rx="3" fill="#a2cfcc" stroke="#91694c" stroke-width="3"/><path d="M-33 6v19m-10-10h20" stroke="#f7dfac" stroke-width="2"/><rect x="25" y="5" width="20" height="21" rx="3" fill="#a2cfcc" stroke="#91694c" stroke-width="3"/>${kind === 'barn' ? '<path d="M-12 56 12 25M12 56-12 25" stroke="#ceac75" stroke-width="3"/>' : ''}<path d="M-38 69h76" stroke="#a98155" stroke-width="9" stroke-linecap="round"/><text y="73" text-anchor="middle" class="map-label">${label}</text></g>`;

export function villageSVG() {
  return `<svg viewBox="0 0 900 520" role="img" aria-labelledby="map-svg-title" class="village-svg"><title id="map-svg-title">A village with a market, farm, granary, well and workshop. Residents move when the simulation advances.</title>
  <defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#c4e9f4"/><stop offset="1" stop-color="#eff6e6"/></linearGradient><linearGradient id="grass" x2="0" y2="1"><stop stop-color="#d5e9ab"/><stop offset="1" stop-color="#aed38f"/></linearGradient><pattern id="field" width="14" height="14" patternUnits="userSpaceOnUse"><path d="m3 14 4-14m2 14 4-14" stroke="#dec36a" stroke-width="3"/></pattern><filter id="shadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#486648" flood-opacity=".12"/></filter></defs>
  <rect width="900" height="520" fill="url(#sky)"/>
  <g fill="#fff" opacity=".65"><path d="M55 69c-18-13-12-31 9-29 1-25 37-26 44-7 20-5 31 9 26 22 20 2 23 17 12 20H55Z"/><path d="M687 71c-22-10-18-29 5-29 2-23 30-30 44-9 18-7 32 4 31 20 24 1 22 19 5 22Z"/></g>
  <path d="M-10 224Q50 115 170 145T390 138Q513 63 667 131T925 196V520H-10Z" fill="#b6d5a1"/>
  <path d="M-5 274Q54 190 173 207T409 173Q581 104 762 209T916 241V520H-5Z" fill="url(#grass)"/>
  <path d="M862 285q-116 17-95 80t-42 89q-92 15-62 66H917V277Z" fill="#91cfde"/><path d="M851 301q-97 12-77 69t-43 98q-60 8-57 47" fill="none" stroke="#ccebf0" stroke-width="5"/>
  <g stroke="#d5c597" stroke-width="32" fill="none" stroke-linecap="round"><path d="M180 232Q294 284 426 335t251 74"/><path d="M428 335Q509 255 646 213"/><path d="M427 337Q318 397 195 423"/></g>
  <g stroke="#eadab2" stroke-width="24" fill="none" stroke-linecap="round"><path d="M180 232Q294 284 426 335t251 74"/><path d="M428 335Q509 255 646 213"/><path d="M427 337Q318 397 195 423"/></g>
  <g fill="#9ec27d" opacity=".65"><ellipse cx="440" cy="358" rx="113" ry="38"/><ellipse cx="166" cy="208" rx="94" ry="41"/></g>
  <g transform="translate(585 136)"><path d="m0 0 102-28 58 47-104 29Z" fill="#c09957"/><path d="m8 0 91-23 48 39-93 25Z" fill="url(#field)"/><path d="m111-26 40 32m-142-9 45 35" stroke="#95704c" stroke-width="4"/><g fill="#efcd65"><path d="m18-7 3-17 3 15m20-20 3 16 2-20m22-5 3 18 3-22" stroke="#c7a24e" stroke-width="2"/></g></g>
  ${building(181, 143, '#efc785', 'Granary', 'barn')}
  ${building(684, 130, '#f3dbac', 'Sunfield farm', 'farm')}
  ${building(170, 345, '#d9b67c', 'Workshop', 'workshop')}
  <g transform="translate(423 267)"><ellipse cy="59" rx="81" ry="23" fill="#8aa46a" opacity=".22"/><path d="M-61 3v52m122-52v52" stroke="#92724f" stroke-width="6"/><path d="M-67-30H67L79 6H-79Z" fill="#f4dfab" stroke="#a98258" stroke-width="2"/><path d="m-60-30-10 36m38-36-4 36M0-30V6m33-36 5 36m24-36 10 36" stroke="#d16d56" stroke-width="13"/><path d="M-62 32H62v25H-62Z" fill="#bf9260" stroke="#916b45" stroke-width="2"/><path d="M-58 40H58m-30-6v21m-40-21v21" stroke="#dcb27a" stroke-width="3"/><g fill="#d4ba5c"><ellipse cx="-35" cy="28" rx="14" ry="9"/><ellipse cx="0" cy="28" rx="15" ry="10"/></g><g fill="#e19c62"><circle cx="30" cy="25" r="7"/><circle cx="42" cy="25" r="7"/></g><text y="81" text-anchor="middle" class="map-label market-label">Market square</text></g>
  <g transform="translate(689 350)"><ellipse cy="40" rx="40" ry="17" fill="#789d71" opacity=".2"/><path d="M-28 10v26q28 18 56 0V10Z" fill="#b8b8a5" stroke="#7b8f82" stroke-width="2"/><ellipse cy="10" rx="28" ry="12" fill="#81bfc4" stroke="#e1dbc2" stroke-width="7"/><path d="M-31-22v44m62-44v44" stroke="#9f7d51" stroke-width="6"/><path d="m-43-20 43-27 43 27Z" fill="#c47951" stroke="#966345" stroke-width="2"/><path d="M0-20V8" stroke="#866c46" stroke-width="2"/><path d="M-8 3H8L6 17H-6Z" fill="#b89b6c"/><text y="67" text-anchor="middle" class="map-label">Willow well</text></g>
  <g transform="translate(342 139)"><path d="M-20 15v41m41-41v41" stroke="#9b7951" stroke-width="5"/><path d="M-33-24H33v45H-33Z" fill="#a27f50" stroke="#7a6342" stroke-width="2"/><path d="M-25-17H25v30H-25Z" fill="#eee0b3"/><path d="M-15-8H17m-32 7H12m-27 7H5" stroke="#a29265" stroke-width="2"/><path d="m-39-27 39-16 39 16Z" fill="#c88252"/><text y="75" text-anchor="middle" class="small-map-label">Notice board</text></g>
  ${tree(79, 280, 1.1)}${tree(289, 165, .77)}${tree(808, 224, 1.2)}${tree(822, 423, .85)}${tree(351, 452, .8)}${tree(84, 440, .75)}${tree(521, 124, .7)}
  <g fill="#f7f4d3"><path d="m245 284 3-5 3 5-3 5Zm330 116 3-5 3 5-3 5Zm-440 56 3-5 3 5-3 5Z"/><circle cx="330" cy="237" r="2"/><circle cx="569" cy="368" r="2"/></g>
  <g id="residents"></g><g id="resident-labels"></g>
  </svg>`;
}

const offsets = [[-37, 16], [6, 24], [43, 12], [-10, -5], [48, 37], [-52, 39], [3, 48]];
const marketOffsets = [[-94, 25], [-48, 60], [0, 31], [49, 64], [97, 25], [-6, 84], [92, 85]];
function residentFigure(agent) {
  const isMira = agent.id === 'mira';
  const hair = { theo: '#765344', ada: '#795241', finn: '#ad8050', lina: '#533f35', oscar: '#b3b3a0', rook: '#423c43' }[agent.id] ?? '#654437';
  if (isMira) return `<svg x="-24" y="-65" width="48" height="67" viewBox="0 0 512 512" overflow="hidden"><image href="/assets/character-cast.png" width="1536" height="1024"/></svg>`;
  return `<path d="M-10-7-12 2m22-9L12 2" stroke="#74533b" stroke-width="6" stroke-linecap="round"/><path d="M-12-35q12-9 24 0l3 26h-30Z" fill="${escapeHTML(agent.color)}" stroke="#536b57" stroke-width="1.5"/><path d="M-13-30-19-15m32-15 6 15" stroke="#bd8c62" stroke-width="5" stroke-linecap="round"/><circle cy="-47" r="13" fill="#d3a275"/><path d="M-13-47q-2-18 13-17 16 0 14 17l-7-7-12 5-8 2Z" fill="${hair}"/><circle cx="-4" cy="-46" r="1.5" fill="#333e35"/><circle cx="5" cy="-46" r="1.5" fill="#333e35"/><path d="m-3-40 6 0" stroke="#916444" stroke-width="1.5" stroke-linecap="round"/>${agent.id === 'rook' ? '<path d="m-17-56 8-18 21 1 5 17Z" fill="#786886"/><path d="M-21-56H21" stroke="#534b62" stroke-width="5" stroke-linecap="round"/>' : ''}`;
}

export function renderVillage(container, world, activeId) {
  if (!container.querySelector('svg')) container.innerHTML = villageSVG();
  const layer = container.querySelector('#residents');
  const labels = container.querySelector('#resident-labels');
  const occupancy = {};
  for (const agent of world.agents) {
    const point = POINTS[agent.location] ?? POINTS.market;
    const n = occupancy[agent.location] ?? 0;
    occupancy[agent.location] = n + 1;
    const placement = agent.location === 'market' ? marketOffsets : offsets;
    const offset = placement[n % placement.length];
    const x = point[0] + offset[0], y = point[1] + offset[1];
    let element = layer.querySelector(`[data-resident="${agent.id}"]`);
    if (!element) {
      element = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      element.dataset.resident = agent.id;
      element.classList.add('resident');
      element.innerHTML = `<ellipse cy="0" rx="17" ry="5" class="resident-shadow"/>${residentFigure(agent)}`;
      layer.append(element);
      const name = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      name.dataset.label = agent.id;
      name.classList.add('resident-name');
      name.setAttribute('text-anchor', 'middle');
      name.textContent = agent.name;
      labels.append(name);
    }
    element.classList.toggle('active-resident', agent.id === activeId);
    element.style.transform = `translate(${x}px, ${y}px)`;
    const label = labels.querySelector(`[data-label="${agent.id}"]`);
    label.style.transform = `translate(${x}px, ${y + 16}px)`;
    label.classList.toggle('active-name', agent.id === activeId);
  }
}

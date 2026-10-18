const base=new URL('./assets/',import.meta.url).href;
export const terrainURL=base+'settlement-terrain.png';
export function buildingArt(kind){
 const index={hall:0,lumber:2,farm:3,market:4,tower:5}[kind]??0;
 return `<svg class="building-sprite" preserveAspectRatio="none" x="-55" y="-100" width="110" height="110" viewBox="${index%3*418} ${Math.floor(index/3)*418} 418 418" overflow="hidden"><image href="${base}settlement-buildings.png" width="1254" height="1254"/></svg>`;
}
export function characterArt(id){
 const index=['mira','pip','bea','gus','luna','nimbus'].indexOf(id),col=Math.max(index,0)%3;
 const top=[0,0,0,542,544,574][Math.max(index,0)],height=[540,532,544,482,480,450][Math.max(index,0)],size=height/512*88;
 return `<svg class="cast-sprite" preserveAspectRatio="none" x="-44" y="${-size}" width="88" height="${size}" viewBox="${col*512} ${top} 512 ${height}" overflow="hidden" aria-hidden="true"><image href="${base}character-sprites-v2.png" width="1536" height="1024"/></svg>`;
}
export function castPortrait(id){return `<svg viewBox="-46 -96 92 100" class="crew-portrait" aria-hidden="true">${characterArt(id)}</svg>`;}

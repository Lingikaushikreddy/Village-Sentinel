import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.SENTINEL_TEST_URL??'http://127.0.0.1:5173';
test('six illustrated residents carry out orders, expose jobs, rest and survive reload',async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install();await page.goto(base);
  await page.locator('#crew-rail [data-crew]').first().waitFor({timeout:4000});assert.equal(await page.locator('#builder-workers [data-crew]').count(),6);
  for(const name of ['Mira','Pip','Bea','Gus','Luna','Nimbus']){await page.getByRole('button',{name:`Inspect ${name} on the map`,exact:true}).click();assert.equal(await page.locator('#crew-name').textContent(),name);}
  const initial=await page.locator('.strategy-svg').getAttribute('viewBox');await page.getByRole('button',{name:'Zoom in',exact:true}).click();assert.notEqual(await page.locator('.strategy-svg').getAttribute('viewBox'),initial);await page.getByRole('button',{name:'Center village',exact:true}).click();assert.equal(await page.locator('.strategy-svg').getAttribute('viewBox'),initial);
  await page.getByRole('button',{name:'Restock supplies',exact:true}).click();await page.clock.runFor(6000);
  await page.locator('#crew-rail [data-crew="mira"]').click();assert.match(await page.locator('#crew-detail').textContent(),/Mira|Farmer/);
  await page.getByRole('button',{name:'Rest Mira for 20 seconds'}).click();assert.match(await page.locator('#crew-detail').textContent(),/Resting/);
  await page.clock.runFor(20000);assert.match(await page.locator('#crew-progress').textContent(),/12\/12|complete/i);
  await page.getByRole('button',{name:'Pause village',exact:true}).click();await page.reload();assert.equal(await page.locator('#builder-workers [data-crew]').count(),6);assert.match(await page.locator('#crew-progress').textContent(),/complete/i);
  await page.locator('.strategy-shell').screenshot({path:'work/living-cast-desktop.png',animations:'disabled'});
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.locator('.strategy-shell').screenshot({path:'work/living-cast-mobile.png',animations:'disabled'});
  await page.getByRole('button',{name:'Build Sunfield farm',exact:true}).click();await page.locator('[data-tile="4,4"]').click();assert.equal(await page.locator('#builder-buildings [data-building]').count(),6);
  await page.getByRole('link',{name:'AI missions',exact:true}).click();assert.ok(await page.locator('#scene-picker').isVisible());assert.equal(errors.length,0,errors.join('\n'));
 }finally{await browser.close();}
});

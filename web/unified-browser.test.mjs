import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.SENTINEL_TEST_URL??'http://127.0.0.1:5173';
test('missions use one painted village, hold its clock and preserve evidence on return',async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});await page.clock.install();await page.goto(base);
  await page.locator('#strategy-map > svg').waitFor();
  assert.equal(await page.locator('#village,.village-panel,.game-layout,.team-section').count(),0);
  await page.getByRole('link',{name:'AI missions',exact:true}).click();
  assert.ok(await page.locator('#village-play #mission-panel').isVisible());
  assert.equal(await page.locator('#builder-workers [data-crew]').count(),6);
  const wood=await page.locator('#resource-wood').textContent();await page.clock.runFor(10000);assert.equal(await page.locator('#resource-wood').textContent(),wood);
  await page.getByRole('button',{name:'Next decision',exact:false}).click();await page.locator('#decision-result:not([hidden])').waitFor();
  assert.match(await page.locator('#mission-map-status').textContent(),/evidence|market|trading/i);
  assert.equal(await page.locator('#history [data-decision]').count(),1);
  await page.getByRole('button',{name:'Return to building',exact:true}).click();
  assert.equal(await page.locator('#mission-panel').isVisible(),false);
  await page.clock.runFor(5000);assert.equal(Number(await page.locator('#resource-wood').textContent()),Number(wood)+6);
  await page.getByRole('link',{name:'AI missions',exact:true}).click();assert.equal(await page.locator('#history [data-decision]').count(),1);
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.getByRole('button',{name:'Next decision',exact:false}).click();await page.waitForFunction(()=>document.querySelectorAll('#history [data-decision]').length===2);assert.equal(await page.locator('#history [data-decision]').count(),2);
  await page.locator('#village-play').screenshot({path:'work/unified-mobile.png',animations:'disabled'});
  await page.setViewportSize({width:1440,height:1000});await page.locator('#village-play').screenshot({path:'work/unified-desktop.png',animations:'disabled'});
 }finally{await browser.close();}
});
test('closing during an in-flight autoplay decision stops later calls and preserves the paused village',async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  const page=await browser.newPage();await page.clock.install();await page.goto(base);
  await page.getByRole('button',{name:'Pause village',exact:true}).click();
  const wood=await page.locator('#resource-wood').textContent();
  await page.getByRole('link',{name:'AI missions',exact:true}).click();
  // Delay the result on the local HTTP path. Static replay has no POST and uses its own promise boundary.
  let release;const gate=new Promise(resolve=>{release=resolve;});let started=false;
  if(!await page.locator('html').getAttribute('data-backend'))await page.route('**/api/runs/*/step',async route=>{started=true;await gate;await route.continue();});
  await page.getByRole('button',{name:'Play the complete scene'}).click();
  if(!await page.locator('html').getAttribute('data-backend'))assert.ok(started);
  await page.getByRole('button',{name:'Return to building',exact:true}).click();release();
  await page.waitForFunction(()=>document.querySelectorAll('#history [data-decision]').length===1);
  await page.clock.runFor(5000);
  assert.equal(await page.locator('#history [data-decision]').count(),1);
  assert.equal(await page.locator('#resource-wood').textContent(),wood);
  assert.equal(await page.getByRole('button',{name:'Resume village',exact:true}).count(),1);
  await page.getByRole('link',{name:'AI missions',exact:true}).click();
  await page.getByRole('button',{name:'Next decision',exact:false}).click();
  await page.waitForFunction(()=>document.querySelectorAll('#history [data-decision]').length===2);
 }finally{await browser.close();}
});

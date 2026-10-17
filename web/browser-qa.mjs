// Run against `npm start`; Chrome must be installed, or set SENTINEL_BROWSER_CHANNEL.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const base=process.env.SENTINEL_TEST_URL ?? 'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,...(process.env.SENTINEL_BROWSER_CHANNEL==='chromium'?{}:{channel:process.env.SENTINEL_BROWSER_CHANNEL??'chrome'})});
mkdirSync('work',{recursive:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1120}});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);
 await page.getByRole('button',{name:'Next decision',exact:false}).click();
 await page.locator('#decision-result:not([hidden])').waitFor();
 assert.equal(await page.locator('.team-card').count(),6);
 assert.match(await page.locator('#operation-badge').textContent(),/Recorded/);
 assert.equal(await page.locator('#history li[data-decision]').count(),1);
 assert.match(await page.locator('#decision-result').textContent(),/travels to market/);
 await page.locator('.technical-details summary').click();
 assert.equal(await page.locator('[data-probability]').count(),3);
 await page.screenshot({path:'work/game-desktop.png',fullPage:true,animations:'disabled'});
 for(const name of ['Mira','Pip','Bea','Gus','Luna','Nimbus']){
  await page.getByRole('button',{name:`Meet ${name}`}).click();
  assert.equal(await page.getByRole('dialog').filter({has:page.getByRole('heading',{name,exact:true})}).count(),1);
  await page.getByRole('button',{name:'Close character guide'}).click();
 }
 for(const scene of ['The messenger','The fair trade']){
  await page.getByRole('button',{name:scene,exact:true}).click();
  await page.getByRole('button',{name:'Next decision',exact:false}).waitFor();
  await page.getByRole('button',{name:'Play the complete scene'}).click();
  await page.getByRole('button',{name:'Scene complete',exact:false}).waitFor({timeout:45_000});
  assert.ok(await page.locator('#history li[data-decision]').count()>0);
  assert.equal(await page.locator('#error').isVisible(),false);
 }
 await page.getByRole('button',{name:'Restart scene'}).click();
 await page.waitForFunction(()=>document.querySelector('#next-button')?.disabled===false);
 await page.setViewportSize({width:390,height:844});
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.screenshot({path:'work/game-mobile.png',fullPage:true,animations:'disabled'});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'mobile horizontal overflow');
 assert.equal(errors.length,0,errors.join('\n'));
 if(process.env.SENTINEL_TEST_LIVE==='1'){
  await page.setViewportSize({width:1440,height:1120});
  await page.selectOption('#mode','live');
  await page.waitForFunction(()=>document.querySelector('#next-button')?.disabled===false);
  await page.getByRole('button',{name:'Next decision',exact:false}).click();
  await page.locator('#decision-result:not([hidden])').waitFor({timeout:30_000});
  assert.match(await page.locator('#operation-badge').textContent(),/Live Decider/);
  assert.match(await page.locator('#truth-note').textContent(),/offline stand-in/);
  assert.equal(await page.locator('#history li[data-decision]').count(),1);
  const detail=await page.locator('#trace-detail pre').textContent();
  const trace=JSON.parse(detail);
  assert.equal(trace.provider.decider,'live');
  assert.equal(trace.trace.decider.backend.startsWith('in-process:'),true);
  assert.ok(trace.trace.decider.input_tokens>0);
  await page.screenshot({path:'work/game-live.png',fullPage:true,animations:'disabled'});
  console.log('PASS: actual local Decider -> HTTP -> engine -> browser trace');
 }
 console.log('PASS: six working role guides, recorded decision, probabilities, complete messenger/fair-trade scenes, mobile and reduced motion');
} finally {await browser.close()}

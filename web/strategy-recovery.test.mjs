import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { newVillage } from './public/strategy-state.mjs';
const base=process.env.SENTINEL_TEST_URL??'http://127.0.0.1:5173';
test('an empty saved event log recovers without breaking the game or mission board',async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(village=>localStorage.setItem('village-sentinel-strategy-v1',JSON.stringify({village,paused:true})),{...newVillage(),log:[]});
  await page.goto(base);await page.locator('#strategy-map svg').waitFor({timeout:3000});
  assert.equal(await page.locator('.scene-button').count(),3);assert.equal(errors.length,0,errors.join('\n'));
 }finally{await browser.close();}
});
test('a cached browser Back navigation resumes village time',async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome',ignoreDefaultArgs:['--disable-back-forward-cache']});
 try{
  const page=await browser.newPage();
  await page.addInitScript(()=>{window.lastPageShowPersisted=false;addEventListener('pageshow',e=>{window.lastPageShowPersisted=e.persisted;});});
  await page.goto(base);await page.locator('#strategy-map svg').waitFor();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('village-sentinel-strategy-v1')??'{}').village?.tick>=1);
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('village-sentinel-strategy-v1')).village.tick);
  await page.goto(new URL('/styles.css',base).href);await page.goBack({waitUntil:'commit'});
  await page.waitForFunction(()=>window.lastPageShowPersisted===true,{},{timeout:3000});
  await page.waitForFunction(tick=>JSON.parse(localStorage.getItem('village-sentinel-strategy-v1')).village.tick>tick,before,{timeout:3500});
 }finally{await browser.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base=process.env.SENTINEL_TEST_URL??'http://127.0.0.1:5173';
test('a chief can build, upgrade, trade, save, pause and reset the village',async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1512,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.locator('#strategy-map > svg').waitFor({timeout:5000});
  await page.getByRole('button',{name:'Pause village',exact:true}).click();
  const gold=Number(await page.locator('#resource-gold').textContent());
  await page.getByRole('button',{name:'Build Sunfield farm',exact:true}).click();
  await page.locator('[data-tile="4,4"]').click();
  assert.equal(Number(await page.locator('#resource-gold').textContent()),gold-60);
  assert.equal(await page.locator('#strategy-map [data-building]').count(),6);
  await page.getByRole('combobox',{name:'Manage a building'}).selectOption('b6');
  await page.getByRole('button',{name:/Upgrade to level 2/}).click();
  assert.match(await page.locator('#building-detail').textContent(),/Level 2/);
  const food=Number(await page.locator('#resource-food').textContent());
  await page.getByRole('button',{name:'Trade 16 coins for 8 food',exact:true}).click();
  assert.equal(Number(await page.locator('#resource-food').textContent()),food+8);
  const beforeMission=Number(await page.locator('#resource-gold').textContent());
  await page.getByRole('link',{name:'AI missions',exact:true}).click();
  await page.getByRole('button',{name:'Play the complete scene',exact:true}).click();
  await page.getByRole('button',{name:'Scene complete',exact:false}).waitFor({timeout:45000});
  assert.equal(Number(await page.locator('#resource-gold').textContent()),beforeMission+40);
  assert.match(await page.locator('#village-objectives').textContent(),/1\/1 AI mission/);
  await page.reload();await page.locator('#strategy-map [data-building=b6]').waitFor();
  assert.equal(await page.getByRole('button',{name:'Resume village',exact:true}).count(),1);
  await page.locator('.strategy-shell').screenshot({path:'work/strategy-desktop.png',animations:'disabled'});
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.waitForFunction(()=>document.querySelector('#strategy-map').scrollLeft>0);
  await page.locator('.strategy-shell').screenshot({path:'work/strategy-mobile.png',animations:'disabled'});
  await page.getByRole('button',{name:'New village',exact:true}).click();await page.getByRole('button',{name:'Start fresh',exact:true}).click();
  assert.equal(await page.locator('#strategy-map [data-building]').count(),5);
  assert.equal(errors.length,0,errors.join('\n'));
 }finally{await browser.close();}
});
test('production stops while paused and resumes with the simulation clock',async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  const page=await browser.newPage();await page.clock.install();await page.goto(base);await page.locator('#strategy-map > svg').waitFor();
  await page.getByRole('button',{name:'Pause village',exact:true}).click();const wood=Number(await page.locator('#resource-wood').textContent());
  await page.clock.runFor(10000);assert.equal(Number(await page.locator('#resource-wood').textContent()),wood);
  await page.getByRole('button',{name:'Resume village',exact:true}).click();await page.clock.runFor(5000);
  assert.equal(Number(await page.locator('#resource-wood').textContent()),wood+6);
  await page.clock.runFor(19000);assert.equal(await page.locator('.raider').count(),3);
  await page.clock.runFor(6000);assert.equal(await page.locator('.raider').count(),0);
  assert.equal(await page.locator('#resource-integrity').textContent(),'88%');
 }finally{await browser.close();}
});

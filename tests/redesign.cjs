const { chromium } = require(process.env.ROOM108_PACKAGES + '/playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {execFileSync}=require('node:child_process');
(async()=>{
const old=execFileSync('git',['show','HEAD:dist/app.js'],{encoding:'utf8'}), now=fs.readFileSync('dist/app.js','utf8');
const photoBlock=s=>s.replaceAll('\r','').slice(s.replaceAll('\r','').indexOf('// Bound browser image operations'),s.replaceAll('\r','').indexOf('function readStory()'));
assert.equal(photoBlock(now),photoBlock(old),'Photo pipeline must be byte-for-byte unchanged');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://localhost:8108');
await page.screenshot({path:'tests/output/redesign-start.png',fullPage:true});
assert.equal(await page.locator('.step:visible').count(),1);
await page.locator('#next').click();assert(await page.locator('#student').isVisible());
await page.locator('#student').fill('Mali มะลิ');await page.locator('#next').click();
await page.locator('#next').click();assert.match(await page.locator('#status').innerText(),/choose a photo/);
for(const [i,name] of ['landscape','portrait','rotated'].entries()){
const chooser=page.waitForEvent('filechooser');await page.locator(`#choose-${i}`).tap();await(await chooser).setFiles(path.resolve(`tests/output/${name}.jpg`));
await page.waitForFunction(()=>!busy);assert.match(await page.locator(`#info-${i}`).innerText(),/Photo loaded/);
assert(await page.locator(`#photo-${i}`).evaluate(img=>img.complete&&img.naturalWidth>0));
await page.locator(`#paragraph-${i}`).fill(['a forest of giant flowers. A small bird asked us to help it find its home. We followed it to a glowing door.','The door took us to a city under the sea. We met a whale who knew the bird. She showed us a path made of silver shells.','The path led us to a castle in the clouds. There, we found the bird’s family waiting for us.'][i]);
if(i===0)await page.screenshot({path:'tests/output/redesign-scene.png',fullPage:true});
await page.locator('#next').click();
}
await page.locator('#ending').fill('The bird gave us a golden feather. When we touched it, we were back in Room 108. We smiled. Our adventure was over, but the feather was still in my hand.');
await page.locator('#back').click();assert.match(await page.locator('#paragraph-2').inputValue(),/castle/);await page.locator('#next').click();await page.locator('#next').click();
assert.equal(await page.locator('#story img').count(),3);assert.match(await page.locator('#story').innerText(),/Beyond Room 108/);
await page.screenshot({path:'tests/output/redesign-preview.png',fullPage:true});
let dl=page.waitForEvent('download');await page.locator('#download').click();let file=await dl;assert.equal(file.suggestedFilename(),'Beyond-Room-108.pdf');await file.saveAs('tests/output/beyond-story.pdf');
await page.locator('#edit').click();await page.locator('#ending').fill('Z'.repeat(2900)+' ENDING_END');
for(let i=2;i>=0;i--){await page.locator('#back').click();await page.locator(`#paragraph-${i}`).fill(('We travelled to a new world and found our friends. ').repeat(55)+' WORLD_END');}
// Exercise reselection, failure recovery and same-file selection on the wizard.
await page.locator('#file-0').setInputFiles(path.resolve('tests/output/broken.jpg'));await page.waitForFunction(()=>!busy);assert.match(await page.locator('#info-0').innerText(),/previous photo/);
for(let n=0;n<2;n++){await page.locator('#file-0').setInputFiles(path.resolve('tests/output/landscape.jpg'));await page.waitForFunction(()=>!busy);assert.match(await page.locator('#info-0').innerText(),/Photo loaded/);}
for(let n=0;n<4;n++)await page.locator('#next').click();
dl=page.waitForEvent('download');await page.locator('#download').click();await(await dl).saveAs('tests/output/beyond-long.pdf');
for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
await page.locator('#edit').click();await page.evaluate(()=>showStep(0));await page.setViewportSize({width:1280,height:1000});await page.screenshot({path:'tests/output/redesign-desktop.png',fullPage:true});
assert.deepEqual(errors,[]);console.log('PASS: unchanged photo pipeline, guided validation, all 3 gallery selections and compressed previews, retained edits/navigation, same-file reselection, error recovery, story preview, normal and long PDF downloads, 320–1280px layouts.');
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});


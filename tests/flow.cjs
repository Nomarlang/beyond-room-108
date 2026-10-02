const { chromium } = require(process.env.ROOM108_PACKAGES + '/playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [], external = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (!r.url().startsWith('http://localhost:8108') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(r.url()); });
  await page.goto('http://localhost:8108');
  await page.locator('#student').fill('Mali มะลิ');
  for (let i = 0; i < 3; i++) await page.locator(`#paragraph-${i}`).fill(`We found a strange place in Scene ${i + 1}. We looked around and took a photo.`);
  await page.locator('#ending').fill('We found the key and returned to our school.');
  await page.getByRole('button', { name: 'Preview complete story' }).click();
  assert.match(await page.locator('#status').innerText(), /choose a photo/);
  for (const [i, name] of ['landscape', 'portrait', 'rotated'].entries()) {
    await page.locator(`input[data-scene="${i}"]`).first().setInputFiles(path.join(__dirname, 'output', name + '.jpg'));
    await page.waitForFunction(i => document.getElementById('status').textContent === `Scene ${i + 1} photo is ready.`, i);
  }
  const sizes = await page.evaluate(() => photos.map(p => [p.width, p.height, p.bytes]));
  assert.deepEqual(sizes.map(x => x.slice(0, 2)), [[1600, 1200], [1200, 1600], [1200, 1600]]);
  assert(sizes.every(x => x[2] < 500000));
  await page.locator('input[data-scene="0"]').first().setInputFiles(path.join(__dirname, 'output/broken.jpg'));
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('cannot open'));
  assert.deepEqual(await page.evaluate(() => [photos[0].width, photos[0].height]), [1600, 1200]);
  await page.getByRole('button', { name: 'Preview complete story' }).click();
  assert.equal(await page.locator('#story img').count(), 3);
  assert.match(await page.locator('#story').innerText(), /Mali มะลิ/);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: path.join(__dirname, 'output/mobile-preview.png'), fullPage: true });
  let waitDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
  await (await waitDownload).saveAs(path.join(__dirname, 'output/story.pdf'));
  await page.getByRole('button', { name: 'Edit story', exact: true }).click();
  const long = ('We walked through the mysterious room and looked for our friends. ').repeat(40) + ' LONG_TEXT_END';
  for (let i = 0; i < 3; i++) await page.locator(`#paragraph-${i}`).fill(long);
  await page.locator('#ending').fill('Z'.repeat(2800) + ' ENDING_END');
  await page.getByRole('button', { name: 'Preview complete story' }).click();
  waitDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
  await (await waitDownload).saveAs(path.join(__dirname, 'output/long-story.pdf'));
  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}`);
  }
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  const log = { result: 'PASS', sizes, checks: ['three 12 MP photos', 'EXIF orientation 6', 'corrupt image preserves previous photo', 'missing-photo validation', 'story preview', 'PDF download', 'long story download', '320/390/768/1280px layouts', 'no external requests', 'no JS errors'] };
  fs.writeFileSync(path.join(__dirname, 'output/results.json'), JSON.stringify(log, null, 2));
  console.log(JSON.stringify(log, null, 2));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

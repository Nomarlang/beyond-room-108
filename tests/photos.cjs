const { chromium } = require(process.env.ROOM108_PACKAGES + '/playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const fixture = name => path.join(__dirname, 'output', name + '.jpg');
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    // Reproduce the old silent-drop path with selections arriving during encoding.
    const old = await browser.newPage();
    const oldSource = execFileSync('git', ['show', 'c3085c72d0f806c982bb9473a16aa8681367d198:dist/app.js'], { encoding: 'utf8' });
    await old.route('**/app.js', route => route.fulfill({ contentType: 'text/javascript', body: oldSource }));
    await old.goto('http://localhost:8108');
    await old.evaluate(() => {
      const encode = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (cb, ...args) { encode.call(this, blob => setTimeout(() => cb(blob), 500), ...args); };
    });
    for (let i = 0; i < 3; i++) await old.locator(`input[data-scene="${i}"]`).setInputFiles(fixture('landscape'));
    await old.waitForFunction(() => !busy);
    assert.deepEqual(await old.evaluate(() => photos.map(Boolean)), [true, false, false]);
    await old.close();
    console.log('Confirmed old bug: two selections silently dropped while the first image was processing.');

    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://localhost:8108');
    assert.equal(await page.getByRole('button', { name: /Take photo/ }).count(), 0);
    assert.equal(await page.locator('video, dialog, input[capture]').count(), 0);
    await page.evaluate(() => {
      window.encodePhoto = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (cb, ...args) { encodePhoto.call(this, blob => setTimeout(() => cb(blob), 500), ...args); };
    });
    for (const [i, name] of ['landscape', 'portrait', 'rotated'].entries()) {
      const chooserEvent = page.waitForEvent('filechooser');
      await page.locator(`#choose-${i}`).tap();
      await (await chooserEvent).setFiles(fixture(name));
      assert.match(await page.locator(`#info-${i}`).innerText(), /Processing|Waiting/);
    }
    assert(await page.locator('#student').isEnabled());
    await page.waitForFunction(() => !busy);
    assert.deepEqual(await page.evaluate(() => photos.map(p => [p.width, p.height])), [[1600, 1200], [1200, 1600], [1200, 1600]]);
    for (let i = 0; i < 3; i++) {
      assert.match(await page.locator(`#info-${i}`).innerText(), /Photo loaded/);
      assert(await page.locator(`#photo-${i}`).evaluate(img => img.complete && img.naturalWidth > 0 && !img.hidden));
      // Reselect the same image, then a replacement, through each real button.
      for (const name of [['landscape', 'portrait', 'rotated'][i], 'landscape']) {
        const chooser = page.waitForEvent('filechooser');
        await page.locator(`#choose-${i}`).tap();
        await (await chooser).setFiles(fixture(name));
        await page.waitForFunction(() => !busy);
        assert.match(await page.locator(`#info-${i}`).innerText(), /Photo loaded/);
      }
      const previous = await page.locator(`#photo-${i}`).getAttribute('src');
      await page.locator(`#file-${i}`).dispatchEvent('cancel');
      assert.equal(await page.locator(`#photo-${i}`).getAttribute('src'), previous);
      await page.locator(`#file-${i}`).setInputFiles(fixture('broken'));
      await page.waitForFunction(() => !busy);
      assert.match(await page.locator(`#info-${i}`).innerText(), /cannot open.*previous photo/);
      assert.equal(await page.locator(`#photo-${i}`).getAttribute('src'), previous);
      await page.locator(`#file-${i}`).setInputFiles(fixture('portrait'));
      await page.waitForFunction(() => !busy);
      assert.match(await page.locator(`#info-${i}`).innerText(), /Photo loaded/);
    }
    // An encoder that never returns must unlock the UI and keep the prior photo.
    await page.clock.install();
    await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob = () => { window.encoderHung = true; }; });
    const previous = await page.locator('#photo-0').getAttribute('src');
    await page.locator('#file-0').setInputFiles(fixture('landscape'));
    await page.waitForFunction(() => window.encoderHung);
    await page.clock.fastForward(31000);
    await page.waitForFunction(() => !busy);
    assert.match(await page.locator('#info-0').innerText(), /took too long/);
    assert(await page.locator('#choose-0').isEnabled());
    assert.equal(await page.locator('#photo-0').getAttribute('src'), previous);
    await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob = encodePhoto; });
    await page.locator('#file-0').setInputFiles(fixture('landscape'));
    await page.waitForFunction(() => !busy);
    assert.match(await page.locator('#info-0').innerText(), /Photo loaded/);
    assert.deepEqual(errors, []);
    console.log('PASS: all three touch picker buttons, queued 12MP photos, compression, EXIF orientation, decoded previews, per-scene progress/success, same-file reselection, replacement, cancellation, corrupt-file recovery, timeout recovery.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });

const { chromium } = require(process.env.ROOM108_PACKAGES + '/playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://localhost:8108');
    await page.evaluate(() => {
      window.cameraCalls = []; window.cameraTracks = [];
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async constraints => {
        cameraCalls.push(constraints);
        const stream = await original(constraints);
        cameraTracks.push(...stream.getTracks());
        return stream;
      };
    });
    assert.equal(await page.locator('input[type=file]').count(), 3);
    assert.equal(await page.locator('input[capture]').count(), 0);
    for (let i = 0; i < 3; i++) {
      await page.locator(`[data-camera-scene="${i}"]`).click();
      await page.waitForFunction(() => !document.getElementById('camera-capture').disabled);
      assert(await page.locator('#camera-video').evaluate(v => v.srcObject.active));
      await page.locator('#camera-capture').click();
      await page.waitForFunction(i => photos[i] && !cameraSession, i);
      assert(await page.locator(`#photo-${i}`).isVisible());
    }
    assert(await page.evaluate(() => cameraTracks.every(t => t.readyState === 'ended')));
    assert(await page.evaluate(() => cameraCalls.every(c => c.audio === false && c.video.facingMode.ideal === 'environment')));
    assert(await page.evaluate(() => photos.every(p => Math.max(p.width, p.height) <= 1600 && p.data.startsWith('data:image/jpeg'))));
    const previous = await page.evaluate(() => photos[0].data);
    await page.locator('[data-camera-scene="0"]').click();
    await page.waitForFunction(() => !document.getElementById('camera-capture').disabled);
    await page.locator('#camera-cancel').click();
    assert.equal(await page.evaluate(() => photos[0].data), previous);
    assert(await page.evaluate(() => cameraTracks.every(t => t.readyState === 'ended') && !busy));
    await page.locator('#student').fill('Camera test');
    for (let i = 0; i < 3; i++) await page.locator(`#paragraph-${i}`).fill(`We took a photo in Scene ${i + 1}.`);
    await page.locator('#ending').fill('We came back home.');
    await page.getByRole('button', { name: 'Preview complete story' }).click();
    assert.equal(await page.locator('#story img').count(), 3);
    const download = page.waitForEvent('download');
    await page.locator('#download').click();
    await (await download).saveAs(path.join(__dirname, 'output/camera-story.pdf'));
    await page.locator('#edit').click();
    await page.evaluate(() => {
      navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Test denial', 'NotAllowedError'); };
    });
    await page.locator('[data-camera-scene="1"]').click();
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('Camera access was blocked'));
    assert(await page.evaluate(() => !busy && !document.getElementById('editor').disabled));
    // Cancellation while permission is pending must discard and stop late streams.
    await page.evaluate(() => {
      navigator.mediaDevices.getUserMedia = () => new Promise(resolve => { window.resolveCamera = resolve; });
    });
    await page.locator('[data-camera-scene="2"]').click();
    await page.locator('#camera-cancel').click();
    await page.evaluate(() => {
      window.lateTrackStopped = false;
      resolveCamera({ getTracks: () => [{ stop: () => { window.lateTrackStopped = true; } }] });
    });
    await page.waitForFunction(() => window.lateTrackStopped);
    assert.deepEqual(errors, []);
    const lanPage = await browser.newPage();
    await lanPage.goto('http://192.168.24.114:8108');
    assert.equal(await lanPage.evaluate(() => isSecureContext), false);
    await lanPage.locator('[data-camera-scene="0"]').click();
    assert.match(await lanPage.locator('#status').innerText(), /needs HTTPS/);
    assert.equal(await lanPage.locator('input[type=file]:enabled').count(), 3);
    console.log('PASS: all three camera captures, rear-camera preference, JPEG previews, PDF download, track cleanup, cancellation, permission denial, late permission cleanup, and HTTP LAN warning. Synthetic camera; physical phone/Safari not tested.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

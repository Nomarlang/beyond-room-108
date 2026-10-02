'use strict';

const $ = (id) => document.getElementById(id);
const opening = 'We entered Room 108 and we found ourselves in...';
const photos = [null, null, null];
let busy = false;
let pdfUrl = null;

for (let i = 0; i < 3; i++) {
  const section = document.createElement('section');
  section.innerHTML = `<h2>Scene ${i + 1}</h2>
    <div class="actions">
      <label class="file-button">Choose photo<input type="file" accept="image/*" data-scene="${i}" aria-label="Choose photo for Scene ${i + 1}"></label>
      <button type="button" data-camera-scene="${i}" aria-label="Take photo for Scene ${i + 1}">Take photo</button>
    </div>
    <img id="photo-${i}" hidden alt="Your Scene ${i + 1} photo">
    <p id="info-${i}" class="photo-info">Choose one photo. Maximum file size: 25 MB.</p>
    <label for="paragraph-${i}">Write a short paragraph for Scene ${i + 1}</label>
    <textarea id="paragraph-${i}" rows="5" maxlength="3000" required></textarea>`;
  $('scenes').append(section);
}

function status(message) { $('status').textContent = message; }
function invalidatePdf() {
  if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  pdfUrl = null;
  $('download-help').hidden = true;
  $('pdf-link').removeAttribute('href');
}

// The browser decodes EXIF orientation. Do not rotate a second time.
// Only one original is decoded at a time; only resized JPEGs stay in state.
async function compressPhoto(file) {
  if (file.size > 25 * 1024 * 1024) throw new Error('This photo is over 25 MB. Choose a smaller photo.');
  const url = URL.createObjectURL(file);
  const img = new Image();
  const canvas = document.createElement('canvas');
  try {
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('This browser cannot open that photo. Choose a JPEG or PNG, or take a new photo. For HEIC photos, export as JPEG first.'));
      img.src = url;
    });
    if (!img.naturalWidth || img.naturalWidth * img.naturalHeight > 50000000) {
      throw new Error('This photo is too large to process safely. Choose a photo below 50 megapixels.');
    }
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Photo processing is unavailable. Please try another browser.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .8));
    if (!blob) throw new Error('Could not process this photo. Please choose another photo.');
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return { data, width: canvas.width, height: canvas.height, bytes: blob.size };
  } finally {
    img.src = '';
    URL.revokeObjectURL(url);
    canvas.width = canvas.height = 1;
  }
}

function setScenePhoto(i, photo) {
  photos[i] = photo;
  $(`photo-${i}`).src = photo.data;
  $(`photo-${i}`).hidden = false;
  $(`info-${i}`).textContent = `${photo.width} × ${photo.height} pixels · ${Math.round(photo.bytes / 1024)} KB. You can choose a different photo.`;
  invalidatePdf();
  status(`Scene ${i + 1} photo is ready.`);
}

// One camera dialog serves all scenes. Session identity prevents late permission
// responses or captures from updating a scene after the user cancels.
const cameraDialog = document.createElement('dialog');
cameraDialog.id = 'camera-dialog';
cameraDialog.setAttribute('aria-labelledby', 'camera-title');
cameraDialog.innerHTML = `<h2 id="camera-title">Take photo</h2>
  <video id="camera-video" autoplay muted playsinline aria-label="Live camera preview"></video>
  <p id="camera-status" role="status" aria-live="polite"></p>
  <div class="actions">
    <button id="camera-capture" type="button" disabled>Capture photo</button>
    <button id="camera-cancel" type="button">Cancel</button>
  </div>`;
document.body.append(cameraDialog);
let cameraSession = null;

function closeCamera() {
  if (!cameraSession) return;
  const session = cameraSession;
  cameraSession = null;
  session.stream?.getTracks().forEach(track => track.stop());
  $('camera-video').pause();
  $('camera-video').srcObject = null;
  if (cameraDialog.open) cameraDialog.close();
  busy = false;
  $('editor').disabled = false;
  document.querySelector(`[data-camera-scene="${session.scene}"]`).focus();
}

async function openCamera(scene) {
  if (busy) return;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    status('The in-app camera needs HTTPS on your phone. This local-network HTTP address cannot use it. You can still use Choose photo.');
    return;
  }
  busy = true;
  $('editor').disabled = true;
  const session = { scene, stream: null };
  cameraSession = session;
  $('camera-title').textContent = `Take photo for Scene ${scene + 1}`;
  $('camera-status').textContent = 'Allow camera access to see the preview.';
  $('camera-capture').disabled = true;
  cameraDialog.showModal();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1600 }, height: { ideal: 1200 } }
    });
    if (cameraSession !== session) { stream.getTracks().forEach(track => track.stop()); return; }
    session.stream = stream;
    stream.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
      if (cameraSession === session) { closeCamera(); status('The camera stopped. Tap Take photo to try again.'); }
    }));
    const video = $('camera-video');
    video.srcObject = stream;
    await video.play();
    if (cameraSession !== session) return;
    $('camera-capture').disabled = !(video.videoWidth && video.videoHeight && video.readyState >= 2);
    $('camera-status').textContent = 'Frame your photo, then tap Capture photo.';
  } catch (error) {
    if (cameraSession !== session) return;
    closeCamera();
    const messages = {
      NotAllowedError: 'Camera access was blocked. Allow camera access in your browser settings, or use Choose photo.',
      NotFoundError: 'No camera was found. Use Choose photo instead.',
      NotReadableError: 'The camera is unavailable. Close other apps using it and try again.'
    };
    status(messages[error.name] || 'Could not open the camera. Please try again or use Choose photo.');
  }
}

$('camera-video').addEventListener('canplay', () => {
  if (cameraSession && !cameraSession.capturing) $('camera-capture').disabled = false;
});
$('camera-capture').addEventListener('click', async () => {
  const session = cameraSession;
  const video = $('camera-video');
  if (!session || session.capturing || !video.videoWidth || video.readyState < 2) return;
  session.capturing = true;
  $('camera-capture').disabled = true;
  $('camera-status').textContent = 'Preparing your photo…';
  const canvas = document.createElement('canvas');
  try {
    const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .9));
    if (!blob) throw new Error('Could not capture this photo. Please try again.');
    const photo = await compressPhoto(blob);
    if (cameraSession !== session) return;
    setScenePhoto(session.scene, photo);
    closeCamera();
  } catch (error) {
    if (cameraSession !== session) return;
    session.capturing = false;
    $('camera-capture').disabled = false;
    $('camera-status').textContent = error.message || 'Could not capture this photo. Please try again.';
  } finally { canvas.width = canvas.height = 1; }
});
document.querySelectorAll('[data-camera-scene]').forEach(button => {
  button.addEventListener('click', () => openCamera(Number(button.dataset.cameraScene)));
});
$('camera-cancel').addEventListener('click', closeCamera);
cameraDialog.addEventListener('cancel', event => { event.preventDefault(); closeCamera(); });
window.addEventListener('pagehide', closeCamera);
document.addEventListener('visibilitychange', () => { if (document.hidden) closeCamera(); });

document.querySelectorAll('input[type=file]').forEach(input => {
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file || busy) return;
    busy = true;
    $('editor').disabled = true;
    const i = Number(input.dataset.scene);
    status(`Preparing Scene ${i + 1} photo…`);
    try {
      const photo = await compressPhoto(file);
      setScenePhoto(i, photo);
    } catch (error) { status(error.message || 'Could not process this photo. Please try again.'); }
    finally { input.value = ''; busy = false; $('editor').disabled = false; }
  });
});

function readStory() {
  return {
    name: $('student').value.trim(),
    scenes: photos.map((photo, i) => ({ photo, text: $(`paragraph-${i}`).value.trim() })),
    ending: $('ending').value.trim()
  };
}
function textElement(tag, text, className = '') {
  const el = document.createElement(tag);
  el.textContent = text;
  el.className = className;
  return el;
}
$('story-form').addEventListener('submit', event => {
  event.preventDefault();
  if (busy) return;
  const data = readStory();
  const missing = data.scenes.findIndex(scene => !scene.photo);
  if (missing !== -1) {
    status(`Please choose a photo for Scene ${missing + 1}.`);
    document.querySelector(`input[data-scene="${missing}"]`).focus();
    return;
  }
  if (!data.name || data.scenes.some(scene => !scene.text) || !data.ending) {
    status('Please write your name, all three paragraphs, and an ending.');
    return;
  }
  const article = $('story');
  article.replaceChildren(textElement('h2', 'Room 108'), textElement('p', data.name, 'story-text'), textElement('p', opening, 'opening'));
  data.scenes.forEach((scene, i) => {
    const img = new Image();
    img.src = scene.photo.data;
    img.alt = `Scene ${i + 1}`;
    article.append(textElement('h3', `Scene ${i + 1}`), img, textElement('p', scene.text, 'story-text'));
  });
  article.append(textElement('h3', 'Final ending'), textElement('p', data.ending, 'story-text'));
  $('story-form').hidden = true;
  $('preview').hidden = false;
  status('Check your story, then download your PDF.');
  $('preview-title').focus();
});
$('edit').addEventListener('click', () => {
  $('preview').hidden = true;
  $('story-form').hidden = false;
  status('');
  $('student').focus();
});
$('story-form').addEventListener('input', invalidatePdf);

// PDF paragraphs use browser-shaped text so Thai names and punctuation also work.
// Render small, paginated text blocks, never a giant screenshot of the story.
function wrapText(ctx, text, maxWidth) {
  const lines = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = '';
    const words = typeof Intl.Segmenter === 'function'
      ? Array.from(new Intl.Segmenter(undefined, { granularity: 'word' }).segment(paragraph), s => s.segment)
      : paragraph.split(/(\s+)/);
    for (const word of words) {
      if (ctx.measureText(line + word).width <= maxWidth) { line += word; continue; }
      if (line.trim()) lines.push(line.trimEnd());
      line = '';
      const chars = typeof Intl.Segmenter === 'function'
        ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(word.trimStart()), s => s.segment)
        : Array.from(word.trimStart());
      for (const char of chars) {
        if (ctx.measureText(line + char).width > maxWidth && line) { lines.push(line); line = ''; }
        line += char;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

function buildPdf(data) {
  if (!window.jspdf) throw new Error('The PDF library is missing. Keep the vendor folder with the app and reload.');
  const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.setProperties({ title: 'Room 108', author: data.name });
  const margin = 18, width = 174, bottom = 276;
  let y = margin;
  const newPage = () => { doc.addPage(); y = margin; };
  const heading = (text, size = 16) => {
    if (y + 16 > bottom) newPage();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(size);
    doc.text(text, margin, y + 6); y += 14;
  };
  const paragraph = text => {
    const canvas = document.createElement('canvas');
    const pixelsPerMm = 6;
    canvas.width = width * pixelsPerMm;
    const ctx = canvas.getContext('2d');
    const font = '26px Arial, sans-serif'; // ~12 pt, rendered at ~152 dpi
    ctx.font = font;
    const lines = wrapText(ctx, text, canvas.width - 8);
    const lineHeight = 40;
    while (lines.length) {
      let count = Math.floor((bottom - y) * pixelsPerMm / lineHeight);
      if (count < 1) { newPage(); count = Math.floor((bottom - y) * pixelsPerMm / lineHeight); }
      const chunk = lines.splice(0, count);
      canvas.height = chunk.length * lineHeight;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = font; ctx.fillStyle = '#111'; ctx.textBaseline = 'alphabetic';
      chunk.forEach((line, i) => ctx.fillText(line, 2, i * lineHeight + 29));
      const height = canvas.height / pixelsPerMm;
      doc.addImage(canvas.toDataURL('image/png'), 'PNG', margin, y, width, height);
      y += height;
      if (lines.length) newPage();
    }
    canvas.width = canvas.height = 1;
    y += 5;
  };
  heading('Room 108', 24);
  paragraph(data.name);
  paragraph(opening);
  data.scenes.forEach((scene, i) => {
    if (i > 0) newPage();
    heading(`Scene ${i + 1}`);
    const photo = scene.photo;
    const maxHeight = Math.min(125, bottom - y - 18);
    const scale = Math.min(width / photo.width, maxHeight / photo.height);
    const w = photo.width * scale, h = photo.height * scale;
    doc.addImage(photo.data, 'JPEG', margin + (width - w) / 2, y, w, h);
    y += h + 7;
    paragraph(scene.text);
  });
  if (y + 35 > bottom) newPage();
  heading('Final ending');
  paragraph(data.ending);
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page++) {
    doc.setPage(page); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text(`Room 108 | ${page} / ${total}`, 105, 288, { align: 'center' });
  }
  return doc.output('blob');
}

$('download').addEventListener('click', () => {
  if (busy) return;
  busy = true;
  $('download').disabled = true;
  try {
    // Synchronous generation preserves the user's download gesture in Safari.
    const blob = buildPdf(readStory());
    invalidatePdf();
    pdfUrl = URL.createObjectURL(blob);
    const link = $('pdf-link');
    link.href = pdfUrl;
    link.download = 'Room-108.pdf';
    $('download-help').hidden = false;
    link.click();
    status('Your PDF is ready. Check your downloads, or use the link below.');
  } catch (error) { status(error.message || 'PDF generation failed. Try smaller photos and download again.'); }
  finally { busy = false; $('download').disabled = false; }
});
window.addEventListener('beforeunload', event => {
  if ($('student').value || photos.some(Boolean) || $('ending').value || [0, 1, 2].some(i => $(`paragraph-${i}`).value)) {
    event.preventDefault(); event.returnValue = '';
  }
});

'use strict';

const $ = (id) => document.getElementById(id);
const opening = 'We entered Room 108 and we found ourselves in…';
const photos = [null, null, null];
let busy = false;
let pdfUrl = null;

for (let i = 0; i < 3; i++) {
  const section = document.createElement('section');
  section.id = `scene-${i}`;
  section.className = 'step';
  section.hidden = true;
  const titles = ['Where are you?', 'Room 108 takes you somewhere new.', 'Where does Room 108 take you next?'];
  const prompts = ['Choose your first place. What can you see? What happens there?', 'You are in a new place. What happens next?', 'You are in your third place. What happens here?'];
  section.innerHTML = `<span class="chapter">WORLD 0${i + 1} / 03</span><h2 tabindex="-1">${titles[i]}</h2><p>${prompts[i]}</p>
    ${i === 0 ? `<p class="opening">${opening}</p>` : ''}
    <div class="actions">
      <button id="choose-${i}" type="button" aria-label="Choose photo for Scene ${i + 1}">Choose photo</button>
      <input id="file-${i}" type="file" accept="image/*" data-scene="${i}" aria-label="Choose photo for Scene ${i + 1}" hidden>
    </div>
    <img id="photo-${i}" hidden alt="Your Scene ${i + 1} photo">
    <p id="info-${i}" class="photo-info" role="status" aria-live="polite">Choose one photo. Maximum file size: 25 MB.</p>
    <label for="paragraph-${i}">Scene ${i + 1} · What happens?</label>
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

// Bound browser image operations so failures always unlock the picker.
function photoTimeout(promise) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Photo processing took too long. Choose a smaller photo saved on this device.')), 30000);
  })]).finally(() => clearTimeout(timer));
}
async function loadPhotoImage(img, source) {
  try {
    await photoTimeout(new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('This browser cannot open that photo. Choose a JPEG or PNG. For HEIC photos, export as JPEG first.'));
      img.src = source;
    }));
    if (img.decode) await photoTimeout(img.decode());
  } finally { img.onload = img.onerror = null; }
}

// The browser decodes EXIF orientation. Do not rotate a second time.
// Only one original is decoded at a time; only resized JPEGs stay in state.
async function compressPhoto(file) {
  if (file.size > 25 * 1024 * 1024) throw new Error('This photo is over 25 MB. Choose a smaller photo.');
  const url = URL.createObjectURL(file);
  const img = new Image();
  const canvas = document.createElement('canvas');
  try {
    await loadPhotoImage(img, url);
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
    const blob = await photoTimeout(new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .8)));
    if (!blob) throw new Error('Could not process this photo. Please choose another photo.');
    const data = await photoTimeout(new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read this photo. Please choose a locally saved JPEG or PNG.'));
      reader.readAsDataURL(blob);
    }));
    return { data, width: canvas.width, height: canvas.height, bytes: blob.size };
  } finally {
    img.src = '';
    URL.revokeObjectURL(url);
    canvas.width = canvas.height = 1;
  }
}

async function setScenePhoto(i, photo) {
  const preview = new Image();
  preview.id = `photo-${i}`;
  preview.alt = `Your Scene ${i + 1} photo`;
  await loadPhotoImage(preview, photo.data);
  // Keep the previous image until its replacement has actually decoded.
  $(`photo-${i}`).replaceWith(preview);
  photos[i] = photo;
  $(`info-${i}`).textContent = `Photo loaded. ${photo.width} × ${photo.height} pixels · ${Math.round(photo.bytes / 1024)} KB. You can choose a different photo.`;
  invalidatePdf();
  status(`Scene ${i + 1} photo is ready.`);
}

// Keep processing sequential to limit memory, but never drop a new selection.
let photoQueue = Promise.resolve();
let pendingPhotos = 0;
document.querySelectorAll('input[type=file]').forEach(input => {
  const i = Number(input.dataset.scene);
  const button = $(`choose-${i}`);
  button.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return; // Cancelling the picker preserves the current photo.
    pendingPhotos++;
    busy = true;
    button.disabled = true;
    $('story-form').querySelector('button[type=submit]').disabled = true;
    $(`info-${i}`).textContent = pendingPhotos > 1 ? 'Photo selected. Waiting to process…' : 'Processing photo…';
    $(`info-${i}`).setAttribute('aria-busy', 'true');
    photoQueue = photoQueue.then(async () => {
      $(`info-${i}`).textContent = 'Processing photo…';
      status(`Preparing Scene ${i + 1} photo…`);
      // Let the browser paint progress before decoding/drawing a large photo.
      await new Promise(resolve => setTimeout(resolve, 0));
      try {
        const photo = await compressPhoto(file);
        await setScenePhoto(i, photo);
      } catch (error) {
        const message = error.message || 'Could not process this photo. Please choose it again.';
        $(`info-${i}`).textContent = message + (photos[i] ? ' Your previous photo is still selected.' : '');
        status(message);
      } finally {
        input.value = ''; // Allow selecting the same file again after success or failure.
        button.disabled = false;
        $(`info-${i}`).setAttribute('aria-busy', 'false');
        pendingPhotos--;
        busy = pendingPhotos > 0;
        $('story-form').querySelector('button[type=submit]').disabled = busy;
      }
    });
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
let currentStep = 0;
const steps = [$('mission'), $('scene-0'), $('scene-1'), $('scene-2'), $('ending-step')];
function showStep(index, focus = true) {
  currentStep = index;
  steps.forEach((step, i) => { step.hidden = i !== index; });
  [...$('progress').children].forEach((item, i) => {
    item.classList.toggle('active', i === index);
    if (i === index) item.setAttribute('aria-current', 'step');
    else item.removeAttribute('aria-current');
  });
  $('back').hidden = index === 0;
  $('next').textContent = index === 0 ? 'Enter Room 108' : index === 4 ? 'See my story' : index === 3 ? 'Write the ending' : index === 1 ? 'Go to Scene 2' : 'Go to Scene 3';
  status('');
  if (focus) { steps[index].querySelector('h2').focus(); steps[index].scrollIntoView({ block: 'start' }); }
}
showStep(0, false);
$('back').addEventListener('click', () => { if (!busy) showStep(currentStep - 1); });
$('story-form').addEventListener('submit', event => {
  event.preventDefault();
  if (busy) return;
  const field = currentStep === 0 ? $('student') : currentStep === 4 ? $('ending') : $(`paragraph-${currentStep - 1}`);
  if (currentStep > 0 && currentStep < 4 && !photos[currentStep - 1]) {
    status(`Please choose a photo for Scene ${currentStep}.`);
    $(`choose-${currentStep - 1}`).focus(); return;
  }
  field.setCustomValidity(field.value.trim() ? '' : 'Please write something before continuing.');
  if (!field.reportValidity()) return;
  if (currentStep < 4) { showStep(currentStep + 1); return; }
  const data = readStory();
  const article = $('story');
  article.replaceChildren(textElement('h2', 'Beyond Room 108'), textElement('p', `A story by ${data.name}`, 'byline story-text'), textElement('p', opening, 'opening'));
  data.scenes.forEach((scene, i) => {
    const img = new Image();
    img.src = scene.photo.data;
    img.alt = `Scene ${i + 1}`;
    article.append(textElement('h3', `World ${String(i + 1).padStart(2, '0')}`), img, textElement('p', scene.text, 'story-text'));
  });
  article.append(textElement('h3', 'The ending'), textElement('p', data.ending, 'story-text'));
  $('story-form').hidden = true;
  $('preview').hidden = false;
  status('Check your story, then download your PDF.');
  $('preview-title').focus();
});
$('edit').addEventListener('click', () => {
  $('preview').hidden = true;
  $('story-form').hidden = false;
  status('');
  showStep(4);
});
$('story-form').addEventListener('input', event => { event.target.setCustomValidity?.(''); invalidatePdf(); });

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
  doc.setProperties({ title: 'Beyond Room 108', author: data.name });
  const margin = 20, width = 170, bottom = 274;
  const cream = [250, 246, 236], navy = [13, 45, 80], pink = [218, 0, 105];
  const decorate = () => {
    doc.setFillColor(...cream); doc.rect(0, 0, 210, 297, 'F');
    doc.setDrawColor(...pink); doc.setLineWidth(.5); doc.line(margin, 14, margin + 16, 14);
    doc.setTextColor(...navy); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text('BEYOND ROOM 108', margin + 21, 15);
  };
  let y = 25;
  decorate();
  const newPage = () => { doc.addPage(); decorate(); y = 25; };
  const heading = (text, size = 16) => {
    if (y + 16 > bottom) newPage();
    doc.setTextColor(...navy); doc.setFont('times', 'bold'); doc.setFontSize(size);
    doc.text(text, margin, y + 6); y += 14;
  };
  const paragraph = text => {
    const canvas = document.createElement('canvas');
    const pixelsPerMm = 6;
    canvas.width = width * pixelsPerMm;
    const ctx = canvas.getContext('2d');
    const font = '27px Georgia, serif'; // ~12 pt, rendered at ~152 dpi
    ctx.font = font;
    const lines = wrapText(ctx, text, canvas.width - 8);
    const lineHeight = 40;
    while (lines.length) {
      let count = Math.floor((bottom - y) * pixelsPerMm / lineHeight);
      if (count < 1) { newPage(); count = Math.floor((bottom - y) * pixelsPerMm / lineHeight); }
      const chunk = lines.splice(0, count);
      canvas.height = chunk.length * lineHeight;
      ctx.fillStyle = '#faf6ec'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = font; ctx.fillStyle = '#0d2d50'; ctx.textBaseline = 'alphabetic';
      chunk.forEach((line, i) => ctx.fillText(line, 2, i * lineHeight + 29));
      const height = canvas.height / pixelsPerMm;
      doc.addImage(canvas.toDataURL('image/png'), 'PNG', margin, y, width, height);
      y += height;
      if (lines.length) newPage();
    }
    canvas.width = canvas.height = 1;
    y += 5;
  };
  heading('Beyond Room 108', 32);
  paragraph(`A story by ${data.name}`);
  paragraph(opening);
  data.scenes.forEach((scene, i) => {
    if (i > 0) newPage();
    doc.setTextColor(...pink); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text(`WORLD 0${i + 1}`, margin, y + 5); y += 12;
    const photo = scene.photo;
    const maxHeight = Math.min(155, bottom - y - 28);
    const scale = Math.min(width / photo.width, maxHeight / photo.height);
    const w = photo.width * scale, h = photo.height * scale;
    doc.addImage(photo.data, 'JPEG', margin + (width - w) / 2, y, w, h);
    y += h + 7;
    paragraph(scene.text);
  });
  if (y + 35 > bottom) newPage();
  heading('The ending', 20);
  paragraph(data.ending);
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page++) {
    doc.setPage(page); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.setDrawColor(...pink); doc.line(98, 282, 112, 282);
    doc.setTextColor(...navy);
    doc.text(`${page} / ${total}`, 105, 289, { align: 'center' });
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
    link.download = 'Beyond-Room-108.pdf';
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

// ============================================================
// Kendra – Book Catalog App Logic
// ============================================================

'use strict';

// ---- App State ----
const state = {
  person:              null,   // selected PEOPLE entry
  capturedImageBase64: null,   // base64 string (no data-URI prefix)
  capturedImageMime:   null,   // e.g. 'image/jpeg'
  allBooks:            [],     // cached from localStorage
};

// ---- Initialise ----
document.addEventListener('DOMContentLoaded', () => {
  buildPersonList();
  populateDropdowns();
  loadApiKeyField();

  document.getElementById('camera-input').addEventListener('change', handleImage);
  document.getElementById('file-input').addEventListener('change', handleImage);

  // Restore session (person stays selected across page refreshes within the same tab)
  const savedName = sessionStorage.getItem('kendra_person');
  if (savedName) {
    const person = PEOPLE.find(p => p.name === savedName);
    if (person) selectPerson(person);
  }
});

// ============================================================
// PERSON SELECTION
// ============================================================

function buildPersonList() {
  const list = document.getElementById('person-list');
  PEOPLE.forEach(person => {
    const btn = document.createElement('button');
    btn.className = 'person-btn';
    btn.innerHTML = `
      <span class="person-name">${esc(person.name)}</span>
      <span class="person-lot">Lot ${person.lotStart}–${person.lotEnd}</span>
    `;
    btn.addEventListener('click', () => selectPerson(person));
    list.appendChild(btn);
  });
}

function selectPerson(person) {
  state.person = person;
  sessionStorage.setItem('kendra_person', person.name);
  refreshCache();

  document.getElementById('greeting').textContent = `Hello, ${person.name}!`;
  document.getElementById('lot-info').textContent = `Lot ${person.lotStart}–${person.lotEnd}`;
  document.getElementById('bottom-nav').classList.add('visible');

  updateDashboard();
  showScreen('dashboard');
}

function switchPerson() {
  state.person = null;
  sessionStorage.removeItem('kendra_person');
  document.getElementById('bottom-nav').classList.remove('visible');
  showScreen('welcome');
}

// ============================================================
// SCREEN NAVIGATION
// ============================================================

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');

  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.screen === name);
  });

  if (name === 'dashboard') updateDashboard();
  if (name === 'books')     renderBookList('');
  if (name === 'add-book')  resetAddBook();

  window.scrollTo(0, 0);
}

// ============================================================
// DASHBOARD
// ============================================================

function updateDashboard() {
  if (!state.person) return;
  refreshCache();

  const myBooks = getMyBooks();
  const nextId  = getNextId();

  document.getElementById('books-count').textContent    = myBooks.length;
  document.getElementById('next-id-display').textContent = nextId !== null ? nextId : 'Full!';

  renderRecent(myBooks);
}

function renderRecent(books) {
  const container = document.getElementById('recent-books');
  const recent = books
    .slice()
    .sort((a, b) => b.addedAt - a.addedAt)
    .slice(0, 5);

  if (recent.length === 0) { container.innerHTML = ''; return; }

  container.innerHTML =
    `<div class="recent-header">Recent Books</div>` +
    recent.map(b => `
      <div class="recent-item">
        <span class="recent-id">#${b.id}</span>
        <span class="recent-title">${esc(b.title || '(untitled)')}</span>
        <span class="recent-cond">${esc(shortCondition(b.condition))}</span>
      </div>
    `).join('');
}

// ============================================================
// ADD BOOK FLOW
// ============================================================

function resetAddBook() {
  // Clear image state
  state.capturedImageBase64 = null;
  state.capturedImageMime   = null;
  document.getElementById('image-preview').src = '';
  document.getElementById('preview-container').classList.add('hidden');
  document.getElementById('capture-placeholder').classList.remove('hidden');
  document.getElementById('scan-btn').disabled = true;
  document.getElementById('camera-input').value = '';
  document.getElementById('file-input').value = '';
  hideScanStatus();

  // Clear form fields
  ['field-title', 'field-author', 'field-notes'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('field-genre').value     = '';
  document.getElementById('field-condition').value = '';

  // Show next ID
  const nextId = getNextId();
  document.getElementById('assigned-id').textContent = nextId !== null ? `#${nextId}` : 'Lot full';

  showStep('capture');
}

function showStep(name) {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  document.getElementById(`step-${name}`).classList.add('active');
}

function backToCapture() { showStep('capture'); }

function skipScan() {
  document.getElementById('field-title').value  = '';
  document.getElementById('field-author').value = '';
  showStep('form');
}

function addAnotherBook() { resetAddBook(); }

// ============================================================
// IMAGE CAPTURE & RESIZE
// ============================================================

function handleImage(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    resizeImage(e.target.result, 1200, (dataUrl, mime, b64) => {
      state.capturedImageBase64 = b64;
      state.capturedImageMime   = mime;

      const img = document.getElementById('image-preview');
      img.src = dataUrl;
      document.getElementById('preview-container').classList.remove('hidden');
      document.getElementById('capture-placeholder').classList.add('hidden');
      document.getElementById('scan-btn').disabled = false;
      hideScanStatus();
    });
  };
  reader.readAsDataURL(file);
}

function resizeImage(dataUrl, maxPx, callback) {
  const img = new Image();
  img.onload = () => {
    let w = img.width, h = img.height;
    if (w > h && w > maxPx) { h = Math.round(h * maxPx / w); w = maxPx; }
    else if (h > maxPx)     { w = Math.round(w * maxPx / h); h = maxPx; }

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);

    const mime   = 'image/jpeg';
    const url    = canvas.toDataURL(mime, 0.85);
    const base64 = url.split(',')[1];
    callback(url, mime, base64);
  };
  img.src = dataUrl;
}

// ============================================================
// AI SCAN (Claude Vision)
// ============================================================

async function scanBook() {
  const apiKey = localStorage.getItem('kendra_apiKey') || '';
  if (!apiKey) {
    showScanStatus('error', 'No API key saved. Go to ⚙️ Settings and add your Anthropic key first.');
    return;
  }
  if (!state.capturedImageBase64) {
    showScanStatus('error', 'No image captured yet.');
    return;
  }

  const btn = document.getElementById('scan-btn');
  btn.disabled = true;
  showScanStatus('loading', '⏳ Reading book cover with AI…');

  try {
    const result = await callClaudeVision(state.capturedImageBase64, state.capturedImageMime, apiKey);
    document.getElementById('field-title').value  = result.title  || '';
    document.getElementById('field-author').value = result.author || '';
    hideScanStatus();
    showStep('form');
  } catch (err) {
    showScanStatus('error', `AI scan failed: ${err.message}. You can still enter details manually.`);
    btn.disabled = false;
  }
}

async function callClaudeVision(base64, mimeType, apiKey) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':                        'application/json',
      'x-api-key':                           apiKey,
      'anthropic-version':                   '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          {
            type:   'image',
            source: { type: 'base64', media_type: mimeType, data: base64 },
          },
          {
            type: 'text',
            text: 'This is a book cover image. Extract the book title and author name. ' +
                  'Respond with ONLY a valid JSON object and nothing else: ' +
                  '{"title": "...", "author": "..."}. ' +
                  'If a value cannot be determined, use an empty string.',
          },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error?.message || `HTTP ${response.status}`);
  }

  const data  = await response.json();
  const raw   = data.content[0]?.text?.trim() || '';
  const match = raw.match(/\{[\s\S]*?\}/);
  if (!match) throw new Error('Unexpected response format from AI.');
  return JSON.parse(match[0]);
}

function showScanStatus(type, msg) {
  const el = document.getElementById('scan-status');
  el.textContent = msg;
  el.className   = `scan-status ${type}`;
}
function hideScanStatus() {
  document.getElementById('scan-status').className = 'scan-status hidden';
  document.getElementById('scan-status').textContent = '';
}

// ============================================================
// SAVE BOOK
// ============================================================

function saveBook() {
  const title     = document.getElementById('field-title').value.trim();
  const author    = document.getElementById('field-author').value.trim();
  const genre     = document.getElementById('field-genre').value;
  const condition = document.getElementById('field-condition').value;
  const notes     = document.getElementById('field-notes').value.trim();

  if (!title)     { alert('Please enter a title.');       return; }
  if (!genre)     { alert('Please select a genre.');      return; }
  if (!condition) { alert('Please select a condition.');  return; }

  const id = getNextId();
  if (id === null) {
    alert('Your lot is full! All IDs have been used.');
    return;
  }

  const book = {
    id,
    title,
    author,
    genre,
    condition,
    notes,
    addedBy:  state.person.name,
    addedAt:  Date.now(),
  };

  const allBooks = getAllBooks();
  allBooks.push(book);
  localStorage.setItem('kendra_books', JSON.stringify(allBooks));
  refreshCache();

  // Success screen
  document.getElementById('saved-summary').textContent =
    `"${book.title}" saved as #${book.id}`;
  document.getElementById('photo-tip').innerHTML =
    `<strong>📷 Photo labels for this book:</strong><br>` +
    `Name your photos <strong>${book.id}A.jpg</strong>, <strong>${book.id}B.jpg</strong>, etc.`;
  showStep('saved');
  updateDashboard();
}

// ============================================================
// BOOK LIST
// ============================================================

function renderBookList(query) {
  const container = document.getElementById('book-list');
  let books = getMyBooks().sort((a, b) => a.id - b.id);

  if (query) {
    const q = query.toLowerCase();
    books = books.filter(b =>
      (b.title  || '').toLowerCase().includes(q) ||
      (b.author || '').toLowerCase().includes(q)
    );
  }

  if (books.length === 0) {
    container.innerHTML = `
      <div class="no-books">
        <div class="icon">📚</div>
        <p>${query ? 'No books match your search.' : 'No books yet — start adding!'}</p>
      </div>`;
    return;
  }

  container.innerHTML = books.map(b => `
    <div class="book-item">
      <div class="book-item-info">
        <div class="book-title">${esc(b.title || '(untitled)')}</div>
        <div class="book-author">${esc(b.author || 'Unknown author')}</div>
        <div class="book-meta">${esc(b.genre)} · ${esc(shortCondition(b.condition))}</div>
      </div>
      <div class="book-id">#${b.id}</div>
    </div>
  `).join('');
}

function filterBooks(query) {
  renderBookList(query);
}

// ============================================================
// SETTINGS
// ============================================================

function loadApiKeyField() {
  document.getElementById('api-key-input').value = localStorage.getItem('kendra_apiKey') || '';
}

function saveSettings() {
  const key = document.getElementById('api-key-input').value.trim();
  if (key) localStorage.setItem('kendra_apiKey', key);
  else     localStorage.removeItem('kendra_apiKey');
  alert('Settings saved!');
}

function confirmClearData() {
  const name = state.person?.name;
  if (!name) return;
  if (!confirm(`Delete ALL books logged by "${name}"? This cannot be undone.`)) return;

  const remaining = getAllBooks().filter(b => b.addedBy !== name);
  localStorage.setItem('kendra_books', JSON.stringify(remaining));
  refreshCache();
  alert('Data cleared.');
  updateDashboard();
}

// ============================================================
// CSV EXPORT
// ============================================================

function exportCSV() {
  const books = getMyBooks().sort((a, b) => a.id - b.id);
  if (books.length === 0) { alert('No books to export yet.'); return; }
  downloadCSV(books, `kendra_${(state.person?.name || 'books').replace(/\s+/g, '_')}`);
}

function exportAllCSV() {
  const books = getAllBooks().sort((a, b) => a.id - b.id);
  if (books.length === 0) { alert('No books in the catalog yet.'); return; }
  downloadCSV(books, 'kendra_all');
}

function downloadCSV(books, filename) {
  const headers = ['id', 'title', 'author', 'genre', 'condition', 'notes', 'addedBy', 'addedAt'];
  const rows = books.map(b =>
    headers.map(h => {
      const val = h === 'addedAt'
        ? new Date(b[h]).toISOString()
        : (b[h] != null ? String(b[h]) : '');
      return `"${val.replace(/"/g, '""')}"`;
    }).join(',')
  );

  const csv  = [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================
// DROPDOWNS
// ============================================================

function populateDropdowns() {
  const genreEl = document.getElementById('field-genre');
  GENRES.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g; opt.textContent = g;
    genreEl.appendChild(opt);
  });

  const condEl = document.getElementById('field-condition');
  CONDITIONS.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    condEl.appendChild(opt);
  });
}

// ============================================================
// DATA HELPERS
// ============================================================

function refreshCache() {
  try { state.allBooks = JSON.parse(localStorage.getItem('kendra_books') || '[]'); }
  catch { state.allBooks = []; }
}

function getAllBooks() { return state.allBooks; }

function getMyBooks() {
  if (!state.person) return [];
  return state.allBooks.filter(b => b.addedBy === state.person.name);
}

/** Returns the next unused ID in this person's lot, or null if full. */
function getNextId() {
  if (!state.person) return null;
  const { lotStart, lotEnd } = state.person;
  const usedIds = new Set(state.allBooks.map(b => b.id));
  for (let id = lotStart; id <= lotEnd; id++) {
    if (!usedIds.has(id)) return id;
  }
  return null;
}

// ============================================================
// UTILITIES
// ============================================================

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Returns just the label portion before " – " */
function shortCondition(cond) {
  if (!cond) return '';
  return cond.split('–')[0].trim();
}

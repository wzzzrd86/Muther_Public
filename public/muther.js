'use strict';

// muther.js — Operator Interface
// This is the main control panel for MU/TH/ER. It handles typing messages, saving macros,
// tweaking the crew's screen settings, and managing chat history.

// Grab all our DOM elements so we can poke at them later
const connDot       = document.getElementById('conn-dot');
const connLabel     = document.getElementById('conn-label');
const mutherLog     = document.getElementById('muther-log');
const composeInput  = document.getElementById('compose-input');
const btnSend       = document.getElementById('btn-send');
const btnBold       = document.getElementById('btn-bold');
const btnItalic     = document.getElementById('btn-italic');
const btnUnderline  = document.getElementById('btn-underline');
const btnAddMacro   = document.getElementById('btn-add-macro');
const macrosCont    = document.getElementById('macros-container');

// Operations Menu
const btnOps        = document.getElementById('btn-ops');
const opsMenu       = document.getElementById('ops-menu');
const opExport      = document.getElementById('op-export');
const opSave        = document.getElementById('op-save');
const opSessions    = document.getElementById('op-sessions');
const opClear       = document.getElementById('op-clear');
const speedSlider   = document.getElementById('speed-slider');
const speedVal      = document.getElementById('speed-val');
const wordDelaySlider = document.getElementById('worddelay-slider');
const wordDelayVal   = document.getElementById('worddelay-val');
const fontsizeSlider = document.getElementById('fontsize-slider');
const fontsizeVal    = document.getElementById('fontsize-val');
const allCapsToggle = document.getElementById('allcaps-toggle');
const themeToggle   = document.getElementById('theme-toggle');

// Save Session Modal
const saveModal      = document.getElementById('save-modal');
const saveNameInput  = document.getElementById('save-name-input');
const btnSaveCancel  = document.getElementById('btn-save-cancel');
const btnSaveConfirm = document.getElementById('btn-save-confirm');

// Session List Modal
const sessionListModal  = document.getElementById('session-list-modal');
const sessionListEl     = document.getElementById('session-list');
const btnSessionCancel  = document.getElementById('btn-session-cancel');

// Toast Notification
const toast             = document.getElementById('toast');

// State variables

// We grab the password from sessionStorage. This lets us refresh the page without
// getting logged out, but keeps the password out of the URL or permanent storage.
const PASSWORD = sessionStorage.getItem('mutherPass') || '';

let chatMessages = [];   // Array of { sender, text, timestamp }
let macros       = [];   // Array of { id, text }
let speed        = 5;    // Typewriter speed (1-10)
let wordDelay    = 3;    // Multiplier for word pauses
let fontSize     = 24;   // Crew font size (14-48)
let allCaps      = false; // Whether text should be converted to uppercase
let lightTheme   = false; // Whether light panel retro theme is active
let ws;                  // WebSocket instance
let macroIdCounter = 0;  // Auto-incrementing ID for macros

// Load settings from localStorage if available
if (localStorage.getItem('muther_speed')) speed = parseInt(localStorage.getItem('muther_speed'), 10);
if (localStorage.getItem('muther_worddelay')) wordDelay = parseInt(localStorage.getItem('muther_worddelay'), 10);
if (localStorage.getItem('muther_allcaps')) allCaps = localStorage.getItem('muther_allcaps') === 'true';
if (localStorage.getItem('muther_fontsize')) fontSize = parseInt(localStorage.getItem('muther_fontsize'), 10);
if (localStorage.getItem('muther_lighttheme')) lightTheme = localStorage.getItem('muther_lighttheme') === 'true';

// Apply initial settings to UI
if (speedSlider) { speedSlider.value = speed; speedVal.textContent = speed; }
if (wordDelaySlider) { wordDelaySlider.value = wordDelay; wordDelayVal.textContent = wordDelay + 'x'; }
if (allCapsToggle) allCapsToggle.checked = allCaps;
if (themeToggle) {
  themeToggle.checked = lightTheme;
  if (lightTheme) document.body.classList.add('theme-light-panel');
}
if (fontsizeSlider) { fontsizeSlider.value = fontSize; fontsizeVal.textContent = fontSize; }

// WebSocket setup
// Automatically use wss:// (secure WebSocket) if the page is loaded over HTTPS.
const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

// Connect to the server via WebSockets.
// This handles logging in, getting messages, and trying again if the server drops us.
function connect() {
  ws = new WebSocket(WS_URL);

  ws.addEventListener('open', () => {
    // We must send our password immediately upon connection.
    ws.send(JSON.stringify({ type: 'auth', role: 'muther', password: PASSWORD }));
  });

  ws.addEventListener('message', (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    handleMessage(msg);
  });

  ws.addEventListener('close', () => {
    setStatus(false);
    // Auto-reconnect after 3 seconds to handle server restarts or network drops
    setTimeout(connect, 3000);
  });

  ws.addEventListener('error', () => ws.close());
}

// Change the little online/offline dot in the corner
function setStatus(online) {
  connDot.className    = online ? 'online' : 'offline';
  connLabel.textContent = online ? 'ONLINE' : 'OFFLINE';
}

// Figure out what to do when the server talks to us
function handleMessage(msg) {
  if (msg.type === 'auth_ok') {
    // Password was correct. Server sends down the entire current chat log.
    setStatus(true);
    chatMessages = msg.messages || [];
    mutherLog.innerHTML = '';
    for (const entry of chatMessages) appendToLog(entry.text);
    return;
  }

  if (msg.type === 'auth_fail') {
    // Incorrect password. Clear sessionStorage so we don't end up in an infinite loop.
    alert('Authentication failed. Returning to login.');
    sessionStorage.removeItem('mutherPass');
    window.location.href = 'index.html';
    return;
  }

  if (msg.type === 'message') {
    // This is an echo of a message that was just sent.
    // It could be from our own tab, or from another operator tab.
    // We update the log here instead of eagerly updating it on click.
    chatMessages.push(msg.entry);
    appendToLog(msg.entry.text);
    return;
  }

  if (msg.type === 'log_cleared') {
    // Someone clicked CLEAR SESSION, or we did. Empty the log locally.
    chatMessages = [];
    mutherLog.innerHTML = '';
    return;
  }
}

// Sending messages

// Bundle up the text from the compose box along with all our current settings,
// and fire it off to the server.
function sendMessage() {
  const raw  = composeInput.value.trim();
  if (!raw || !ws || ws.readyState !== WebSocket.OPEN) return;
  
  ws.send(JSON.stringify({
    type:   'message',
    text:   raw,
  }));
  
  composeInput.value = '';
  composeInput.focus();
}

if (btnSend) btnSend.addEventListener('click', sendMessage);

// Allow multi-line input by requiring a modifier key + Enter to actually send the message.
if (composeInput) composeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.shiftKey)) {
    e.preventDefault();
    sendMessage();
  }
});

// Text Editor Tools
function insertTag(inputElement, startTag, endTag) {
  if (!inputElement) return;
  const start = inputElement.selectionStart;
  const end = inputElement.selectionEnd;
  const text = inputElement.value;
  const before = text.substring(0, start);
  const selected = text.substring(start, end);
  const after = text.substring(end);

  inputElement.value = before + startTag + selected + endTag + after;
  inputElement.focus();
  inputElement.setSelectionRange(start + startTag.length, start + startTag.length + selected.length);
  inputElement.dispatchEvent(new Event('input'));
}

if (btnBold) btnBold.addEventListener('click', () => insertTag(composeInput, '[b]', '[/b]'));
if (btnItalic) btnItalic.addEventListener('click', () => insertTag(composeInput, '[i]', '[/i]'));
if (btnUnderline) btnUnderline.addEventListener('click', () => insertTag(composeInput, '[u]', '[/u]'));

// Custom Textarea Resizer (Top edge)
const composeResizer = document.getElementById('compose-resizer');
if (composeResizer && composeInput) {
  let startY, startHeight;
  const wrapper = composeInput.parentElement;

  function doDrag(e) {
    // Dragging UP means e.clientY gets smaller, delta is positive
    const deltaY = startY - e.clientY;
    const newHeight = startHeight + deltaY;
    // Set height on the wrapper because composeInput uses flex: 1
    wrapper.style.height = Math.max(48, Math.min(400, newHeight)) + 'px';
  }

  function stopDrag() {
    document.removeEventListener('mousemove', doDrag);
    document.removeEventListener('mouseup', stopDrag);
    document.body.style.cursor = '';
  }

  composeResizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startY = e.clientY;
    startHeight = wrapper.getBoundingClientRect().height;
    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);
    document.body.style.cursor = 'n-resize';
  });
}

// Turn BBCode into HTML securely so we don't accidentally run XSS payloads
function bbCodeToHTML(text) {
  const div = document.createElement('div');
  div.textContent = text;
  let html = div.innerHTML;
  html = html.replace(/\[b\]/gi, '<b>').replace(/\[\/b\]/gi, '</b>');
  html = html.replace(/\[i\]/gi, '<i>').replace(/\[\/i\]/gi, '</i>');
  html = html.replace(/\[u\]/gi, '<u>').replace(/\[\/u\]/gi, '</u>');
  return html;
}

// Log display

// Instantly slap a new message into the operator log.
// We don't bother with the typewriter effect here because the operator needs to read fast.
function appendToLog(text) {
  const el       = document.createElement('div');
  el.className   = 'log-entry';
  const ts       = document.createElement('span');
  ts.className   = 'ts';
  ts.textContent = `[${new Date().toLocaleTimeString()}]`;
  const tx       = document.createElement('span');
  tx.className   = 'txt';
  tx.innerHTML   = ' ' + bbCodeToHTML(text);
  
  el.appendChild(ts);
  el.appendChild(tx);
  mutherLog.appendChild(el);
  mutherLog.scrollTop = mutherLog.scrollHeight; // Always scroll to bottom
}

// Macros

// Make a brand new macro and save it
function addMacro(text = '') {
  const id  = ++macroIdCounter;
  const obj = { id, text };
  macros.push(obj);
  renderMacro(obj);
  saveMacrosToStorage();
}

// Build the HTML for a macro row and wire up its buttons
function renderMacro(obj) {
  const row  = document.createElement('div');
  row.className = 'macro-row';
  row.dataset.id = obj.id;

  const delBtn = document.createElement('button');
  delBtn.className = 'macro-delete-btn';
  delBtn.textContent = 'X';
  delBtn.title = 'Remove macro';
  delBtn.setAttribute('aria-label', 'Remove macro');
  delBtn.addEventListener('click', () => removeMacro(obj.id));

  const ta = document.createElement('textarea');
  ta.value       = obj.text;
  ta.placeholder = 'MACRO TEXT...';
  ta.rows        = 3;
  ta.setAttribute('aria-label', 'Macro text');
  // Update state and save to local storage live as the user types
  ta.addEventListener('input', () => {
    obj.text = ta.value;
    saveMacrosToStorage();
  });

  const actions = document.createElement('div');
  actions.className = 'macro-actions';

  const toolbar = document.createElement('div');
  toolbar.className = 'macro-toolbar';

  const btnB = document.createElement('button');
  btnB.className = 'btn btn-sm editor-btn btn-bold';
  btnB.textContent = '[B]';
  btnB.title = 'Bold';
  btnB.addEventListener('click', () => insertTag(ta, '[b]', '[/b]'));

  const btnI = document.createElement('button');
  btnI.className = 'btn btn-sm editor-btn btn-italic';
  btnI.textContent = '[I]';
  btnI.title = 'Italic';
  btnI.addEventListener('click', () => insertTag(ta, '[i]', '[/i]'));

  const btnU = document.createElement('button');
  btnU.className = 'btn btn-sm editor-btn btn-underline';
  btnU.textContent = '[U]';
  btnU.title = 'Underline';
  btnU.addEventListener('click', () => insertTag(ta, '[u]', '[/u]'));

  toolbar.appendChild(btnB);
  toolbar.appendChild(btnI);
  toolbar.appendChild(btnU);

  const transmitBtn = document.createElement('button');
  transmitBtn.className   = 'btn btn-sm';
  transmitBtn.textContent = 'TRANSMIT';
  transmitBtn.setAttribute('aria-label', 'Copy macro to compose area');
  transmitBtn.addEventListener('click', () => {
    // Instead of sending directly, put it in the compose window so the operator can review/edit
    composeInput.value = ta.value;
    composeInput.focus();
  });

  actions.appendChild(toolbar);
  actions.appendChild(transmitBtn);
  row.appendChild(delBtn);
  row.appendChild(ta);
  row.appendChild(actions);
  macrosCont.appendChild(row);
}

function removeMacro(id) {
  macros = macros.filter(m => m.id !== id);
  const el = macrosCont.querySelector(`[data-id="${id}"]`);
  if (el) el.remove();
  saveMacrosToStorage();
}

if (btnAddMacro) btnAddMacro.addEventListener('click', () => addMacro());

// Save our macros to the browser's localStorage.
// Unlike chat history, these stick around forever.
function saveMacrosToStorage() {
  localStorage.setItem('muther_macros', JSON.stringify(macros.map(m => m.text)));
}

function loadMacrosFromStorage() {
  try {
    const saved = JSON.parse(localStorage.getItem('muther_macros') || '[]');
    for (const text of saved) addMacro(text);
  } catch { /* ignore parsing errors */ }
}

// Operations dropdown menu
// Toggle the Operations menu.
if (btnOps) btnOps.addEventListener('click', (e) => {
  e.stopPropagation();
  const open = !opsMenu.classList.contains('hidden');
  opsMenu.classList.toggle('hidden', open);
  btnOps.setAttribute('aria-expanded', String(!open));
});

// "Click outside to close" behaviour for the Operations menu.
document.addEventListener('click', () => {
  opsMenu.classList.add('hidden');
  btnOps.setAttribute('aria-expanded', 'false');
});

// Prevent clicking inside the menu from closing the menu.
if (opsMenu) opsMenu.addEventListener('click', (e) => e.stopPropagation());

// Whenever we change a setting, tell the server immediately.
// This keeps the crew screens perfectly in sync with our sliders.
// Speed slider
if (speedSlider) speedSlider.addEventListener('input', () => {
  speed = parseInt(speedSlider.value, 10);
  speedVal.textContent = speed;
  localStorage.setItem('muther_speed', speed);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'settings', speed, wordDelay, allCaps, fontSize }));
  }
});

// Word delay slider
if (wordDelaySlider) wordDelaySlider.addEventListener('input', () => {
  wordDelay = parseInt(wordDelaySlider.value, 10);
  wordDelayVal.textContent = wordDelay + 'x';
  localStorage.setItem('muther_worddelay', wordDelay);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'settings', speed, wordDelay, allCaps, fontSize }));
  }
});

// Font size slider
if (fontsizeSlider) fontsizeSlider.addEventListener('input', () => {
  fontSize = parseInt(fontsizeSlider.value, 10);
  fontsizeVal.textContent = fontSize;
  localStorage.setItem('muther_fontsize', fontSize);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'settings', speed, wordDelay, allCaps, fontSize }));
  }
});

// All caps toggle
if (allCapsToggle) allCapsToggle.addEventListener('change', () => {
  allCaps = allCapsToggle.checked;
  localStorage.setItem('muther_allcaps', allCaps);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'settings', speed, wordDelay, allCaps, fontSize }));
  }
});

// Theme toggle
if (themeToggle) themeToggle.addEventListener('change', () => {
  lightTheme = themeToggle.checked;
  localStorage.setItem('muther_lighttheme', lightTheme);
  document.body.classList.toggle('theme-light-panel', lightTheme);
});

// Export chat log to a plain text file.
if (opExport) opExport.addEventListener('click', () => {
  closeOps();
  const lines = chatMessages.map(m => `[${m.timestamp}] ${m.text}`).join('\n');
  const blob  = new Blob([lines], { type: 'text/plain' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href      = url;
  a.download  = `muther-log-${todayStr()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CHAT LOG EXPORTED');
});

// Save session
if (opSave) opSave.addEventListener('click', () => {
  closeOps();
  saveNameInput.value = todayStr(); // Default to today's date
  saveModal.classList.remove('hidden');
  saveNameInput.focus();
  saveNameInput.select();
});

if (btnSaveCancel) btnSaveCancel.addEventListener('click', () => saveModal.classList.add('hidden'));

if (btnSaveConfirm) btnSaveConfirm.addEventListener('click', async () => {
  const name = saveNameInput.value.trim();
  if (!name) { showToast('NAME REQUIRED'); return; }
  try {
    // POST to the REST API to save chat history + macros to a JSON file
    const res = await fetch('/api/sessions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, messages: chatMessages, macros: macros.map(m => m.text) })
    });
    if (!res.ok) throw new Error('Save failed');
    showToast(`SESSION "${name.toUpperCase()}" SAVED`);
    saveModal.classList.add('hidden');
  } catch (err) {
    showToast('ERROR: SAVE FAILED');
  }
});

// Sessions List (Load / Delete)
if (opSessions) opSessions.addEventListener('click', async () => {
  closeOps();
  await openSessionList();
});

// Clear session
if (opClear) opClear.addEventListener('click', () => {
  closeOps();
  if (!confirm('CLEAR CURRENT SESSION? THIS WILL ERASE THE CHAT LOG FOR ALL CONNECTED CREW.')) return;
  chatMessages = [];
  mutherLog.innerHTML = '';
  // Sending 'clear_log' tells the server to wipe its in-memory array and broadcast the clear to all crew.
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'clear_log' }));
  }
  showToast('SESSION CLEARED');
});

// Ask the server for the list of saved sessions and show them in the modal
async function openSessionList() {
  sessionListEl.innerHTML = '';

  try {
    const res      = await fetch('/api/sessions');
    const sessions = await res.json();

    if (sessions.length === 0) {
      sessionListEl.innerHTML = '<li class="session-empty">NO SAVED SESSIONS</li>';
    } else {
      for (const s of sessions) {
        const li   = document.createElement('li');

        // Name + date
        const info = document.createElement('div');
        info.className = 'session-info';
        const nm   = document.createElement('span');
        nm.className   = 'session-name';
        nm.textContent = s.name;
        const dt   = document.createElement('span');
        dt.className   = 'session-date';
        dt.textContent = new Date(s.savedAt).toLocaleString();
        info.appendChild(nm);
        info.appendChild(dt);

        // Inline actions (Load / Delete buttons on every row)
        const actions = document.createElement('div');
        actions.className = 'session-row-actions';

        const loadBtn = document.createElement('button');
        loadBtn.className   = 'btn btn-sm btn-primary';
        loadBtn.textContent = 'LOAD';
        loadBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await loadSession(s.name);
        });

        const delBtn = document.createElement('button');
        delBtn.className   = 'btn btn-sm btn-danger';
        delBtn.textContent = 'DEL';
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await deleteSession(s.name);
        });

        actions.appendChild(loadBtn);
        actions.appendChild(delBtn);
        li.appendChild(info);
        li.appendChild(actions);
        li.style.cursor = 'default';
        sessionListEl.appendChild(li);
      }
    }
  } catch {
    sessionListEl.innerHTML = '<li class="session-error">ERROR LOADING SESSIONS</li>';
  }

  sessionListModal.classList.remove('hidden');
}

// Fetch a specific session and overwrite our current chat and macros with it
async function loadSession(name) {
  try {
    const res  = await fetch(`/api/sessions/${encodeURIComponent(name)}`);
    const data = await res.json();
    
    // Restore chat
    chatMessages    = data.messages || [];
    mutherLog.innerHTML = '';
    for (const entry of chatMessages) appendToLog(entry.text);
    
    // Restore macros
    macrosCont.innerHTML = '';
    macros = [];
    macroIdCounter = 0;
    for (const text of (data.macros || [])) addMacro(text);
    saveMacrosToStorage();
    
    sessionListModal.classList.add('hidden');
    showToast(`SESSION "${name.toUpperCase()}" LOADED`);
  } catch {
    showToast('ERROR: LOAD FAILED');
  }
}

// Delete a session file permanently
async function deleteSession(name) {
  if (!confirm(`DELETE SESSION "${name}"? THIS CANNOT BE UNDONE.`)) return;
  try {
    const res = await fetch(`/api/sessions/${encodeURIComponent(name)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error();
    showToast(`SESSION "${name.toUpperCase()}" DELETED`);
    await openSessionList(); // refresh in place
  } catch {
    showToast('ERROR: DELETE FAILED');
  }
}

if (btnSessionCancel) btnSessionCancel.addEventListener('click', () => sessionListModal.classList.add('hidden'));

// Close modals on backdrop click
[saveModal, sessionListModal].forEach(m => {
  m.addEventListener('click', (e) => { if (e.target === m) m.classList.add('hidden'); });
});

// Helper to hide the Operations menu.
function closeOps() {
  opsMenu.classList.add('hidden');
  btnOps.setAttribute('aria-expanded', 'false');
}

// Toast Notifications
let toastTimer;
// Pop up a quick little message at the bottom of the screen.
// It disappears on its own after a couple of seconds.
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

// Little helper functions
// Get today's date formatted nicely for default save names
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Start it up
if (!PASSWORD) {
  // No password in session — redirect back to login
  window.location.href = 'index.html';
} else {
  loadMacrosFromStorage();
  connect();
}

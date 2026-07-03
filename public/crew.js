'use strict';

// crew.js — Read-only typewriter terminal for the Crew
// This file is just for show. It hooks up via WebSocket to get messages from the operator,
// and then types them out on the screen letter by letter so it looks like an old computer.

const log         = document.getElementById('crew-log');
const idleCursor  = document.getElementById('idle-cursor-line');
const connDot     = document.getElementById('conn-status');
const connLabel   = document.getElementById('conn-label');

// Speed delivered from server with each message (chars/sec derived value).
// Default mid-speed until a message arrives.
let globalSpeed    = 5;      // 1-10 speed
let globalWordDelay = 3;     // 1-20x word pause multiplier
let globalAllCaps  = false;   // Whether text should be converted to uppercase
let globalFontSize = 24;     // Display font size in pixels

// Queue of messages waiting to be typed out.
// Each item: { text: string }
// A queue is used instead of immediate rendering so that if MU/TH/ER sends 
// multiple messages quickly, they queue up and animate sequentially.
let typeQueue = [];
let isTyping = false;
let typingTimer = null;

// WebSocket stuff
// Automatically use wss:// (secure WebSocket) if the page is loaded over HTTPS.
const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
let ws;

// Connect to our WebSocket server
// This also deals with logging in, getting messages, and trying again if the connection drops.
function connect() {
  ws = new WebSocket(WS_URL);

  ws.addEventListener('open', () => {
    setStatus(true);
    // Crew doesn't require a password, but must declare its role immediately
    ws.send(JSON.stringify({ type: 'auth', role: 'crew' }));
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

// Change the little online/offline light in the corner.
function setStatus(online) {
  connDot.className    = online ? 'online' : 'offline';
  connLabel.textContent = online ? 'ONLINE' : 'OFFLINE';
}

// Make sure the log text size matches our global settings.
function applyFontSize() {
  log.style.fontSize = `${globalFontSize}px`;
}

// Message handler
// Figure out what to do with messages when they arrive.
function handleMessage(msg) {
  if (msg.type === 'init') {
    // Sent immediately upon connection. 
    // Contains the current display settings and the entire history of the session.
    globalSpeed    = msg.speed     ?? 5;
    globalWordDelay = msg.wordDelay ?? 3;
    globalAllCaps  = msg.allCaps   ?? false;
    globalFontSize = msg.fontSize  ?? 24;
    applyFontSize();
    
    // Clear the existing log to prevent duplicating history if the socket reconnects
    log.innerHTML = '';
    log.appendChild(idleCursor);
    
    // We append the historical messages instantly (no typewriter effect) 
    // so the crew member doesn't have to watch an hour of text re-type itself.
    for (const entry of msg.messages) {
      appendMessage(entry.text, false, globalAllCaps);
    }
    return;
  }

  if (msg.type === 'settings') {
    // Sent whenever the MU/TH/ER operator changes a setting slider/toggle.
    // We update our globals and apply visual changes instantly.
    if (typeof msg.speed     === 'number')  globalSpeed     = msg.speed;
    if (typeof msg.wordDelay === 'number')  globalWordDelay = msg.wordDelay;
    if (typeof msg.allCaps   === 'boolean') globalAllCaps   = msg.allCaps;
    if (typeof msg.fontSize  === 'number')  { globalFontSize = msg.fontSize; applyFontSize(); }
    return;
  }

  if (msg.type === 'message') {
    // A live message from the MU/TH/ER operator.
    // The operator's settings at the time of sending are bundled with the message.
    
    const text = globalAllCaps ? msg.entry.text.toUpperCase() : msg.entry.text;
    enqueueType(text);
    return;
  }

  if (msg.type === 'log_cleared') {
    // The operator clicked CLEAR SESSION.
    
    // Abort any actively typing messages and flush the queue
    clearTimeout(typingTimer);
    typeQueue = [];
    isTyping = false;
    
    log.innerHTML = '';
    // Re-attach the idle cursor to the empty log
    log.appendChild(idleCursor);
    idleCursor.style.display = '';
    return;
  }
}

// Typewriter effect logic

// Turn the 1-10 speed setting into a millisecond delay per character.
// It's exponential so the slow speeds feel super slow and dramatic,
// while speed 10 is almost instant.
function speedToMs(speed) {
  const clamped = Math.max(1, Math.min(10, speed));
  return Math.round(320 / Math.pow(clamped, 1.426));
}

// Pop a new message into the line. If we aren't typing already, kick things off.
function enqueueType(text) {
  typeQueue.push({ text });
  if (!isTyping) processQueue();
}

// Grab the next message and start typing it.
// This loops back on itself when it's done to grab the next one.
function processQueue() {
  if (typeQueue.length === 0) {
    isTyping = false;
    // Re-append the idle cursor so it sits below the last message
    log.appendChild(idleCursor);
    idleCursor.style.display = '';
    scrollBottom();
    return;
  }
  
  isTyping = true;
  // Hide idle cursor while a message is actively being typed
  idleCursor.style.display = 'none';
  
  const { text } = typeQueue.shift();
  typewriteText(text, () => processQueue());
}

// Make a new message chunk and type it out letter by letter.
// We pop the 'MU/TH/ER: ' prefix up instantly so only the actual message gets the typing effect.
function typewriteText(text, onDone) {
  const block    = document.createElement('div');
  block.className = 'msg-block';

  // Prefix — rendered immediately, no typewriter effect
  const prefixEl = document.createElement('span');
  prefixEl.className   = 'msg-prefix';
  prefixEl.textContent = 'MU/TH/ER: ';

  const textEl   = document.createElement('span');
  textEl.className = 'msg-text';

  const cursor   = document.createElement('span');
  cursor.className = 'typing-cursor';

  const bodyWrap = document.createElement('div');
  bodyWrap.className = 'msg-body';
  bodyWrap.appendChild(textEl);
  bodyWrap.appendChild(cursor);

  block.appendChild(prefixEl);
  block.appendChild(bodyWrap);
  log.insertBefore(block, idleCursor);
  scrollBottom();

  const tokens = tokenizeBBCode(text);
  let tokenIndex = 0;
  const msPerChar = speedToMs(globalSpeed);

  let currentContainer = textEl;
  const wrapperStack = [textEl];

  // Recursive timeout loop to process tokens
  function typeNext() {
    if (tokenIndex >= tokens.length) {
      cursor.remove();
      onDone(); // Signal that we're done so the queue can advance
      return;
    }
    
    const tok = tokens[tokenIndex++];
    
    if (tok.type === 'tag') {
      const el = document.createElement(tok.tag);
      currentContainer.appendChild(el);
      wrapperStack.push(el);
      currentContainer = el;
      // Tags process instantly without typewriter delay
      typeNext();
    } else if (tok.type === 'close') {
      if (wrapperStack.length > 1) {
        wrapperStack.pop();
        currentContainer = wrapperStack[wrapperStack.length - 1];
      }
      typeNext();
    } else {
      currentContainer.appendChild(document.createTextNode(tok.char));
      scrollBottom();
      
      // Add a natural pause between words. 
      // Multiplier is adjustable by the operator via globalWordDelay (1-20x)
      const delay = (tok.char === ' ') ? msPerChar * globalWordDelay : msPerChar;
      typingTimer = setTimeout(typeNext, delay);
    }
  }

  typeNext();
}

// Throw a message on the screen right away (good for loading up old history).
function appendMessage(text, _typed = false, allCaps = false) {
  const display  = allCaps ? text.toUpperCase() : text;
  
  const block    = document.createElement('div');
  block.className = 'msg-block';
  
  const prefixEl = document.createElement('span');
  prefixEl.className   = 'msg-prefix';
  prefixEl.textContent = 'MU/TH/ER: ';
  
  const textEl   = document.createElement('span');
  textEl.className = 'msg-text';
  textEl.innerHTML = bbCodeToHTML(display);

  const bodyWrap = document.createElement('div');
  bodyWrap.className = 'msg-body';
  bodyWrap.appendChild(textEl);

  block.appendChild(prefixEl);
  block.appendChild(bodyWrap);
  log.insertBefore(block, idleCursor);
  
  scrollBottom();
}

// Break apart BBCode into chunks so our typewriter knows what's text and what's a tag.
function tokenizeBBCode(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const sub3 = text.substring(i, i+3).toLowerCase();
    const sub4 = text.substring(i, i+4).toLowerCase();
    if (sub3 === '[b]') { tokens.push({ type: 'tag', tag: 'b' }); i += 3; }
    else if (sub4 === '[/b]') { tokens.push({ type: 'close', tag: 'b' }); i += 4; }
    else if (sub3 === '[i]') { tokens.push({ type: 'tag', tag: 'i' }); i += 3; }
    else if (sub4 === '[/i]') { tokens.push({ type: 'close', tag: 'i' }); i += 4; }
    else if (sub3 === '[u]') { tokens.push({ type: 'tag', tag: 'u' }); i += 3; }
    else if (sub4 === '[/u]') { tokens.push({ type: 'close', tag: 'u' }); i += 4; }
    else { tokens.push({ type: 'char', char: text[i] }); i += 1; }
  }
  return tokens;
}

// Safely turn BBCode into HTML so we don't accidentally run bad code.
function bbCodeToHTML(text) {
  const div = document.createElement('div');
  div.textContent = text;
  let html = div.innerHTML;
  html = html.replace(/\[b\]/gi, '<b>').replace(/\[\/b\]/gi, '</b>');
  html = html.replace(/\[i\]/gi, '<i>').replace(/\[\/i\]/gi, '</i>');
  html = html.replace(/\[u\]/gi, '<u>').replace(/\[\/u\]/gi, '</u>');
  return html;
}

// Keep the chat scrolled all the way to the bottom.
function scrollBottom() {
  log.scrollTop = log.scrollHeight;
}

// Start it up
connect();

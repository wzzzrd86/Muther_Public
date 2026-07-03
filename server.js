//https://render.com/articles/building-real-time-applications-with-websockets Websocket basics

'use strict';

require('dotenv').config();

const express    = require('express');
const http       = require('http');
const WebSocket  = require('ws');
const path       = require('path');
const fs         = require('fs');

// Basic configuration stuff
const PORT          = 3001;
// MUTHER_PASSWORD must be provided in the environment or .env file
const MUTHER_PASS   = process.env.MUTHER_PASSWORD || 'changeme';
const SESSIONS_DIR  = path.join(__dirname, 'data', 'sessions');

// Ensure sessions directory exists on startup so the API can write to it immediately
fs.mkdirSync(SESSIONS_DIR, { recursive: true });

// Set up the HTTP and Express server
// We're hooking up Express and WebSockets to the same server so they can share port 3001.
const app    = express();
const server = http.createServer(app);

app.use(express.json({ limit: '10mb' }));

// REST API routes for handling sessions

// Keep things safe by stripping out weird characters from session names
// This stops people from trying to poke around our directories.
function sanitizeName(name) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '');
}

// GET /api/sessions
// Grab all the saved sessions and show the newest ones first.
app.get('/api/sessions', (req, res) => {
  try {
    const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
    const list  = files.map(f => {
      const p    = path.join(SESSIONS_DIR, f);
      const stat = fs.statSync(p);
      return { name: f.replace('.json', ''), savedAt: stat.mtimeMs };
    });
    // Sort descending by modified time (newest first)
    list.sort((a, b) => b.savedAt - a.savedAt);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

// GET /api/sessions/:name
// Load up a specific session by its name to get all its messages and macros.
app.get('/api/sessions/:name', (req, res) => {
  try {
    const sName = sanitizeName(req.params.name);
    const p     = path.join(SESSIONS_DIR, sName + '.json');
    if (!fs.existsSync(p)) return res.status(404).json({ error: 'Not found' });
    
    const data  = JSON.parse(fs.readFileSync(p, 'utf8'));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read session' });
  }
});

// POST /api/sessions
// Save a session's chat and macros into a JSON file. If it's already there, we just overwrite it.
app.post('/api/sessions', (req, res) => {
  try {
    const { name, messages, macros } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    
    const sName = sanitizeName(name);
    const p     = path.join(SESSIONS_DIR, sName + '.json');
    
    const payload = {
      name:     sName,
      savedAt:  Date.now(),
      messages: messages || [],
      macros:   macros   || []
    };
    
    fs.writeFileSync(p, JSON.stringify(payload, null, 2), 'utf8');
    res.json({ ok: true, name: sName });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save session' });
  }
});

// DELETE /api/sessions/:name
// Throw away a saved session file when we don't need it anymore.
app.delete('/api/sessions/:name', (req, res) => {
  try {
    const sName = sanitizeName(req.params.name);
    const p     = path.join(SESSIONS_DIR, sName + '.json');
    if (!fs.existsSync(p)) return res.status(404).json({ error: 'Not found' });
    
    fs.unlinkSync(p);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// WebSocket logic for real-time chat
const wss = new WebSocket.Server({ server, path: '/ws' });

// In-memory state. This represents the *live* session.
// It is lost if the Node.js server restarts.
let chatLog        = [];          // Array of { sender, text, timestamp }
let currentSpeed   = 5;           // Typewriter speed (1-10)
let currentWordDelay = 3;         // Typewriter word pause multiplier (1-20x)
let currentAllCaps = false;       // Uppercase toggle
let currentFontSize = 24;         // Crew display font size

// Track authenticated clients. Each client object has: { ws, role: 'muther'|'crew', authed: boolean }
const clients = new Set();

// send a JSON message to all logged-in clients of a certain role.
function broadcast(role, payload) {
  const str = JSON.stringify(payload);
  for (const client of clients) {
    if (client.authed && client.role === role && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(str);
    }
  }
}

wss.on('connection', (ws) => {
  const client = { ws, role: null, authed: false };
  clients.add(client);

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    // connection must authenticate before doing anything else
    if (msg.type === 'auth') {
      if (msg.role === 'crew') {
        // Crew requires no password, they just observe
        client.role  = 'crew';
        client.authed = true;
        // Send the current session state and chat log to the newly connected crew member
        ws.send(JSON.stringify({ 
          type: 'init', 
          messages: chatLog, 
          speed: currentSpeed, 
          wordDelay: currentWordDelay,
          allCaps: currentAllCaps, 
          fontSize: currentFontSize 
        }));
        return;
      }

      if (msg.role === 'muther') {
        // MU/TH/ER operators must provide the server password
        if (msg.password === MUTHER_PASS) {
          client.role   = 'muther';
          client.authed = true;
          // Return the chat history so the operator's log populates
          ws.send(JSON.stringify({ type: 'auth_ok', messages: chatLog }));
        } else {
          ws.send(JSON.stringify({ type: 'auth_fail' }));
          ws.close();
        }
        return;
      }
    }

    // Ignore all other messages if the client hasn't successfully authenticated
    if (!client.authed) return;

    // Only MU/TH/ER is allowed to send operational commands
    if (client.role === 'muther') {
      
      if (msg.type === 'message') {
        // A new chat message from the operator
        const entry = {
          sender:    'muther',
          text:      msg.text || '',
          timestamp: new Date().toISOString()
        };
        chatLog.push(entry);

        // Broadcast the new message to all crew displays
        broadcast('crew', { 
          type: 'message', 
          entry
        });

        // Echo the message back to all MU/TH/ER clients (so if the GM has multiple tabs open, they stay in sync)
        broadcast('muther', { type: 'message', entry });
        return;
      }

      if (msg.type === 'settings') {
        // The operator changed a setting (e.g. dragged a slider) without sending a message.
        if (typeof msg.speed     === 'number')  currentSpeed     = msg.speed;
        if (typeof msg.wordDelay === 'number')  currentWordDelay = msg.wordDelay;
        if (typeof msg.allCaps   === 'boolean') currentAllCaps   = msg.allCaps;
        if (typeof msg.fontSize  === 'number')  currentFontSize  = msg.fontSize;
        
        // Broadcast settings to crew so visual updates (like font size) apply immediately
        broadcast('crew', { 
          type: 'settings', 
          speed: currentSpeed, 
          wordDelay: currentWordDelay,
          allCaps: currentAllCaps, 
          fontSize: currentFontSize 
        });
        return;
      }

      if (msg.type === 'clear_log') {
        // The operator wants to wipe the active session
        chatLog = [];
        // Tell everyone to clear their screens
        broadcast('crew',   { type: 'log_cleared' });
        broadcast('muther', { type: 'log_cleared' });
        return;
      }
    }
  });

  // Clean up the client object when the socket closes
  ws.on('close', () => clients.delete(client));
});

// Boot up the server
server.listen(PORT, () => {
  console.log(`MU/TH/ER Node server running on port ${PORT}`);
});

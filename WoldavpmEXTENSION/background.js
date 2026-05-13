// ══════════════════════════════════════════════════════
//  WOLDAV — Background Service Worker
//  Holds decrypted vault in memory for the browser session.
//  Cleared automatically when the browser closes.
// ══════════════════════════════════════════════════════

let sessionVault  = null;   // decrypted entries array — in memory only
let sessionKey    = null;   // CryptoKey — in memory only
let sessionToken  = null;   // GitHub token — in memory only
let gistId        = null;

const GIST_FILENAME = 'woldav_vault.enc';

// ── CRYPTO ──────────────────────────────────────────

async function deriveKey(password, salt) {
  const raw = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password),
    'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' },
    raw,
    { name: 'AES-GCM', length: 256 },
    false, ['encrypt', 'decrypt']
  );
}

async function encryptVault(data, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const buf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key,
    new TextEncoder().encode(JSON.stringify(data))
  );
  return { iv: Array.from(iv), data: Array.from(new Uint8Array(buf)) };
}

async function decryptVault(payload, key) {
  const buf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(payload.iv) }, key,
    new Uint8Array(payload.data)
  );
  return JSON.parse(new TextDecoder().decode(buf));
}

// ── GITHUB GIST ──────────────────────────────────────

async function gistGet(token, id) {
  const r = await fetch(`https://api.github.com/gists/${id}`, {
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' }
  });
  if (!r.ok) throw new Error('Failed to fetch gist');
  const j = await r.json();
  return JSON.parse(j.files[GIST_FILENAME].content);
}

async function gistUpdate(token, id, payload) {
  const r = await fetch(`https://api.github.com/gists/${id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ files: { [GIST_FILENAME]: { content: JSON.stringify(payload) } } })
  });
  if (!r.ok) throw new Error('Failed to update gist');
}

async function gistCreate(token) {
  const r = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      description: 'Woldav encrypted vault',
      public: false,
      files: { [GIST_FILENAME]: { content: JSON.stringify({ init: true }) } }
    })
  });
  if (!r.ok) throw new Error('Failed to create gist');
  const j = await r.json();
  return j.id;
}

// ── HELPERS ──────────────────────────────────────────

function saltFromHex(hex) {
  return new Uint8Array(hex.match(/.{2}/g).map(h => parseInt(h, 16)));
}

function saltToHex(salt) {
  return Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function pushVault() {
  if (!sessionToken || !gistId || !sessionKey) return;
  const payload = await encryptVault(sessionVault, sessionKey);
  await gistUpdate(sessionToken, gistId, payload);
}

async function pullVault() {
  const payload = await gistGet(sessionToken, gistId);
  if (payload.init) {
    sessionVault = [];
  } else {
    sessionVault = await decryptVault(payload, sessionKey);
  }
  return sessionVault;
}

// ── MESSAGE HANDLER ──────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  (async () => {
    try {
      switch (msg.type) {

        // ── UNLOCK ──
        case 'UNLOCK': {
          const stored = await chrome.storage.local.get(['woldav_salt', 'woldav_gist_id']);
          if (!stored.woldav_salt || !stored.woldav_gist_id) {
            respond({ ok: false, error: 'No vault found. Use First Setup.' });
            return;
          }
          const salt = saltFromHex(stored.woldav_salt);
          sessionKey   = await deriveKey(msg.password, salt);
          sessionToken = msg.token;
          gistId       = stored.woldav_gist_id;
          await pullVault();
          respond({ ok: true });
          break;
        }

        // ── SETUP ──
        case 'SETUP': {
          const salt = crypto.getRandomValues(new Uint8Array(16));
          sessionKey   = await deriveKey(msg.password, salt);
          sessionToken = msg.token;
          gistId       = await gistCreate(msg.token);
          sessionVault = [];
          await chrome.storage.local.set({
            woldav_salt:    saltToHex(salt),
            woldav_gist_id: gistId
          });
          respond({ ok: true });
          break;
        }

        // ── IS UNLOCKED ──
        case 'IS_UNLOCKED': {
          respond({ ok: sessionKey !== null });
          break;
        }

        // ── GET ENTRIES ──
        case 'GET_ENTRIES': {
          if (!sessionKey) { respond({ ok: false, error: 'Locked' }); return; }
          respond({ ok: true, entries: sessionVault });
          break;
        }

        // ── ADD ENTRY ──
        case 'ADD_ENTRY': {
          if (!sessionKey) { respond({ ok: false, error: 'Locked' }); return; }
          sessionVault.unshift(msg.entry);
          await pushVault();
          respond({ ok: true, entries: sessionVault });
          break;
        }

        // ── DELETE ENTRY ──
        case 'DELETE_ENTRY': {
          if (!sessionKey) { respond({ ok: false, error: 'Locked' }); return; }
          sessionVault = sessionVault.filter(e => e.id !== msg.id);
          await pushVault();
          respond({ ok: true, entries: sessionVault });
          break;
        }

        // ── SYNC ──
        case 'SYNC': {
          if (!sessionKey) { respond({ ok: false, error: 'Locked' }); return; }
          await pushVault();
          const entries = await pullVault();
          respond({ ok: true, entries });
          break;
        }

        // ── LOCK ──
        case 'LOCK': {
          sessionKey = null; sessionToken = null;
          sessionVault = null; gistId = null;
          respond({ ok: true });
          break;
        }

        // ── GET MATCHES (for autofill) ──
        case 'GET_MATCHES': {
          if (!sessionKey || !sessionVault) { respond({ ok: false, matches: [] }); return; }
          const host = msg.host.replace(/^www\./, '');
          const matches = sessionVault.filter(e => {
            try {
              return new URL(e.site).hostname.replace(/^www\./, '') === host;
            } catch { return e.site.includes(host); }
          });
          respond({ ok: true, matches });
          break;
        }

        default:
          respond({ ok: false, error: 'Unknown message type' });
      }
    } catch (err) {
      respond({ ok: false, error: err.message });
    }
  })();
  return true; // keep message channel open for async
});

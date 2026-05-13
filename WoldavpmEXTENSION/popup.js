// ══════════════════════════════════════════════════════
//  WOLDAV — Popup Script
//  All vault operations go through background.js via messages.
// ══════════════════════════════════════════════════════

function $(id) { return document.getElementById(id); }

// ── TOAST ──────────────────────────────────────────

let toastTimer;
function toast(msg, color) {
  const el = $('toast');
  el.textContent = msg;
  el.style.borderColor = color || 'var(--accent)';
  el.style.color = color || 'var(--accent)';
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

// ── RIPPLE ──────────────────────────────────────────

function ripple(btn, ev) {
  const sp = document.createElement('span');
  sp.className = 'ripple';
  const r = btn.getBoundingClientRect();
  const sz = Math.max(r.width, r.height);
  Object.assign(sp.style, {
    width:  sz + 'px', height: sz + 'px',
    left:   (ev.clientX - r.left - sz / 2) + 'px',
    top:    (ev.clientY - r.top  - sz / 2) + 'px'
  });
  btn.appendChild(sp);
  setTimeout(() => sp.remove(), 500);
}

// ── MESSAGING ──────────────────────────────────────

function msg(payload) {
  return new Promise(resolve => chrome.runtime.sendMessage(payload, resolve));
}

// ── SYNC STATUS ──────────────────────────────────────

function setSyncStatus(state, text) {
  $('syncDot').className = 'sync-dot' + (state ? ' ' + state : '');
  $('syncText').textContent = text;
}

// ── HELPERS ──────────────────────────────────────────

function getLetter(site) {
  try { return new URL(site).hostname.replace('www.', '')[0].toUpperCase(); }
  catch { return (site[0] || '?').toUpperCase(); }
}

function getDomain(site) {
  try { return new URL(site).hostname.replace('www.', ''); }
  catch { return site; }
}

function strengthColor(score) {
  return ['#ff4f6d', '#ff9640', '#f5e05b', '#5bf5b0'][score];
}

// ── RENDER ──────────────────────────────────────────

function renderEntries(entries) {
  const ul = $('entryList');
  const empty = $('emptyState');
  $('countBadge').textContent = entries.length;
  ul.innerHTML = '';
  empty.style.display = entries.length ? 'none' : 'block';

  entries.forEach((e, i) => {
    const li = document.createElement('li');
    li.style.animationDelay = `${i * 0.04}s`;

    const av = document.createElement('div');
    av.className = 'li-avatar';
    av.textContent = getLetter(e.site);

    const info = document.createElement('div');
    info.className = 'li-info';
    info.innerHTML = `<div class="li-site">${getDomain(e.site)}</div><div class="li-user">${e.user}</div>`;

    const actions = document.createElement('div');
    actions.className = 'li-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'li-btn'; copyBtn.title = 'Copy password'; copyBtn.textContent = '⎘';
    copyBtn.addEventListener('click', ev => {
      ev.stopPropagation();
      navigator.clipboard.writeText(e.pass).then(() => toast('📋 Password copied'));
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'li-btn del'; delBtn.title = 'Delete'; delBtn.textContent = '✕';
    delBtn.addEventListener('click', async ev => {
      ev.stopPropagation();
      setSyncStatus('syncing', 'Deleting…');
      const res = await msg({ type: 'DELETE_ENTRY', id: e.id });
      if (res.ok) {
        renderEntries(res.entries);
        setSyncStatus('synced', 'Synced · ' + new Date().toLocaleTimeString());
        toast('🗑 Entry deleted');
      } else {
        setSyncStatus('error', 'Sync failed');
        toast('Delete failed', 'var(--danger)');
      }
    });

    actions.append(copyBtn, delBtn);
    li.append(av, info, actions);
    ul.appendChild(li);
  });
}

// ── SCREENS ──────────────────────────────────────────

function showVault(entries) {
  $('lockScreen').classList.add('hidden');
  $('vaultScreen').classList.remove('hidden');
  renderEntries(entries);
}

function showLock() {
  $('vaultScreen').classList.add('hidden');
  $('lockScreen').classList.remove('hidden');
}

// ── ON LOAD: check if already unlocked ──────────────

(async () => {
  const res = await msg({ type: 'IS_UNLOCKED' });
  if (res && res.ok) {
    const data = await msg({ type: 'GET_ENTRIES' });
    if (data.ok) {
      showVault(data.entries);
      setSyncStatus('synced', 'Vault loaded');
    }
  }
})();

// ── TABS ──────────────────────────────────────────

$('tabUnlock').addEventListener('click', () => {
  $('tabUnlock').classList.add('active'); $('tabSetup').classList.remove('active');
  $('panelUnlock').classList.add('active'); $('panelSetup').classList.remove('active');
});

$('tabSetup').addEventListener('click', () => {
  $('tabSetup').classList.add('active'); $('tabUnlock').classList.remove('active');
  $('panelSetup').classList.add('active'); $('panelUnlock').classList.remove('active');
});

// ── UNLOCK ──────────────────────────────────────────

$('unlockBtn').addEventListener('click', async function(ev) {
  ripple(this, ev);
  const pass  = $('unlockPass').value;
  const token = $('unlockToken').value.trim();
  const err   = $('unlockErr');
  err.textContent = '';

  if (!pass || !token) { err.textContent = 'Both fields are required.'; return; }

  this.disabled = true; this.textContent = 'Unlocking…';
  const res = await msg({ type: 'UNLOCK', password: pass, token });

  if (res.ok) {
    const data = await msg({ type: 'GET_ENTRIES' });
    showVault(data.entries);
    setSyncStatus('synced', 'Vault loaded');
  } else {
    err.textContent = res.error || 'Wrong password or token.';
  }
  this.disabled = false; this.textContent = 'Unlock Vault';
});

// Enter key on unlock
[$('unlockPass'), $('unlockToken')].forEach(el => {
  el.addEventListener('keydown', e => { if (e.key === 'Enter') $('unlockBtn').click(); });
});

// ── SETUP ──────────────────────────────────────────

$('setupBtn').addEventListener('click', async function(ev) {
  ripple(this, ev);
  const pass  = $('setupPass').value;
  const pass2 = $('setupPass2').value;
  const token = $('setupToken').value.trim();
  const err   = $('setupErr');
  err.textContent = '';

  if (!pass || !token)      { err.textContent = 'All fields are required.'; return; }
  if (pass !== pass2)       { err.textContent = 'Passwords do not match.'; return; }
  if (pass.length < 10)     { err.textContent = 'Password must be 10+ characters.'; return; }

  this.disabled = true; this.textContent = 'Creating…';
  const res = await msg({ type: 'SETUP', password: pass, token });

  if (res.ok) {
    showVault([]);
    setSyncStatus('synced', 'Vault created');
    toast('✓ Vault created! Keep your master password safe.');
  } else {
    err.textContent = res.error || 'Setup failed.';
  }
  this.disabled = false; this.textContent = 'Create Vault';
});

// ── LOCK ──────────────────────────────────────────

$('lockBtn').addEventListener('click', async () => {
  await msg({ type: 'LOCK' });
  showLock();
  toast('Vault locked');
});

// ── ADD ENTRY ──────────────────────────────────────

$('inPass').addEventListener('input', function() {
  const v = this.value; let s = 0;
  if (v.length >= 8) s++;
  if (/[A-Z]/.test(v) && /[a-z]/.test(v)) s++;
  if (/\d/.test(v)) s++;
  if (/[^A-Za-z0-9]/.test(v)) s++;
  const fill = $('strengthFill');
  fill.style.width      = v ? `${(s / 4) * 100}%` : '0%';
  fill.style.background = v ? strengthColor(Math.max(0, s - 1)) : '';
});

$('addBtn').addEventListener('click', async function(ev) {
  ripple(this, ev);
  const site = $('inSite').value.trim();
  const user = $('inUser').value.trim();
  const pass = $('inPass').value.trim();

  if (!site || !user || !pass) { toast('⚠ Fill all fields', 'var(--danger)'); return; }

  this.disabled = true; this.textContent = 'Saving…';
  setSyncStatus('syncing', 'Saving…');

  const res = await msg({ type: 'ADD_ENTRY', entry: { id: Date.now(), site, user, pass } });

  if (res.ok) {
    renderEntries(res.entries);
    $('inSite').value = ''; $('inUser').value = ''; $('inPass').value = '';
    $('strengthFill').style.width = '0';
    setSyncStatus('synced', 'Synced · ' + new Date().toLocaleTimeString());
    toast('✓ Entry saved');
  } else {
    setSyncStatus('error', 'Sync failed');
    toast('Save failed', 'var(--danger)');
  }

  this.disabled = false; this.textContent = '+ Save Entry';
});

// ── SEARCH ──────────────────────────────────────────

$('searchInput').addEventListener('input', async function() {
  const q = this.value.toLowerCase();
  const data = await msg({ type: 'GET_ENTRIES' });
  if (!data.ok) return;
  renderEntries(q ? data.entries.filter(e =>
    e.site.toLowerCase().includes(q) || e.user.toLowerCase().includes(q)
  ) : data.entries);
});

// ── SYNC ──────────────────────────────────────────

async function doSync() {
  setSyncStatus('syncing', 'Syncing…');
  const res = await msg({ type: 'SYNC' });
  if (res.ok) {
    renderEntries(res.entries);
    setSyncStatus('synced', 'Synced · ' + new Date().toLocaleTimeString());
    toast('✓ Synced');
  } else {
    setSyncStatus('error', 'Sync failed');
    toast('Sync failed', 'var(--danger)');
  }
}

$('syncBtn').addEventListener('click', doSync);
$('syncNowBtn').addEventListener('click', doSync);

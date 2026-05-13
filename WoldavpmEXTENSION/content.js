// ══════════════════════════════════════════════════════
//  WOLDAV — Content Script
//  Detects login forms and injects an autofill suggestion.
// ══════════════════════════════════════════════════════

(function () {
  'use strict';

  // Don't run in iframes
  if (window.self !== window.top) return;

  let suggestion = null;
  let matches    = [];
  let activePassField = null;
  let activeUserField = null;

  // ── FIND LOGIN FIELDS ──────────────────────────────

  function findLoginFields() {
    const passFields = Array.from(document.querySelectorAll('input[type="password"]'))
      .filter(el => isVisible(el));

    return passFields.map(passEl => {
      const form = passEl.closest('form') || passEl.parentElement;
      // Look for a username/email field near the password field
      const userEl = findUserField(passEl, form);
      return { passEl, userEl };
    });
  }

  function isVisible(el) {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
  }

  function findUserField(passEl, container) {
    // Search within the same form/container first
    const candidates = Array.from((container || document).querySelectorAll(
      'input[type="text"], input[type="email"], input[name*="user"], input[name*="email"], input[name*="login"], input[autocomplete*="email"], input[autocomplete*="username"]'
    )).filter(isVisible);

    if (candidates.length === 0) return null;

    // Return the one closest (in DOM order) before the password field
    let best = null;
    for (const c of candidates) {
      if (c.compareDocumentPosition(passEl) & Node.DOCUMENT_POSITION_FOLLOWING) {
        best = c;
      }
    }
    return best || candidates[0];
  }

  // ── SUGGESTION UI ──────────────────────────────────

  function createSuggestion(passEl, matchList) {
    removeSuggestion();
    if (!matchList.length) return;

    activePassField = passEl;
    matches = matchList;

    const rect = passEl.getBoundingClientRect();

    suggestion = document.createElement('div');
    suggestion.id = '__woldav_suggestion__';
    Object.assign(suggestion.style, {
      position:     'fixed',
      top:          (rect.bottom + window.scrollY + 4) + 'px',
      left:         (rect.left  + window.scrollX) + 'px',
      width:        Math.max(rect.width, 260) + 'px',
      zIndex:       '2147483647',
      background:   '#13131e',
      border:       '1px solid rgba(91,245,176,0.3)',
      borderRadius: '12px',
      boxShadow:    '0 8px 32px rgba(0,0,0,0.6), 0 0 20px rgba(91,245,176,0.15)',
      fontFamily:   'system-ui, sans-serif',
      overflow:     'hidden',
      animation:    '__woldav_fadein__ 0.2s ease forwards'
    });

    // Inject keyframes once
    if (!document.getElementById('__woldav_style__')) {
      const style = document.createElement('style');
      style.id = '__woldav_style__';
      style.textContent = `
        @keyframes __woldav_fadein__ {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `;
      document.head.appendChild(style);
    }

    // Header
    const header = document.createElement('div');
    Object.assign(header.style, {
      display:    'flex', alignItems: 'center', gap: '8px',
      padding:    '10px 14px 8px',
      borderBottom: '1px solid rgba(255,255,255,0.06)'
    });

    const logo = document.createElement('span');
    logo.textContent = '🔐';
    logo.style.fontSize = '14px';

    const label = document.createElement('span');
    label.textContent = 'Woldav — saved logins';
    Object.assign(label.style, {
      fontSize: '11px', fontWeight: '600',
      color: 'rgba(91,245,176,0.8)', letterSpacing: '0.3px'
    });

    header.append(logo, label);
    suggestion.appendChild(header);

    // Entries
    matchList.slice(0, 5).forEach(entry => {
      const item = document.createElement('div');
      Object.assign(item.style, {
        display:    'flex', alignItems: 'center', gap: '10px',
        padding:    '10px 14px', cursor: 'pointer',
        transition: 'background 0.15s',
        borderBottom: '1px solid rgba(255,255,255,0.04)'
      });

      item.addEventListener('mouseenter', () => { item.style.background = 'rgba(91,245,176,0.07)'; });
      item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });

      const av = document.createElement('div');
      Object.assign(av.style, {
        width: '26px', height: '26px', borderRadius: '6px',
        background: 'rgba(91,245,176,0.12)',
        border: '1px solid rgba(91,245,176,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: '800', fontSize: '12px', color: '#5bf5b0',
        flexShrink: '0'
      });

      try {
        av.textContent = new URL(entry.site).hostname.replace('www.','')[0].toUpperCase();
      } catch { av.textContent = '?'; }

      const info = document.createElement('div');
      info.style.flex = '1';
      info.style.minWidth = '0';

      const siteName = document.createElement('div');
      siteName.textContent = entry.user;
      Object.assign(siteName.style, {
        fontSize: '12px', fontWeight: '600', color: '#eeeef8',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
      });

      const passHint = document.createElement('div');
      passHint.textContent = '••••••••';
      Object.assign(passHint.style, {
        fontSize: '10px', color: '#6e6e8a',
        fontFamily: 'monospace', marginTop: '1px'
      });

      info.append(siteName, passHint);
      item.append(av, info);

      item.addEventListener('mousedown', ev => {
        ev.preventDefault();
        fillCredentials(entry);
        removeSuggestion();
      });

      suggestion.appendChild(item);
    });

    // Dismiss row
    const dismiss = document.createElement('div');
    dismiss.textContent = 'Dismiss';
    Object.assign(dismiss.style, {
      padding: '8px 14px', fontSize: '10px', color: '#44445a',
      cursor: 'pointer', textAlign: 'center', fontFamily: 'monospace'
    });
    dismiss.addEventListener('mouseenter', () => { dismiss.style.color = '#6e6e8a'; });
    dismiss.addEventListener('mouseleave', () => { dismiss.style.color = '#44445a'; });
    dismiss.addEventListener('mousedown', ev => { ev.preventDefault(); removeSuggestion(); });
    suggestion.appendChild(dismiss);

    document.body.appendChild(suggestion);
  }

  function removeSuggestion() {
    if (suggestion) { suggestion.remove(); suggestion = null; }
  }

  // ── FILL CREDENTIALS ──────────────────────────────

  function fillCredentials(entry) {
    // Fill password
    if (activePassField) {
      setNativeValue(activePassField, entry.pass);
    }
    // Fill username
    if (activeUserField) {
      setNativeValue(activeUserField, entry.user);
    } else {
      // Try to find the user field now
      const fields = findLoginFields();
      if (fields.length && fields[0].userEl) {
        setNativeValue(fields[0].userEl, entry.user);
      }
    }
  }

  // React/Vue-compatible value setter
  function setNativeValue(el, value) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set;

    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(el, value);
    } else {
      el.value = value;
    }

    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ── WATCH FOR PASSWORD FIELDS ──────────────────────

  function handlePassFocus(ev) {
    const passEl = ev.target;
    if (passEl.type !== 'password') return;

    const fields = findLoginFields();
    const match  = fields.find(f => f.passEl === passEl);
    if (match) activeUserField = match.userEl;

    // Ask background for matches
    chrome.runtime.sendMessage(
      { type: 'GET_MATCHES', host: window.location.hostname },
      res => {
        if (res && res.ok && res.matches.length) {
          createSuggestion(passEl, res.matches);
        }
      }
    );
  }

  function handlePassBlur() {
    // Small delay so click on suggestion registers first
    setTimeout(removeSuggestion, 200);
  }

  // ── OBSERVE DOM FOR DYNAMICALLY ADDED FIELDS ──────

  function attachListeners(root) {
    root.querySelectorAll('input[type="password"]').forEach(el => {
      if (el.__woldav_attached__) return;
      el.__woldav_attached__ = true;
      el.addEventListener('focus', handlePassFocus);
      el.addEventListener('blur',  handlePassBlur);
    });
  }

  attachListeners(document);

  const observer = new MutationObserver(mutations => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === 1) attachListeners(node);
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Close suggestion on outside click
  document.addEventListener('click', ev => {
    if (suggestion && !suggestion.contains(ev.target)) removeSuggestion();
  });

})();

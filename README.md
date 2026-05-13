# 🔐 Woldav — Password Manager

A secure, open-source password manager that runs entirely in your browser. No servers, no accounts, no tracking. Your passwords are encrypted with AES-256-GCM and synced privately via GitHub Gist.

---

## Features

- **AES-256-GCM encryption** — passwords are encrypted locally before leaving your device
- **GitHub Gist sync** — your encrypted vault syncs automatically across all your devices
- **Master password** — the only key to your vault, never stored anywhere
- **Auto-fill** — detects login forms and fills your credentials automatically (extension only)
- **PWA** — works in any browser, installable as a desktop or mobile app
- **Chrome Extension** — lives in your toolbar with one-click autofill
- **Zero dependencies** — no libraries, no frameworks, no tracking

---

## Use as a Web App (any device, no install)

Visit: `https://davidwolfrum-bit.github.io/woldav`

That's it. Works on any computer, phone, or tablet with a browser.

---

## Use as a Chrome Extension (with autofill)

1. Clone or download this repo
   ```
   git clone https://github.com/davidwolfrum-bit/woldav.git
   ```
2. Open Chrome → go to `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** → select the 'WoldavpmEXTENSION' folder

---

## First Time Setup (both web app and extension)

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens) → Generate new token (classic)
2. Check only the **gist** scope → set expiration to **No expiration** → copy the token
3. Open Woldav → click **First Setup**
4. Enter a strong master password (10+ characters) and your GitHub token
5. Click **Create Vault** — a private Gist is created automatically

---

## Logging in on a new device

1. Visit the web app URL or load the extension
2. Enter your **master password** and **GitHub token**
3. Your vault loads instantly

> If you lose your token, generate a new one — your passwords are safe.
> If you lose your master password, your vault cannot be recovered. Write it down somewhere safe offline.

---

## Security

- Passwords are encrypted with **AES-256-GCM** before leaving your browser
- Key derivation uses **PBKDF2 with 310,000 iterations** (OWASP 2024 standard)
- GitHub only ever stores an encrypted blob — it cannot read your passwords
- Your GitHub token and master password are held in memory only, never written to disk
- The token is cleared automatically when the browser closes

---

## License

MIT — free to use, modify, and share.

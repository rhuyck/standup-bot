# Kendra – Family Book Catalog

A mobile-first web app for cataloging a large collection of old books. Each family member is assigned a lot of 1000 IDs, photographs book covers, and uses AI to auto-detect title and author. Genre and condition are chosen from pre-populated dropdowns. All data is stored locally in the browser and exportable as CSV.

## Features

- **Person selector** — each family member sees only their assigned lot
- **AI book scanning** — photograph a cover; Claude identifies title and author automatically
- **Auto ID assignment** — next available ID in your lot is assigned automatically
- **Dropdowns** — pre-populated genre and condition selects (no free-text errors)
- **Photo labeling guide** — after saving, the app tells you what to name your photos (e.g. `1000A.jpg`, `1000B.jpg`)
- **CSV export** — download your books (or all books) as a spreadsheet-ready CSV
- **Works offline** — data stored in your browser's localStorage; no server needed
- **Mobile-first** — designed for phones; camera capture built in

---

## 1 – Enable GitHub Pages

1. Push this branch to GitHub
2. Go to **Settings → Pages**
3. Under *Source*, select **Deploy from a branch**
4. Choose this branch, folder `/` (root), and click **Save**
5. GitHub will give you a URL like `https://yourname.github.io/kendra/`

---

## 2 – Configure family members

Edit **`config.js`** and update the `PEOPLE` array with real names and lot ranges:

```js
const PEOPLE = [
  { name: "Alice",   lotStart: 1,    lotEnd: 999  },
  { name: "Bob",     lotStart: 1000, lotEnd: 1999 },
  { name: "Carol",   lotStart: 2000, lotEnd: 2999 },
  { name: "Dave",    lotStart: 3000, lotEnd: 3999 },
];
```

You can edit this file directly on GitHub (click the pencil icon) — no computer needed.

---

## 3 – Get an Anthropic API key (for AI book scanning)

1. Visit **https://console.anthropic.com** — sign up for free
2. Go to **API Keys** and create a new key
3. Open the Kendra app on your phone
4. Tap ⚙️ **Settings**
5. Paste your key into **Anthropic API Key** and tap **Save**

The key is stored only in your browser's local storage and is never sent anywhere except directly to the Anthropic API when you scan a cover.

> **Without an API key** the app still works — skip the scan and enter title/author manually.

---

## 4 – How to Use

1. Open the GitHub Pages URL on your phone
2. **Select your name** from the list
3. Tap **+ Add Book**
4. Tap **📷 Camera** to photograph the book cover
5. Tap **🔍 Scan with AI** — title and author fill in automatically
6. Select **Genre** and **Condition** from the dropdowns
7. Add any **Notes** (inscriptions, damage, missing pages, etc.)
8. Tap **💾 Save Book**
9. The app shows you how to label your photos (`1000A.jpg`, `1000B.jpg`, etc.)

### Exporting to a spreadsheet

- Tap ⚙️ **Settings → Export My Books (CSV)** to download your lot
- Open the CSV in Google Sheets, Excel, or Numbers
- Columns: `id, title, author, genre, condition, notes, addedBy, addedAt`

### Combining everyone's data

Since each person's data is stored on their own device, to merge:

1. Each person exports their CSV from Settings
2. Open all CSVs in Google Sheets and paste them into one sheet
3. Sort by column `id` for the full catalog in order

---

## Data & Privacy

- Data lives in **your browser's localStorage** — it does not sync between phones automatically
- If you clear your browser data, books will be lost — **export a CSV backup regularly**
- Book cover images are sent to Anthropic's API for identification and are not stored by this app

---

## File Structure

```
index.html   — single-page app shell
style.css    — mobile-first styles (warm library theme)
config.js    — people, genres, conditions (edit this!)
app.js       — all app logic
.nojekyll    — tells GitHub Pages not to use Jekyll
KENDRA.md    — this file
```

---

## Customisation

| What to change | File | Variable |
|---|---|---|
| Family member names & lots | `config.js` | `PEOPLE` |
| Available genres | `config.js` | `GENRES` |
| Condition labels | `config.js` | `CONDITIONS` |
| Colour scheme | `style.css` | `:root` CSS variables |

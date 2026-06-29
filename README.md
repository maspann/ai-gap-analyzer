# AI Gap Analyzer (v2, multi-role)

A chatbot-style **NLP competency diagnostic** for the course *Basic NLP for Engineering Students* (Project 2). A student answers questions in their own words, a **real NLP pipeline** scores every answer (tokenize, remove stopwords, stem, TF-IDF, cosine similarity), and the app builds a competency map (Mastered / Developing / Gap), a personalized learning pathway, and a detailed mistake review matched to a grading rubric.

Version 2 adds **login with two roles**:

- **Student** takes the diagnostic, sees exactly where they went wrong, and sees how their result maps to the grading rubric, plus their own attempt history.
- **Admin** manages everything: edits concepts, questions, model answers (answer keys), the rubric and grade scale, manages user accounts, and inspects every student's attempt history.

It is still **100% client-side** (HTML + CSS + vanilla JS). No backend, no build step, no API key. It deploys on GitHub Pages by uploading the files.

---

## Demo accounts

The app seeds two accounts on first load:

| Username | Password   | Role    |
|----------|------------|---------|
| `admin`  | `admin123` | admin   |
| `demo`   | `demo123`  | student |

New sign-ups from the Register tab are created as **students**. An admin can promote a student to admin from the Users tab.

---

## File structure

```
ai-gap-analyzer/
├── index.html          # all views: auth, student (welcome/diagnostic/results/history/rubric), admin
├── css/
│   └── styles.css      # cyber-HUD theme + all v2 component styles
├── js/
│   ├── data.js         # STAGE 1 (Data): default seed corpus, 8 NLP concepts + prereq graph
│   ├── nlp.js          # STAGE 2-4: the NLP engine (tokenize, stem, TF-IDF, cosine, scoring)
│   ├── store.js        # persistence + auth: users, session, content, rubric, history (localStorage)
│   ├── diagnostic.js   # student flow: Q&A, live inspector, review, rubric match, history
│   ├── admin.js        # admin dashboard: content/answer-key editor, rubric editor, users, history
│   └── app.js          # boot + router + login UI (decides student vs admin view)
├── test_engine.js      # unit tests for the NLP engine (23)
├── test_store.js       # unit tests for the store/auth layer (28)
├── test_app.js         # jsdom integration tests: login -> diagnostic -> results, + admin path
├── package.json        # only dev dependency is jsdom (for running tests)
├── .nojekyll           # tells GitHub Pages to serve files as-is
└── README.md
```

Script load order in `index.html` matters and is already set:
`data.js -> nlp.js -> store.js -> diagnostic.js -> admin.js -> app.js`.

---

## How it maps to the grading rubric

The project is built to argue for the top band by being a **real end-to-end pipeline**, not a mockup:

| Rubric evidence    | Where it shows up                                                            |
|--------------------|------------------------------------------------------------------------------|
| NLP Pipeline       | live Pipeline Inspector: tokenize, stopword removal, stems, TF-IDF, cosine   |
| Model / Reasoning  | coverage + cosine similarity + misconception detection, with numbers per answer |
| Prototype Demo     | runs live in the browser; export an evidence `.txt` report                   |
| User Value         | competency map + personalized pathway + detailed mistake review              |
| Backbone 1-5       | Data -> Preprocessing -> Representation -> Model -> User Output, all visible  |

The grade scale (100 / 90 / 80 / 70) and competency bands are **editable by the admin**, so the rubric the app grades against is whatever the instructor configures.

---

## Roles in detail

### Student
1. Log in (or register).
2. **Start diagnostic**: answer each question in your own words. Strong answers trigger a deeper follow-up.
3. **Results**: overall mastery, your grade band on the rubric, and a **review section** that shows, per question, your answer vs the keywords you covered and missed, any misconception you stated, a short "why this score" note, and the model answer.
4. **Grading rubric**: a read-only view of exactly how you are scored.
5. **My history**: every past attempt with the change vs the previous one (the feedback loop).

### Admin
- **Content and answer keys**: add / edit / delete concepts and questions; edit each model answer (the answer key used for cosine scoring), keywords, misconception phrases, prerequisites, and resources. Save, reset to defaults, add concept, add question.
- **Rubric**: edit the competency band thresholds, the grade scale (100 / 90 / 80 / 70), and the evidence criteria text.
- **Users**: add users, change roles, reset passwords, delete accounts (you cannot delete yourself or demote the last admin).
- **All history**: see every student's attempts, expand any attempt to read their answers and per-question scores, delete attempts, or clear all.
- **Reset**: factory reset (restores the default accounts, content, and rubric).

---

## Important limitation: where the data lives

Because GitHub Pages is static (no server, no database), accounts, content edits, the rubric, and history are stored in the **browser's localStorage**. That means:

- Data is saved **per browser and per device**. If a student logs in on a different laptop or browser, they start from the seeded defaults; they will not see history created elsewhere.
- An admin's content and rubric edits apply to **that browser only**. To grade a class on one machine (for example during the UAS demo), have everyone use the same browser, or have the admin demo the editing live.
- Password hashing here is a lightweight, **non-cryptographic** digest. It is a classroom prototype, not real security. A production version would use a real backend with proper hashing.

If your instructor needs true shared multi-user data, the same front end can later be pointed at a small backend (for example Firebase or a REST API); only `store.js` would change.

---

## Run and deploy

### Run locally (just open it)
Open `index.html` in a browser. Everything works from the file system. (For best results, serve it with any static server, for example `python -m http.server`, then open `http://localhost:8000`.)

### Run the tests (optional)
```
npm install      # installs jsdom (dev only)
npm test         # runs engine + store + integration tests
```

### Deploy to GitHub Pages (re-install guide)

If you deployed v1 before, you can update in place. From scratch:

1. Create a GitHub repo, for example `ai-gap-analyzer`.
2. Upload the contents of this folder to the `main` branch. Either drag the files into the GitHub web uploader, or:
   ```
   git init
   git add .
   git commit -m "AI Gap Analyzer v2 (multi-role)"
   git branch -M main
   git remote add origin https://github.com/<your-username>/ai-gap-analyzer.git
   git push -u origin main
   ```
3. In the repo: **Settings -> Pages**.
4. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
5. Choose branch **main**, folder **/ (root)**, then **Save**.
6. Wait about a minute. The site is live at:
   ```
   https://<your-username>.github.io/ai-gap-analyzer/
   ```

Notes:
- `.nojekyll` is included so GitHub Pages serves the files unchanged.
- Do **not** upload `node_modules/`; it is only needed locally to run the tests.
- If you are replacing an existing v1 deploy, just push the new files over the old ones; the URL stays the same. Tell users to do a hard refresh (Ctrl/Cmd + Shift + R) so the browser loads the new scripts.

---

## Tech summary

- Vanilla JS (no framework), one small NLP engine, one store/auth layer, role-based router.
- Tests: 23 engine + 28 store + jsdom integration (student flow and admin path).
- Theme: deep navy "engineering command center" with neon accents; fonts Space Grotesk / Inter / JetBrains Mono via Google Fonts.

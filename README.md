# AI Gap Analyzer — NLP Competency Diagnostic

> **Project 2 · Basic NLP for Engineering Students.**
> A chatbot-based diagnostic that interviews a student across 8 core NLP concepts,
> runs a **real NLP pipeline** on every typed answer, detects competency gaps, and
> recommends a personalized learning pathway.

Everything runs **100% in the browser** — no server, no API key, no build step.
That makes it trivial to deploy on **GitHub Pages** and easy to demo live during UAS.

---

## What it actually does (the real pipeline, not a mockup)

Every answer the student types flows through a genuine 5-stage NLP backbone:

| Stage | Backbone step | Where it lives |
|------|---------------|----------------|
| 1 | **Data** — reference corpus of 8 concepts, model answers, keywords | `js/data.js` |
| 2 | **Preprocessing** — tokenize → remove stopwords → Porter-style stemming | `js/nlp.js` → `tokenize`, `stem`, `preprocess` |
| 3 | **Representation** — Bag-of-Words → TF / IDF → TF-IDF vectors | `js/nlp.js` → `termFreq`, `inverseDocFreq`, `tfidfVector` |
| 4 | **Model / Reasoning** — cosine similarity + keyword coverage + misconception checks | `js/nlp.js` → `cosineSimilarity`, `scoreAnswer`, `band` |
| 5 | **User Output** — competency map, gap detection, learning pathway, evidence log | `js/app.js` |

The **Pipeline Inspector** panel shows these stages live for each answer (token drop,
stems, coverage %, cosine %, final score), so during the demo you can literally point
at the NLP working.

## The 5 required features (from the Project 2 slide)

1. **Chatbot Diagnostic** — adaptive questions. Answer the basics well and it pushes a
   harder *stretch* question on that concept; struggle and it moves on.
2. **Understanding Probe** — each answer is parsed and scored by the NLP engine.
3. **Competency Gap Detection** — every concept lands in **Mastered / Developing / Gap**.
4. **Personalized Learning Pathway** — gaps are ordered by prerequisite (topological)
   order, each with read / practice / next-step resources.
5. **Feedback Loop** — your last run is saved (`localStorage`); re-take to see your
   delta (“↑ up 12 points vs last run”).

---

## File structure

```
ai-gap-analyzer/
├── index.html          # 3 views: welcome → diagnostic → results (loads scripts in order)
├── css/
│   └── styles.css      # 2026 cyber-HUD theme: deep-space navy + neon accents, fully responsive
├── js/
│   ├── data.js         # STAGE 1 Data — the 8-concept reference corpus + prereq graph
│   ├── nlp.js          # STAGES 2–4 — the NLP engine (tokenize, stem, TF-IDF, cosine, scoring)
│   └── app.js          # STAGE 5 — controller: adaptive Q&A, dashboard, pathway, logs, export
├── test_engine.js      # 16 unit tests for the NLP engine
├── test_app.js         # full UI integration test (jsdom) — strong / mixed / weak students
├── package.json        # dev dependency: jsdom (only needed to RUN tests, not to deploy)
├── .nojekyll           # tells GitHub Pages to serve files as-is
└── README.md
```

Load order matters and is wired in `index.html`: **`data.js` → `nlp.js` → `app.js`**
(data first, engine next, controller last).

---

## Run locally

Just open `index.html` in a browser — that's it. Or serve it:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Run the tests (evidence for your report)

```bash
npm install      # installs jsdom (dev only)
npm test         # runs both suites
```

Expected output:

```
==== RESULT: 16 passed, 0 failed ====
==== APP RESULT: ALL PASS ====
```

`test_app.js` drives the *real* `app.js` against the *real* `index.html` through jsdom and
checks three student profiles end-to-end (a strong student masters all 8 concepts with 0
gaps; a mixed student gets a partial pathway; a weak student gets 8 gaps + full pathway).

---

## Deploy to GitHub Pages

1. Create a repo (e.g. `ai-gap-analyzer`) and push these files to the `main` branch.
2. **Settings → Pages → Build and deployment → Source: “Deploy from a branch”**.
3. Branch: `main`, folder: `/ (root)`. Save.
4. Wait ~1 minute. Your app is live at
   `https://<your-username>.github.io/ai-gap-analyzer/`.

The `.nojekyll` file is already included so GitHub serves the folders untouched.
You do **not** need to upload `node_modules/` — it's only for running tests locally.

---

## Tech notes

- Vanilla JS, no framework, no bundler — nothing to break on Pages.
- `localStorage` is wrapped in `try/catch`, so the feedback loop degrades gracefully if
  storage is blocked.
- Input is locked during question transitions, so a fast double-click can never score a
  stale answer against the next question.

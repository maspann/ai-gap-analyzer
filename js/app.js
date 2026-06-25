/* =====================================================================
 * app.js — Controller for the AI Gap Analyzer
 * Orchestrates: adaptive Q&A -> NLP scoring (nlp.js) -> live dashboard ->
 * gap detection -> personalized pathway -> evidence logs -> feedback loop.
 * ===================================================================== */
(function () {
  "use strict";

  var CONCEPTS = window.GapData.CONCEPTS;
  var NLP = window.GapNLP;

  /* ------- DOM helpers ------- */
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function show(view) {
    ["welcome", "diagnostic", "results"].forEach(function (v) {
      $("view-" + v).classList.toggle("hidden", v !== view);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ------- global topological order over concepts (for pathway) ------- */
  function topoOrder() {
    var order = [], placed = {};
    var byId = {}; CONCEPTS.forEach(function (c) { byId[c.id] = c; });
    function visit(c) {
      if (placed[c.id]) return;
      (c.prereqs || []).forEach(function (p) { if (byId[p]) visit(byId[p]); });
      placed[c.id] = true; order.push(c.id);
    }
    CONCEPTS.forEach(visit);
    return order;
  }
  var TOPO = topoOrder();

  /* ------- session state ------- */
  var state;
  var locked = false;   // true while a question transition is in flight

  function lockInput(on) {
    locked = on;
    var ans = $("answer"), bs = $("btn-submit"), bk = $("btn-skip");
    if (ans) ans.disabled = on;
    if (bs) bs.disabled = on;
    if (bk) bk.disabled = on;
  }

  function freshState() {
    return {
      idx: 0,                 // index into CONCEPTS
      queue: [0],             // question indices pending for current concept
      qPos: 0,                // position in queue
      perQuestion: {},        // conceptId -> [scores]
      results: {},            // conceptId -> {score, band, detail}
      logs: [],
      asked: 0, total: estimateTotal(),
      started: Date.now()
    };
  }
  function estimateTotal() {
    // 1 base question per concept (stretch questions are adaptive extras)
    return CONCEPTS.length;
  }

  /* ------- logging ------- */
  function log(kind, msg) {
    var t = new Date().toLocaleTimeString("en-GB");
    state.logs.push({ t: t, kind: kind, msg: msg });
  }

  /* ================================================================= *
   * Competency map rendering
   * ================================================================= */
  function renderMap(targetId) {
    var el = $(targetId);
    var results = (state && state.results) ? state.results : {};
    el.innerHTML = CONCEPTS.map(function (c) {
      var r = results[c.id];
      var band = r ? r.band : "untested";
      var pct = r ? Math.round(r.score * 100) + "%" : "—";
      var label = r ? bandLabel(band) : "Untested";
      return '<div class="node ' + (r ? band : "") + '">' +
        '<div class="score">' + pct + '</div>' +
        '<div class="name">' + esc(c.name) + '</div>' +
        '<div class="tag">' + esc(c.tag) + '</div>' +
        '<div class="state"><span class="ring"></span>' + label + '</div>' +
        '</div>';
    }).join("");
  }
  function bandLabel(b) {
    return { mastered: "Mastered", developing: "Developing", gap: "Gap", untested: "Untested" }[b] || b;
  }

  /* ================================================================= *
   * Chat
   * ================================================================= */
  function pushAI(html) {
    var box = $("chat");
    box.insertAdjacentHTML("beforeend",
      '<div class="msg ai"><div class="av">AI</div><div class="bubble">' + html + '</div></div>');
    box.scrollTop = box.scrollHeight;
  }
  function pushYou(text, verdictHtml) {
    var box = $("chat");
    box.insertAdjacentHTML("beforeend",
      '<div class="msg you"><div class="av">YOU</div><div class="bubble">' +
      esc(text) + (verdictHtml ? '<div class="verdict">' + verdictHtml + '</div>' : '') +
      '</div></div>');
    box.scrollTop = box.scrollHeight;
  }

  function currentConcept() { return CONCEPTS[state.idx]; }
  function currentQuestion() {
    var c = currentConcept();
    return c.questions[state.queue[state.qPos]];
  }

  function askCurrent() {
    if (!state || state.idx >= CONCEPTS.length) return;
    var c = currentConcept(), q = currentQuestion();
    if (!c || !q) return;
    var stretch = state.queue[state.qPos] > 0;
    pushAI(
      '<span class="concept-tag">' + esc(c.name) + (stretch ? ' · stretch' : '') + '</span>' +
      esc(q.prompt));
    $("qcounter").textContent = "Q " + (state.asked + 1) + " / ~" + state.total;
    updateProgress();
    $("answer").value = "";
    lockInput(false);     // new question is on screen — accept input again
    $("answer").focus();
  }

  function updateProgress() {
    var done = Object.keys(state.results).length;
    var pct = Math.round((done / CONCEPTS.length) * 100);
    $("progbar").style.width = pct + "%";
    $("proglabel").textContent = pct + "%";
  }

  /* ================================================================= *
   * Pipeline inspector (shows the NLP stages for the last answer)
   * ================================================================= */
  function renderInspector(detail, q) {
    var tk = detail.tokens;
    var hitSet = new Set((detail.hits || []).map(NLP.stem));

    var rawHtml = tk.raw.map(function (t) {
      var dropped = !tk.filtered.includes(t);
      return '<span class="tok' + (dropped ? ' drop' : '') + '">' + esc(t) + '</span>';
    }).join("");

    var stemHtml = tk.stems.map(function (s) {
      var cls = hitSet.has(s) ? "tok hit" : "tok stem";
      return '<span class="' + cls + '">' + esc(s) + '</span>';
    }).join("");

    var cov = Math.round(detail.coverage * 100);
    var cos = Math.round(detail.cosine * 100);
    var sc = Math.round(detail.score * 100);

    $("inspector").innerHTML =
      '<div class="insp-stage"><div class="h">Stage 2 · Tokenize + stopword removal <b>(' + tk.raw.length + ' → ' + tk.filtered.length + ')</b></div><div class="tokens">' + rawHtml + '</div></div>' +
      '<div class="insp-stage"><div class="h">Stage 2 · Stems <b>(blue = matched concept keyword)</b></div><div class="tokens">' + stemHtml + '</div></div>' +
      '<div class="insp-stage"><div class="h">Stage 3–4 · Representation + reasoning</div><div class="metricbars">' +
        bar("Keyword cov.", cov) + bar("TF-IDF cos.", cos) + bar("Score", sc) +
      '</div></div>' +
      (detail.flagged && detail.flagged.length
        ? '<div class="insp-stage"><div class="h" style="color:var(--pink)">⚠ Misconception detected</div><div class="tokens"><span class="tok" style="color:var(--pink);border-color:rgba(244,114,182,.4)">' + esc(detail.flagged[0]) + '</span></div></div>'
        : '');
  }
  function bar(label, pct) {
    return '<div class="m"><label>' + label + '</label>' +
      '<div class="track"><i style="width:' + pct + '%"></i></div>' +
      '<div class="val">' + pct + '%</div></div>';
  }

  /* ================================================================= *
   * Submit / scoring
   * ================================================================= */
  function submit(skipped) {
    if (locked) return;                                  // ignore double / stray submits during transitions
    if (!state || state.idx >= CONCEPTS.length) return;  // finished / stray event
    var c = currentConcept(), q = currentQuestion();
    if (!c || !q) return;
    var text = skipped ? "" : $("answer").value.trim();
    if (!skipped && text.length < 2) { $("answer").focus(); return; }

    // Lock input + clear the box immediately so the same text can never be
    // re-scored against the next (stretch) question during the transition.
    lockInput(true);
    $("answer").value = "";

    var detail = NLP.scoreAnswer(skipped ? "" : text, q);
    var band = NLP.band(detail.score);

    // record this question's score
    (state.perQuestion[c.id] = state.perQuestion[c.id] || []).push(detail.score);
    state.asked++;

    // student bubble + verdict
    var verdict =
      '<span class="pill ' + band + '">' + bandLabel(band) + ' · ' + Math.round(detail.score * 100) + '%</span>' +
      (detail.hits.length ? '<span style="color:var(--green)">✓ ' + detail.hits.length + ' key concepts</span>' : '') +
      (detail.misses.length ? '<span style="color:var(--ink-dim)">missed: ' + esc(detail.misses.slice(0, 3).join(", ")) + '</span>' : '');
    pushYou(skipped ? "(skipped)" : text, verdict);

    renderInspector(detail, q);
    log("run", "[" + c.id + "] tokens " + detail.tokens.raw.length +
      " → stems " + detail.tokens.stems.length +
      " | coverage=" + (detail.coverage * 100).toFixed(0) + "%" +
      " cosine=" + detail.cosine.toFixed(2) +
      " score=" + (detail.score * 100).toFixed(0) + "% → " + band.toUpperCase() +
      (detail.flagged.length ? " | FLAG: " + detail.flagged[0] : ""));

    // ----- adaptive branching -----
    var wasBase = state.queue[state.qPos] === 0;
    if (!skipped && wasBase && band === "mastered" && c.questions.length > 1) {
      // strong on the basics -> probe deeper with the stretch question
      state.queue.push(1);
      state.qPos++;
      pushAI('<span style="color:var(--green)">Nice — that\'s solid. Let me push a little deeper.</span>');
      setTimeout(askCurrent, 350);
      return;
    }

    finalizeConcept(c);
    advance();
  }

  function finalizeConcept(c) {
    var arr = state.perQuestion[c.id] || [0];
    var avg = arr.reduce(function (a, b) { return a + b; }, 0) / arr.length;
    state.results[c.id] = { score: avg, band: NLP.band(avg) };
    renderMap("cmap");
    updateProgress();
    log("ok", "Concept '" + c.name + "' finalized: " + Math.round(avg * 100) + "% (" + NLP.band(avg).toUpperCase() + ")");
  }

  function advance() {
    state.idx++;
    state.queue = [0]; state.qPos = 0;
    if (state.idx >= CONCEPTS.length) { return finish(); }
    setTimeout(askCurrent, 400);
  }

  /* ================================================================= *
   * Results
   * ================================================================= */
  function finish() {
    var ids = Object.keys(state.results);
    var overall = ids.reduce(function (a, id) { return a + state.results[id].score; }, 0) / ids.length;
    var mastered = ids.filter(function (id) { return state.results[id].band === "mastered"; }).length;
    var developing = ids.filter(function (id) { return state.results[id].band === "developing"; }).length;
    var gaps = ids.filter(function (id) { return state.results[id].band === "gap"; }).length;

    $("s-overall").textContent = Math.round(overall * 100) + "%";
    $("s-mastered").textContent = mastered;
    $("s-developing").textContent = developing;
    $("s-gap").textContent = gaps;
    $("overall-band").textContent = overall >= 0.7 ? "STRONG" : overall >= 0.4 ? "DEVELOPING" : "NEEDS WORK";

    renderMap("cmap-final");
    renderPathway();
    renderLogs();
    renderProgressNote(overall, mastered, developing, gaps);
    saveProgress(overall, mastered, developing, gaps);

    log("ok", "Diagnostic complete in " + ((Date.now() - state.started) / 1000).toFixed(1) +
      "s | overall " + Math.round(overall * 100) + "% | " + gaps + " gap(s), " + developing + " developing");
    show("results");
  }

  function renderPathway() {
    // concepts needing work, ordered by prerequisite (topological) order
    var need = TOPO.filter(function (id) {
      var r = state.results[id];
      return r && (r.band === "gap" || r.band === "developing");
    });
    var box = $("pathway");
    if (!need.length) {
      box.innerHTML = '<div class="pathway-empty">✓ No gaps detected — every concept is at mastery. Recommended next action: move on to model evaluation & deployment.</div>';
      return;
    }
    var byId = {}; CONCEPTS.forEach(function (c) { byId[c.id] = c; });
    box.innerHTML = need.map(function (id, i) {
      var c = byId[id], r = state.results[id];
      var pillCls = r.band;
      return '<div class="step">' +
        '<div class="num">' + (i + 1) + '</div>' +
        '<div>' +
          '<div class="name">' + esc(c.name) +
            ' <span class="pill ' + pillCls + '">' + bandLabel(r.band) + ' · ' + Math.round(r.score * 100) + '%</span></div>' +
          '<p class="why">' + esc(c.blurb) + '</p>' +
          '<ul class="todo">' +
            '<li><b>Read:</b> ' + esc(c.resources.read) + '</li>' +
            '<li><b>Practice:</b> ' + esc(c.resources.practice) + '</li>' +
            '<li><b>Then:</b> ' + esc(c.resources.next) + '</li>' +
          '</ul>' +
        '</div>' +
      '</div>';
    }).join("");
  }

  function renderLogs() {
    $("logbox").innerHTML = state.logs.map(function (l) {
      var cls = l.kind === "ok" ? "ok" : l.kind === "warn" ? "warn" : l.kind === "err" ? "err" : "k";
      return '<span class="t">' + l.t + '</span>  <span class="' + cls + '">' + esc(l.msg) + '</span>';
    }).join("\n");
  }

  function renderProgressNote(overall) {
    var prev = loadProgress();
    var note = $("progress-note");
    if (!prev) { note.textContent = "First run recorded. Re-take after studying to track improvement (feedback loop)."; return; }
    var delta = Math.round((overall - prev.overall) * 100);
    if (delta > 0) note.innerHTML = '↑ <span style="color:var(--green)">Up ' + delta + ' points</span> vs your last run (' + Math.round(prev.overall * 100) + '%). Keep going.';
    else if (delta < 0) note.innerHTML = '↓ <span style="color:var(--pink)">Down ' + Math.abs(delta) + ' points</span> vs last run (' + Math.round(prev.overall * 100) + '%).';
    else note.textContent = "Same overall as last run (" + Math.round(prev.overall * 100) + "%).";
  }

  /* ------- feedback loop persistence (graceful if storage blocked) ------- */
  var KEY = "gapAnalyzer.lastRun";
  function saveProgress(overall, m, d, g) {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        overall: overall, mastered: m, developing: d, gaps: g, at: Date.now()
      }));
    } catch (e) { /* storage unavailable (e.g. sandbox) — non-fatal */ }
  }
  function loadProgress() {
    try { var v = localStorage.getItem(KEY); return v ? JSON.parse(v) : null; }
    catch (e) { return null; }
  }

  /* ------- export evidence report ------- */
  function exportReport() {
    var ids = Object.keys(state.results);
    var overall = ids.reduce(function (a, id) { return a + state.results[id].score; }, 0) / ids.length;
    var lines = [];
    lines.push("AI GAP ANALYZER — DIAGNOSTIC EVIDENCE REPORT");
    lines.push("Generated: " + new Date().toLocaleString());
    lines.push("Overall mastery: " + Math.round(overall * 100) + "%");
    lines.push("");
    lines.push("COMPETENCY MAP");
    CONCEPTS.forEach(function (c) {
      var r = state.results[c.id];
      lines.push("  - " + c.name.padEnd(20) + " " +
        (r ? (Math.round(r.score * 100) + "%").padStart(4) + "  " + r.band.toUpperCase() : "untested"));
    });
    lines.push("");
    lines.push("LEARNING PATHWAY (prerequisite order)");
    var need = TOPO.filter(function (id) { var r = state.results[id]; return r && r.band !== "mastered"; });
    if (!need.length) lines.push("  (no gaps — all concepts mastered)");
    var byId = {}; CONCEPTS.forEach(function (c) { byId[c.id] = c; });
    need.forEach(function (id, i) {
      var c = byId[id];
      lines.push("  " + (i + 1) + ". " + c.name);
      lines.push("       Read: " + c.resources.read);
      lines.push("       Practice: " + c.resources.practice);
    });
    lines.push("");
    lines.push("PIPELINE RUN LOG");
    state.logs.forEach(function (l) { lines.push("  [" + l.t + "] " + l.msg); });

    var blob = new Blob([lines.join("\n")], { type: "text/plain" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "gap-analyzer-report.txt";
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  /* ================================================================= *
   * Wiring
   * ================================================================= */
  function start() {
    state = freshState();
    lockInput(true);
    $("chat").innerHTML = "";
    $("inspector").innerHTML = '<div class="insp-empty">Submit an answer to watch it flow through the pipeline.</div>';
    renderMap("cmap");
    log("ok", "Session started. Probing " + CONCEPTS.length + " NLP concepts.");
    show("diagnostic");
    pushAI("Hi! I'm your NLP gap analyzer. I'll ask about a few core concepts and read your explanations with a real NLP pipeline. Answer in your own words — there's no penalty for trying.");
    setTimeout(askCurrent, 500);
  }

  function init() {
    renderMap("cmap");
    $("btn-start").addEventListener("click", start);
    $("btn-demo").addEventListener("click", function () {
      start();
      setTimeout(function () {
        $("answer").value = "Tokenization splits text into smaller units called tokens such as words or subwords, so the model can read them instead of raw text.";
      }, 700);
    });
    $("btn-submit").addEventListener("click", function () { submit(false); });
    $("btn-skip").addEventListener("click", function () { submit(true); });
    $("answer").addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); submit(false); }
    });
    $("btn-export").addEventListener("click", exportReport);
    $("btn-retake").addEventListener("click", start);
    $("btn-home").addEventListener("click", function () { show("welcome"); });
  }

  document.addEventListener("DOMContentLoaded", init);
})();

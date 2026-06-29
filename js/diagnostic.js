/* =====================================================================
 * diagnostic.js — Student experience
 * Adaptive Q&A -> NLP scoring -> live dashboard -> gap detection ->
 * personalized pathway -> DETAILED mistake review -> rubric match ->
 * saved attempt history (feedback loop). Content + rubric come from the
 * admin-editable store, so whatever the admin changes drives this flow.
 * ===================================================================== */
window.GapDiag = (function () {
  "use strict";

  var NLP = window.GapNLP;
  var Store = window.GapStore;

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function show(view) { if (window.GapApp) window.GapApp.show(view); }

  /* ---- working copies pulled fresh each run (so admin edits apply) ---- */
  var CONCEPTS = [];
  var RUBRIC = null;
  function loadConfig() {
    CONCEPTS = Store.getContent();
    RUBRIC = Store.getRubric();
  }
  function bandKey(score) { return Store.bandFor(score, RUBRIC).key; }
  function bandLabel(key) {
    var b = RUBRIC.bands.filter(function (x) { return x.key === key; })[0];
    return b ? b.label : key;
  }

  /* ---- topological order over concepts (pathway) ---- */
  function topoOrder() {
    var order = [], placed = {}, byId = {};
    CONCEPTS.forEach(function (c) { byId[c.id] = c; });
    function visit(c) {
      if (placed[c.id]) return;
      (c.prereqs || []).forEach(function (p) { if (byId[p]) visit(byId[p]); });
      placed[c.id] = true; order.push(c.id);
    }
    CONCEPTS.forEach(visit);
    return order;
  }

  /* ---- session state ---- */
  var state, locked = false;
  function lockInput(on) {
    locked = on;
    [$("answer"), $("btn-submit"), $("btn-skip")].forEach(function (el) { if (el) el.disabled = on; });
  }
  function freshState() {
    return {
      idx: 0, queue: [0], qPos: 0,
      perQuestion: {},   // conceptId -> [scores]
      detail: {},        // conceptId -> [{prompt,answer,skipped,score,band,coverage,cosine,hits,misses,flagged,modelAnswer,keywords}]
      results: {},       // conceptId -> {score, band}
      logs: [], asked: 0, total: CONCEPTS.length, started: Date.now()
    };
  }
  function log(kind, msg) {
    state.logs.push({ t: new Date().toLocaleTimeString("en-GB"), kind: kind, msg: msg });
  }

  /* ================= competency map ================= */
  function renderMap(targetId) {
    var el = $(targetId); if (!el) return;
    var results = (state && state.results) ? state.results : {};
    el.innerHTML = CONCEPTS.map(function (c) {
      var r = results[c.id];
      var key = r ? r.band : "untested";
      var pct = r ? Math.round(r.score * 100) + "%" : "—";
      return '<div class="node ' + (r ? key : "") + '">' +
        '<div class="score">' + pct + '</div>' +
        '<div class="name">' + esc(c.name) + '</div>' +
        '<div class="tag">' + esc(c.tag || "") + '</div>' +
        '<div class="state"><span class="ring"></span>' + (r ? bandLabel(key) : "Untested") + '</div>' +
        '</div>';
    }).join("");
  }

  /* ================= chat ================= */
  function pushAI(html) {
    var box = $("chat");
    box.insertAdjacentHTML("beforeend", '<div class="msg ai"><div class="av">AI</div><div class="bubble">' + html + '</div></div>');
    box.scrollTop = box.scrollHeight;
  }
  function pushYou(text, verdictHtml) {
    var box = $("chat");
    box.insertAdjacentHTML("beforeend", '<div class="msg you"><div class="av">YOU</div><div class="bubble">' +
      esc(text) + (verdictHtml ? '<div class="verdict">' + verdictHtml + '</div>' : '') + '</div></div>');
    box.scrollTop = box.scrollHeight;
  }
  function currentConcept() { return CONCEPTS[state.idx]; }
  function currentQuestion() { return currentConcept().questions[state.queue[state.qPos]]; }

  function askCurrent() {
    if (!state || state.idx >= CONCEPTS.length) return;
    var c = currentConcept(), q = currentQuestion();
    if (!c || !q) return;
    var stretch = state.queue[state.qPos] > 0;
    pushAI('<span class="concept-tag">' + esc(c.name) + (stretch ? ' · stretch' : '') + '</span>' + esc(q.prompt));
    $("qcounter").textContent = "Q " + (state.asked + 1) + " / ~" + state.total;
    updateProgress();
    $("answer").value = "";
    lockInput(false);
    $("answer").focus();
  }
  function updateProgress() {
    var pct = Math.round((Object.keys(state.results).length / CONCEPTS.length) * 100);
    $("progbar").style.width = pct + "%"; $("proglabel").textContent = pct + "%";
  }

  /* ================= pipeline inspector ================= */
  function renderInspector(detail) {
    var tk = detail.tokens, hitSet = new Set((detail.hits || []).map(NLP.stem));
    var rawHtml = tk.raw.map(function (t) {
      return '<span class="tok' + (tk.filtered.includes(t) ? '' : ' drop') + '">' + esc(t) + '</span>';
    }).join("");
    var stemHtml = tk.stems.map(function (s) {
      return '<span class="' + (hitSet.has(s) ? "tok hit" : "tok stem") + '">' + esc(s) + '</span>';
    }).join("");
    var cov = Math.round(detail.coverage * 100), cos = Math.round(detail.cosine * 100), sc = Math.round(detail.score * 100);
    $("inspector").innerHTML =
      '<div class="insp-stage"><div class="h">Stage 2 · Tokenize + stopword removal <b>(' + tk.raw.length + ' → ' + tk.filtered.length + ')</b></div><div class="tokens">' + rawHtml + '</div></div>' +
      '<div class="insp-stage"><div class="h">Stage 2 · Stems <b>(blue = matched keyword)</b></div><div class="tokens">' + stemHtml + '</div></div>' +
      '<div class="insp-stage"><div class="h">Stage 3–4 · Representation + reasoning</div><div class="metricbars">' +
        bar("Keyword cov.", cov) + bar("TF-IDF cos.", cos) + bar("Score", sc) + '</div></div>' +
      (detail.flagged && detail.flagged.length
        ? '<div class="insp-stage"><div class="h" style="color:var(--pink)">⚠ Misconception detected</div><div class="tokens"><span class="tok" style="color:var(--pink);border-color:rgba(244,114,182,.4)">' + esc(detail.flagged[0]) + '</span></div></div>' : '');
  }
  function bar(label, pct) {
    return '<div class="m"><label>' + label + '</label><div class="track"><i style="width:' + pct + '%"></i></div><div class="val">' + pct + '%</div></div>';
  }

  /* ================= submit / scoring ================= */
  function submit(skipped) {
    if (locked) return;
    if (!state || state.idx >= CONCEPTS.length) return;
    var c = currentConcept(), q = currentQuestion();
    if (!c || !q) return;
    var text = skipped ? "" : $("answer").value.trim();
    if (!skipped && text.length < 2) { $("answer").focus(); return; }
    lockInput(true);
    $("answer").value = "";

    var detail = NLP.scoreAnswer(skipped ? "" : text, q);
    var key = bandKey(detail.score);

    (state.perQuestion[c.id] = state.perQuestion[c.id] || []).push(detail.score);
    (state.detail[c.id] = state.detail[c.id] || []).push({
      prompt: q.prompt, answer: skipped ? "" : text, skipped: !!skipped,
      score: detail.score, band: key, coverage: detail.coverage, cosine: detail.cosine,
      hits: detail.hits, misses: detail.misses, flagged: detail.flagged,
      modelAnswer: q.modelAnswer, keywords: q.keywords || []
    });
    state.asked++;

    var verdict = '<span class="pill ' + key + '">' + bandLabel(key) + ' · ' + Math.round(detail.score * 100) + '%</span>' +
      (detail.hits.length ? '<span style="color:var(--green)">✓ ' + detail.hits.length + ' key concepts</span>' : '') +
      (detail.misses.length ? '<span style="color:var(--ink-dim)">missed: ' + esc(detail.misses.slice(0, 3).join(", ")) + '</span>' : '');
    pushYou(skipped ? "(skipped)" : text, verdict);

    renderInspector(detail);
    log("run", "[" + c.id + "] tokens " + detail.tokens.raw.length + " → stems " + detail.tokens.stems.length +
      " | coverage=" + (detail.coverage * 100).toFixed(0) + "% cosine=" + detail.cosine.toFixed(2) +
      " score=" + (detail.score * 100).toFixed(0) + "% → " + key.toUpperCase() +
      (detail.flagged.length ? " | FLAG: " + detail.flagged[0] : ""));

    var wasBase = state.queue[state.qPos] === 0;
    if (!skipped && wasBase && key === "mastered" && c.questions.length > 1) {
      state.queue.push(1); state.qPos++;
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
    state.results[c.id] = { score: avg, band: bandKey(avg) };
    renderMap("cmap"); updateProgress();
    log("ok", "Concept '" + c.name + "' finalized: " + Math.round(avg * 100) + "% (" + bandKey(avg).toUpperCase() + ")");
  }
  function advance() {
    state.idx++; state.queue = [0]; state.qPos = 0;
    if (state.idx >= CONCEPTS.length) return finish();
    setTimeout(askCurrent, 400);
  }

  /* ================= finish + results ================= */
  function finish() {
    var ids = Object.keys(state.results);
    var overall = ids.reduce(function (a, id) { return a + state.results[id].score; }, 0) / (ids.length || 1);
    var counts = { mastered: 0, developing: 0, gap: 0 };
    ids.forEach(function (id) { counts[state.results[id].band] = (counts[state.results[id].band] || 0) + 1; });

    $("s-overall").textContent = Math.round(overall * 100) + "%";
    $("s-mastered").textContent = counts.mastered || 0;
    $("s-developing").textContent = counts.developing || 0;
    $("s-gap").textContent = counts.gap || 0;
    var grade = Store.gradeFor(overall, RUBRIC);
    $("overall-band").textContent = grade.score + " · " + grade.label;

    renderMap("cmap-final");
    renderRubricMatch(overall, counts, grade);
    renderReview();
    renderPathway();
    renderLogs();

    // feedback-loop note vs previous attempt (this user)
    var me = Store.currentUser();
    var prev = me ? Store.listHistory(me.username)[0] : null;
    renderProgressNote(overall, prev);

    // persist attempt to history
    if (me) {
      Store.addAttempt({
        username: me.username, overall: overall, counts: counts,
        grade: { score: grade.score, label: grade.label },
        detail: serializeDetail(),
        logs: state.logs.slice()
      });
    }
    log("ok", "Diagnostic complete in " + ((Date.now() - state.started) / 1000).toFixed(1) +
      "s | overall " + Math.round(overall * 100) + "% | grade " + grade.score);
    show("results");
  }

  function serializeDetail() {
    return CONCEPTS.map(function (c) {
      return { id: c.id, name: c.name, result: state.results[c.id] || null, questions: state.detail[c.id] || [] };
    });
  }

  function renderRubricMatch(overall, counts, grade) {
    var el = $("rubric-match");
    var total = CONCEPTS.length;
    el.innerHTML =
      '<div class="grade-badge ' + gradeClass(grade.score) + '">' +
        '<div class="g-score">' + grade.score + '<span>/100</span></div>' +
        '<div class="g-meta"><div class="g-label">' + esc(grade.label) + '</div>' +
        '<div class="g-desc">' + esc(grade.desc) + '</div></div>' +
      '</div>' +
      '<p class="match-line">Based on <b>' + Math.round(overall * 100) + '%</b> overall mastery across <b>' + total + '</b> concepts: ' +
        '<span class="pill mastered">' + (counts.mastered || 0) + ' mastered</span> ' +
        '<span class="pill developing">' + (counts.developing || 0) + ' developing</span> ' +
        '<span class="pill gap">' + (counts.gap || 0) + ' gap</span></p>' +
      ((counts.gap || 0) > 0
        ? '<p class="match-hint">Concepts in <b>Gap</b> are pulling your grade down — close those first in the pathway below to move up a band.</p>'
        : '<p class="match-hint">No gaps — to push higher, deepen the <b>developing</b> concepts.</p>') +
      '<div class="rubric-grades">' + RUBRIC.grades.slice().sort(function (a, b) { return b.min - a.min; }).map(function (g) {
        var here = g.score === grade.score;
        return '<div class="rg-row' + (here ? ' here' : '') + '"><span class="rg-score">' + g.score + '</span><span class="rg-label">' + esc(g.label) + '</span><span class="rg-min">≥ ' + Math.round(g.min * 100) + '%</span></div>';
      }).join("") + '</div>';
  }
  function gradeClass(score) { return score >= 100 ? "g-100" : score >= 90 ? "g-90" : score >= 80 ? "g-80" : "g-70"; }

  function renderReview() {
    var el = $("review");
    var html = CONCEPTS.map(function (c) {
      var qs = state.detail[c.id] || [];
      if (!qs.length) return "";
      var inner = qs.map(function (d) {
        var why = whyNote(d);
        var hits = d.hits.length ? d.hits.map(function (h) { return '<span class="kw ok">' + esc(h) + '</span>'; }).join("") : '<span class="muted">none</span>';
        var miss = d.misses.length ? d.misses.map(function (m) { return '<span class="kw bad">' + esc(m) + '</span>'; }).join("") : '<span class="muted">none</span>';
        return '<div class="qrev">' +
          '<div class="qrev-head"><span class="pill ' + d.band + '">' + bandLabel(d.band) + ' · ' + Math.round(d.score * 100) + '%</span>' +
            '<span class="qrev-q">' + esc(d.prompt) + '</span></div>' +
          '<div class="qrev-you"><span class="lbl">Your answer</span><div class="qrev-text">' + (d.skipped ? '<i class="muted">(skipped)</i>' : esc(d.answer)) + '</div></div>' +
          '<div class="qrev-kw"><div><span class="lbl">Covered</span> ' + hits + '</div><div><span class="lbl">Missed</span> ' + miss + '</div></div>' +
          (d.flagged.length ? '<div class="qrev-flag">⚠ Misconception: “' + esc(d.flagged[0]) + '”. That statement is not correct — re-check the concept.</div>' : '') +
          '<div class="qrev-why">' + why + '</div>' +
          '<details class="qrev-model"><summary>Show what we looked for</summary>' +
            '<div class="qrev-text">' + esc(d.modelAnswer) + '</div>' +
            (d.keywords.length ? '<div class="qrev-keys"><span class="lbl">Key terms</span> ' + d.keywords.map(function (k) { return '<span class="kw">' + esc(k) + '</span>'; }).join("") + '</div>' : '') +
          '</details>' +
        '</div>';
      }).join("");
      return '<div class="review-concept"><h4>' + esc(c.name) + '</h4>' + inner + '</div>';
    }).join("");
    el.innerHTML = html || '<p class="muted">No answers recorded.</p>';
  }

  function whyNote(d) {
    if (d.skipped) return 'You skipped this — it counts as a gap. Come back and attempt it.';
    if (d.band === "mastered") return 'Strong answer — you covered the key ideas and your wording matched well.';
    var bits = [];
    if (d.misses.length) bits.push('you didn\'t mention <b>' + esc(d.misses.slice(0, 3).join(", ")) + '</b>');
    if (d.coverage >= 0.5 && d.cosine < 0.4) bits.push('your wording drifted from how the concept is usually explained');
    if (!d.misses.length && d.cosine < 0.4) bits.push('keywords were present but the explanation was thin — add more detail');
    if (d.flagged.length) bits.push('you stated a misconception');
    if (!bits.length) bits.push('add more specific NLP terms and a short example to lift the score');
    return 'Why this score: ' + bits.join("; ") + '.';
  }

  function renderPathway() {
    var TOPO = topoOrder();
    var need = TOPO.filter(function (id) {
      var r = state.results[id]; return r && (r.band === "gap" || r.band === "developing");
    });
    var box = $("pathway"), byId = {};
    CONCEPTS.forEach(function (c) { byId[c.id] = c; });
    if (!need.length) { box.innerHTML = '<div class="pathway-empty">✓ No gaps detected — every concept is at mastery. Next: model evaluation & deployment.</div>'; return; }
    box.innerHTML = need.map(function (id, i) {
      var c = byId[id], r = state.results[id];
      return '<div class="step"><div class="num">' + (i + 1) + '</div><div>' +
        '<div class="name">' + esc(c.name) + ' <span class="pill ' + r.band + '">' + bandLabel(r.band) + ' · ' + Math.round(r.score * 100) + '%</span></div>' +
        '<p class="why">' + esc(c.blurb || "") + '</p><ul class="todo">' +
        '<li><b>Read:</b> ' + esc(c.resources.read) + '</li>' +
        '<li><b>Practice:</b> ' + esc(c.resources.practice) + '</li>' +
        '<li><b>Then:</b> ' + esc(c.resources.next) + '</li></ul></div></div>';
    }).join("");
  }
  function renderLogs() {
    $("logbox").innerHTML = state.logs.map(function (l) {
      var cls = l.kind === "ok" ? "ok" : l.kind === "warn" ? "warn" : l.kind === "err" ? "err" : "k";
      return '<span class="t">' + l.t + '</span>  <span class="' + cls + '">' + esc(l.msg) + '</span>';
    }).join("\n");
  }
  function renderProgressNote(overall, prev) {
    var note = $("progress-note");
    if (!prev) { note.textContent = "First run recorded. Re-take after studying to track improvement (feedback loop)."; return; }
    var delta = Math.round((overall - prev.overall) * 100);
    if (delta > 0) note.innerHTML = '↑ <span style="color:var(--green)">Up ' + delta + ' points</span> vs your last run (' + Math.round(prev.overall * 100) + '%). Keep going.';
    else if (delta < 0) note.innerHTML = '↓ <span style="color:var(--pink)">Down ' + Math.abs(delta) + ' points</span> vs last run (' + Math.round(prev.overall * 100) + '%).';
    else note.textContent = "Same overall as last run (" + Math.round(prev.overall * 100) + "%).";
  }

  /* ================= export ================= */
  function exportReport() {
    var ids = Object.keys(state.results);
    var overall = ids.reduce(function (a, id) { return a + state.results[id].score; }, 0) / (ids.length || 1);
    var me = Store.currentUser();
    var lines = ["AI GAP ANALYZER — DIAGNOSTIC EVIDENCE REPORT",
      "Student: " + (me ? me.username : "(guest)"),
      "Generated: " + new Date().toLocaleString(),
      "Overall mastery: " + Math.round(overall * 100) + "%  |  Grade: " + Store.gradeFor(overall, RUBRIC).score, "",
      "COMPETENCY MAP"];
    CONCEPTS.forEach(function (c) {
      var r = state.results[c.id];
      lines.push("  - " + c.name.padEnd(20) + " " + (r ? (Math.round(r.score * 100) + "%").padStart(4) + "  " + r.band.toUpperCase() : "untested"));
    });
    lines.push("", "PIPELINE RUN LOG");
    state.logs.forEach(function (l) { lines.push("  [" + l.t + "] " + l.msg); });
    var blob = new Blob([lines.join("\n")], { type: "text/plain" });
    var url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = "gap-analyzer-report.txt";
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  /* ================= read-only rubric view ================= */
  function renderRubricView() {
    loadConfig();
    var el = $("rubric-view"); if (!el) return;
    el.innerHTML =
      '<p class="muted">This is exactly how the system grades you. Your instructor can change it from the admin panel.</p>' +
      '<h4>Competency bands (per concept)</h4><div class="rubric-cards">' +
      RUBRIC.bands.slice().sort(function (a, b) { return b.min - a.min; }).map(function (b) {
        return '<div class="rubric-card ' + b.key + '"><div class="rc-top"><b>' + esc(b.label) + '</b><span>≥ ' + Math.round(b.min * 100) + '%</span></div><p>' + esc(b.desc) + '</p></div>';
      }).join("") + '</div>' +
      '<h4>Overall grade scale</h4><div class="rubric-grades">' +
      RUBRIC.grades.slice().sort(function (a, b) { return b.min - a.min; }).map(function (g) {
        return '<div class="rg-row"><span class="rg-score">' + g.score + '</span><span class="rg-label">' + esc(g.label) + '</span><span class="rg-min">≥ ' + Math.round(g.min * 100) + '%</span><span class="rg-desc">' + esc(g.desc) + '</span></div>';
      }).join("") + '</div>' +
      '<h4>Evidence criteria</h4><table class="rubric-table"><thead><tr><th>Criterion</th><th>Strong</th><th>Weak</th></tr></thead><tbody>' +
      RUBRIC.criteria.map(function (c) {
        return '<tr><td><b>' + esc(c.name) + '</b></td><td class="good">' + esc(c.good) + '</td><td class="bad">' + esc(c.bad) + '</td></tr>';
      }).join("") + '</tbody></table>';
  }

  /* ================= user history view ================= */
  function renderUserHistory() {
    var me = Store.currentUser(); if (!me) return;
    var el = $("user-history"); if (!el) return;
    var hist = Store.listHistory(me.username);
    if ($("w-attempts")) $("w-attempts").textContent = hist.length;
    if (!hist.length) { el.innerHTML = '<p class="muted">No attempts yet. Take the diagnostic to start tracking your progress.</p>'; return; }
    el.innerHTML = hist.map(function (a, i) {
      var prev = hist[i + 1];
      var delta = prev ? Math.round((a.overall - prev.overall) * 100) : null;
      var deltaHtml = delta === null ? '' : (delta > 0 ? '<span class="delta up">↑ ' + delta + '</span>' : delta < 0 ? '<span class="delta down">↓ ' + Math.abs(delta) + '</span>' : '<span class="delta">=</span>');
      return '<div class="hist-row">' +
        '<div class="hist-main"><div class="hist-score">' + Math.round(a.overall * 100) + '%</div>' +
          '<div><div class="hist-grade">' + (a.grade ? a.grade.score + ' · ' + esc(a.grade.label) : '') + ' ' + deltaHtml + '</div>' +
          '<div class="hist-date">' + new Date(a.at).toLocaleString() + '</div></div></div>' +
        '<div class="hist-counts"><span class="pill mastered">' + (a.counts.mastered || 0) + 'M</span>' +
          '<span class="pill developing">' + (a.counts.developing || 0) + 'D</span>' +
          '<span class="pill gap">' + (a.counts.gap || 0) + 'G</span></div></div>';
    }).join("");
  }

  /* ================= lifecycle ================= */
  function start() {
    loadConfig();
    if (!CONCEPTS.length) { alert("No content configured. Ask an admin to add concepts."); return; }
    state = freshState(); lockInput(true);
    $("chat").innerHTML = "";
    $("inspector").innerHTML = '<div class="insp-empty">Submit an answer to watch it flow through the pipeline.</div>';
    renderMap("cmap");
    log("ok", "Session started. Probing " + CONCEPTS.length + " NLP concepts.");
    show("diagnostic");
    pushAI("Hi! I'm your NLP gap analyzer. I'll ask about a few core concepts and read your explanations with a real NLP pipeline. Answer in your own words — there's no penalty for trying.");
    setTimeout(askCurrent, 500);
  }

  var wired = false;
  function init() {
    if (wired) return; wired = true;
    $("btn-start").addEventListener("click", start);
    $("btn-submit").addEventListener("click", function () { submit(false); });
    $("btn-skip").addEventListener("click", function () { submit(true); });
    $("answer").addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); submit(false); }
    });
    $("btn-export").addEventListener("click", exportReport);
    $("btn-retake").addEventListener("click", start);
    $("btn-home").addEventListener("click", function () { show("welcome"); });
    $("btn-view-rubric").addEventListener("click", function () { renderRubricView(); show("rubric"); });
    $("btn-view-history").addEventListener("click", function () { renderUserHistory(); show("history"); });
  }

  function refreshWelcome() {
    loadConfig();
    if ($("w-concepts")) $("w-concepts").textContent = CONCEPTS.length;
    var me = Store.currentUser();
    if ($("w-attempts") && me) $("w-attempts").textContent = Store.listHistory(me.username).length;
  }

  return { init: init, start: start, renderRubricView: renderRubricView, renderUserHistory: renderUserHistory, refreshWelcome: refreshWelcome };
})();

/* =====================================================================
 * admin.js — Admin dashboard
 * Tabs: Content & answer keys · Rubric · Users · All history · Reset.
 * Admins can edit every question, model answer, keyword, rubric threshold,
 * and grade band; manage user accounts and roles; and inspect every
 * student's attempt history (answers + scores) — all persisted in the store.
 * ===================================================================== */
window.GapAdmin = (function () {
  "use strict";

  var Store = window.GapStore;
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function csv(arr) { return (arr || []).join(", "); }
  function splitCsv(s) { return String(s || "").split(",").map(function (x) { return x.trim(); }).filter(Boolean); }
  function val(el, sel) { var n = el.querySelector(sel); return n ? n.value : ""; }
  function flash(id, msg, ok) {
    var n = $(id); if (!n) return;
    n.textContent = msg; n.className = "admin-msg " + (ok === false ? "err" : "ok");
    setTimeout(function () { if (n) { n.textContent = ""; n.className = "admin-msg"; } }, 2600);
  }

  /* ===================== CONTENT EDITOR ===================== */
  function renderContent() {
    var concepts = Store.getContent();
    $("admin-content").innerHTML =
      '<div class="admin-actions"><button class="btn sm" id="ac-add">+ Add concept</button>' +
      '<button class="btn sm" id="ac-save">Save all changes</button>' +
      '<button class="btn ghost sm" id="ac-reset">Reset to defaults</button>' +
      '<span id="ac-msg" class="admin-msg"></span></div>' +
      '<div id="ac-list">' + concepts.map(conceptEditor).join("") + '</div>';
    wireContent();
  }
  function conceptEditor(c, i) {
    return '<div class="cedit" data-ci="' + i + '">' +
      '<div class="cedit-head">' +
        '<input class="f-id mono" value="' + esc(c.id) + '" placeholder="id" />' +
        '<input class="f-name" value="' + esc(c.name) + '" placeholder="Concept name" />' +
        '<input class="f-tag mono" value="' + esc(c.tag || "") + '" placeholder="tag" />' +
        '<button class="btn ghost sm del-concept">Delete</button>' +
      '</div>' +
      '<label class="alabel">Short description (blurb)</label>' +
      '<input class="f-blurb" value="' + esc(c.blurb || "") + '" />' +
      '<label class="alabel">Prerequisite concept ids (comma-separated, drives the learning pathway)</label>' +
      '<input class="f-prereqs mono" value="' + esc(csv(c.prereqs)) + '" placeholder="e.g. tokenization, stopwords" />' +
      '<div class="three">' +
        '<div><label class="alabel">Resource · Read</label><input class="f-read" value="' + esc(c.resources ? c.resources.read : "") + '" /></div>' +
        '<div><label class="alabel">Resource · Practice</label><input class="f-practice" value="' + esc(c.resources ? c.resources.practice : "") + '" /></div>' +
        '<div><label class="alabel">Resource · Then</label><input class="f-next" value="' + esc(c.resources ? c.resources.next : "") + '" /></div>' +
      '</div>' +
      '<div class="qlist">' + (c.questions || []).map(questionEditor).join("") + '</div>' +
      '<button class="btn ghost sm add-q">+ Add question</button>' +
    '</div>';
  }
  function questionEditor(q, j) {
    return '<div class="qedit" data-qi="' + j + '">' +
      '<div class="qedit-top"><span class="qnum">Q' + (j + 1) + (j === 0 ? ' · base' : ' · stretch') + '</span>' +
        '<button class="btn ghost sm del-q">Delete question</button></div>' +
      '<label class="alabel">Question prompt</label><textarea class="f-prompt" rows="2">' + esc(q.prompt) + '</textarea>' +
      '<label class="alabel">Model answer (answer key — used for TF-IDF cosine scoring)</label><textarea class="f-model" rows="3">' + esc(q.modelAnswer) + '</textarea>' +
      '<div class="two">' +
        '<div><label class="alabel">Required keywords (comma-separated)</label><input class="f-keywords" value="' + esc(csv(q.keywords)) + '" /></div>' +
        '<div><label class="alabel">Misconception phrases (comma-separated)</label><input class="f-misc" value="' + esc(csv(q.misconceptions)) + '" /></div>' +
      '</div>' +
    '</div>';
  }
  function collectContent() {
    var out = [];
    document.querySelectorAll("#ac-list .cedit").forEach(function (ce) {
      var questions = [];
      ce.querySelectorAll(".qedit").forEach(function (qe, j) {
        questions.push({
          level: j === 0 ? 1 : 2,
          prompt: val(qe, ".f-prompt").trim(),
          modelAnswer: val(qe, ".f-model").trim(),
          keywords: splitCsv(val(qe, ".f-keywords")),
          misconceptions: splitCsv(val(qe, ".f-misc"))
        });
      });
      out.push({
        id: val(ce, ".f-id").trim() || Store.uid("c"),
        name: val(ce, ".f-name").trim() || "Untitled",
        tag: val(ce, ".f-tag").trim(),
        group: "cyan",
        prereqs: splitCsv(val(ce, ".f-prereqs")),
        blurb: val(ce, ".f-blurb").trim(),
        questions: questions.length ? questions : [{ level: 1, prompt: "New question", modelAnswer: "", keywords: [], misconceptions: [] }],
        resources: { read: val(ce, ".f-read").trim(), practice: val(ce, ".f-practice").trim(), next: val(ce, ".f-next").trim() }
      });
    });
    return out;
  }
  function wireContent() {
    $("ac-save").onclick = function () {
      var c = collectContent();
      var ids = c.map(function (x) { return x.id; });
      if (new Set(ids).size !== ids.length) { flash("ac-msg", "Duplicate concept ids — make them unique.", false); return; }
      Store.setContent(c); flash("ac-msg", "Saved " + c.length + " concepts.");
    };
    $("ac-add").onclick = function () {
      var c = collectContent();
      c.push({ id: "concept" + (c.length + 1), name: "New Concept", tag: "tag", group: "cyan", prereqs: [], blurb: "",
        questions: [{ level: 1, prompt: "Explain this concept.", modelAnswer: "", keywords: [], misconceptions: [] }],
        resources: { read: "", practice: "", next: "" } });
      Store.setContent(c); renderContent();
    };
    $("ac-reset").onclick = function () {
      if (!confirm("Reset all content & answer keys to the original defaults? This cannot be undone.")) return;
      Store.resetContent(); renderContent(); flash("ac-msg", "Content reset to defaults.");
    };
    document.querySelectorAll(".del-concept").forEach(function (b) {
      b.onclick = function () {
        var ci = +b.closest(".cedit").getAttribute("data-ci");
        var c = collectContent(); c.splice(ci, 1); Store.setContent(c); renderContent();
      };
    });
    document.querySelectorAll(".add-q").forEach(function (b) {
      b.onclick = function () {
        var ci = +b.closest(".cedit").getAttribute("data-ci");
        var c = collectContent();
        c[ci].questions.push({ level: 2, prompt: "New question", modelAnswer: "", keywords: [], misconceptions: [] });
        Store.setContent(c); renderContent();
      };
    });
    document.querySelectorAll(".del-q").forEach(function (b) {
      b.onclick = function () {
        var ce = b.closest(".cedit"), ci = +ce.getAttribute("data-ci"), qi = +b.closest(".qedit").getAttribute("data-qi");
        var c = collectContent();
        if (c[ci].questions.length <= 1) { alert("A concept needs at least one question."); return; }
        c[ci].questions.splice(qi, 1); Store.setContent(c); renderContent();
      };
    });
  }

  /* ===================== RUBRIC EDITOR ===================== */
  function renderRubric() {
    var r = Store.getRubric();
    var bands = r.bands.map(function (b, i) {
      return '<div class="redit" data-bi="' + i + '"><input class="rb-label" value="' + esc(b.label) + '" />' +
        '<input class="rb-min num" type="number" min="0" max="100" value="' + Math.round(b.min * 100) + '" /><span class="pct">%</span>' +
        '<input class="rb-desc wide" value="' + esc(b.desc) + '" /></div>';
    }).join("");
    var grades = r.grades.map(function (g, i) {
      return '<div class="redit" data-gi="' + i + '"><input class="rg-score num" type="number" value="' + g.score + '" />' +
        '<input class="rg-min num" type="number" min="0" max="100" value="' + Math.round(g.min * 100) + '" /><span class="pct">%</span>' +
        '<input class="rg-label" value="' + esc(g.label) + '" />' +
        '<input class="rg-desc wide" value="' + esc(g.desc) + '" /></div>';
    }).join("");
    var crit = r.criteria.map(function (c, i) {
      return '<div class="redit" data-xi="' + i + '"><input class="rx-name" value="' + esc(c.name) + '" />' +
        '<input class="rx-good wide" value="' + esc(c.good) + '" /><input class="rx-bad wide" value="' + esc(c.bad) + '" /></div>';
    }).join("");
    $("admin-rubric").innerHTML =
      '<div class="admin-actions"><button class="btn sm" id="ar-save">Save rubric</button>' +
      '<button class="btn ghost sm" id="ar-reset">Reset rubric</button><span id="ar-msg" class="admin-msg"></span></div>' +
      '<h4>Competency bands <span class="muted">(label · min score · description)</span></h4>' + bands +
      '<h4>Grade scale <span class="muted">(grade · min overall · label · description)</span></h4>' + grades +
      '<h4>Evidence criteria <span class="muted">(criterion · strong · weak)</span></h4>' + crit;
    $("ar-save").onclick = saveRubric;
    $("ar-reset").onclick = function () { if (confirm("Reset rubric to defaults?")) { Store.resetRubric(); renderRubric(); flash("ar-msg", "Rubric reset."); } };
  }
  function saveRubric() {
    var r = Store.getRubric();
    document.querySelectorAll("#admin-rubric .redit[data-bi]").forEach(function (el, i) {
      r.bands[i].label = val(el, ".rb-label").trim();
      r.bands[i].min = clamp01(+val(el, ".rb-min") / 100);
      r.bands[i].desc = val(el, ".rb-desc").trim();
    });
    document.querySelectorAll("#admin-rubric .redit[data-gi]").forEach(function (el, i) {
      r.grades[i].score = +val(el, ".rg-score");
      r.grades[i].min = clamp01(+val(el, ".rg-min") / 100);
      r.grades[i].label = val(el, ".rg-label").trim();
      r.grades[i].desc = val(el, ".rg-desc").trim();
    });
    document.querySelectorAll("#admin-rubric .redit[data-xi]").forEach(function (el, i) {
      r.criteria[i].name = val(el, ".rx-name").trim();
      r.criteria[i].good = val(el, ".rx-good").trim();
      r.criteria[i].bad = val(el, ".rx-bad").trim();
    });
    Store.setRubric(r); flash("ar-msg", "Rubric saved.");
  }
  function clamp01(x) { return Math.max(0, Math.min(1, isNaN(x) ? 0 : x)); }

  /* ===================== USERS ===================== */
  function renderUsers() {
    var users = Store.listUsers(), me = Store.currentUser();
    var admins = users.filter(function (u) { return u.role === "admin"; }).length;
    var rows = users.map(function (u) {
      var isMe = me && u.id === me.id;
      return '<tr data-uid="' + u.id + '"><td><b>' + esc(u.username) + '</b>' + (isMe ? ' <span class="muted">(you)</span>' : '') + '</td>' +
        '<td><select class="u-role"' + (isMe && admins <= 1 ? ' disabled' : '') + '><option value="user"' + (u.role === "user" ? " selected" : "") + '>user</option>' +
        '<option value="admin"' + (u.role === "admin" ? " selected" : "") + '>admin</option></select></td>' +
        '<td class="muted">' + new Date(u.createdAt).toLocaleDateString() + '</td>' +
        '<td><button class="btn ghost sm u-reset">Reset pw</button> ' +
        '<button class="btn ghost sm u-del"' + (isMe ? ' disabled' : '') + '>Delete</button></td></tr>';
    }).join("");
    $("admin-users").innerHTML =
      '<div class="admin-actions"><input id="nu-user" placeholder="new username" class="mini" />' +
      '<input id="nu-pass" placeholder="password" class="mini" />' +
      '<select id="nu-role" class="mini"><option value="user">user</option><option value="admin">admin</option></select>' +
      '<button class="btn sm" id="nu-add">+ Add user</button><span id="u-msg" class="admin-msg"></span></div>' +
      '<table class="admin-table"><thead><tr><th>Username</th><th>Role</th><th>Created</th><th>Actions</th></tr></thead><tbody>' + rows + '</tbody></table>';
    wireUsers();
  }
  function wireUsers() {
    $("nu-add").onclick = function () {
      var res = Store.register($("nu-user").value, $("nu-pass").value, $("nu-role").value);
      if (!res.ok) { flash("u-msg", res.error, false); return; }
      $("nu-user").value = ""; $("nu-pass").value = ""; renderUsers(); flash("u-msg", "User added.");
    };
    document.querySelectorAll("#admin-users tr[data-uid]").forEach(function (tr) {
      var uid = tr.getAttribute("data-uid");
      var sel = tr.querySelector(".u-role");
      if (sel) sel.onchange = function () { Store.setRole(uid, sel.value); renderUsers(); };
      var del = tr.querySelector(".u-del");
      if (del) del.onclick = function () {
        if (!confirm("Delete this user? Their history stays unless you clear it.")) return;
        Store.deleteUser(uid); renderUsers();
      };
      var rst = tr.querySelector(".u-reset");
      if (rst) rst.onclick = function () {
        var p = prompt("New password for this user (min 4 chars):");
        if (p && p.length >= 4) { Store.resetPassword(uid, p); flash("u-msg", "Password reset."); }
        else if (p !== null) flash("u-msg", "Password too short.", false);
      };
    });
  }

  /* ===================== ALL HISTORY ===================== */
  function renderHistory() {
    var hist = Store.listHistory();
    var head = '<div class="admin-actions"><span class="muted">' + hist.length + ' attempt(s) across all students.</span>' +
      '<button class="btn ghost sm" id="ah-clear">Clear all history</button><span id="ah-msg" class="admin-msg"></span></div>';
    if (!hist.length) { $("admin-history").innerHTML = head + '<p class="muted">No attempts recorded yet.</p>'; wireHistoryTop(); return; }
    var rows = hist.map(function (a) {
      return '<div class="ahist" data-aid="' + a.id + '">' +
        '<div class="ahist-row">' +
          '<div class="ahist-user"><b>' + esc(a.username) + '</b><span class="muted">' + new Date(a.at).toLocaleString() + '</span></div>' +
          '<div class="ahist-score">' + Math.round(a.overall * 100) + '% · ' + (a.grade ? a.grade.score : '') + '</div>' +
          '<div class="ahist-counts"><span class="pill mastered">' + (a.counts.mastered || 0) + 'M</span>' +
            '<span class="pill developing">' + (a.counts.developing || 0) + 'D</span>' +
            '<span class="pill gap">' + (a.counts.gap || 0) + 'G</span></div>' +
          '<div class="ahist-act"><button class="btn ghost sm ah-toggle">Details</button>' +
            '<button class="btn ghost sm ah-del">Delete</button></div>' +
        '</div><div class="ahist-detail hidden">' + attemptDetail(a) + '</div></div>';
    }).join("");
    $("admin-history").innerHTML = head + rows;
    wireHistoryTop();
    document.querySelectorAll("#admin-history .ahist").forEach(function (row) {
      var aid = row.getAttribute("data-aid");
      row.querySelector(".ah-toggle").onclick = function () { row.querySelector(".ahist-detail").classList.toggle("hidden"); };
      row.querySelector(".ah-del").onclick = function () { if (confirm("Delete this attempt?")) { Store.deleteAttempt(aid); renderHistory(); } };
    });
  }
  function wireHistoryTop() {
    var c = $("ah-clear");
    if (c) c.onclick = function () { if (confirm("Delete ALL attempt history for ALL students?")) { Store.clearHistory(); renderHistory(); } };
  }
  function attemptDetail(a) {
    if (!a.detail || !a.detail.length) return '<p class="muted">No per-question detail stored.</p>';
    return a.detail.map(function (c) {
      if (!c.questions || !c.questions.length) return "";
      var qs = c.questions.map(function (d) {
        return '<div class="adq"><span class="pill ' + d.band + '">' + Math.round(d.score * 100) + '%</span>' +
          '<div class="adq-body"><div class="adq-q">' + esc(d.prompt) + '</div>' +
          '<div class="adq-a"><b>Answer:</b> ' + (d.skipped ? '<i class="muted">(skipped)</i>' : esc(d.answer)) + '</div>' +
          '<div class="adq-kw"><b>Covered:</b> ' + (d.hits.length ? esc(d.hits.join(", ")) : '—') + ' · <b>Missed:</b> ' + (d.misses.length ? esc(d.misses.join(", ")) : '—') + '</div>' +
          (d.flagged && d.flagged.length ? '<div class="adq-flag">⚠ ' + esc(d.flagged[0]) + '</div>' : '') + '</div></div>';
      }).join("");
      return '<div class="adc"><h5>' + esc(c.name) + (c.result ? ' <span class="muted">' + Math.round(c.result.score * 100) + '%</span>' : '') + '</h5>' + qs + '</div>';
    }).join("");
  }

  /* ===================== DANGER ===================== */
  function renderDanger() {
    $("admin-danger").innerHTML =
      '<div class="danger-card"><h4>Factory reset</h4>' +
      '<p class="muted">Wipes all users, content, rubric, and history, then restores the original defaults (admin/admin123 + demo/demo123). Use this if the demo data gets messy before a presentation.</p>' +
      '<button class="btn ghost sm" id="dz-reset">Factory reset everything</button><span id="dz-msg" class="admin-msg"></span></div>';
    $("dz-reset").onclick = function () {
      if (!confirm("FACTORY RESET: delete all accounts, content, rubric and history?")) return;
      Store.factoryReset();
      flash("dz-msg", "Reset complete. Logging out…");
      setTimeout(function () { Store.logout(); location.reload(); }, 900);
    };
  }

  /* ===================== tabs / lifecycle ===================== */
  function showTab(name) {
    ["content", "rubric", "users", "history", "danger"].forEach(function (t) {
      $("admin-" + t).classList.toggle("hidden", t !== name);
    });
    document.querySelectorAll(".admin-tabs .tab").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-tab") === name);
    });
    if (name === "content") renderContent();
    else if (name === "rubric") renderRubric();
    else if (name === "users") renderUsers();
    else if (name === "history") renderHistory();
    else if (name === "danger") renderDanger();
  }

  var wired = false;
  function init() {
    if (wired) return; wired = true;
    document.querySelectorAll(".admin-tabs .tab").forEach(function (b) {
      b.addEventListener("click", function () { showTab(b.getAttribute("data-tab")); });
    });
  }
  function render() { showTab("content"); }

  return { init: init, render: render };
})();

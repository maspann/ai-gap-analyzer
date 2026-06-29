/* =====================================================================
 * store.js — Persistence + auth layer (runs fully client-side)
 * ---------------------------------------------------------------------
 * Everything the multi-role app needs to remember lives here, namespaced
 * under "gap.*" keys. Uses localStorage when available and transparently
 * falls back to an in-memory object (so it also works in a sandbox / in
 * Node for unit tests). No backend, no server — deployable on GitHub Pages.
 *
 * NOTE ON SECURITY: password hashing here is a lightweight NON-CRYPTOGRAPHIC
 * digest. It only stops casual plaintext peeking in localStorage. This is a
 * classroom prototype; a production system would use a real backend + bcrypt.
 * ===================================================================== */
(function (root) {
  "use strict";

  /* ---- storage backend: localStorage, else in-memory shim ---- */
  var mem = {};
  var backend = (function () {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("__gap_test__", "1");
        localStorage.removeItem("__gap_test__");
        return localStorage;
      }
    } catch (e) { /* blocked — fall through */ }
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
      setItem: function (k, v) { mem[k] = String(v); },
      removeItem: function (k) { delete mem[k]; }
    };
  })();

  function read(key, fallback) {
    try { var v = backend.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  }
  function write(key, val) {
    try { backend.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { return false; }
  }

  /* ---- keys ---- */
  var K = {
    users:   "gap.users",
    session: "gap.session",
    content: "gap.content",
    rubric:  "gap.rubric",
    history: "gap.history",
    seeded:  "gap.seeded",
    seq:     "gap.seq"
  };

  /* ---- non-cryptographic password digest (demo only) ---- */
  function hashPw(pw) {
    var h = 2166136261 >>> 0;              // FNV-1a offset basis
    var s = "gapSalt::v1::" + String(pw);
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;     // FNV prime
    }
    return ("0000000" + h.toString(16)).slice(-8);
  }

  function uid(prefix) {
    return (prefix || "id") + "_" + Date.now().toString(36) + "_" +
      Math.random().toString(36).slice(2, 7);
  }

  /* ---- default seed content (deep clone of the reference corpus) ---- */
  function defaultConcepts() {
    var src = (typeof window !== "undefined" && window.GapData && window.GapData.CONCEPTS)
      ? window.GapData.CONCEPTS
      : (typeof require !== "undefined" ? require("./data.js").CONCEPTS : []);
    return JSON.parse(JSON.stringify(src));
  }

  /* ---- default rubric (mirrors the course assessment rubric) ---- */
  function defaultRubric() {
    return {
      // per-concept competency bands (thresholds are on a 0..1 score)
      bands: [
        { key: "mastered",   label: "Mastered",   min: 0.70, color: "green", desc: "Concept clearly understood and explained in own words." },
        { key: "developing", label: "Developing", min: 0.40, color: "amber", desc: "Partial understanding; key ideas present but incomplete." },
        { key: "gap",        label: "Gap",        min: 0.00, color: "pink",  desc: "Concept missing or misunderstood — needs study." }
      ],
      // overall grade bands (from the UAS rubric: 100 / 90 / 80 / 70)
      grades: [
        { min: 0.90, score: 100, label: "Excellent",         desc: "Complete NLP pipeline, strong reasoning, real end-to-end demo, clear user value." },
        { min: 0.75, score: 90,  label: "Strong",            desc: "Mostly complete pipeline and solid reasoning with minor gaps." },
        { min: 0.55, score: 80,  label: "Functional",        desc: "Working prototype but reasoning or coverage is limited in places." },
        { min: 0.00, score: 70,  label: "Needs Improvement", desc: "Incomplete pipeline / limited reasoning; closer to a mockup." }
      ],
      // evidence criteria the grade is argued from
      criteria: [
        { name: "NLP Pipeline",    good: "complete (clean→tokenize→stopword→stem→TF-IDF→cosine)", bad: "incomplete / steps missing" },
        { name: "Model / Reasoning", good: "strong (coverage + similarity + misconception checks)", bad: "limited / shallow" },
        { name: "Prototype Demo",  good: "real end-to-end, runs live",                            bad: "mockup / simulated" },
        { name: "User Value",      good: "clear (gaps + personalized pathway)",                   bad: "undefined" }
      ]
    };
  }

  /* ---- one-time seeding of default admin/user + content + rubric ---- */
  function seed(force) {
    if (!force && read(K.seeded, false)) return;
    if (force || !read(K.users, null)) {
      write(K.users, [
        { id: uid("u"), username: "admin", role: "admin", pass: hashPw("admin123"), createdAt: Date.now() },
        { id: uid("u"), username: "demo",  role: "user",  pass: hashPw("demo123"),  createdAt: Date.now() }
      ]);
    }
    if (force || !read(K.content, null)) write(K.content, defaultConcepts());
    if (force || !read(K.rubric, null))  write(K.rubric, defaultRubric());
    if (!read(K.history, null)) write(K.history, []);
    write(K.seeded, true);
  }

  /* ---- users / auth ---- */
  function listUsers() { return read(K.users, []); }
  function findUser(username) {
    return listUsers().filter(function (u) {
      return u.username.toLowerCase() === String(username).toLowerCase();
    })[0] || null;
  }
  function register(username, password, role) {
    username = String(username || "").trim();
    if (username.length < 3) return { ok: false, error: "Username must be at least 3 characters." };
    if (String(password || "").length < 4) return { ok: false, error: "Password must be at least 4 characters." };
    if (findUser(username)) return { ok: false, error: "That username is already taken." };
    var users = listUsers();
    var u = { id: uid("u"), username: username, role: role === "admin" ? "admin" : "user", pass: hashPw(password), createdAt: Date.now() };
    users.push(u);
    write(K.users, users);
    return { ok: true, user: publicUser(u) };
  }
  function login(username, password) {
    var u = findUser(username);
    if (!u || u.pass !== hashPw(password)) return { ok: false, error: "Wrong username or password." };
    var sess = { id: u.id, username: u.username, role: u.role, at: Date.now() };
    write(K.session, sess);
    return { ok: true, user: sess };
  }
  function logout() { try { backend.removeItem(K.session); } catch (e) {} }
  function currentUser() { return read(K.session, null); }
  function publicUser(u) { return { id: u.id, username: u.username, role: u.role, createdAt: u.createdAt }; }

  function deleteUser(id) {
    var users = listUsers().filter(function (u) { return u.id !== id; });
    write(K.users, users);
  }
  function setRole(id, role) {
    var users = listUsers().map(function (u) {
      if (u.id === id) u.role = role === "admin" ? "admin" : "user";
      return u;
    });
    write(K.users, users);
  }
  function resetPassword(id, newPass) {
    var users = listUsers().map(function (u) {
      if (u.id === id) u.pass = hashPw(newPass);
      return u;
    });
    write(K.users, users);
  }

  /* ---- content (admin-editable concepts) ---- */
  function getContent() {
    var c = read(K.content, null);
    if (!c) { c = defaultConcepts(); write(K.content, c); }
    return c;
  }
  function setContent(concepts) { write(K.content, concepts); }
  function resetContent() { write(K.content, defaultConcepts()); return getContent(); }

  /* ---- rubric (admin-editable) ---- */
  function getRubric() {
    var r = read(K.rubric, null);
    if (!r) { r = defaultRubric(); write(K.rubric, r); }
    return r;
  }
  function setRubric(rubric) { write(K.rubric, rubric); }
  function resetRubric() { write(K.rubric, defaultRubric()); return getRubric(); }

  /* band a 0..1 score using the (editable) rubric thresholds */
  function bandFor(score, rubric) {
    var bands = (rubric || getRubric()).bands.slice().sort(function (a, b) { return b.min - a.min; });
    for (var i = 0; i < bands.length; i++) if (score >= bands[i].min) return bands[i];
    return bands[bands.length - 1];
  }
  /* map a 0..1 overall to a grade band */
  function gradeFor(overall, rubric) {
    var grades = (rubric || getRubric()).grades.slice().sort(function (a, b) { return b.min - a.min; });
    for (var i = 0; i < grades.length; i++) if (overall >= grades[i].min) return grades[i];
    return grades[grades.length - 1];
  }

  /* ---- history (per-attempt records; admin sees all, user sees own) ---- */
  function listHistory(filterUsername) {
    var h = read(K.history, []);
    if (filterUsername) h = h.filter(function (a) { return a.username === filterUsername; });
    return h.sort(function (a, b) {
      if (b.at !== a.at) return b.at - a.at;           // newest first
      return (b.seq || 0) - (a.seq || 0);              // stable tiebreak for same-ms inserts
    });
  }
  function addAttempt(attempt) {
    var h = read(K.history, []);
    var seq = read(K.seq, 0) + 1; write(K.seq, seq);
    attempt.id = uid("a");
    attempt.seq = seq;
    attempt.at = attempt.at || Date.now();
    h.push(attempt);
    write(K.history, h);
    return attempt;
  }
  function deleteAttempt(id) {
    write(K.history, read(K.history, []).filter(function (a) { return a.id !== id; }));
  }
  function clearHistory(filterUsername) {
    if (!filterUsername) { write(K.history, []); return; }
    write(K.history, read(K.history, []).filter(function (a) { return a.username !== filterUsername; }));
  }

  /* ---- danger zone ---- */
  function factoryReset() {
    [K.users, K.session, K.content, K.rubric, K.history, K.seeded, K.seq].forEach(function (k) {
      try { backend.removeItem(k); } catch (e) {}
    });
    mem = {};
    seed(true);
  }

  var api = {
    _backend: backend,
    hashPw: hashPw,
    seed: seed,
    // auth
    listUsers: listUsers, findUser: findUser, register: register, login: login,
    logout: logout, currentUser: currentUser, deleteUser: deleteUser,
    setRole: setRole, resetPassword: resetPassword, publicUser: publicUser,
    // content
    getContent: getContent, setContent: setContent, resetContent: resetContent,
    defaultConcepts: defaultConcepts,
    // rubric
    getRubric: getRubric, setRubric: setRubric, resetRubric: resetRubric,
    defaultRubric: defaultRubric, bandFor: bandFor, gradeFor: gradeFor,
    // history
    listHistory: listHistory, addAttempt: addAttempt, deleteAttempt: deleteAttempt,
    clearHistory: clearHistory,
    // util
    uid: uid, factoryReset: factoryReset, KEYS: K
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.GapStore = api;
})(typeof window !== "undefined" ? window : this);

/* =====================================================================
 * app.js — Boot + router + auth UI
 * Decides what the logged-in user sees (student workspace vs admin
 * dashboard), builds role-aware navigation, and owns view switching.
 * Loaded last; depends on data.js, nlp.js, store.js, diagnostic.js, admin.js.
 * ===================================================================== */
(function () {
  "use strict";

  var Store = window.GapStore;
  var $ = function (id) { return document.getElementById(id); };
  var VIEWS = ["auth", "welcome", "diagnostic", "results", "history", "rubric", "admin"];

  function show(view) {
    VIEWS.forEach(function (v) { var el = $("view-" + v); if (el) el.classList.toggle("hidden", v !== view); });
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) {}
    document.querySelectorAll("#mainnav .navbtn").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-view") === view);
    });
  }

  function buildNav(role) {
    var items = role === "admin"
      ? [
          { label: "Dashboard", view: "admin", fn: function () { window.GapAdmin.render(); show("admin"); } },
          { label: "Preview diagnostic", view: "diagnostic", fn: function () { window.GapDiag.start(); } }
        ]
      : [
          { label: "Home", view: "welcome", fn: function () { window.GapDiag.refreshWelcome(); show("welcome"); } },
          { label: "Take diagnostic", view: "diagnostic", fn: function () { window.GapDiag.start(); } },
          { label: "My history", view: "history", fn: function () { window.GapDiag.renderUserHistory(); show("history"); } },
          { label: "Grading rubric", view: "rubric", fn: function () { window.GapDiag.renderRubricView(); show("rubric"); } }
        ];
    var nav = $("mainnav");
    nav.innerHTML = items.map(function (it) { return '<button class="navbtn" data-view="' + it.view + '">' + it.label + '</button>'; }).join("");
    nav.classList.remove("hidden");
    Array.prototype.forEach.call(nav.children, function (btn, i) { btn.onclick = items[i].fn; });
  }

  function route() {
    var u = Store.currentUser();
    if (!u) {
      $("userbox").classList.add("hidden");
      $("mainnav").classList.add("hidden");
      show("auth");
      return;
    }
    $("ub-name").textContent = u.username;
    $("ub-role").textContent = u.role;
    $("ub-role").className = "rolebadge " + u.role;
    $("userbox").classList.remove("hidden");
    buildNav(u.role);
    if (u.role === "admin") { window.GapAdmin.render(); show("admin"); }
    else { window.GapDiag.refreshWelcome(); show("welcome"); }
  }

  /* ---- auth handlers ---- */
  function doLogin() {
    var res = Store.login($("li-user").value.trim(), $("li-pass").value);
    if (!res.ok) { $("li-err").textContent = res.error; return; }
    $("li-err").textContent = ""; $("li-pass").value = "";
    route();
  }
  function doRegister() {
    var u = $("rg-user").value.trim(), p = $("rg-pass").value;
    var res = Store.register(u, p, "user");
    if (!res.ok) { $("rg-err").textContent = res.error; return; }
    $("rg-err").textContent = "";
    Store.login(u, p);   // auto-login the new student
    route();
  }
  function setPane(which) {
    var login = which === "login";
    $("seg-login").classList.toggle("active", login);
    $("seg-register").classList.toggle("active", !login);
    $("pane-login").classList.toggle("hidden", !login);
    $("pane-register").classList.toggle("hidden", login);
  }

  var booted = false;
  function init() {
    if (booted) return;          // DOMContentLoaded can fire more than once under some runtimes
    booted = true;
    Store.seed();
    window.GapDiag.init();
    window.GapAdmin.init();

    $("seg-login").onclick = function () { setPane("login"); };
    $("seg-register").onclick = function () { setPane("register"); };
    $("btn-login").onclick = doLogin;
    $("btn-register").onclick = doRegister;
    $("btn-logout").onclick = function () { Store.logout(); route(); };
    $("li-pass").addEventListener("keydown", function (e) { if (e.key === "Enter") doLogin(); });
    $("rg-pass").addEventListener("keydown", function (e) { if (e.key === "Enter") doRegister(); });

    route();
  }

  window.GapApp = { show: show, route: route };
  document.addEventListener("DOMContentLoaded", init);
})();

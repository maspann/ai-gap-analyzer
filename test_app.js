/* Full UI integration test using jsdom. Drives the real multi-role flow:
 * seed -> login as student -> take diagnostic -> reach results.
 * Also verifies the admin path loads (login as admin -> dashboard renders).
 * Run: node test_app.js
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function bootDom() {
  let html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  html = html.replace(/<link[^>]*>/g, "").replace(/<script[^>]*><\/script>/g, "");
  const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "https://localhost/" });
  const { window } = dom;
  window.scrollTo = function () {};
  global.window = window;
  ["js/data.js", "js/nlp.js", "js/store.js", "js/diagnostic.js", "js/admin.js", "js/app.js"].forEach(f => {
    window.eval(fs.readFileSync(path.join(__dirname, f), "utf8"));
  });
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
  // isolate each run: clean slate of users/content/rubric/history
  window.GapStore.factoryReset();
  window.GapApp.route();
  return window;
}

function login(window, user, pass) {
  const $ = id => window.document.getElementById(id);
  $("li-user").value = user; $("li-pass").value = pass;
  $("btn-login").click();
}

async function runScenario(name, answerFor) {
  const window = bootDom();
  const $ = id => window.document.getElementById(id);
  const visible = id => !$("view-" + id).classList.contains("hidden");

  login(window, "demo", "demo123");
  if (!visible("welcome")) throw new Error(`[${name}] login did not reach welcome`);

  $("btn-start").click();

  const tagNodes = () => window.document.querySelectorAll("#chat .msg.ai .concept-tag");
  async function waitForQuestion(prevCount) {
    let waited = 0;
    while (waited < 4000) {
      if (!visible("diagnostic")) return false;
      if (tagNodes().length > prevCount) return true;
      await delay(20); waited += 20;
    }
    return tagNodes().length > prevCount;
  }

  let steps = 0, seen = 0;
  while (visible("diagnostic") && steps < 80) {
    const has = await waitForQuestion(seen);
    if (!has || !visible("diagnostic")) break;
    steps++;
    const all = tagNodes();
    seen = all.length;
    const txt = all[all.length - 1].textContent;
    const stretch = txt.includes("stretch");
    const conceptName = txt.split("·")[0].trim();
    const concept = window.GapData.CONCEPTS.find(c => c.name === conceptName);
    $("answer").value = answerFor(concept, stretch);
    $("btn-submit").click();
  }

  if (!visible("results")) throw new Error(`[${name}] never reached results (steps=${steps})`);

  // export must not throw
  window.URL.createObjectURL = () => "blob:stub";
  window.URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = function () {};
  $("btn-export").click();

  return {
    window,
    overall: $("s-overall").textContent,
    mastered: +$("s-mastered").textContent,
    developing: +$("s-developing").textContent,
    gaps: +$("s-gap").textContent,
    pathwaySteps: window.document.querySelectorAll("#pathway .step").length,
    pathwayEmpty: !!window.document.querySelector("#pathway .pathway-empty"),
    reviewCards: window.document.querySelectorAll("#review .qrev").length,
    rubricMatch: !!window.document.querySelector("#rubric-match .grade-badge"),
    logLines: ($("logbox").textContent.match(/\n/g) || []).length + 1,
    nodesColored: window.document.querySelectorAll("#cmap-final .node.mastered, #cmap-final .node.developing, #cmap-final .node.gap").length
  };
}

(async () => {
  let failures = 0;
  const assert = (cond, msg) => { if (cond) console.log("  PASS  " + msg); else { failures++; console.log("  FAIL  " + msg); } };

  console.log("\n== Scenario A: strong student (model answers) ==");
  const A = await runScenario("strong", (c, stretch) => {
    const q = c.questions[stretch ? 1 : 0] || c.questions[0];
    return q.modelAnswer;
  });
  console.log("    overall=%s mastered=%d dev=%d gaps=%d review=%d rubricMatch=%s",
    A.overall, A.mastered, A.developing, A.gaps, A.reviewCards, A.rubricMatch);
  assert(A.gaps === 0, "strong student has 0 gaps");
  assert(A.mastered >= 6, "strong student masters >=6 concepts (" + A.mastered + ")");
  assert(A.nodesColored === 8, "all 8 nodes scored on final map");
  assert(A.reviewCards >= 8, "mistake-review rendered a card per question (" + A.reviewCards + ")");
  assert(A.rubricMatch, "rubric-match grade badge rendered");
  assert(A.logLines >= 8, "evidence log populated");

  console.log("\n== Scenario B: mixed student ==");
  const B = await runScenario("mixed", (c, stretch) => {
    const advanced = ["embeddings", "contextual", "pos", "lemmatization"];
    if (advanced.includes(c.id)) return "uh i dont really know maybe something idk";
    const q = c.questions[stretch ? 1 : 0] || c.questions[0];
    return q.modelAnswer;
  });
  console.log("    overall=%s mastered=%d dev=%d gaps=%d pathway=%d",
    B.overall, B.mastered, B.developing, B.gaps, B.pathwaySteps);
  assert(B.gaps >= 1, "mixed student has at least 1 gap (" + B.gaps + ")");
  assert(B.pathwaySteps >= 1, "pathway has recommended steps (" + B.pathwaySteps + ")");
  assert(!B.pathwayEmpty, "pathway is not the empty state");
  assert(B.mastered >= 1, "mixed student still masters foundational concepts (" + B.mastered + ")");

  console.log("\n== Scenario C: weak student (gibberish) ==");
  const C = await runScenario("weak", () => "idk um maybe stuff things whatever");
  console.log("    overall=%s mastered=%d dev=%d gaps=%d pathway=%d",
    C.overall, C.mastered, C.developing, C.gaps, C.pathwaySteps);
  assert(C.gaps >= 5, "weak student has many gaps (" + C.gaps + ")");
  assert(C.pathwaySteps >= 1, "pathway populated for weak student");

  console.log("\n== Scenario D: admin path ==");
  const w = bootDom();
  const $ = id => w.document.getElementById(id);
  login(w, "admin", "admin123");
  const adminVisible = !$("view-admin").classList.contains("hidden");
  assert(adminVisible, "admin lands on dashboard view");
  assert($("ub-role").textContent === "admin", "topbar shows admin role");
  assert(w.document.querySelectorAll("#admin-content .cedit").length === 8, "content editor lists 8 concepts");
  // edit a model answer through the store and confirm persistence
  let content = w.GapStore.getContent();
  content[0].questions[0].modelAnswer = "ADMIN EDITED KEY";
  w.GapStore.setContent(content);
  assert(w.GapStore.getContent()[0].questions[0].modelAnswer === "ADMIN EDITED KEY", "admin content edit persists in store");
  // rubric banding reflects store
  assert(w.GapStore.bandFor(0.75).key === "mastered", "rubric banding works (0.75 -> mastered)");

  console.log(`\n==== APP RESULT: ${failures === 0 ? "ALL PASS" : failures + " FAILED"} ====\n`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error("CRASH:", e); process.exit(1); });

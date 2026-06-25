/* Full UI integration test using jsdom. Drives the real app.js flow.
 * Run: node test_app.js
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runScenario(name, answerFor) {
  // Load HTML, strip external <link>/<script> so jsdom doesn't hit network.
  let html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  html = html.replace(/<link[^>]*>/g, "").replace(/<script[^>]*><\/script>/g, "");

  const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  window.scrollTo = function () {};
  global.window = window;
  // load scripts in order into the window context
  ["js/data.js", "js/nlp.js", "js/app.js"].forEach(f => {
    window.eval(fs.readFileSync(path.join(__dirname, f), "utf8"));
  });
  // app.js registers init on DOMContentLoaded; fire it.
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

  const $ = id => window.document.getElementById(id);
  const visible = id => !$("view-" + id).classList.contains("hidden");

  // start
  $("btn-start").click();

  const tagNodes = () => window.document.querySelectorAll("#chat .msg.ai .concept-tag");

  // wait until a question is actually rendered (or results), polling on real timers
  async function waitForQuestion(prevCount) {
    let waited = 0;
    while (waited < 4000) {
      if (!visible("diagnostic")) return false;        // moved on to results
      if (tagNodes().length > prevCount) return true;  // a new question appeared
      await delay(20); waited += 20;
    }
    return tagNodes().length > prevCount;
  }

  let steps = 0;
  let seen = 0;
  while (visible("diagnostic") && steps < 80) {
    const has = await waitForQuestion(seen);
    if (!has || !visible("diagnostic")) break;
    steps++;

    const all = tagNodes();
    seen = all.length;
    const lastTag = all[all.length - 1];
    const txt = lastTag.textContent;
    const stretch = / stretch$/.test(txt.trim());
    const conceptName = txt.replace(/ · stretch$/, "").trim();
    const concept = window.GapData.CONCEPTS.find(c => c.name === conceptName);

    const ans = answerFor(concept, stretch);
    $("answer").value = ans;
    $("btn-submit").click();
  }

  if (!visible("results")) throw new Error(`[${name}] never reached results (steps=${steps})`);

  const out = {
    overall: $("s-overall").textContent,
    mastered: +$("s-mastered").textContent,
    developing: +$("s-developing").textContent,
    gaps: +$("s-gap").textContent,
    pathwaySteps: window.document.querySelectorAll("#pathway .step").length,
    pathwayEmpty: !!window.document.querySelector("#pathway .pathway-empty"),
    logLines: ($("logbox").textContent.match(/\n/g) || []).length + 1,
    nodesColored: window.document.querySelectorAll("#cmap-final .node.mastered, #cmap-final .node.developing, #cmap-final .node.gap").length,
    errorFree: true
  };

  // test export handler doesn't throw (stub URL + anchor click)
  window.URL.createObjectURL = () => "blob:stub";
  window.URL.revokeObjectURL = () => {};
  HTMLAnchorElementClickStub(window);
  $("btn-export").click();

  return out;
}

// prevent jsdom "not implemented: navigation" noise on the download anchor
function HTMLAnchorElementClickStub(window) {
  const proto = window.HTMLAnchorElement.prototype;
  proto.click = function () { /* no-op for download anchor */ };
}

(async () => {
  let failures = 0;
  const assert = (cond, msg) => { if (cond) console.log("  PASS  " + msg); else { failures++; console.log("  FAIL  " + msg); } };

  console.log("\n== Scenario A: strong student (answers with model answers) ==");
  const A = await runScenario("strong", (c, stretch) => {
    const q = c.questions[stretch ? 1 : 0] || c.questions[0];
    return q.modelAnswer;
  });
  console.log("   ", A);
  assert(A.gaps === 0, "strong student has 0 gaps");
  assert(A.mastered >= 6, "strong student masters >=6 concepts (" + A.mastered + ")");
  assert(A.nodesColored === 8, "all 8 nodes scored on final map");
  assert(A.logLines >= 8, "evidence log populated");

  console.log("\n== Scenario B: mixed student (good first half, gibberish second) ==");
  let i = 0;
  const order = window.GapData ? window.GapData.CONCEPTS.map(c => c.id) : [];
  const B = await runScenario("mixed", (c, stretch) => {
    // good answers for foundational concepts, nonsense for advanced ones
    const advanced = ["embeddings", "contextual", "pos", "lemmatization"];
    if (advanced.includes(c.id)) return "uh i dont really know maybe something idk";
    const q = c.questions[stretch ? 1 : 0] || c.questions[0];
    return q.modelAnswer;
  });
  console.log("   ", B);
  assert(B.gaps >= 1, "mixed student has at least 1 gap (" + B.gaps + ")");
  assert(B.pathwaySteps >= 1, "pathway has recommended steps (" + B.pathwaySteps + ")");
  assert(!B.pathwayEmpty, "pathway is not the empty state");
  assert(B.mastered >= 1, "mixed student still masters foundational concepts (" + B.mastered + ")");

  console.log("\n== Scenario C: weak student (gibberish everywhere) ==");
  const C = await runScenario("weak", () => "idk um maybe stuff things whatever");
  console.log("   ", C);
  assert(C.gaps >= 5, "weak student has many gaps (" + C.gaps + ")");
  assert(C.pathwaySteps >= 1, "pathway populated for weak student");

  console.log(`\n==== APP RESULT: ${failures === 0 ? "ALL PASS" : failures + " FAILED"} ====\n`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error("CRASH:", e); process.exit(1); });

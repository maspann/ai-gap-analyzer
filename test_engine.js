/* Unit tests for the REAL NLP engine the browser loads (js/nlp.js + js/data.js).
 * Run: node test_engine.js
 */
const NLP = require("./js/nlp.js");
const { CONCEPTS } = require("./js/data.js");

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log("  PASS  " + msg); } else { fail++; console.log("  FAIL  " + msg); } }
function approx(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-9); }

console.log("== 1. Tokenizer + stopword removal ==");
const pp = NLP.preprocess("The pump is OVER 75C!!! Check bearings, vibration high.");
ok(pp.raw.includes("pump") && pp.raw.includes("75c"), "tokenizes words + numbers, strips punctuation");
ok(!pp.filtered.includes("the") && !pp.filtered.includes("is"), "removes stopwords (the, is)");
ok(pp.filtered.includes("pump"), "keeps engineering term (pump)");

console.log("\n== 2. Stemmer collapses morphological variants to the same stem ==");
// What matters for matching is that a word and its inflections reduce to ONE
// shared stem, so student wording matches the reference keyword regardless of form.
const families = [
  ["token", "tokens"],
  ["vibration", "vibrations"],
  ["embedding", "embeddings"],
  ["connect", "connecting", "connected"],
  ["run", "running"]
];
families.forEach(group => {
  const stems = group.map(NLP.stem);
  const allSame = stems.every(s => s === stems[0]);
  ok(allSame, `[${group.join(", ")}] all stem to "${stems[0]}"`);
});
ok(NLP.stem(NLP.stem("tokenization")) === NLP.stem("tokenization"), "stemmer is idempotent");

console.log("\n== 3. Cosine similarity bounds ==");
const idf = NLP.inverseDocFreq([["token","split","text"], ["token","split","text"]]);
const v = NLP.tfidfVector(["token","split","text"], idf);
ok(approx(NLP.cosineSimilarity(v, v), 1, 1e-9), "identical vectors -> cosine 1");
ok(NLP.cosineSimilarity({a:1}, {b:1}) === 0, "disjoint vectors -> cosine 0");

console.log("\n== 4. band() thresholds ==");
ok(NLP.band(0.9) === "mastered", "0.90 -> mastered");
ok(NLP.band(0.55) === "developing", "0.55 -> developing");
ok(NLP.band(0.2) === "gap", "0.20 -> gap");

console.log("\n== 5. Scoring monotonicity (strong > weak > empty) ==");
const tok = CONCEPTS.find(c => c.id === "tokenization").questions[0];
const strong = NLP.scoreAnswer(tok.modelAnswer, tok).score;
const weak = NLP.scoreAnswer("idk maybe cutting stuff", tok).score;
const empty = NLP.scoreAnswer("", tok).score;
ok(strong >= 0.7, "model answer scores mastered (" + strong.toFixed(2) + ")");
ok(weak < 0.4, "weak answer scores gap (" + weak.toFixed(2) + ")");
ok(empty === 0, "empty answer scores 0");
ok(strong > weak && weak >= empty, "ordering strong > weak >= empty");

console.log("\n== 6. Misconception detection ==");
const stem2 = CONCEPTS.find(c => c.id === "tokenization").questions[0];
const mis = NLP.scoreAnswer("tokenization is the same as stemming", stem2);
ok(mis.flagged.length >= 1, "flags a misconception phrase when present");

console.log("\n== 7. Every concept's model answer self-scores as mastered ==");
let allMastered = true, worst = 1, worstId = "";
CONCEPTS.forEach(c => c.questions.forEach(q => {
  const s = NLP.scoreAnswer(q.modelAnswer, q).score;
  if (s < worst) { worst = s; worstId = c.id; }
  if (NLP.band(s) !== "mastered") allMastered = false;
}));
ok(allMastered, "all model answers across all questions are mastered (worst=" + worst.toFixed(2) + " @ " + worstId + ")");

console.log("\n== 8. Corpus shape ==");
ok(CONCEPTS.length === 8, "8 concepts present");
ok(CONCEPTS.every(c => c.id && c.name && c.questions.length >= 1 && c.resources), "every concept has id/name/questions/resources");
ok(CONCEPTS.every(c => Array.isArray(c.prereqs)), "every concept declares a prereqs array (drives pathway)");

console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====\n`);
process.exit(fail === 0 ? 0 : 1);

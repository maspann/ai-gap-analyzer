/* Unit tests for the persistence + auth layer (js/store.js).
 * Runs in Node using the in-memory storage fallback. Run: node test_store.js
 */
const S = require("./js/store.js");

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log("  PASS  " + m); } else { fail++; console.log("  FAIL  " + m); } }

S.factoryReset(); // start clean

console.log("== 1. Seeding ==");
ok(S.listUsers().length === 2, "seeds 2 default accounts");
ok(!!S.findUser("admin") && S.findUser("admin").role === "admin", "admin account exists with admin role");
ok(!!S.findUser("demo") && S.findUser("demo").role === "user", "demo account exists with user role");
ok(S.getContent().length === 8, "seeds 8 concepts of content");
ok(S.getRubric().bands.length === 3 && S.getRubric().grades.length === 4, "seeds rubric (3 bands, 4 grades)");

console.log("\n== 2. Password hashing ==");
ok(S.hashPw("admin123") === S.hashPw("admin123"), "hash is deterministic");
ok(S.hashPw("admin123") !== S.hashPw("admin124"), "different passwords hash differently");
ok(!/admin123/.test(JSON.stringify(S.listUsers())), "plaintext password not stored");

console.log("\n== 3. Auth flow ==");
ok(S.login("admin", "wrong").ok === false, "login rejects wrong password");
ok(S.login("nobody", "x").ok === false, "login rejects unknown user");
const li = S.login("admin", "admin123");
ok(li.ok && li.user.role === "admin", "login accepts correct admin credentials");
ok(S.currentUser() && S.currentUser().username === "admin", "session persists current user");
S.logout();
ok(S.currentUser() === null, "logout clears session");

console.log("\n== 4. Registration ==");
ok(S.register("ab", "1234").ok === false, "rejects short username");
ok(S.register("validuser", "12").ok === false, "rejects short password");
const reg = S.register("fandy", "secret123");
ok(reg.ok && reg.user.role === "user", "registers a new user (default role=user)");
ok(S.register("fandy", "other").ok === false, "rejects duplicate username");
ok(S.login("fandy", "secret123").ok === true, "can log in with newly registered account");

console.log("\n== 5. Content editing ==");
let content = S.getContent();
content[0].questions[0].modelAnswer = "EDITED MODEL ANSWER";
S.setContent(content);
ok(S.getContent()[0].questions[0].modelAnswer === "EDITED MODEL ANSWER", "admin edit to content persists");
ok(S.resetContent()[0].questions[0].modelAnswer !== "EDITED MODEL ANSWER", "resetContent restores defaults");

console.log("\n== 6. Rubric editing + banding ==");
let r = S.getRubric();
r.bands.find(b => b.key === "mastered").min = 0.80; // make mastery stricter
S.setRubric(r);
ok(S.bandFor(0.75).key === "developing", "0.75 is 'developing' after raising mastery threshold to 0.80");
ok(S.bandFor(0.85).key === "mastered", "0.85 still 'mastered'");
S.resetRubric();
ok(S.bandFor(0.75).key === "mastered", "after reset, 0.75 is 'mastered' again (default 0.70)");
ok(S.gradeFor(0.95).score === 100, "overall 0.95 -> grade 100 Excellent");
ok(S.gradeFor(0.50).score === 70, "overall 0.50 -> grade 70 Needs Improvement");

console.log("\n== 7. History (per-user) ==");
S.clearHistory();
S.addAttempt({ username: "demo", overall: 0.8, counts: { mastered: 6, developing: 1, gap: 1 }, detail: [] });
S.addAttempt({ username: "fandy", overall: 0.4, counts: { mastered: 2, developing: 2, gap: 4 }, detail: [] });
S.addAttempt({ username: "demo", overall: 0.9, counts: { mastered: 8, developing: 0, gap: 0 }, detail: [] });
ok(S.listHistory().length === 3, "admin sees all 3 attempts");
ok(S.listHistory("demo").length === 2, "user 'demo' sees only their 2 attempts");
ok(S.listHistory("demo")[0].overall === 0.9, "history sorted newest first");

console.log(`\n==== STORE RESULT: ${pass} passed, ${fail} failed ====\n`);
process.exit(fail === 0 ? 0 : 1);

/* =====================================================================
 * nlp.js  —  The NLP Pipeline Engine (runs fully in the browser)
 * ---------------------------------------------------------------------
 * Implements every stage of the Basic NLP Pipeline from the course:
 *   1. Data            -> reference corpus (see data.js)
 *   2. Preprocessing   -> clean, tokenize, remove stopwords, stem
 *   3. Representation   -> bag-of-words + TF-IDF vectors
 *   4. Model/Reasoning -> cosine similarity + keyword coverage scoring
 *   5. User Output      -> competency score per concept (used by app.js)
 *
 * No external libraries. Works in the browser (window.GapNLP) and in
 * Node.js (module.exports) so the logic can be unit-tested.
 * ===================================================================== */
(function (root) {
  "use strict";

  /* ------------------------------------------------------------------ *
   * STAGE 2a — Stopwords (low-information words to filter out)
   * Engineering terms are deliberately KEPT (domain-specific cleaning).
   * ------------------------------------------------------------------ */
  var STOPWORDS = new Set([
    "a","an","the","and","or","but","if","then","so","because","as","of",
    "at","by","for","with","about","against","between","into","through",
    "during","before","after","to","from","up","down","in","out","on","off",
    "over","under","again","further","is","are","was","were","be","been",
    "being","have","has","had","having","do","does","did","doing","i","you",
    "he","she","it","we","they","this","that","these","those","my","your",
    "its","our","their","me","him","her","them","what","which","who","whom",
    "when","where","why","how","all","any","both","each","more","most","some",
    "such","no","nor","not","only","own","same","than","too","very","can",
    "will","just","also","there","here","would","could","should","kind",
    "thing","things","like","get","got","one","want","make","makes","made",
    "use","used","using","lot","really","basically","like","etc"
  ]);

  /* ------------------------------------------------------------------ *
   * STAGE 2b — Tokenizer (word-level, keeps numbers + technical tokens)
   * ------------------------------------------------------------------ */
  function tokenize(text) {
    if (!text) return [];
    return String(text)
      .toLowerCase()
      .replace(/[_/]/g, " ")          // split snake_case / paths
      .replace(/[^a-z0-9\s-]/g, " ")  // strip punctuation (preprocessing)
      .split(/\s+/)
      .filter(function (t) { return t.length > 0; });
  }

  /* ------------------------------------------------------------------ *
   * STAGE 2c — Porter-style stemmer (compact, real rule set)
   * Reduces word forms: "tokenizing","tokenized","tokens" -> "token".
   * Good enough to match student wording against the reference keys.
   * ------------------------------------------------------------------ */
  function stem(word) {
    if (word.length <= 3) return word;
    var w = word;

    // Step 1a: plurals
    if (/sses$/.test(w)) w = w.replace(/sses$/, "ss");
    else if (/ies$/.test(w)) w = w.replace(/ies$/, "i");
    else if (/ss$/.test(w)) { /* keep */ }
    else if (/s$/.test(w)) w = w.replace(/s$/, "");

    // Step 1b: -ed / -ing  (only if a vowel remains in the stem)
    var hasVowel = function (s) { return /[aeiouy]/.test(s); };
    if (/eed$/.test(w)) {
      w = w.replace(/eed$/, "ee");
    } else if (/(ed|ing)$/.test(w)) {
      var base = w.replace(/(ed|ing)$/, "");
      if (hasVowel(base)) {
        w = base;
        if (/(at|bl|iz)$/.test(w)) w += "e";                 // vibrat -> vibrate
        else if (/([^aeiouylsz])\1$/.test(w)) w = w.slice(0, -1); // double cons.
        else if (/[^aeiouwxy]y$/.test(w)) { /* keep */ }
      }
    }

    // Step 2/3: common derivational endings
    var repl = [
      [/ational$/, "ate"], [/tional$/, "tion"], [/ization$/, "ize"],
      [/ation$/, "ate"], [/ator$/, "ate"], [/tion$/, "t"], [/sion$/, "s"],
      [/iveness$/, "ive"],
      [/fulness$/, "ful"], [/ousness$/, "ous"], [/aliti$/, "al"],
      [/iviti$/, "ive"], [/biliti$/, "ble"], [/icate$/, "ic"],
      [/ative$/, ""], [/alize$/, "al"], [/ically$/, "ic"],
      [/ful$/, ""], [/ness$/, ""], [/ement$/, ""],
      [/ment$/, ""], [/ity$/, ""], [/ously$/, "ous"], [/ly$/, ""]
    ];
    for (var i = 0; i < repl.length; i++) {
      if (repl[i][0].test(w)) { w = w.replace(repl[i][0], repl[i][1]); break; }
    }

    // Step 5: trailing 'e'
    if (/e$/.test(w) && w.length > 4) w = w.replace(/e$/, "");

    return w;
  }

  /* ------------------------------------------------------------------ *
   * STAGE 2 (combined) — full preprocessing returning structured tokens
   * Returns the intermediate artifacts so the UI can SHOW the pipeline.
   * ------------------------------------------------------------------ */
  function preprocess(text) {
    var raw = tokenize(text);
    var noStop = raw.filter(function (t) { return !STOPWORDS.has(t); });
    var stems = noStop.map(stem);
    return { raw: raw, filtered: noStop, stems: stems };
  }

  /* ------------------------------------------------------------------ *
   * STAGE 3 — Representation
   * Bag-of-words term frequencies + TF-IDF given a document collection.
   * ------------------------------------------------------------------ */
  function termFreq(tokens) {
    var tf = {};
    tokens.forEach(function (t) { tf[t] = (tf[t] || 0) + 1; });
    return tf;
  }

  // documents: array of token arrays. Returns idf map.
  function inverseDocFreq(documents) {
    var df = {}, N = documents.length;
    documents.forEach(function (doc) {
      var seen = {};
      doc.forEach(function (t) {
        if (!seen[t]) { df[t] = (df[t] || 0) + 1; seen[t] = true; }
      });
    });
    var idf = {};
    Object.keys(df).forEach(function (t) {
      idf[t] = Math.log((N + 1) / (df[t] + 1)) + 1; // smoothed idf
    });
    return idf;
  }

  function tfidfVector(tokens, idf) {
    var tf = termFreq(tokens), vec = {}, total = tokens.length || 1;
    Object.keys(tf).forEach(function (t) {
      var weight = (tf[t] / total) * (idf[t] || 1);
      vec[t] = weight;
    });
    return vec;
  }

  /* ------------------------------------------------------------------ *
   * STAGE 4 — Model / Reasoning
   * Cosine similarity between two sparse vectors.
   * ------------------------------------------------------------------ */
  function cosineSimilarity(vecA, vecB) {
    var dot = 0, magA = 0, magB = 0;
    Object.keys(vecA).forEach(function (k) {
      magA += vecA[k] * vecA[k];
      if (vecB[k]) dot += vecA[k] * vecB[k];
    });
    Object.keys(vecB).forEach(function (k) { magB += vecB[k] * vecB[k]; });
    if (magA === 0 || magB === 0) return 0;
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
  }

  /* ------------------------------------------------------------------ *
   * STAGE 4 (scorer) — Score one student answer against a reference.
   * Combines:
   *   - keyword coverage   (did they mention the required concepts?)
   *   - cosine similarity  (how aligned is the overall wording?)
   *   - distractor penalty (only if a misconception phrase appears)
   * Returns a 0..1 competency score + an evidence breakdown for logs.
   * ------------------------------------------------------------------ */
  function scoreAnswer(studentText, reference) {
    var sp = preprocess(studentText);
    var studentStems = sp.stems;

    // Build a tiny 2-doc collection for TF-IDF (reference + student).
    var refStems = preprocess(reference.modelAnswer).stems;
    var idf = inverseDocFreq([refStems, studentStems]);
    var refVec = tfidfVector(refStems, idf);
    var stuVec = tfidfVector(studentStems, idf);
    var cosine = cosineSimilarity(refVec, stuVec);

    // Keyword coverage on stemmed required keywords.
    var requiredStems = (reference.keywords || []).map(stem);
    var studentSet = new Set(studentStems);
    var hit = [], miss = [];
    requiredStems.forEach(function (ks, i) {
      if (studentSet.has(ks)) hit.push(reference.keywords[i]);
      else miss.push(reference.keywords[i]);
    });
    var coverage = requiredStems.length
      ? hit.length / requiredStems.length : 0;

    // Misconception detection (optional) — light penalty.
    var penalty = 0, flagged = [];
    (reference.misconceptions || []).forEach(function (phrase) {
      var pStems = preprocess(phrase).stems;
      var allPresent = pStems.length > 0 && pStems.every(function (s) {
        return studentSet.has(s);
      });
      if (allPresent) { penalty += 0.15; flagged.push(phrase); }
    });

    // Weighted blend. Coverage dominates (concept recall matters most),
    // cosine rewards coherent explanation. Tiny length sanity check.
    var lengthOk = sp.filtered.length >= 3 ? 1 : sp.filtered.length / 3;
    var raw = (0.65 * coverage + 0.35 * cosine) * lengthOk - penalty;
    var score = Math.max(0, Math.min(1, raw));

    return {
      score: score,
      coverage: coverage,
      cosine: cosine,
      hits: hit,
      misses: miss,
      flagged: flagged,
      tokens: sp,            // expose pipeline artifacts for the UI/logs
      refVector: refVec,
      studentVector: stuVec
    };
  }

  /* ------------------------------------------------------------------ *
   * Helper — map a 0..1 score to a competency band.
   * ------------------------------------------------------------------ */
  function band(score) {
    if (score >= 0.70) return "mastered";
    if (score >= 0.40) return "developing";
    return "gap";
  }

  var api = {
    STOPWORDS: STOPWORDS,
    tokenize: tokenize,
    stem: stem,
    preprocess: preprocess,
    termFreq: termFreq,
    inverseDocFreq: inverseDocFreq,
    tfidfVector: tfidfVector,
    cosineSimilarity: cosineSimilarity,
    scoreAnswer: scoreAnswer,
    band: band
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.GapNLP = api;
})(typeof window !== "undefined" ? window : this);

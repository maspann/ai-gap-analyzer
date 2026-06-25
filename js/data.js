/* =====================================================================
 * data.js  —  STAGE 1: Data (the reference corpus)
 * ---------------------------------------------------------------------
 * The knowledge base the Gap Analyzer diagnoses against. Eight concepts
 * mirror the Competency Map in the course (Project 2). Each concept has:
 *   - prereqs            : dependency edges -> drives the learning pathway
 *   - questions          : adaptive bank (easy / core / stretch)
 *       modelAnswer      : reference text used for TF-IDF cosine scoring
 *       keywords         : concepts that MUST appear (coverage scoring)
 *       misconceptions   : phrases that signal a wrong mental model
 *   - resources          : what the pathway recommends to close a gap
 * ===================================================================== */
(function (root) {
  "use strict";

  var CONCEPTS = [
    {
      id: "preprocessing",
      name: "Text Preprocessing",
      tag: "clean",
      group: "cyan",
      prereqs: [],
      blurb: "Turning noisy engineering text into clean, comparable text.",
      questions: [
        {
          level: 1,
          prompt: "In your own words, what is text preprocessing and why do we do it before anything else in an NLP pipeline?",
          modelAnswer: "Text preprocessing cleans raw noisy text and normalizes it so the rest of the pipeline can compare words reliably. It removes noise like punctuation and inconsistent casing and standardizes formats. The goal is to reduce noise while preserving engineering context.",
          keywords: ["clean", "noise", "normalize", "raw", "standardize"],
          misconceptions: ["preprocessing trains the model", "preprocessing predicts"]
        },
        {
          level: 2,
          prompt: "A sensor log says: 'TEMP_Sensor-01 reading OVER 75C!!! status OK??'. List the preprocessing steps you would apply and what each one fixes.",
          modelAnswer: "First lowercasing standardizes the text. Then punctuation handling removes or preserves symbols like the exclamation marks. Stopword removal filters low information words. Normalization unifies formats and variants such as units. Stemming or lemmatization reduces word forms. Finally domain specific cleaning keeps engineering meaning like the sensor id and units.",
          keywords: ["lowercase", "punctuation", "stopword", "normalize", "stem", "domain"],
          misconceptions: []
        }
      ],
      resources: {
        read: "Slide: Text Preprocessing Essentials (lowercasing, punctuation, stopwords, normalization, stemming, domain cleaning).",
        practice: "Take 3 raw sensor logs and produce clean structured tokens with a 6-step pipeline.",
        next: "Once clean text is solid, move on to how text is split into tokens."
      }
    },
    {
      id: "tokenization",
      name: "Tokenization",
      tag: "token",
      group: "cyan",
      prereqs: ["preprocessing"],
      blurb: "Splitting text into the units a model actually reads.",
      questions: [
        {
          level: 1,
          prompt: "What is tokenization? Give an example of splitting a short sentence into tokens.",
          modelAnswer: "Tokenization splits text into smaller units called tokens, usually words, subwords, or characters. For example the pump shows high vibration becomes the, pump, shows, high, vibration. The model reads these tokens instead of raw text.",
          keywords: ["split", "token", "word", "unit", "subword"],
          misconceptions: ["tokenization removes stopwords", "tokenization is the same as stemming"]
        },
        {
          level: 2,
          prompt: "Compare word-level, character-level, and subword tokenization. When would you choose subwords for engineering text?",
          modelAnswer: "Word tokenization splits on words and is simple but struggles with rare or unseen words. Character tokenization splits into letters and handles anything but loses meaning per token. Subword tokenization breaks rare words into reusable pieces like vibr and ation, so it handles technical or out of vocabulary terms like sensor codes while keeping meaning. Choose subwords when text has many rare technical tokens.",
          keywords: ["word", "character", "subword", "rare", "vocabulary"],
          misconceptions: []
        }
      ],
      resources: {
        read: "Slide: Tokenization and Subword Thinking (words / characters / subwords / keywords / sensor codes).",
        practice: "Tokenize one mixed input three ways: words, characters, and subwords. Compare counts.",
        next: "Next, learn which tokens to drop — stop words."
      }
    },
    {
      id: "stopwords",
      name: "Stop Words",
      tag: "filteg",
      group: "green",
      prereqs: ["tokenization"],
      blurb: "Filtering low-information words to keep the signal.",
      questions: [
        {
          level: 1,
          prompt: "What are stop words and why might we remove them? Should we always remove them?",
          modelAnswer: "Stop words are common low information words like the, is, and of that appear everywhere and carry little meaning. Removing them filters noise and focuses on meaningful terms. But we should not always remove them, because in some tasks they change meaning, so it depends on the engineering task.",
          keywords: ["common", "low", "information", "filter", "meaning"],
          misconceptions: ["stop words are misspelled words", "removing stop words always improves accuracy"]
        }
      ],
      resources: {
        read: "Slide: Stopword Removal — filter low-information words while preserving context.",
        practice: "Remove stopwords from 5 maintenance notes; check which words you decided to keep and why.",
        next: "With tokens filtered, reduce word forms via stemming."
      }
    },
    {
      id: "stemming",
      name: "Stemming",
      tag: "stem",
      group: "green",
      prereqs: ["stopwords"],
      blurb: "Chopping words to a crude root so variants match.",
      questions: [
        {
          level: 1,
          prompt: "What does stemming do? Show what happens to the words 'connecting', 'connected', 'connection'.",
          modelAnswer: "Stemming reduces words to a crude root by chopping endings, so connecting, connected, and connection all become connect. It is fast and rule based but the root may not be a real word.",
          keywords: ["root", "reduce", "chop", "ending", "rule"],
          misconceptions: ["stemming always produces a real word", "stemming uses a dictionary"]
        },
        {
          level: 2,
          prompt: "Why can stemming be 'aggressive' or wrong sometimes? Give a downside compared to lemmatization.",
          modelAnswer: "Stemming uses crude rules with no dictionary or grammar, so it can over chop and produce non words like univers from university, or merge unrelated words. Unlike lemmatization it does not know the part of speech or the real base form, so it is faster but less accurate.",
          keywords: ["crude", "rule", "non-word", "over", "accurate"],
          misconceptions: []
        }
      ],
      resources: {
        read: "Slide: Stemming or Lemmatization — reduce word forms.",
        practice: "Run a stemmer on 10 engineering verbs; list 2 cases where it over-chops.",
        next: "Compare with the smarter cousin: lemmatization."
      }
    },
    {
      id: "lemmatization",
      name: "Lemmatization",
      tag: "lemma",
      group: "green",
      prereqs: ["stemming"],
      blurb: "Mapping words to their real dictionary base form.",
      questions: [
        {
          level: 1,
          prompt: "How is lemmatization different from stemming? Use 'running' and 'better' as examples.",
          modelAnswer: "Lemmatization maps a word to its real dictionary base form called a lemma, using vocabulary and part of speech. Running becomes run and better becomes good. Unlike stemming it produces real words and is more accurate, but it is slower and needs language knowledge.",
          keywords: ["lemma", "dictionary", "base", "real", "context"],
          misconceptions: ["lemmatization just removes the last letters", "lemmatization and stemming give identical output"]
        }
      ],
      resources: {
        read: "Slide: Stemming or Lemmatization — lemmatization uses context and a dictionary.",
        practice: "Lemmatize a paragraph and compare against a stemmer side by side.",
        next: "Now tag the grammatical role of each word: parts of speech."
      }
    },
    {
      id: "pos",
      name: "Parts of Speech",
      tag: "syntax",
      group: "amber",
      prereqs: ["tokenization"],
      blurb: "Labeling each token's grammatical role.",
      questions: [
        {
          level: 1,
          prompt: "What is part-of-speech tagging and why is it useful in an engineering NLP system?",
          modelAnswer: "Part of speech tagging labels each token with its grammatical role like noun, verb, or adjective. It helps the system understand syntax and structure, which improves lemmatization, information extraction, and intent recognition. For example knowing increase is a verb and pump is a noun helps map an operator command to an action.",
          keywords: ["noun", "verb", "tag", "grammatical", "syntax"],
          misconceptions: ["pos tagging removes words", "pos tagging is the same as tokenization"]
        }
      ],
      resources: {
        read: "Concept: syntax and parts of speech feeding lemmatization and extraction.",
        practice: "Tag an operator command and use the verb to map it to a system action.",
        next: "Move from grammar to meaning: word embeddings."
      }
    },
    {
      id: "embeddings",
      name: "Word Embeddings",
      tag: "vector",
      group: "violet",
      prereqs: ["tokenization", "stopwords"],
      blurb: "Turning words into dense numerical meaning vectors.",
      questions: [
        {
          level: 1,
          prompt: "What is a word embedding, and why represent words as vectors instead of plain text?",
          modelAnswer: "A word embedding maps each word to a dense numerical vector so that similar words sit close together in a semantic vector space. Text becomes computable when language is encoded as numbers, which lets a model measure similarity and feed machine learning. For example pump and motor end up near each other.",
          keywords: ["vector", "dense", "semantic", "similar", "number"],
          misconceptions: ["embeddings count word occurrences", "embeddings are just bag of words"]
        },
        {
          level: 2,
          prompt: "How do Word2Vec/GloVe embeddings differ from a Bag-of-Words or TF-IDF representation?",
          modelAnswer: "Bag of words and TF-IDF count word occurrences and weight important terms, producing sparse vectors with no notion of meaning. Word2Vec and GloVe learn dense embeddings from context or global co occurrence, so similar words get nearby vectors and relationships are captured. Embeddings carry semantics while TF-IDF only carries frequency.",
          keywords: ["dense", "context", "semantic", "tfidf", "occurrence"],
          misconceptions: []
        }
      ],
      resources: {
        read: "Slides: Representing Words as Numbers + Word Embeddings in Practice (Word2Vec, GloVe).",
        practice: "Embed 10 engineering terms and cluster them; check that motor/pump/rotor group together.",
        next: "Finally, meaning that changes with context: contextual models."
      }
    },
    {
      id: "contextual",
      name: "Contextual Models",
      tag: "context",
      group: "violet",
      prereqs: ["embeddings"],
      blurb: "BERT-style embeddings where meaning depends on context.",
      questions: [
        {
          level: 1,
          prompt: "What problem do contextual models like BERT solve that plain word embeddings cannot? Use the word 'current' as an example.",
          modelAnswer: "Plain embeddings give one fixed vector per word, so current has the same vector everywhere. Contextual models like BERT read the surrounding words from both directions and give the same word a different vector depending on context. Current in current flows through the circuit gets an electrical meaning, while current in current project status is delayed gets a time meaning.",
          keywords: ["context", "bert", "bidirectional", "different", "meaning"],
          misconceptions: ["bert gives one fixed vector per word", "contextual models ignore surrounding words"]
        }
      ],
      resources: {
        read: "Slide: Contextual Embeddings and BERT (bidirectional context, attention).",
        practice: "Feed two sentences with the same word in different senses; compare the vectors.",
        next: "You've covered the full representation stack — review evaluation next."
      }
    }
  ];

  var api = { CONCEPTS: CONCEPTS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.GapData = api;
})(typeof window !== "undefined" ? window : this);

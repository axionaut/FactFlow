(function attachFactFlowLearning(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.FactFlowLearning = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function buildFactFlowLearning() {
  'use strict';

  const SCHEMA_VERSION = 2;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const CHALLENGE_LADDER = [
    1000, 2000, 3000, 5000, 10000,
    20000, 40000, 80000, 160000, 320000,
    640000, 1250000, 2500000, 5000000, 10000000
  ];
  const CATEGORIES = [
    'Indian History',
    'World History',
    'Geography (India)',
    'Geography (World)',
    'Polity & Constitution',
    'Science & Technology',
    'Sports',
    'Awards & Honours',
    'Cinema (Bollywood)',
    'Cinema (Regional/World)',
    'Literature & Authors',
    'Mythology & Religion',
    'Current Affairs',
    'Business & Economy',
    'Art & Culture',
    'Miscellaneous/Trivia'
  ];

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeDisplayText(value) {
    return String(value || '').normalize('NFC').replace(/\s+/g, ' ').trim();
  }

  function hasBrokenEncoding(value) {
    const text = String(value || '');
    return /\uFFFD|\u00C3[\u0080-\u00BF]|\u00C2[\u0080-\u00BF]|â(?:€™|€œ|€|€“|€”|€¦)/u.test(text);
  }

  function formatOptionText(value) {
    const text = normalizeDisplayText(value);
    const match = text.match(/\p{L}/u);
    if (!match) return text;
    const index = match.index || 0;
    const letter = match[0];
    const upper = letter.toLocaleUpperCase('en-US');
    if (letter === upper || /^\p{Lu}/u.test(text.slice(index + letter.length))) return text;
    return `${text.slice(0, index)}${upper}${text.slice(index + letter.length)}`;
  }

  function hashText(value) {
    let hash = 2166136261;
    const text = String(value || '');
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function questionKey(question) {
    return `q-${hashText(normalizeText(question?.canonical_key || question?.question_text))}`;
  }

  function sameOrder(first, second) {
    return Array.isArray(first)
      && Array.isArray(second)
      && first.length === second.length
      && first.every((value, index) => Number(value) === Number(second[index]));
  }

  function shuffledOptionOrder(question, seed, previousOrder = []) {
    const count = Array.isArray(question?.options) ? question.options.length : 0;
    const order = Array.from({ length: count }, (_, index) => index);
    let entropy = Number.parseInt(hashText(`${question?.key || questionKey(question)}:${seed}`), 36) >>> 0;
    for (let index = count - 1; index > 0; index -= 1) {
      entropy = (Math.imul(entropy ^ (entropy >>> 15), 2246822519) + 3266489917) >>> 0;
      const swapIndex = entropy % (index + 1);
      [order[index], order[swapIndex]] = [order[swapIndex], order[index]];
    }
    const identity = Array.from({ length: count }, (_, index) => index);
    const mustChange = sameOrder(order, previousOrder) || (!previousOrder.length && sameOrder(order, identity));
    if (mustChange && count > 1) order.push(order.shift());
    return order;
  }

  function applyOptionOrder(question, order) {
    const valid = Array.isArray(order)
      && order.length === question.options.length
      && new Set(order.map(Number)).size === question.options.length
      && order.every((index) => Number.isInteger(Number(index)) && Number(index) >= 0 && Number(index) < question.options.length);
    const optionOrder = valid ? order.map(Number) : Array.from({ length: question.options.length }, (_, index) => index);
    return {
      ...question,
      options: optionOrder.map((index) => question.options[index]),
      correct_option_index: optionOrder.indexOf(Number(question.correct_option_index)),
      option_order: optionOrder
    };
  }

  function presentQuestion(question, seed, previousOrder = []) {
    return applyOptionOrder(question, shuffledOptionOrder(question, seed, previousOrder));
  }

  function inferCategory(question) {
    const existing = String(question?.category || '');
    if (CATEGORIES.includes(existing) && existing !== 'Miscellaneous/Trivia') return existing;

    const value = normalizeText([
      question?.subcategory,
      question?.question_text,
      ...(Array.isArray(question?.tags) ? question.tags : [])
    ].join(' '));
    const indian = /\bindia\b|\bindian\b|delhi|mumbai|kolkata|chennai|bengaluru|maharashtra|rajasthan|uttar pradesh|lok sabha|rajya sabha/.test(value);

    if (/cricket|football|tennis|olympic|sport|athlete|player|tournament|hockey|chess|formula one|basketball/.test(value)) return 'Sports';
    if (/constitution|parliament|president|prime minister|government|minister|election|politic|supreme court|lok sabha|rajya sabha/.test(value)) return 'Polity & Constitution';
    if (/computer|science|planet|space|chemical|physics|biology|medicine|disease|organ|technology|mathematic|animal|nature/.test(value)) return 'Science & Technology';
    if (/geography|river|mountain|capital|country|continent|ocean|sea|island|city|state|located/.test(value)) return indian ? 'Geography (India)' : 'Geography (World)';
    if (/history|king|queen|emperor|battle|dynasty|independence|ancient|medieval|war|century/.test(value)) return indian ? 'Indian History' : 'World History';
    if (/author|book|novel|poem|literature|writer|playwright/.test(value)) return 'Literature & Authors';
    if (/god|goddess|ramayana|mahabharata|religion|temple|myth|bible|quran|buddh/.test(value)) return 'Mythology & Religion';
    if (/award|honour|prize|medal|nobel|oscar/.test(value)) return 'Awards & Honours';
    if (/company|business|bank|economy|currency|rupee|industry|finance|stock market/.test(value)) return 'Business & Economy';
    if (/dance|festival|painting|music|culture|architecture|artist|sculpture/.test(value)) return 'Art & Culture';
    if (/bollywood|hindi film|indian cinema/.test(value)) return 'Cinema (Bollywood)';
    if (/film|actor|actress|cinema|movie|television|entertainment|director|sitcom/.test(value)) return 'Cinema (Regional/World)';
    return 'Miscellaneous/Trivia';
  }

  function determineTier(question) {
    if (/^Tier [1-4]$/.test(question?.difficulty_tier || '')) return question.difficulty_tier;
    const ladder = Number(question?.ladder_position);
    if (ladder >= 1) {
      if (ladder <= 5) return 'Tier 1';
      if (ladder <= 10) return 'Tier 2';
      if (ladder <= 15) return 'Tier 3';
      return 'Tier 4';
    }
    const prize = Number(question?.prize_level_asked_at || 5000);
    if (prize <= 40000) return 'Tier 1';
    if (prize <= 320000) return 'Tier 2';
    if (prize <= 3200000) return 'Tier 3';
    return 'Tier 4';
  }

  function prepareQuestion(question) {
    return {
      ...question,
      key: questionKey(question),
      question_text: normalizeDisplayText(question?.question_text),
      category: inferCategory(question),
      difficulty_tier: determineTier(question),
      options: Array.isArray(question?.options) ? question.options.map(formatOptionText) : []
    };
  }

  function isPracticeQuestion(question) {
    const answer = Number(question?.correct_option_index);
    const options = question?.options;
    const unverifiedArchive = question?.provenance_status === 'third-party transcript; answer not independently verified';
    const practiceType = question?.question_type === 'practice'
      || question?.source === 'FactFlow demo';
    return practiceType
      && !unverifiedArchive
      && !hasBrokenEncoding(question?.question_text)
      && Number.isInteger(answer)
      && answer >= 0
      && Array.isArray(options)
      && options.length === 4
      && options.every((option) => String(option).trim() && !hasBrokenEncoding(option));
  }

  function dateKey(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function addDays(value, days) {
    const date = value instanceof Date ? new Date(value) : new Date(value);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + days);
    return dateKey(date);
  }

  function createLearningState() {
    return {
      schemaVersion: SCHEMA_VERSION,
      attempts: [],
      schedule: {},
      dailySession: null,
      currentChallenge: null,
      challengeHistory: [],
      settings: { sessionSize: 10 },
      migrations: {}
    };
  }

  function normalizeLearningState(input) {
    const base = createLearningState();
    if (!input || typeof input !== 'object' || Array.isArray(input)) return base;
    return {
      ...base,
      ...input,
      schemaVersion: SCHEMA_VERSION,
      attempts: Array.isArray(input.attempts) ? input.attempts.filter((attempt) => attempt?.questionKey) : [],
      schedule: input.schedule && typeof input.schedule === 'object' && !Array.isArray(input.schedule) ? input.schedule : {},
      challengeHistory: Array.isArray(input.challengeHistory) ? input.challengeHistory : [],
      settings: { ...base.settings, ...(input.settings || {}) },
      migrations: { ...(input.migrations || {}) }
    };
  }

  function attemptsFor(state, key) {
    return state.attempts.filter((attempt) => attempt.questionKey === key);
  }

  function questionStats(state, key) {
    const attempts = attemptsFor(state, key);
    const correct = attempts.filter((attempt) => attempt.correct).length;
    const latest = attempts[attempts.length - 1] || null;
    return {
      attempts: attempts.length,
      correct,
      incorrect: attempts.length - correct,
      accuracy: attempts.length ? correct / attempts.length : null,
      latest
    };
  }

  function recordAttempt(state, question, selectedIndex, options = {}) {
    const key = question.key || questionKey(question);
    const answeredAt = options.answeredAt || new Date().toISOString();
    const correct = Number(selectedIndex) === Number(question.correct_option_index);
    const previous = state.schedule[key] || {
      repetitions: 0,
      intervalDays: 0,
      ease: 2.3,
      lapses: 0,
      dueDate: dateKey(answeredAt),
      needsReview: false
    };
    const repetitions = correct ? previous.repetitions + 1 : 0;
    let intervalDays;
    if (!correct) intervalDays = 1;
    else if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 3;
    else intervalDays = clamp(Math.round(Math.max(previous.intervalDays, 1) * previous.ease), 4, 180);

    const attempt = {
      id: `attempt-${Date.parse(answeredAt) || Date.now()}-${state.attempts.length + 1}`,
      questionKey: key,
      selectedIndex: Number(selectedIndex),
      correct,
      answeredAt,
      responseMs: Number.isFinite(options.responseMs) ? Math.max(0, Math.round(options.responseMs)) : null,
      mode: options.mode || 'daily',
      optionOrder: Array.isArray(options.optionOrder) ? options.optionOrder.map(Number) : null
    };
    state.attempts.push(attempt);
    state.schedule[key] = {
      repetitions,
      intervalDays,
      ease: clamp(previous.ease + (correct ? 0.05 : -0.2), 1.3, 2.8),
      lapses: previous.lapses + (correct ? 0 : 1),
      dueDate: addDays(answeredAt, intervalDays),
      lastAnsweredAt: answeredAt,
      needsReview: !correct
    };
    return attempt;
  }

  function isDue(state, key, now = new Date()) {
    const schedule = state.schedule[key];
    if (!schedule) return false;
    return Boolean(schedule.needsReview || String(schedule.dueDate || '') <= dateKey(now));
  }

  function archivePatternWeights(archiveQuestions) {
    const counts = {};
    for (const question of archiveQuestions) {
      const category = question.category || inferCategory(question);
      counts[category] = (counts[category] || 0) + 1;
    }
    const maximum = Math.max(1, ...Object.values(counts));
    return Object.fromEntries(Object.entries(counts).map(([category, count]) => [category, count / maximum]));
  }

  function questionPriority(state, question, patternWeights = {}, now = new Date()) {
    const stats = questionStats(state, question.key || questionKey(question));
    const schedule = state.schedule[question.key || questionKey(question)];
    let score = 10;
    if (!stats.attempts) score += 24;
    if (isDue(state, question.key || questionKey(question), now)) score += 28;
    if (schedule?.needsReview) score += 22;
    if (stats.accuracy !== null) score += (1 - stats.accuracy) * 18;
    score += (patternWeights[question.category] || 0) * 10;
    score += { 'Tier 1': 1, 'Tier 2': 3, 'Tier 3': 5, 'Tier 4': 7 }[question.difficulty_tier] || 0;
    if (question.category === 'Current Affairs' && question.event_date) {
      const ageDays = Math.max(0, (new Date(now) - new Date(question.event_date)) / DAY_MS);
      score += clamp(12 - ageDays / 15, 0, 12);
    }
    return clamp(Math.round(score), 0, 100);
  }

  function deterministicNoise(key, day) {
    return Number.parseInt(hashText(`${key}:${day}`).slice(-4), 36) % 1000 / 1000;
  }

  function selectSession(state, questions, archiveQuestions, options = {}) {
    const now = options.now || new Date();
    const day = dateKey(now);
    const size = clamp(Number(options.size || state.settings.sessionSize || 10), 1, 30);
    const weights = archivePatternWeights(archiveQuestions);
    const eligible = questions
      .filter(isPracticeQuestion)
      .filter((question) => questionStats(state, question.key || questionKey(question)).attempts === 0)
      .map((question) => ({
        question,
        priority: questionPriority(state, question, weights, now),
        noise: deterministicNoise(question.key, day)
      }))
      .sort((a, b) => b.priority - a.priority || b.noise - a.noise);

    const chosen = [];
    const chosenKeys = new Set();
    const categoryCounts = {};
    const categoryCap = Math.max(2, Math.ceil(size * 0.3));
    function take(pool, target, enforceCap = true) {
      for (const item of pool) {
        if (chosen.length >= target || chosen.length >= size) break;
        const key = item.question.key;
        const category = item.question.category;
        if (chosenKeys.has(key)) continue;
        if (enforceCap && (categoryCounts[category] || 0) >= categoryCap) continue;
        chosen.push(item.question);
        chosenKeys.add(key);
        categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      }
    }

    take(eligible, size);
    if (chosen.length < size) take(eligible, size, false);
    return chosen;
  }

  function createDailySession(state, questions, archiveQuestions, options = {}) {
    const now = options.now || new Date();
    const selected = selectSession(state, questions, archiveQuestions, options);
    return {
      id: `daily-${dateKey(now)}-${Date.now()}`,
      date: dateKey(now),
      mode: 'daily',
      questionKeys: selected.map((question) => question.key),
      cursor: 0,
      responses: {},
      completedAt: null
    };
  }

  function selectChallengeQuestions(questions, options = {}) {
    const day = options.seed || `${dateKey(options.now || new Date())}:${Date.now()}`;
    const practice = questions
      .filter(isPracticeQuestion)
      .filter((question) => !options.state || questionStats(options.state, question.key || questionKey(question)).attempts === 0);
    const chosen = [];
    const chosenKeys = new Set();
    const bands = [
      { positions: 5, tiers: ['Tier 1', 'Tier 2'] },
      { positions: 5, tiers: ['Tier 2', 'Tier 1', 'Tier 4'] },
      { positions: 5, tiers: ['Tier 4', 'Tier 3', 'Tier 2'] }
    ];
    for (const [bandIndex, band] of bands.entries()) {
      const candidates = practice
        .filter((question) => band.tiers.includes(question.difficulty_tier))
        .sort((a, b) => {
          const tierDifference = band.tiers.indexOf(a.difficulty_tier) - band.tiers.indexOf(b.difficulty_tier);
          return tierDifference || deterministicNoise(b.key, `${day}:${bandIndex}`) - deterministicNoise(a.key, `${day}:${bandIndex}`);
        });
      for (const question of candidates) {
        if (chosen.length >= (bandIndex + 1) * band.positions) break;
        if (chosenKeys.has(question.key)) continue;
        chosen.push(question);
        chosenKeys.add(question.key);
      }
    }
    if (chosen.length < CHALLENGE_LADDER.length) {
      practice
        .filter((question) => !chosenKeys.has(question.key))
        .sort((a, b) => deterministicNoise(b.key, day) - deterministicNoise(a.key, day))
        .slice(0, CHALLENGE_LADDER.length - chosen.length)
        .forEach((question) => chosen.push(question));
    }
    return chosen.slice(0, CHALLENGE_LADDER.length);
  }

  function createChallenge(questions, options = {}) {
    const selected = selectChallengeQuestions(questions, options);
    const startedAt = new Date().toISOString();
    return {
      id: `challenge-${Date.now()}`,
      status: 'active',
      position: 0,
      questionKeys: selected.map((question) => question.key),
      answers: [],
      startedAt,
      endedAt: null,
      outcome: null,
      winnings: 0
    };
  }

  function guaranteedWinnings(position) {
    if (position >= 10) return CHALLENGE_LADDER[9];
    if (position >= 5) return CHALLENGE_LADDER[4];
    return 0;
  }

  function topicProgress(state, questions) {
    const questionMap = new Map(questions.map((question) => [question.key || questionKey(question), question]));
    const buckets = {};
    for (const attempt of state.attempts) {
      const question = questionMap.get(attempt.questionKey);
      if (!question) continue;
      const category = question.category || inferCategory(question);
      if (!buckets[category]) buckets[category] = { category, attempts: 0, correct: 0, unique: new Set() };
      buckets[category].attempts += 1;
      buckets[category].correct += attempt.correct ? 1 : 0;
      buckets[category].unique.add(attempt.questionKey);
    }
    return Object.values(buckets)
      .map((bucket) => ({
        category: bucket.category,
        attempts: bucket.attempts,
        correct: bucket.correct,
        accuracy: bucket.attempts ? bucket.correct / bucket.attempts : 0,
        practiced: bucket.unique.size,
        mastery: clamp(Math.round((bucket.correct / Math.max(bucket.attempts, 1)) * Math.min(1, bucket.attempts / 8) * 100), 0, 100)
      }))
      .sort((a, b) => a.mastery - b.mastery || b.attempts - a.attempts);
  }

  function studyStreak(state, now = new Date()) {
    const days = new Set(state.attempts.map((attempt) => dateKey(attempt.answeredAt)));
    let cursor = new Date(now);
    if (!days.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
    let streak = 0;
    while (days.has(dateKey(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  return {
    SCHEMA_VERSION,
    CHALLENGE_LADDER,
    CATEGORIES,
    addDays,
    applyOptionOrder,
    archivePatternWeights,
    clamp,
    createDailySession,
    createChallenge,
    createLearningState,
    dateKey,
    determineTier,
    hashText,
    inferCategory,
    guaranteedWinnings,
    formatOptionText,
    isDue,
    isPracticeQuestion,
    hasBrokenEncoding,
    normalizeLearningState,
    normalizeDisplayText,
    normalizeText,
    prepareQuestion,
    presentQuestion,
    questionKey,
    questionPriority,
    questionStats,
    recordAttempt,
    selectSession,
    selectChallengeQuestions,
    studyStreak,
    topicProgress
  };
}));

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
    const value = normalizeText([
      question?.subcategory,
      question?.question_text,
      ...(Array.isArray(question?.tags) ? question.tags : [])
    ].join(' '));
    const indian = /\bindia\b|\bindian\b|delhi|mumbai|kolkata|chennai|bengaluru|maharashtra|rajasthan|uttar pradesh|lok sabha|rajya sabha/.test(value);
    if (CATEGORIES.includes(existing) && existing !== 'Miscellaneous/Trivia') {
      if (existing === 'Indian History' && !indian) return 'World History';
      if (existing === 'Geography (India)' && !indian) return 'Geography (World)';
      if (existing === 'Cinema (Bollywood)' && !indian && !/bollywood/.test(value)) return 'Cinema (Regional/World)';
      return existing;
    }

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
    const patternArchive = question?.source === 'IQgarage episode archive';
    const kbcArchive = question?.source === 'GKSection translated KBC archive';
    const practiceType = question?.question_type === 'practice'
      || question?.source === 'FactFlow demo';
    return practiceType
      && !patternArchive
      && !kbcArchive
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
      recentQuestionKeys: [],
      todayQuestionNumber: 0,
      selectionNonce: hashText(`${Date.now()}:${Math.random()}`),
      persistenceRevision: 0,
      savedAt: 0,
      migrations: {}
    };
  }

  function normalizeLearningState(input) {
    const base = createLearningState();
    if (!input || typeof input !== 'object' || Array.isArray(input)) return base;
    const attempts = Array.isArray(input.attempts) ? input.attempts.filter((attempt) => attempt?.questionKey) : [];
    const storedQuestionNumber = Number(input.todayQuestionNumber);
    return {
      ...base,
      ...input,
      schemaVersion: SCHEMA_VERSION,
      attempts,
      schedule: input.schedule && typeof input.schedule === 'object' && !Array.isArray(input.schedule) ? input.schedule : {},
      challengeHistory: Array.isArray(input.challengeHistory) ? input.challengeHistory : [],
      settings: { ...base.settings, ...(input.settings || {}) },
      recentQuestionKeys: Array.isArray(input.recentQuestionKeys) ? input.recentQuestionKeys : [],
      todayQuestionNumber: Number.isFinite(storedQuestionNumber) && storedQuestionNumber >= 0
        ? storedQuestionNumber
        : attempts.filter((attempt) => attempt.mode === 'daily').length,
      selectionNonce: String(input.selectionNonce || base.selectionNonce),
      persistenceRevision: Math.max(0, Number(input.persistenceRevision) || 0),
      savedAt: Math.max(0, Number(input.savedAt) || 0),
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

  function learnerCategoryWeights(state, questions) {
    const byKey = new Map(questions.map((question) => [question.key || questionKey(question), question]));
    const buckets = {};
    for (const attempt of state.attempts) {
      const question = byKey.get(attempt.questionKey);
      if (!question) continue;
      const category = question.category || inferCategory(question);
      if (!buckets[category]) buckets[category] = { attempts: 0, correct: 0 };
      buckets[category].attempts += 1;
      buckets[category].correct += attempt.correct ? 1 : 0;
    }
    return Object.fromEntries(Object.entries(buckets).map(([category, bucket]) => [
      category,
      Math.round((1 - bucket.correct / Math.max(bucket.attempts, 1)) * 24)
    ]));
  }

  function deterministicNoise(key, day) {
    return Number.parseInt(hashText(`${key}:${day}`).slice(-4), 36) % 1000 / 1000;
  }

  function questionFamily(question) {
    const subtype = normalizeText(question?.subcategory);
    const stem = normalizeText(question?.question_text);
    const identity = `${subtype} ${stem}`;
    if (/\bcapital\b/.test(identity)) return 'capital';
    if (/\bbirthplace\b|\bborn\b/.test(identity)) return 'birthplace';
    if (/\bdirector\b|\bdirected\b/.test(identity)) return 'director';
    if (/\bauthor\b|\bwrote\b|\bwritten\b/.test(identity)) return 'author';
    if (/\bcurrency\b/.test(identity)) return 'currency';
    if (/\bheritage\b.*\bcountry\b/.test(identity)) return 'heritage-location';
    if (/\bathlete\b.*\bsport\b|\bsport\b.*\bassociated\b/.test(identity)) return 'sport-association';
    if (/\bchemical\b.*\bsymbol\b/.test(identity)) return 'chemical-symbol';
    if (subtype) return subtype;
    return `${question?.category || inferCategory(question)}:${stem.split(' ').slice(0, 5).join('-')}`;
  }

  function selectDiverseQuestions(candidates, size, options = {}) {
    const chosen = [];
    const chosenKeys = new Set();
    const categoryCounts = {};
    const familyCounts = {};
    const categoryCap = Number(options.categoryCap || 2);
    const familyCap = Number(options.familyCap || 2);
    const seed = options.seed || dateKey();
    for (let position = 0; position < size; position += 1) {
      let ranked = candidates.map((item) => {
        const question = item.question || item;
        const base = Number(options.baseScore ? options.baseScore(question, position, item) : item.score || 0);
        const group = Number(options.priorityGroup ? options.priorityGroup(question, position, item) : 0);
        return { item, question, base, group, category: question.category || inferCategory(question), family: questionFamily(question) };
      }).filter((entry) => Number.isFinite(entry.base) && !chosenKeys.has(entry.question.key || questionKey(entry.question)));
      const previous = chosen[chosen.length - 1];
      const pools = [
        ranked.filter((entry) => (categoryCounts[entry.category] || 0) < categoryCap
          && (familyCounts[entry.family] || 0) < familyCap
          && entry.category !== previous?.category && entry.family !== previous?.family),
        ranked.filter((entry) => (categoryCounts[entry.category] || 0) < categoryCap
          && (familyCounts[entry.family] || 0) < familyCap),
        ranked.filter((entry) => entry.category !== previous?.category && entry.family !== previous?.family),
        ranked
      ];
      let pool;
      if (options.priorityGroup) {
        pool = pools[0].length
          ? pools[0]
          : pools[1].length
            ? pools[1]
            : ranked.filter((entry) => (categoryCounts[entry.category] || 0) < categoryCap
              && (familyCounts[entry.family] || 0) < familyCap);
      } else {
        pool = pools.find((entries) => entries.length);
      }
      if (!pool?.length) pool = ranked;
      if (!pool?.length) break;
      if (options.priorityGroup) {
        const preferredGroup = Math.min(...pool.map((entry) => entry.group));
        pool = pool.filter((entry) => entry.group === preferredGroup);
      }
      pool.sort((a, b) => {
        const aScore = a.base - a.group * 35 - (categoryCounts[a.category] || 0) * 18 - (familyCounts[a.family] || 0) * 28
          + deterministicNoise(a.question.key || questionKey(a.question), `${seed}:${position}`);
        const bScore = b.base - b.group * 35 - (categoryCounts[b.category] || 0) * 18 - (familyCounts[b.family] || 0) * 28
          + deterministicNoise(b.question.key || questionKey(b.question), `${seed}:${position}`);
        return bScore - aScore;
      });
      const selected = pool[0];
      chosen.push({ question: selected.question, category: selected.category, family: selected.family });
      chosenKeys.add(selected.question.key || questionKey(selected.question));
      categoryCounts[selected.category] = (categoryCounts[selected.category] || 0) + 1;
      familyCounts[selected.family] = (familyCounts[selected.family] || 0) + 1;
    }
    return chosen.map((entry) => entry.question);
  }

  function selectSession(state, questions, archiveQuestions, options = {}) {
    const now = options.now || new Date();
    const day = `${dateKey(now)}:${state.selectionNonce || ''}`;
    const size = clamp(Number(options.size || state.settings.sessionSize || 10), 1, 30);
    const weights = archivePatternWeights(archiveQuestions);
    const learnerWeights = learnerCategoryWeights(state, questions);
    const recent = new Set(options.recentQuestionKeys || state.recentQuestionKeys || []);
    const cooldownSize = Math.floor(questions.filter(isPracticeQuestion).length * 0.7);
    const eligible = questions
      .filter(isPracticeQuestion)
      .filter((question) => questionStats(state, question.key || questionKey(question)).attempts === 0)
      .filter((question) => !recent.has(question.key || questionKey(question)) || recent.size < cooldownSize)
      .map((question) => ({
        question,
        priority: questionPriority(state, question, weights, now) + (learnerWeights[question.category] || 0),
        noise: deterministicNoise(question.key, day)
      }))
      .sort((a, b) => b.priority - a.priority || b.noise - a.noise);

    return selectDiverseQuestions(eligible, size, {
      seed: day,
      categoryCap: 2,
      familyCap: 2,
      baseScore: (_question, _position, item) => item.priority + item.noise
    });
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
    const patternWeights = options.patternWeights || {};
    const recent = new Set(options.recentQuestionKeys || []);
    const cooldownSize = Math.floor(questions.filter(isPracticeQuestion).length * 0.7);
    const practice = questions
      .filter(isPracticeQuestion)
      .filter((question) => !options.state || questionStats(options.state, question.key || questionKey(question)).attempts === 0)
      .filter((question) => !recent.has(question.key || questionKey(question)) || recent.size < cooldownSize);
    const bands = [
      { positions: 5, tiers: ['Tier 1', 'Tier 2'] },
      { positions: 5, tiers: ['Tier 2', 'Tier 3', 'Tier 1'] },
      { positions: 5, tiers: ['Tier 3', 'Tier 4', 'Tier 2'] }
    ];
    return selectDiverseQuestions(practice, CHALLENGE_LADDER.length, {
      seed: day,
      categoryCap: 3,
      familyCap: 2,
      priorityGroup(question, position) {
        const band = bands[Math.min(bands.length - 1, Math.floor(position / 5))];
        const tierIndex = band.tiers.indexOf(question.difficulty_tier);
        return tierIndex < 0 ? Number.POSITIVE_INFINITY : tierIndex;
      },
      baseScore(question, position) {
        const band = bands[Math.min(bands.length - 1, Math.floor(position / 5))];
        const tierIndex = band.tiers.indexOf(question.difficulty_tier);
        if (tierIndex < 0) return Number.NEGATIVE_INFINITY;
        return 100 + (patternWeights[question.category] || 0) * 10;
      }
    });
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
    questionFamily,
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

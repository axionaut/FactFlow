'use strict';

const APP_VERSION = 37;
const CORPUS_URL = 'data/kbc-corpus.json';
const LEARNING_STORAGE_KEY = 'factflow-learning-v2';
const LEARNING_DB_NAME = 'factflow-learning';
const LEARNING_DB_STORE = 'state';
const LEARNING_DB_KEY = 'current';
const LEGACY_STORAGE_KEY = 'kbc-prep-app-v1';
const RETIRED_TRANSLATION_STORAGE_KEY = 'factflow-hi-en-translations-v1';
const LOCAL_FACT_STORAGE_KEY = 'factflow-wikidata-local-v1';
const FACT_LOW_WATERMARK = 120;
const SCHEDULED_REVIEW_BATCH_SIZE = 10;
const BACKGROUND_REFRESH_MS = 10 * 60 * 1000;
const Learning = window.FactFlowLearning;
let learningDatabasePromise = null;

const state = {
  corpus: null,
  questions: [],
  practiceQuestions: [],
  archiveQuestions: [],
  localFactQuestions: [],
  localFactSourceState: {},
  factRefreshPromise: null,
  challengeNotice: '',
  questionMap: new Map(),
  learning: Learning.createLearningState(),
  selectedTab: 'today',
  challengeSelection: null,
  activeQuestionKey: null,
  questionStartedAt: Date.now(),
  usingDemo: false
};

function byId(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const node = byId(id);
  if (node) node.textContent = String(value);
}

function clear(node) {
  while (node?.firstChild) node.removeChild(node.firstChild);
}

function element(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = String(options.text);
  if (options.type) node.type = options.type;
  if (options.href) node.href = options.href;
  if (options.target) node.target = options.target;
  if (options.rel) node.rel = options.rel;
  if (options.dataset) Object.assign(node.dataset, options.dataset);
  if (options.disabled) node.disabled = true;
  if (options.attributes) {
    Object.entries(options.attributes).forEach(([name, value]) => node.setAttribute(name, value));
  }
  const childList = Array.isArray(children) ? children : [children];
  childList.filter(Boolean).forEach((child) => node.append(child));
  return node;
}

function buildDemoQuestions() {
  const rows = [
    ['Which Indian city is known as the Pink City?', ['Jaipur', 'Udaipur', 'Jodhpur', 'Bikaner'], 0, 'Geography (India)', 'Tier 1'],
    ['Who was the first woman President of India?', ['Sonia Gandhi', 'Indira Gandhi', 'Pratibha Patil', 'Meira Kumar'], 2, 'Polity & Constitution', 'Tier 2'],
    ['Which planet is known as the Red Planet?', ['Venus', 'Mars', 'Jupiter', 'Mercury'], 1, 'Science & Technology', 'Tier 1'],
    ['Who wrote the epic poem Ramcharitmanas?', ['Kabir', 'Tulsidas', 'Kalidasa', 'Surdas'], 1, 'Literature & Authors', 'Tier 2'],
    ['The Konark Sun Temple is in which Indian state?', ['Odisha', 'Gujarat', 'Madhya Pradesh', 'Tamil Nadu'], 0, 'Art & Culture', 'Tier 1'],
    ['Which constitutional amendment introduced GST in India?', ['99th', '100th', '101st', '102nd'], 2, 'Polity & Constitution', 'Tier 3'],
    ['Which gas is most abundant in Earth’s atmosphere?', ['Oxygen', 'Carbon dioxide', 'Nitrogen', 'Hydrogen'], 2, 'Science & Technology', 'Tier 1'],
    ['Who composed India’s national anthem?', ['Bankim Chandra Chattopadhyay', 'Rabindranath Tagore', 'Sarojini Naidu', 'Subramania Bharati'], 1, 'Art & Culture', 'Tier 1'],
    ['Which river is called the Sorrow of Bihar?', ['Kosi', 'Son', 'Gandak', 'Damodar'], 0, 'Geography (India)', 'Tier 2'],
    ['The Dadasaheb Phalke Award is India’s highest honour in which field?', ['Literature', 'Cinema', 'Sport', 'Science'], 1, 'Awards & Honours', 'Tier 1']
  ];
  return rows.map(([questionText, options, answer, category, tier], index) => ({
    id: `demo-${index + 1}`,
    question_text: questionText,
    options,
    correct_option_index: answer,
    question_type: 'practice',
    category,
    difficulty_tier: tier,
    source: 'FactFlow demo',
    source_url: '',
    tags: [],
    provenance_status: 'bundled demo; answer supplied by app'
  }));
}

function openLearningDatabase() {
  if (!window.indexedDB) return Promise.resolve(null);
  if (learningDatabasePromise) return learningDatabasePromise;
  learningDatabasePromise = new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(LEARNING_DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(LEARNING_DB_STORE)) {
          request.result.createObjectStore(LEARNING_DB_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return learningDatabasePromise;
}

async function readLearningBackup() {
  const database = await openLearningDatabase();
  if (!database) return null;
  return new Promise((resolve) => {
    try {
      const request = database.transaction(LEARNING_DB_STORE, 'readonly')
        .objectStore(LEARNING_DB_STORE).get(LEARNING_DB_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeLearningBackup(snapshot) {
  const database = await openLearningDatabase();
  if (!database) return false;
  return new Promise((resolve) => {
    try {
      const transaction = database.transaction(LEARNING_DB_STORE, 'readwrite');
      transaction.objectStore(LEARNING_DB_STORE).put(snapshot, LEARNING_DB_KEY);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
      transaction.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

function learningStateFreshness(value) {
  return [
    Math.max(0, Number(value?.persistenceRevision) || 0),
    Math.max(0, Number(value?.savedAt) || 0),
    Array.isArray(value?.attempts) ? value.attempts.length : 0
  ];
}

function newerLearningState(first, second) {
  if (!first) return second;
  if (!second) return first;
  const a = learningStateFreshness(first);
  const b = learningStateFreshness(second);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? first : second;
  }
  return first;
}

async function loadLearningState() {
  let localState = null;
  try {
    const raw = localStorage.getItem(LEARNING_STORAGE_KEY);
    localState = raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('Unable to load learning history.', error);
  }
  const backupState = await readLearningBackup();
  const selected = newerLearningState(localState, backupState);
  state.learning = Learning.normalizeLearningState(selected);
  if (selected === backupState && backupState) {
    try { localStorage.setItem(LEARNING_STORAGE_KEY, JSON.stringify(state.learning)); } catch { /* IndexedDB remains authoritative. */ }
  }
}

function saveLearningState() {
  state.learning.persistenceRevision = Math.max(0, Number(state.learning.persistenceRevision) || 0) + 1;
  state.learning.savedAt = Date.now();
  const snapshot = JSON.parse(JSON.stringify(state.learning));
  void writeLearningBackup(snapshot).then((saved) => {
    if (!saved) console.warn('Unable to save the IndexedDB learning backup.');
  });
  try {
    localStorage.setItem(LEARNING_STORAGE_KEY, JSON.stringify(snapshot));
    return true;
  } catch (error) {
    console.warn('Unable to save learning history.', error);
    setText('corpusStatus', 'Progress is using the browser’s durable backup.');
    return false;
  }
}

function migrateLegacyProgress() {
  if (state.learning.migrations.legacyQuestionState) return;
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    const legacyQuestions = raw ? JSON.parse(raw) : [];
    if (Array.isArray(legacyQuestions)) {
      legacyQuestions
        .filter((question) => ['correct', 'incorrect'].includes(question?.last_result))
        .forEach((legacyQuestion) => {
          const question = Learning.prepareQuestion(legacyQuestion);
          let selectedIndex = Number(legacyQuestion.last_answer);
          if (!Number.isInteger(selectedIndex)) {
            selectedIndex = legacyQuestion.last_result === 'correct'
              ? Number(legacyQuestion.correct_option_index)
              : (Number(legacyQuestion.correct_option_index) + 1) % 4;
          }
          const answeredAt = legacyQuestion.last_correct
            ? `${legacyQuestion.last_correct}T12:00:00.000Z`
            : new Date().toISOString();
          Learning.recordAttempt(state.learning, question, selectedIndex, { answeredAt, mode: 'legacy' });
        });
    }
  } catch (error) {
    console.warn('Unable to migrate previous answer state.', error);
  }
  state.learning.migrations.legacyQuestionState = new Date().toISOString();
  saveLearningState();
}

function localFactPayloadFor(corpus) {
  const sourceVersion = Number(corpus?.wikidata_source_version || 0);
  try {
    const payload = JSON.parse(localStorage.getItem(LOCAL_FACT_STORAGE_KEY) || '{}');
    if (Number(payload.sourceVersion) !== sourceVersion) return { sourceVersion, questions: [], sourceState: corpus?.wikidata_state || {} };
    return {
      sourceVersion,
      questions: Array.isArray(payload.questions) ? payload.questions : [],
      sourceState: payload.sourceState && typeof payload.sourceState === 'object' ? payload.sourceState : corpus?.wikidata_state || {}
    };
  } catch {
    return { sourceVersion, questions: [], sourceState: corpus?.wikidata_state || {} };
  }
}

function saveLocalFacts() {
  try {
    localStorage.setItem(LOCAL_FACT_STORAGE_KEY, JSON.stringify({
      sourceVersion: Number(state.corpus?.wikidata_source_version || 0),
      questions: state.localFactQuestions,
      sourceState: state.localFactSourceState
    }));
  } catch (error) {
    console.warn('Unable to save the locally replenished question bank.', error);
  }
}

function applyCorpus(corpus) {
  state.corpus = corpus;
  state.usingDemo = false;
  const corpusQuestions = Array.isArray(corpus.questions) ? corpus.questions : [];
  const bundledKeys = new Set(corpusQuestions.map((question) => question.canonical_key || question.id).filter(Boolean));
  const local = localFactPayloadFor(corpus);
  state.localFactQuestions = local.questions.filter((question) =>
    Number(question.source_schema_version) === local.sourceVersion
    && !bundledKeys.has(question.canonical_key || question.id));
  state.localFactSourceState = local.sourceState;
  const merged = [...new Map([
    ...corpusQuestions.filter((question) => question.question_type !== 'translation_pending'),
    ...state.localFactQuestions
  ].map((question) => [question.canonical_key || Learning.normalizeText(question.question_text) || question.id, question])).values()];
  state.questions = merged.map(Learning.prepareQuestion);
  state.practiceQuestions = [...new Map(state.questions
    .filter(Learning.isPracticeQuestion)
    .map((question) => [Learning.normalizeText(question.question_text), question])).values()];
  state.archiveQuestions = state.questions.filter((question) =>
    question.source === 'IQgarage episode archive' || !Learning.isPracticeQuestion(question));
  state.questionMap = new Map(state.practiceQuestions.map((question) => [question.key, question]));
  saveLocalFacts();
  repairStaleChallenge();
}

async function loadCorpus() {
  try {
    const response = await fetch(CORPUS_URL, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Corpus request returned ${response.status}`);
    applyCorpus(await response.json());
    localStorage.removeItem(RETIRED_TRANSLATION_STORAGE_KEY);
  } catch (error) {
    console.warn('Bundled corpus unavailable; using the offline demo bank.', error);
    state.usingDemo = true;
    state.corpus = {
      generated_at: null,
      coverage: [],
      sources: [{ name: 'FactFlow demo', url: '', license: 'Bundled offline demonstration questions.' }]
    };
    state.localFactQuestions = [];
    state.localFactSourceState = {};
    state.questions = buildDemoQuestions().map(Learning.prepareQuestion);
    state.practiceQuestions = state.questions.filter(Learning.isPracticeQuestion);
    state.archiveQuestions = [];
    state.questionMap = new Map(state.practiceQuestions.map((question) => [question.key, question]));
  }
}

function unseenQuestionCount() {
  return state.practiceQuestions.filter((question) => Learning.questionStats(state.learning, question.key).attempts === 0).length;
}

async function replenishQuestionBank(options = {}) {
  if (state.usingDemo || state.factRefreshPromise) return state.factRefreshPromise;
  if (!options.force && unseenQuestionCount() >= FACT_LOW_WATERMARK) return null;
  state.factRefreshPromise = (async () => {
    const source = await import(`./tools/wikidata-source.mjs?v=${APP_VERSION}`);
    if (Number(source.WIKIDATA_SOURCE_VERSION) !== Number(state.corpus?.wikidata_source_version)) {
      throw new Error('The local question source is newer than the bundled corpus.');
    }
    const result = await source.gatherWikidataQuestions(state.localFactSourceState, { batchSize: 12 });
    state.localFactSourceState = result.state;
    const known = new Set(state.questions.map((question) => question.canonical_key || question.id).filter(Boolean));
    const additions = result.questions.filter((question) => !known.has(question.canonical_key || question.id));
    if (additions.length) {
      state.localFactQuestions.push(...additions);
      const prepared = additions.map(Learning.prepareQuestion).filter(Learning.isPracticeQuestion);
      state.questions.push(...prepared);
      state.practiceQuestions.push(...prepared);
      prepared.forEach((question) => state.questionMap.set(question.key, question));
    }
    saveLocalFacts();
    if (result.errors.length) console.warn('Some background question profiles were unavailable.', result.errors);
    return additions.length;
  })().catch((error) => {
    console.warn('Background question replenishment was unavailable.', error);
    return 0;
  }).finally(() => {
    state.factRefreshPromise = null;
    renderAll();
  });
  return state.factRefreshPromise;
}

async function refreshBundledCorpus() {
  if (state.usingDemo) return;
  try {
    const response = await fetch(`${CORPUS_URL}?refresh=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return;
    const corpus = await response.json();
    if (corpus.generated_at !== state.corpus?.generated_at) applyCorpus(corpus);
  } catch (error) {
    console.warn('Background corpus refresh was unavailable.', error);
  }
}

async function runBackgroundMaintenance() {
  await refreshBundledCorpus();
  await replenishQuestionBank();
}

function validDailySession(session) {
  return session
    && session.date === Learning.dateKey()
    && Array.isArray(session.questionKeys)
    && session.questionKeys.length > 0
    && session.questionKeys.every((key) => state.questionMap.has(key));
}

function createNewDailySession() {
  state.learning.dailySession = Learning.createDailySession(
    state.learning,
    state.practiceQuestions,
    state.archiveQuestions,
    { size: 10, recentQuestionKeys: state.learning.recentQuestionKeys }
  );
  state.learning.recentQuestionKeys = [
    ...new Set([...(state.learning.recentQuestionKeys || []), ...state.learning.dailySession.questionKeys])
  ].slice(-Math.max(30, Math.floor(state.practiceQuestions.length * 0.7)));
  state.activeQuestionKey = null;
  state.questionStartedAt = Date.now();
  saveLearningState();
}

async function startNewDailySession(button = null) {
  if (button) button.disabled = true;
  const required = 10;
  for (let attempt = 0; attempt < 3 && unseenQuestionCount() < required; attempt += 1) {
    setText('sessionSummary', 'Replenishing the unseen question bank…');
    await replenishQuestionBank({ force: true });
  }
  createNewDailySession();
  renderAll();
}

function ensureDailySession() {
  if (!validDailySession(state.learning.dailySession)) createNewDailySession();
}

function activeSession() {
  return state.selectedTab === 'review' && state.learning.reviewSession
    ? state.learning.reviewSession
    : state.learning.dailySession;
}

function questionForSession(session) {
  if (!session || session.cursor >= session.questionKeys.length) return null;
  return state.questionMap.get(session.questionKeys[session.cursor]) || null;
}

function responseForSession(session) {
  const question = questionForSession(session);
  if (!session || !question) return null;
  const attemptId = session.responses?.[question.key];
  return attemptId ? state.learning.attempts.find((attempt) => attempt.id === attemptId) || null : null;
}

function activeQuestion() {
  return questionForSession(activeSession());
}

function activeResponse() {
  return responseForSession(activeSession());
}

function presentedQuestion(question, contextKey, response = null) {
  if (Array.isArray(response?.optionOrder)) return Learning.applyOptionOrder(question, response.optionOrder);
  const previousOrder = Learning.questionStats(state.learning, question.key).latest?.optionOrder || [];
  return Learning.presentQuestion(question, contextKey, previousOrder);
}

function switchTab(tabName) {
  state.selectedTab = tabName;
  document.querySelectorAll('.nav-button').forEach((button) => {
    const active = button.dataset.tab === tabName;
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `tab-${tabName}`);
  });
  if (tabName === 'review') renderReview();
  if (tabName === 'challenge') renderChallenge();
  if (tabName === 'progress') renderProgress();
  if (tabName === 'insights') renderInsights();
  if (window.location.hash !== `#${tabName}`) history.replaceState(null, '', `#${tabName}`);
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
}

function formatRupees(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN')}`;
}

function buildChallenge() {
  return Learning.createChallenge(state.practiceQuestions, {
    state: state.learning,
    patternWeights: Learning.archivePatternWeights(state.archiveQuestions),
    recentQuestionKeys: state.learning.recentQuestionKeys
  });
}

function repairStaleChallenge() {
  const current = state.learning.currentChallenge;
  if (!current || current.status !== 'active') return false;
  const stale = !Array.isArray(current.questionKeys)
    || current.questionKeys.length !== Learning.CHALLENGE_LADDER.length
    || current.questionKeys.some((key) => !state.questionMap.has(key));
  if (!stale) return false;
  const replacement = buildChallenge();
  state.learning.currentChallenge = replacement.questionKeys.length === Learning.CHALLENGE_LADDER.length
    ? replacement
    : null;
  state.challengeSelection = null;
  state.challengeNotice = replacement.questionKeys.length === Learning.CHALLENGE_LADDER.length
    ? 'The question bank refreshed, so FactFlow rebuilt the ladder automatically.'
    : `A full challenge needs 15 unseen questions; ${replacement.questionKeys.length} are available right now.`;
  saveLearningState();
  return true;
}

function startChallenge() {
  const challenge = buildChallenge();
  if (challenge.questionKeys.length < Learning.CHALLENGE_LADDER.length) {
    state.learning.currentChallenge = null;
    state.challengeNotice = `A full challenge needs 15 unseen questions; ${challenge.questionKeys.length} are available right now. Review questions stay in Review.`;
  } else {
    state.learning.currentChallenge = challenge;
    state.learning.recentQuestionKeys = [
      ...new Set([...(state.learning.recentQuestionKeys || []), ...challenge.questionKeys])
    ].slice(-Math.max(30, Math.floor(state.practiceQuestions.length * 0.7)));
    state.challengeNotice = '';
  }
  state.challengeSelection = null;
  saveLearningState();
  renderAll();
}

function archiveChallenge(game) {
  if (!game || game.archived) return;
  const summary = {
    id: game.id,
    startedAt: game.startedAt,
    endedAt: game.endedAt,
    outcome: game.outcome,
    correctCount: game.answers.filter((answer) => answer.correct).length,
    winnings: game.winnings
  };
  state.learning.challengeHistory.push(summary);
  game.archived = true;
}

function lockChallengeAnswer() {
  const game = state.learning.currentChallenge;
  if (!game || game.status !== 'active' || !Number.isInteger(state.challengeSelection)) return;
  const canonicalQuestion = state.questionMap.get(game.questionKeys[game.position]);
  if (!canonicalQuestion) return;
  const question = presentedQuestion(canonicalQuestion, `${game.id}:${game.position}`);
  const selectedIndex = state.challengeSelection;
  const attempt = Learning.recordAttempt(state.learning, question, selectedIndex, {
    mode: 'challenge',
    optionOrder: question.option_order
  });
  game.answers.push({
    questionKey: question.key,
    selectedIndex,
    correct: attempt.correct,
    answeredAt: attempt.answeredAt,
    correctIndex: Number(question.correct_option_index),
    optionOrder: question.option_order
  });
  if (attempt.correct) {
    game.winnings = Learning.CHALLENGE_LADDER[game.position];
    if (game.position >= Learning.CHALLENGE_LADDER.length - 1) {
      game.status = 'complete';
      game.outcome = 'jackpot';
      game.endedAt = new Date().toISOString();
      archiveChallenge(game);
    } else {
      game.position += 1;
    }
    setText('challengeFeedback', 'Correct. Moving up the ladder.');
  } else {
    game.status = 'complete';
    game.outcome = 'incorrect';
    game.winnings = Learning.guaranteedWinnings(game.position);
    game.endedAt = new Date().toISOString();
    archiveChallenge(game);
    setText('challengeFeedback', 'Incorrect. The challenge has ended.');
  }
  state.challengeSelection = null;
  saveLearningState();
  renderAll();
}

function renderChallengeLadder(game) {
  const ladder = byId('challengeLadder');
  clear(ladder);
  Learning.CHALLENGE_LADDER.forEach((amount, index) => {
    const classes = ['ladder-step'];
    if (index === 4 || index === 9) classes.push('safe');
    if (game && index < game.position) classes.push('passed');
    if (game?.status === 'active' && index === game.position) classes.push('current');
    ladder.append(element('li', { className: classes.join(' ') }, [
      element('span', { text: index + 1 }),
      element('strong', { text: formatRupees(amount) })
    ]));
  });
}

function renderChallengeQuestion(container, game, question) {
  question = presentedQuestion(question, `${game.id}:${game.position}`);
  const stage = element('article', { className: 'question-stage' });
  stage.append(
    element('div', { className: 'question-top' }, [
      element('span', { className: 'question-number', text: `Question ${game.position + 1} of 15` }),
      element('span', { className: 'priority-score', text: formatRupees(Learning.CHALLENGE_LADDER[game.position]) })
    ]),
    element('h4', { text: question.question_text }),
    element('div', { className: 'question-meta' }, [
      element('span', { className: 'meta-pill', text: question.category }),
      element('span', { className: 'meta-pill', text: question.difficulty_tier })
    ])
  );
  const options = element('ul', { className: 'option-list' });
  question.options.forEach((option, index) => {
    const button = element('button', {
      className: `option-button${state.challengeSelection === index ? ' selected' : ''}`,
      type: 'button',
      attributes: { 'aria-pressed': state.challengeSelection === index ? 'true' : 'false' }
    }, [
      element('span', { className: 'option-letter', text: String.fromCharCode(65 + index) }),
      element('span', { text: option })
    ]);
    button.addEventListener('click', () => {
      state.challengeSelection = index;
      renderChallenge();
    });
    options.append(element('li', {}, button));
  });
  stage.append(options);
  const lockButton = element('button', {
    className: 'primary-button',
    type: 'button',
    text: 'Lock answer',
    disabled: !Number.isInteger(state.challengeSelection)
  });
  lockButton.addEventListener('click', lockChallengeAnswer);
  stage.append(element('div', { className: 'lock-row' }, [
    element('p', { className: 'lock-hint', text: Number.isInteger(state.challengeSelection) ? `Option ${String.fromCharCode(65 + state.challengeSelection)} selected` : 'Choose an option before locking.' }),
    lockButton
  ]));
  container.append(stage);
}

function renderChallengeResult(container, game) {
  const correctCount = game.answers.filter((answer) => answer.correct).length;
  const lastAnswer = game.answers[game.answers.length - 1];
  const failedQuestion = lastAnswer && !lastAnswer.correct ? state.questionMap.get(lastAnswer.questionKey) : null;
  const copy = element('div', { className: 'challenge-result-copy' }, [
    element('div', { className: 'completion-icon', text: game.outcome === 'jackpot' ? '★' : correctCount }),
    element('h3', { text: game.outcome === 'jackpot' ? 'You cleared the ladder' : `Run ended at question ${correctCount + 1}` }),
    element('p', { text: `You answered ${correctCount} question${correctCount === 1 ? '' : 's'} correctly and finished with ${formatRupees(game.winnings)} on the classic practice ladder.` })
  ]);
  if (failedQuestion) {
    copy.append(element('div', { className: 'answer-panel success' }, [
      element('p', { className: 'answer-title', text: 'Correct answer' }),
      element('strong', { text: failedQuestion.options[Number(failedQuestion.correct_option_index)] }),
      element('p', { className: 'source-note', text: 'This question is now in Review.' })
    ]));
  }
  const button = element('button', { className: 'primary-button', type: 'button', text: 'Play again' });
  button.addEventListener('click', startChallenge);
  copy.append(button);
  container.append(element('div', { className: 'challenge-result' }, copy));
}

function renderChallenge() {
  const game = state.learning.currentChallenge;
  const history = state.learning.challengeHistory;
  const best = history.reduce((maximum, item) => Math.max(maximum, Number(item.correctCount || 0)), 0);
  setText('challengeBest', `${best} / 15`);
  setText('challengePlayed', history.length);
  setText('challengePosition', game?.status === 'active' ? `Q${game.position + 1} · ${formatRupees(Learning.CHALLENGE_LADDER[game.position])}` : '—');
  renderChallengeLadder(game);
  const container = byId('challengeArea');
  clear(container);
  if (!game) {
    const intro = element('div', { className: 'challenge-intro-copy' }, [
      element('div', { className: 'completion-icon', text: '15' }),
      element('h3', { text: 'Ready for a pressure test?' }),
      element('p', { text: state.challengeNotice || 'The run uses 15 unseen questions, starting with foundational recall and progressing toward harder questions. Practised questions return only through Review.' })
    ]);
    const button = element('button', { className: 'primary-button', type: 'button', text: 'Start challenge' });
    button.addEventListener('click', startChallenge);
    intro.append(button);
    container.append(element('div', { className: 'challenge-intro' }, intro));
    return;
  }
  if (game.status === 'complete') {
    renderChallengeResult(container, game);
    return;
  }
  const question = state.questionMap.get(game.questionKeys[game.position]);
  if (!question) {
    if (repairStaleChallenge()) renderChallenge();
    return;
  }
  renderChallengeQuestion(container, game, question);
}

function sourceDescription(question) {
  const provenance = String(question.provenance_status || '');
  if (question.source === 'FactFlow demo') return 'Bundled demonstration answer. It is not part of the live corpus.';
  if (provenance.includes('answer supplied')) {
    return `Answer supplied by ${question.source}; FactFlow has not independently verified it.`;
  }
  return provenance || `Answer supplied by ${question.source || 'the question source'}.`;
}

function renderQuestion(container, session, question, response) {
  question = presentedQuestion(question, `${session.id}:${session.cursor}`, response);
  const weights = Learning.archivePatternWeights(state.archiveQuestions);
  const priority = Learning.questionPriority(state.learning, question, weights);
  const stage = element('article', { className: 'question-stage' });
  const questionNumber = session.mode === 'daily'
    ? state.learning.todayQuestionNumber + 1
    : session.cursor + 1;
  stage.append(
    element('div', { className: 'question-top' }, [
      element('span', { className: 'question-number', text: `Question ${questionNumber}` }),
      element('span', { className: 'priority-score', text: `Learning priority ${priority}/100` })
    ]),
    element('h4', { text: question.question_text }),
    element('div', { className: 'question-meta' }, [
      element('span', { className: 'meta-pill', text: question.category }),
      element('span', { className: 'meta-pill', text: question.difficulty_tier }),
      element('span', { className: 'meta-pill', text: question.category === 'Current Affairs' ? 'Dated current affairs' : 'Evergreen GK' })
    ])
  );

  const options = element('ul', { className: 'option-list' });
  question.options.forEach((option, index) => {
    const isCorrect = index === Number(question.correct_option_index);
    const isSelectedWrong = response && index === response.selectedIndex && !response.correct;
    const button = element('button', {
      className: `option-button${response && isCorrect ? ' correct' : ''}${isSelectedWrong ? ' incorrect' : ''}`,
      type: 'button',
      disabled: Boolean(response),
      attributes: { 'aria-label': `Option ${String.fromCharCode(65 + index)}: ${option}` }
    }, [
      element('span', { className: 'option-letter', text: String.fromCharCode(65 + index) }),
      element('span', { text: option })
    ]);
    if (!response) button.addEventListener('click', () => answerQuestion(index));
    options.append(element('li', {}, button));
  });
  stage.append(options);

  if (response) {
    const correctAnswer = question.options[Number(question.correct_option_index)];
    const answerPanel = element('div', { className: `answer-panel ${response.correct ? 'success' : 'danger'}` });
    answerPanel.append(
      element('p', { className: 'answer-title', text: response.correct ? 'Correct' : 'Not quite' }),
      element('p', {
        className: 'answer-copy',
        text: response.correct ? 'Correct. It will return later for spaced reinforcement.' : `Correct answer: ${correctAnswer}. It is now in your review queue.`
      })
    );
    const nextButton = element('button', {
      className: 'primary-button',
      type: 'button',
      text: session.mode === 'review' && response.correct && !reviewSessionHasRemaining(session) ? 'Continue practice' : 'Next question',
      attributes: { id: session.mode === 'review' ? 'nextReviewButton' : 'nextQuestionButton' }
    });
    nextButton.addEventListener('click', advanceSession);
    answerPanel.append(element('div', { className: 'feedback-actions' }, nextButton));
    if (question.explanation) answerPanel.append(element('p', { className: 'source-note', text: question.explanation }));
    const sourceLine = element('p', { className: 'source-note', text: sourceDescription(question) });
    if (question.source_url) {
      sourceLine.append(' ', element('a', {
        text: 'Open source',
        href: question.source_url,
        target: '_blank',
        rel: 'noreferrer'
      }));
    }
    answerPanel.append(sourceLine);
    stage.append(answerPanel);
  }
  container.append(stage);
}

function answerQuestion(selectedIndex) {
  const canonicalQuestion = activeQuestion();
  const session = activeSession();
  if (!canonicalQuestion || activeResponse()) return;
  const question = presentedQuestion(canonicalQuestion, `${session.id}:${session.cursor}`);
  const responseMs = Date.now() - state.questionStartedAt;
  const attempt = Learning.recordAttempt(state.learning, question, selectedIndex, {
    responseMs,
    mode: session.mode,
    optionOrder: question.option_order
  });
  if (!session.responses) session.responses = {};
  session.responses[question.key] = attempt.id;
  saveLearningState();
  setText(session.mode === 'review' ? 'reviewFeedback' : 'sessionFeedback',
    attempt.correct ? 'Correct answer.' : 'Incorrect answer. The question remains in review.');
  renderAll();
  void replenishQuestionBank();
  requestAnimationFrame(() => byId(session.mode === 'review' ? 'nextReviewButton' : 'nextQuestionButton')?.focus());
}

function advanceSession() {
  const session = activeSession();
  const response = activeResponse();
  const question = activeQuestion();
  if (!session || !response || !question) return;
  if (session.mode === 'review') {
    if (!response.correct) {
      delete session.responses[question.key];
      if (!session.questionKeys.slice(session.cursor + 1).includes(question.key)) session.questionKeys.push(question.key);
    }
    session.cursor += 1;
    state.activeQuestionKey = null;
    state.questionStartedAt = Date.now();
    if (session.cursor >= session.questionKeys.length) {
      state.learning.reviewSession = null;
      saveLearningState();
      ensureDailySession();
      switchTab('today');
      renderAll();
      return;
    }
    saveLearningState();
    renderAll();
    return;
  }
  if (session.mode === 'daily') state.learning.todayQuestionNumber += 1;
  session.cursor += 1;
  state.activeQuestionKey = null;
  state.questionStartedAt = Date.now();
  if (session.cursor >= session.questionKeys.length && session.mode === 'daily') {
    createNewDailySession();
    renderAll();
    return;
  }
  if (session.cursor >= session.questionKeys.length) session.completedAt = new Date().toISOString();
  saveLearningState();
  renderAll();
  byId('sessionHeading')?.focus?.();
}

function renderCompletion(container, session) {
  const attemptIds = Object.values(session.responses || {});
  const attempts = state.learning.attempts.filter((attempt) => attemptIds.includes(attempt.id));
  const correct = attempts.filter((attempt) => attempt.correct).length;
  const card = element('div', { className: 'completion-card' }, [
    element('div', { className: 'completion-icon', text: '✓' }),
    element('h3', { text: 'Daily session complete' }),
    element('p', {
      text: attempts.length
        ? `${correct} of ${attempts.length} correct. Wrong answers remain in Review until you clear them.`
        : 'No unseen questions are currently available. The accumulating corpus is checked on every refresh; practised questions remain in Review only.'
    })
  ]);
  const action = element('button', {
    className: 'primary-button',
    type: 'button',
    text: 'Start another session'
  });
  action.addEventListener('click', () => void startNewDailySession(action));
  card.append(action);
  container.append(card);
}

function renderToday() {
  const session = state.learning.dailySession;
  const container = byId('sessionArea');
  clear(container);
  setText('todayStreak', Learning.studyStreak(state.learning));
  setText('sessionModeLabel', 'Today’s practice');
  setText('sessionHeading', 'Daily session');
  const total = session?.questionKeys.length || 0;
  const response = responseForSession(session);
  const sessionQuestions = (session?.questionKeys || []).map((key) => state.questionMap.get(key)).filter(Boolean);
  const newCount = sessionQuestions.filter((question) => Learning.questionStats(state.learning, question.key).attempts === 0).length;
  setText('sessionSummary', `${newCount} unseen question${newCount === 1 ? '' : 's'} in this queue. Practised questions return only through Review.`);

  const question = questionForSession(session);
  if (!session || !total || !question || session.cursor >= total) {
    renderCompletion(container, session || { mode: 'daily', responses: {}, questionKeys: [] });
    return;
  }
  if (state.activeQuestionKey !== question.key) {
    state.activeQuestionKey = question.key;
    state.questionStartedAt = Date.now();
  }
  renderQuestion(container, session, question, response);
}

function reviewQuestions() {
  return state.practiceQuestions
    .filter((question) => Learning.isDue(state.learning, question.key))
    .sort((a, b) => {
      const aSchedule = state.learning.schedule[a.key];
      const bSchedule = state.learning.schedule[b.key];
      return Number(Boolean(bSchedule?.needsReview)) - Number(Boolean(aSchedule?.needsReview))
        || String(aSchedule?.dueDate).localeCompare(String(bSchedule?.dueDate));
    });
}

function reviewBacklog() {
  const questions = reviewQuestions();
  return {
    wrong: questions.filter((question) => state.learning.schedule[question.key]?.needsReview),
    scheduled: questions.filter((question) => !state.learning.schedule[question.key]?.needsReview)
  };
}

function reviewBatch(backlog = reviewBacklog()) {
  return [
    ...backlog.wrong,
    ...backlog.scheduled.slice(0, SCHEDULED_REVIEW_BATCH_SIZE)
  ];
}

function reviewSessionRemainingKeys(session) {
  if (!session) return [];
  return [...new Set(session.questionKeys.slice(session.cursor).filter((key) => (
    state.questionMap.has(key) && Learning.isDue(state.learning, key)
  )))];
}

function reviewSessionHasRemaining(session) {
  if (!session) return false;
  return session.questionKeys.slice(session.cursor + 1).some((key) => (
    state.questionMap.has(key) && Learning.isDue(state.learning, key)
  ));
}

function startReview(questions = reviewBatch()) {
  const questionKeys = questions.map((question) => question.key);
  if (!questionKeys.length) return null;
  state.learning.reviewSession = {
    id: `review-${Date.now()}`,
    date: Learning.dateKey(),
    mode: 'review',
    batchVersion: 1,
    questionKeys,
    cursor: 0,
    responses: {},
    completedAt: null
  };
  state.activeQuestionKey = null;
  state.questionStartedAt = Date.now();
  saveLearningState();
  return state.learning.reviewSession;
}

function renderReview() {
  const backlog = reviewBacklog();
  const batch = reviewBatch(backlog);
  let session = state.learning.reviewSession;
  if (session && session.batchVersion !== 1) {
    state.learning.reviewSession = null;
    session = batch.length ? startReview(batch) : null;
  }
  if (!session && state.selectedTab === 'review' && batch.length) session = startReview(batch);
  setText('reviewWrongCount', backlog.wrong.length);
  setText('reviewDueCount', Math.min(backlog.scheduled.length, SCHEDULED_REVIEW_BATCH_SIZE));
  setText('reviewNavCount', session ? reviewSessionRemainingKeys(session).length : batch.length);
  const list = byId('reviewList');
  clear(list);
  if (session) {
    while (session.cursor < session.questionKeys.length && !state.questionMap.has(session.questionKeys[session.cursor])) {
      session.cursor += 1;
    }
    const question = questionForSession(session);
    if (question) {
      if (state.activeQuestionKey !== question.key) {
        state.activeQuestionKey = question.key;
        state.questionStartedAt = Date.now();
      }
      renderQuestion(list, session, question, responseForSession(session));
      return;
    }
    state.learning.reviewSession = null;
    saveLearningState();
  }
  if (!batch.length) {
    list.append(element('div', { className: 'empty-state' }, [
      element('h3', { text: 'Nothing due right now' }),
      element('p', { text: 'Complete a daily session and scheduled reviews will appear here.' })
    ]));
    return;
  }
}

function formatAttemptTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function renderProgress() {
  const attempts = state.learning.attempts;
  const correct = attempts.filter((attempt) => attempt.correct).length;
  const practiced = new Set(attempts.map((attempt) => attempt.questionKey)).size;
  const streak = Learning.studyStreak(state.learning);
  setText('progressAccuracy', attempts.length ? `${Math.round(correct / attempts.length * 100)}%` : '—');
  setText('progressAccuracyDetail', attempts.length ? `${correct} correct of ${attempts.length}` : 'No answers yet');
  setText('progressPracticed', practiced);
  setText('progressAttempts', attempts.length);
  setText('progressStreak', `${streak} day${streak === 1 ? '' : 's'}`);

  const mastery = Learning.topicProgress(state.learning, state.practiceQuestions);
  const masteryList = byId('topicProgress');
  clear(masteryList);
  if (!mastery.length) {
    masteryList.append(element('div', { className: 'empty-state' }, [
      element('h3', { text: 'Your topic map starts with the first answer' }),
      element('p', { text: 'FactFlow will put weaker, less-practised topics first.' })
    ]));
  } else {
    mastery.forEach((topic) => {
      masteryList.append(element('div', { className: 'mastery-row' }, [
        element('div', { className: 'mastery-name' }, [
          element('strong', { text: topic.category }),
          element('small', { text: `${topic.attempts} attempts · ${Math.round(topic.accuracy * 100)}% correct` })
        ]),
        element('div', { className: 'mastery-track' }, element('span', { attributes: { style: `width:${topic.mastery}%` } })),
        element('span', { className: 'mastery-value', text: `${topic.mastery}%` })
      ]));
    });
  }

  const activity = byId('recentActivity');
  clear(activity);
  const recent = [...attempts].reverse().slice(0, 12);
  if (!recent.length) {
    activity.append(element('div', { className: 'empty-state' }, [
      element('h3', { text: 'No activity yet' }),
      element('p', { text: 'Your recent correct and incorrect answers will appear here.' })
    ]));
  } else {
    recent.forEach((attempt) => {
      const question = state.questionMap.get(attempt.questionKey);
      activity.append(element('div', { className: 'activity-row' }, [
        element('span', { className: `activity-dot${attempt.correct ? ' correct' : ''}` }),
        element('div', { className: 'activity-copy' }, [
          element('strong', { text: question?.question_text || 'Question no longer in the current bank' }),
          element('small', { text: attempt.correct ? 'Correct' : 'Needs review' })
        ]),
        element('span', { className: 'activity-time', text: formatAttemptTime(attempt.answeredAt) })
      ]));
    });
  }
}

function renderInsights() {
  setText('insightPracticeCount', state.practiceQuestions.length);
  setText('insightArchiveCount', state.archiveQuestions.length);
  setText('insightCategoryCount', new Set(state.practiceQuestions.map((question) => question.category)).size);
  const generated = state.corpus?.generated_at ? new Date(state.corpus.generated_at) : null;
  setText('insightGeneratedAt', generated && !Number.isNaN(generated.getTime())
    ? generated.toLocaleDateString([], { month: 'short', day: 'numeric' })
    : state.usingDemo ? 'Offline demo' : '—');

  const counts = {};
  state.archiveQuestions.forEach((question) => {
    counts[question.category] = (counts[question.category] || 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const maximum = Math.max(1, ...sorted.map(([, count]) => count));
  const chart = byId('archiveCategoryChart');
  clear(chart);
  sorted.forEach(([category, count]) => {
    chart.append(element('div', { className: 'chart-row' }, [
      element('span', { className: 'chart-label', text: category }),
      element('div', { className: 'chart-track' }, element('span', { attributes: { style: `width:${count / maximum * 100}%` } })),
      element('span', { className: 'chart-value', text: count })
    ]));
  });

  const sources = byId('sourceQualityList');
  clear(sources);
  const sourceNotes = [
    ['Historical KBC archive questions', 'GKSection translations retain their original Hindi, four-option order, answer index, and source URL as pattern evidence only. They are not learner practice, and source answers are not independently fact-checked.'],
    ['Accumulating fact bank', 'Wikidata contributes English questions from structured India and international facts. Options are generated only from answers of the same fact type.'],
    ['Historical KBC pattern corpus', 'GKSection and IQgarage records train the app’s topic, category, and difficulty weighting but never appear in Today, Challenge, or Review. SonyLIV is referenced for official provenance but is not scraped.']
  ];
  sourceNotes.forEach(([title, copy]) => {
    sources.append(element('div', { className: 'source-item' }, [
      element('strong', { text: title }),
      element('p', { text: copy })
    ]));
  });

  const coverage = Array.isArray(state.corpus?.coverage) ? state.corpus.coverage : [];
  const coverageGrid = byId('corpusCoverageGrid');
  clear(coverageGrid);
  const total = coverage.reduce((sum, item) => sum + Number(item.questions || 0), 0);
  setText('coverageSummary', coverage.length
    ? `${total} provenance-labelled historical KBC records. Only structurally eligible English records enter practice.`
    : 'Archive coverage is unavailable in offline demo mode.');
  coverage.forEach((item) => {
    coverageGrid.append(element('div', { className: 'coverage-item' }, [
      element('strong', { text: `Season ${item.season}` }),
      element('span', { text: `${item.questions} archive records · ${Number(item.playable || 0)} included in practice` })
    ]));
  });
}

function renderHeader() {
  const unseen = unseenQuestionCount();
  setText('appVersionLabel', `v${APP_VERSION}`);
  setText('mobileVersionLabel', `v${APP_VERSION}`);
  setText('corpusStatus', state.usingDemo
    ? 'Offline demo bank · serve over HTTP for the full corpus'
    : `${unseen} unseen · ${state.practiceQuestions.length} playable English questions`);
}

function renderAll() {
  renderHeader();
  renderToday();
  renderChallenge();
  renderReview();
  renderProgress();
  renderInsights();
}

function attachListeners() {
  document.querySelectorAll('.nav-button').forEach((button) => {
    button.addEventListener('click', () => switchTab(button.dataset.tab));
  });
  byId('newChallengeButton').addEventListener('click', startChallenge);
  window.addEventListener('hashchange', () => {
    const requested = window.location.hash.slice(1);
    if (['today', 'challenge', 'review', 'progress', 'insights'].includes(requested)) switchTab(requested);
  });
}

async function init() {
  if (!Learning) throw new Error('FactFlow learning engine failed to load.');
  await loadLearningState();
  await loadCorpus();
  migrateLegacyProgress();
  ensureDailySession();
  attachListeners();
  renderAll();
  void runBackgroundMaintenance();
  window.setInterval(() => void runBackgroundMaintenance(), BACKGROUND_REFRESH_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void runBackgroundMaintenance();
    else saveLearningState();
  });
  window.addEventListener('pagehide', saveLearningState);
  const requestedTab = window.location.hash.slice(1);
  if (['today', 'challenge', 'review', 'progress', 'insights'].includes(requestedTab)) switchTab(requestedTab);
}

init().catch((error) => {
  console.error(error);
  setText('corpusStatus', 'FactFlow could not start.');
  const container = byId('sessionArea');
  clear(container);
  container?.append(element('div', { className: 'empty-state' }, [
    element('h3', { text: 'Unable to start the study session' }),
    element('p', { text: 'Reload the page. If the problem continues, serve the project over HTTP.' })
  ]));
});

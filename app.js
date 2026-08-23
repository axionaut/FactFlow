'use strict';

const APP_VERSION = 27;
const CORPUS_URL = 'data/kbc-corpus.json';
const LEARNING_STORAGE_KEY = 'factflow-learning-v2';
const LEGACY_STORAGE_KEY = 'kbc-prep-app-v1';
const RETIRED_TRANSLATION_STORAGE_KEY = 'factflow-hi-en-translations-v1';
const LOCAL_FACT_STORAGE_KEY = 'factflow-wikidata-local-v1';
const FACT_LOW_WATERMARK = 120;
const BACKGROUND_REFRESH_MS = 10 * 60 * 1000;
const Learning = window.FactFlowLearning;

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
  reviewSession: null,
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

function loadLearningState() {
  try {
    const raw = localStorage.getItem(LEARNING_STORAGE_KEY);
    state.learning = Learning.normalizeLearningState(raw ? JSON.parse(raw) : null);
  } catch (error) {
    console.warn('Unable to load learning history.', error);
    state.learning = Learning.createLearningState();
  }
}

function saveLearningState() {
  try {
    localStorage.setItem(LEARNING_STORAGE_KEY, JSON.stringify(state.learning));
    return true;
  } catch (error) {
    console.warn('Unable to save learning history.', error);
    setText('corpusStatus', 'Practice works, but this browser could not save progress.');
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
  state.reviewSession = null;
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
  return state.reviewSession || state.learning.dailySession;
}

function activeQuestion() {
  const session = activeSession();
  if (!session || session.cursor >= session.questionKeys.length) return null;
  return state.questionMap.get(session.questionKeys[session.cursor]) || null;
}

function activeResponse() {
  const session = activeSession();
  const question = activeQuestion();
  if (!session || !question) return null;
  const attemptId = session.responses?.[question.key];
  return attemptId ? state.learning.attempts.find((attempt) => attempt.id === attemptId) || null : null;
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
    copy.append(element('p', {
      text: `Correct answer: ${failedQuestion.options[Number(failedQuestion.correct_option_index)]}. This question is now in Review.`
    }));
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

function renderQuestion(container, question, response) {
  const session = activeSession();
  question = presentedQuestion(question, `${session.id}:${session.cursor}`, response);
  const weights = Learning.archivePatternWeights(state.archiveQuestions);
  const priority = Learning.questionPriority(state.learning, question, weights);
  const stage = element('article', { className: 'question-stage' });
  stage.append(
    element('div', { className: 'question-top' }, [
      element('span', { className: 'question-number', text: `Question ${session.cursor + 1}` }),
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
      text: session.cursor + 1 >= session.questionKeys.length ? 'Finish session' : 'Next question',
      attributes: { id: 'nextQuestionButton' }
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
  setText('sessionFeedback', attempt.correct ? 'Correct answer.' : 'Incorrect answer. The question was added to review.');
  renderAll();
  void replenishQuestionBank();
  requestAnimationFrame(() => byId('nextQuestionButton')?.focus());
}

function advanceSession() {
  const session = activeSession();
  if (!session || !activeResponse()) return;
  session.cursor += 1;
  state.activeQuestionKey = null;
  state.questionStartedAt = Date.now();
  if (session.cursor >= session.questionKeys.length && session.mode === 'daily') {
    createNewDailySession();
    renderAll();
    return;
  }
  if (session.cursor >= session.questionKeys.length) session.completedAt = new Date().toISOString();
  if (!state.reviewSession) saveLearningState();
  renderAll();
  byId('sessionHeading')?.focus?.();
}

function renderCompletion(container, session) {
  const attemptIds = Object.values(session.responses || {});
  const attempts = state.learning.attempts.filter((attempt) => attemptIds.includes(attempt.id));
  const correct = attempts.filter((attempt) => attempt.correct).length;
  const card = element('div', { className: 'completion-card' }, [
    element('div', { className: 'completion-icon', text: '✓' }),
    element('h3', { text: session.mode === 'review' ? 'Review complete' : 'Daily session complete' }),
    element('p', {
      text: attempts.length
        ? `${correct} of ${attempts.length} correct. Wrong answers remain in Review until you clear them.`
        : 'No unseen questions are currently available. The accumulating corpus is checked on every refresh; practised questions remain in Review only.'
    })
  ]);
  const action = element('button', {
    className: 'primary-button',
    type: 'button',
    text: session.mode === 'review' ? 'Back to review' : 'Start another session'
  });
  action.addEventListener('click', () => {
    if (session.mode === 'review') {
      state.reviewSession = null;
      switchTab('review');
    } else {
      void startNewDailySession(action);
    }
  });
  card.append(action);
  container.append(card);
}

function renderToday() {
  const session = activeSession();
  const container = byId('sessionArea');
  clear(container);
  setText('todayStreak', Learning.studyStreak(state.learning));
  setText('sessionModeLabel', session?.mode === 'review' ? 'Focused review' : 'Today’s practice');
  setText('sessionHeading', session?.mode === 'review' ? 'Review session' : 'Daily session');
  const total = session?.questionKeys.length || 0;
  const response = activeResponse();
  const answered = Math.min((session?.cursor || 0) + (response ? 1 : 0), total);
  const percent = total ? answered / total * 100 : 0;
  byId('sessionProgressBar').style.width = `${percent}%`;
  setText('sessionProgressText', total && session.cursor < total ? `Question ${session.cursor + 1} of ${total}` : `${answered} questions completed`);

  const sessionQuestions = (session?.questionKeys || []).map((key) => state.questionMap.get(key)).filter(Boolean);
  const newCount = sessionQuestions.filter((question) => Learning.questionStats(state.learning, question.key).attempts === 0).length;
  setText('sessionSummary', session?.mode === 'review'
    ? 'A focused retry. Answer correctly to clear this item from your mistake queue.'
    : `${newCount} unseen question${newCount === 1 ? '' : 's'} in this queue. Practised questions return only through Review.`);

  const question = activeQuestion();
  if (!session || !total || !question || session.cursor >= total) {
    renderCompletion(container, session || { mode: 'daily', responses: {}, questionKeys: [] });
    return;
  }
  if (state.activeQuestionKey !== question.key) {
    state.activeQuestionKey = question.key;
    state.questionStartedAt = Date.now();
  }
  renderQuestion(container, question, response);
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

function startReview(questionKey) {
  const questionKeys = [
    questionKey,
    ...reviewQuestions().map((question) => question.key).filter((key) => key !== questionKey)
  ];
  state.reviewSession = {
    id: `review-${Date.now()}`,
    date: Learning.dateKey(),
    mode: 'review',
    questionKeys,
    cursor: 0,
    responses: {},
    completedAt: null
  };
  state.activeQuestionKey = null;
  state.questionStartedAt = Date.now();
  switchTab('today');
  renderToday();
}

function renderReview() {
  const questions = reviewQuestions();
  const wrong = questions.filter((question) => state.learning.schedule[question.key]?.needsReview);
  const scheduled = questions.filter((question) => !state.learning.schedule[question.key]?.needsReview);
  setText('reviewWrongCount', wrong.length);
  setText('reviewDueCount', scheduled.length);
  setText('reviewNavCount', questions.length);
  const list = byId('reviewList');
  clear(list);
  if (!questions.length) {
    list.append(element('div', { className: 'empty-state' }, [
      element('h3', { text: 'Nothing due right now' }),
      element('p', { text: 'Complete a daily session and scheduled reviews will appear here.' })
    ]));
    return;
  }
  questions.slice(0, 30).forEach((question) => {
    const schedule = state.learning.schedule[question.key];
    const copy = element('div', { className: 'review-card-copy' }, [
      element('h3', { text: question.question_text }),
      element('p', { text: `${question.category} · ${schedule.needsReview ? 'Incorrect last time' : `Due ${schedule.dueDate}`}` })
    ]);
    const button = element('button', { className: 'secondary-button', type: 'button', text: 'Review now' });
    button.addEventListener('click', () => startReview(question.key));
    list.append(element('article', { className: 'review-card' }, [copy, button]));
  });
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
    ['English practice questions', 'India-first questions translated from GKSection retain their original Hindi, four-option order, answer index, and source URL. Source answers are not independently fact-checked.'],
    ['Accumulating fact bank', 'Wikidata contributes English questions from structured India and international facts. Options are generated only from answers of the same fact type.'],
    ['Historical KBC pattern corpus', 'IQgarage records train the app’s topic, category, and difficulty weighting but never appear in Today, Challenge, or Review. SonyLIV is referenced for official provenance but is not scraped.']
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
  byId('newSessionButton').addEventListener('click', (event) => void startNewDailySession(event.currentTarget));
  byId('newChallengeButton').addEventListener('click', startChallenge);
  window.addEventListener('hashchange', () => {
    const requested = window.location.hash.slice(1);
    if (['today', 'challenge', 'review', 'progress', 'insights'].includes(requested)) switchTab(requested);
  });
}

async function init() {
  if (!Learning) throw new Error('FactFlow learning engine failed to load.');
  loadLearningState();
  await loadCorpus();
  migrateLegacyProgress();
  ensureDailySession();
  attachListeners();
  renderAll();
  void runBackgroundMaintenance();
  window.setInterval(() => void runBackgroundMaintenance(), BACKGROUND_REFRESH_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void runBackgroundMaintenance();
  });
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

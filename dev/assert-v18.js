'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Learning = require('../learning.js');

function question(index, tier, category) {
  return Learning.prepareQuestion({
    id: 'test-' + index,
    question_text: 'Test question number ' + index + ' about ' + category + '?',
    options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
    correct_option_index: 1,
    question_type: 'practice',
    difficulty_tier: tier,
    category,
    source: 'Wikidata structured facts',
    provenance_status: 'third-party KBC transcript; English translation reviewed; answer supplied by source'
  });
}

const checks = [];
function check(name, callback) {
  callback();
  checks.push(name);
}

check('stable question keys ignore punctuation and case', () => {
  const first = Learning.questionKey({ question_text: 'Who Wrote This?' });
  const second = Learning.questionKey({ question_text: 'who wrote this' });
  assert.equal(first, second);
});

check('reviewed source categories remain authoritative', () => {
  assert.equal(Learning.inferCategory({
    category: 'Indian History',
    question_text: 'Which book did this Indian revolutionary write?'
  }), 'Indian History');
});

check('historical IQgarage records can train selection patterns but never the learner', () => {
  const historical = question(999, 'Tier 3', 'Indian History');
  historical.source = 'IQgarage episode archive';
  historical.question_type = 'practice';
  assert.equal(Learning.isPracticeQuestion(historical), false);
  assert.ok(Object.keys(Learning.archivePatternWeights([historical])).includes('Indian History'));
});

check('display text preserves Unicode and consistently capitalizes options', () => {
  assert.equal(Learning.formatOptionText('münchen'), 'München');
  assert.equal(Learning.formatOptionText('München'), 'München');
  assert.equal(Learning.formatOptionText('eBay'), 'eBay');
  assert.equal(Learning.formatOptionText('NASA'), 'NASA');
  assert.equal(Learning.hasBrokenEncoding('MÃ¼nchen'), true);
  assert.equal(Learning.hasBrokenEncoding('München'), false);
});

check('options reshuffle without changing the correct answer', () => {
  const sample = question(0, 'Tier 1', 'Indian History');
  const first = Learning.presentQuestion(sample, 'first-show');
  const repeated = Learning.presentQuestion(sample, 'review-show', first.option_order);
  assert.notDeepEqual(first.option_order, [0, 1, 2, 3]);
  assert.notDeepEqual(repeated.option_order, first.option_order);
  assert.equal(first.options[first.correct_option_index], 'Beta');
  assert.equal(repeated.options[repeated.correct_option_index], 'Beta');
  const restored = Learning.applyOptionOrder(sample, repeated.option_order);
  assert.deepEqual(restored.options, repeated.options);
  const state = Learning.createLearningState();
  const attempt = Learning.recordAttempt(state, repeated, repeated.correct_option_index, { optionOrder: repeated.option_order });
  assert.equal(attempt.correct, true);
  assert.deepEqual(attempt.optionOrder, repeated.option_order);
});

check('attempts are separate and incorrect answers enter review', () => {
  const state = Learning.createLearningState();
  const sample = question(1, 'Tier 1', 'Science & Technology');
  const attempt = Learning.recordAttempt(state, sample, 0, { answeredAt: '2026-08-23T10:00:00.000Z' });
  assert.equal(attempt.correct, false);
  assert.equal(state.schedule[sample.key].needsReview, true);
  assert.equal(Learning.isDue(state, sample.key, new Date('2026-08-23T12:00:00.000Z')), true);
  assert.equal(sample.last_result, undefined);
});

check('a correct retry clears the mistake and expands the interval', () => {
  const state = Learning.createLearningState();
  const sample = question(2, 'Tier 2', 'Indian History');
  Learning.recordAttempt(state, sample, 0, { answeredAt: '2026-08-20T10:00:00.000Z' });
  Learning.recordAttempt(state, sample, 1, { answeredAt: '2026-08-21T10:00:00.000Z' });
  assert.equal(state.schedule[sample.key].needsReview, false);
  assert.equal(state.schedule[sample.key].dueDate, '2026-08-22');
  Learning.recordAttempt(state, sample, 1, { answeredAt: '2026-08-22T10:00:00.000Z' });
  assert.equal(state.schedule[sample.key].dueDate, '2026-08-25');
});

const bank = [
  ...Array.from({ length: 10 }, (_, index) => question(index + 10, 'Tier 1', index % 2 ? 'Science & Technology' : 'Geography (World)')),
  ...Array.from({ length: 10 }, (_, index) => question(index + 30, 'Tier 2', index % 2 ? 'Indian History' : 'Sports')),
  ...Array.from({ length: 10 }, (_, index) => question(index + 50, 'Tier 4', index % 2 ? 'Polity & Constitution' : 'Literature & Authors'))
];

check('daily sessions are bounded, unique, and category-diverse', () => {
  const state = Learning.createLearningState();
  const session = Learning.selectSession(state, bank, [], { size: 10, now: new Date('2026-08-23T12:00:00') });
  assert.equal(session.length, 10);
  assert.equal(new Set(session.map((item) => item.key)).size, 10);
  const maximumCategoryCount = Math.max(...Object.values(session.reduce((counts, item) => {
    counts[item.category] = (counts[item.category] || 0) + 1;
    return counts;
  }, {})));
  assert.ok(maximumCategoryCount <= 3);
});

check('ordinary sessions never repeat practised questions', () => {
  const state = Learning.createLearningState();
  bank.slice(0, 7).forEach((item, index) => Learning.recordAttempt(state, item, item.correct_option_index, {
    answeredAt: `2026-08-${String(index + 1).padStart(2, '0')}T10:00:00.000Z`
  }));
  const selected = Learning.selectSession(state, bank, [], { size: 30, now: new Date('2026-08-23T12:00:00') });
  assert.equal(selected.length, bank.length - 7);
  assert.ok(selected.every((item) => Learning.questionStats(state, item.key).attempts === 0));
  assert.ok(selected.every((item) => !bank.slice(0, 7).some((used) => used.key === item.key)));
});

check('learning priorities always stay within a real 0-100 range', () => {
  const state = Learning.createLearningState();
  bank.forEach((item) => {
    const score = Learning.questionPriority(state, item, { [item.category]: 1 });
    assert.ok(score >= 0 && score <= 100);
  });
});

check('KBC challenge builds a unique escalating 15-question ladder', () => {
  const selected = Learning.selectChallengeQuestions(bank, { seed: 'fixed-test' });
  assert.equal(selected.length, 15);
  assert.equal(new Set(selected.map((item) => item.key)).size, 15);
  assert.ok(selected.slice(0, 5).every((item) => item.difficulty_tier === 'Tier 1'));
  assert.ok(selected.slice(5, 10).every((item) => item.difficulty_tier === 'Tier 2'));
  assert.ok(selected.slice(10).every((item) => item.difficulty_tier === 'Tier 4'));
  assert.equal(Learning.guaranteedWinnings(4), 0);
  assert.equal(Learning.guaranteedWinnings(5), 10000);
  assert.equal(Learning.guaranteedWinnings(10), 320000);
});

check('KBC challenge uses historical weights without serial category repetition', () => {
  const selected = Learning.selectChallengeQuestions(bank, {
    seed: 'pattern-weighted',
    patternWeights: { 'Science & Technology': 1, 'Geography (World)': 0 }
  });
  assert.equal(selected.slice(0, 5).filter((item) => item.category === 'Science & Technology').length, 3);
  selected.slice(1, 5).forEach((item, index) => assert.notEqual(item.category, selected[index].category));
  assert.ok(selected.every((item) => item.source !== 'IQgarage episode archive'));
});

check('KBC challenge excludes every previously practised question', () => {
  const state = Learning.createLearningState();
  const used = bank.slice(0, 8);
  used.forEach((item, index) => Learning.recordAttempt(state, item, item.correct_option_index, {
    answeredAt: `2026-08-${String(index + 1).padStart(2, '0')}T10:00:00.000Z`
  }));
  const selected = Learning.selectChallengeQuestions(bank, { state, seed: 'unseen-only' });
  assert.ok(selected.every((item) => !used.some((seen) => seen.key === item.key)));
});

check('the bundled KBC ladder avoids serial categories and question templates', () => {
  const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'kbc-corpus.json'), 'utf8'));
  const practice = corpus.questions.map(Learning.prepareQuestion).filter(Learning.isPracticeQuestion);
  const selected = Learning.selectChallengeQuestions(practice, {
    seed: 'corpus-diversity',
    patternWeights: Learning.archivePatternWeights(corpus.questions.filter((item) => item.question_type === 'archive'))
  });
  assert.equal(selected.length, 15);
  const families = selected.map(Learning.questionFamily);
  selected.slice(1).forEach((item, index) => {
    assert.notEqual(item.category, selected[index].category, `adjacent category repeated at ${index + 1}`);
    assert.notEqual(families[index + 1], families[index], `adjacent template repeated at ${index + 1}`);
  });
  const familyCounts = Object.values(families.reduce((counts, family) => {
    counts[family] = (counts[family] || 0) + 1;
    return counts;
  }, {}));
  assert.ok(Math.max(...familyCounts) <= 3);
  assert.ok(familyCounts.filter((count) => count > 2).length <= 1);
});

check('bundled corpus has a large accumulating India-first practice bank', () => {
  const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'kbc-corpus.json'), 'utf8'));
  const prepared = corpus.questions.map(Learning.prepareQuestion);
  const practice = prepared.filter(Learning.isPracticeQuestion);
  assert.ok(practice.length >= 400);
  assert.ok(practice.every((item) => item.options.length === 4));
  assert.ok(practice.every((item) => Number.isInteger(Number(item.correct_option_index))));
  assert.ok(new Set(practice.map((item) => item.category)).size >= 8);
  const wikidata = practice.filter((item) => item.source === 'Wikidata structured facts');
  assert.ok(wikidata.length >= 400);
  assert.ok(wikidata.filter((item) => item.tags.includes('india')).length >= 250);
  assert.equal(practice.filter((item) => item.source === 'IQgarage episode archive').length, 0);
  assert.equal(practice.filter((item) => item.source === 'GKSection translated KBC archive').length, 0);
  assert.ok(corpus.questions.filter((item) => item.source === 'GKSection translated KBC archive').length >= 1);
  assert.ok(corpus.questions.filter((item) => item.source === 'IQgarage episode archive').length >= 499);
  assert.ok(corpus.questions.filter((item) => item.source === 'IQgarage episode archive')
    .every((item) => item.question_type === 'archive'));
  assert.ok(practice.every((item) => item.source.startsWith('GKSection')
    || item.source === 'Wikidata structured facts'));
  assert.equal(practice.some((item) => String(item.translation_status).includes('machine')), false);
  assert.equal(practice.some((item) => Learning.hasBrokenEncoding(item.question_text) || item.options.some(Learning.hasBrokenEncoding)), false);
  assert.equal(practice.some((item) => new Set(item.options.map(Learning.normalizeText)).size !== 4), false);
  assert.equal(practice.some((item) => item.options.some((option) => /^\p{Ll}(?!\p{Lu})/u.test(option))), false);
  assert.equal(practice.some((item) => /unsept|unnil|unquad/i.test(item.question_text)), false);
  assert.equal(new Set(practice.map((item) => Learning.normalizeText(item.question_text))).size, practice.length);
  assert.equal(corpus.questions.some((item) => ['Open Trivia DB', 'The Trivia API'].includes(item.source)), false);
  assert.ok(corpus.translation_pending >= 1);
});

check('HTML loads cache-aligned assets and every main screen', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  for (const id of ['tab-today', 'tab-challenge', 'tab-review', 'tab-progress', 'tab-insights']) {
    assert.ok(html.includes('id="' + id + '"'), 'missing ' + id);
  }
  assert.ok(html.includes('styles.css?v=29'));
  assert.ok(html.includes('learning.js?v=29'));
  assert.ok(html.includes('app.js?v=29'));
  assert.equal(html.includes('translateHindiButton'), false);
  assert.equal(html.includes('translationPendingCount'), false);
  assert.ok(app.includes("localStorage.removeItem(RETIRED_TRANSLATION_STORAGE_KEY)"));
  assert.ok(app.includes('const FACT_LOW_WATERMARK = 120'));
  assert.ok(app.includes('async function replenishQuestionBank'));
  assert.ok(app.includes("import(`./tools/wikidata-source.mjs?v=${APP_VERSION}`)"));
  assert.ok(app.includes('window.setInterval(() => void runBackgroundMaintenance(), BACKGROUND_REFRESH_MS)'));
  assert.ok(app.includes('for (let attempt = 0; attempt < 3 && unseenQuestionCount() < required; attempt += 1)'));
  assert.ok(app.includes('session.questionKeys.every((key) => state.questionMap.has(key))'));
  assert.ok(app.includes('function repairStaleChallenge()'));
  assert.equal(app.includes('This challenge cannot continue'), false);
  const referencedIds = [
    ...app.matchAll(/byId\('([^']+)'\)/g),
    ...app.matchAll(/setText\('([^']+)'/g)
  ].map((match) => match[1]);
  referencedIds.forEach((id) => assert.ok(
    html.includes('id="' + id + '"') || app.includes("id: '" + id + "'"),
    'app references missing element #' + id
  ));
  const declaredIds = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(declaredIds).size, declaredIds.length, 'HTML contains duplicate IDs');
});

console.log('v18 assertions passed: ' + checks.length + '/' + checks.length);
checks.forEach((name, index) => console.log((index + 1) + '. ' + name));

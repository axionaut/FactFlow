const APP_VERSION = 10;
const STORAGE_KEY = 'kbc-prep-app-v1';
const CORPUS_URL = 'data/kbc-corpus.json';
const CATEGORY_TAXONOMY = [
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

const state = {
  questions: [],
  corpus: null,
  selectedTab: 'dashboard',
  filters: {
    category: 'all',
    tier: 'all',
    search: ''
  }
};

async function loadState() {
  let savedQuestions = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    savedQuestions = Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Unable to load local question data.', error);
  }

  try {
    const response = await fetch(CORPUS_URL);
    if (!response.ok) throw new Error(`Corpus request returned ${response.status}`);
    const corpus = await response.json();
    const archiveQuestions = Array.isArray(corpus.questions) ? corpus.questions : [];
    state.corpus = corpus;
    const userQuestions = savedQuestions.filter((question) => question.source !== 'seed' && !String(question.id || '').startsWith('iqg-'));
    const merged = new Map(archiveQuestions.map((question) => [normalizeText(question.question_text), question]));
    userQuestions.forEach((question) => merged.set(normalizeText(question.question_text), question));
    state.questions = [...merged.values()];
  } catch (error) {
    console.warn('Bundled corpus unavailable; using saved or demo data.', error);
    state.questions = savedQuestions.length ? savedQuestions : buildSeedQuestions();
  }
  persistQuestions();
}

function persistQuestions() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.questions));
}

function buildSeedQuestions() {
  return [
    {
      id: 'seed-1',
      season: 17,
      episode: 6,
      air_date: '2025-08-30',
      question_text: 'Which movement led to the formation of the Indian National Congress in 1885?',
      options: ['Swadeshi Movement', 'Home Rule Movement', 'Partition of Bengal agitation', 'Moderate reform movement'],
      correct_option_index: 3,
      category: 'Indian History',
      subcategory: 'Freedom struggle',
      difficulty_tier: 'Tier 1',
      prize_level_asked_at: 10000,
      source: 'seed',
      tags: ['congress', 'history', 'freedom-struggle'],
      seen_count: 1,
      last_correct: '2026-08-14',
      ladder_position: 2
    },
    {
      id: 'seed-2',
      season: 15,
      episode: 11,
      air_date: '2023-11-19',
      question_text: 'Which Indian city is known as the Pink City?',
      options: ['Jaipur', 'Udaipur', 'Jodhpur', 'Bikaner'],
      correct_option_index: 0,
      category: 'Geography (India)',
      subcategory: 'Cities',
      difficulty_tier: 'Tier 1',
      prize_level_asked_at: 5000,
      source: 'seed',
      tags: ['cities', 'india', 'tourism'],
      seen_count: 2,
      last_correct: '2025-01-20',
      ladder_position: 1
    },
    {
      id: 'seed-3',
      season: 14,
      episode: 9,
      air_date: '2022-09-16',
      question_text: 'Who was the first woman President of India?',
      options: ['Sonia Gandhi', 'Indira Gandhi', 'Pratibha Patil', 'Meira Kumar'],
      correct_option_index: 2,
      category: 'Polity & Constitution',
      subcategory: 'Leadership',
      difficulty_tier: 'Tier 2',
      prize_level_asked_at: 80000,
      source: 'seed',
      tags: ['president', 'women', 'constitution'],
      seen_count: 1,
      last_correct: null,
      ladder_position: 7
    },
    {
      id: 'seed-4',
      season: 11,
      episode: 2,
      air_date: '2019-11-15',
      question_text: 'Which planet is known as the Red Planet?',
      options: ['Mars', 'Venus', 'Jupiter', 'Mercury'],
      correct_option_index: 0,
      category: 'Science & Technology',
      subcategory: 'Space',
      difficulty_tier: 'Tier 1',
      prize_level_asked_at: 2000,
      source: 'seed',
      tags: ['space', 'planets', 'science'],
      seen_count: 3,
      last_correct: '2026-06-01',
      ladder_position: 4
    },
    {
      id: 'seed-5',
      season: 8,
      episode: 14,
      air_date: '2016-10-01',
      question_text: 'Which Indian cricketer is known as the "Master Blaster"?',
      options: ['Virat Kohli', 'Rohit Sharma', 'Sachin Tendulkar', 'MS Dhoni'],
      correct_option_index: 2,
      category: 'Sports',
      subcategory: 'Cricket',
      difficulty_tier: 'Tier 1',
      prize_level_asked_at: 5000,
      source: 'seed',
      tags: ['sports', 'cricket', 'records'],
      seen_count: 2,
      last_correct: '2026-03-12',
      ladder_position: 3
    },
    {
      id: 'seed-6',
      season: 16,
      episode: 13,
      air_date: '2024-11-09',
      question_text: 'Which national award is often called the "Dadasaheb Phalke Award" in cinema?',
      options: ['Padma Shri', 'National Film Award', 'Dadasaheb Phalke Award', 'Filmfare Award'],
      correct_option_index: 2,
      category: 'Awards & Honours',
      subcategory: 'Cinema',
      difficulty_tier: 'Tier 2',
      prize_level_asked_at: 160000,
      source: 'seed',
      tags: ['awards', 'cinema', 'honours'],
      seen_count: 0,
      last_correct: null,
      ladder_position: 8
    },
    {
      id: 'seed-7',
      season: 18,
      episode: 2,
      air_date: '2026-08-12',
      question_text: 'Which Indian mission performed a soft landing near the Moon south pole region?',
      options: ['Chandrayaan-2', 'Chandrayaan-3', 'Aditya-L1', 'Mangalyaan'],
      correct_option_index: 1,
      category: 'Science & Technology',
      subcategory: 'Space',
      difficulty_tier: 'Tier 3',
      prize_level_asked_at: 320000,
      source: 'seed',
      tags: ['chandrayaan', 'space', 'moon'],
      seen_count: 0,
      last_correct: null,
      ladder_position: 12
    },
    {
      id: 'seed-8',
      season: 18,
      episode: 5,
      air_date: '2026-08-17',
      question_text: 'Which constitutional amendment introduced the Goods and Services Tax regime in India?',
      options: ['101st Amendment', '74th Amendment', '73rd Amendment', '42nd Amendment'],
      correct_option_index: 0,
      category: 'Polity & Constitution',
      subcategory: 'Constitutional amendments',
      difficulty_tier: 'Tier 3',
      prize_level_asked_at: 1600000,
      source: 'seed',
      tags: ['gst', 'constitutional-amendments', 'economy'],
      seen_count: 0,
      last_correct: null,
      ladder_position: 11
    },
    {
      id: 'seed-9',
      season: 7,
      episode: 7,
      air_date: '2015-10-11',
      question_text: 'Who wrote the epic poem "Ramcharitmanas"?',
      options: ['Kalidasa', 'Tulsidas', 'Bhavabhuti', 'Kabir'],
      correct_option_index: 1,
      category: 'Mythology & Religion',
      subcategory: 'Literature',
      difficulty_tier: 'Tier 2',
      prize_level_asked_at: 80000,
      source: 'seed',
      tags: ['mythology', 'literature', 'ram'],
      seen_count: 1,
      last_correct: '2025-12-04',
      ladder_position: 6
    },
    {
      id: 'seed-10',
      season: 13,
      episode: 9,
      air_date: '2021-11-30',
      question_text: 'Which Indian author wrote the novel "A Suitable Boy"?',
      options: ['Anita Desai', 'Vikram Seth', 'Arundhati Roy', 'Nayantara Sahgal'],
      correct_option_index: 1,
      category: 'Literature & Authors',
      subcategory: 'Writers',
      difficulty_tier: 'Tier 2',
      prize_level_asked_at: 160000,
      source: 'seed',
      tags: ['authors', 'novels', 'literature'],
      seen_count: 1,
      last_correct: null,
      ladder_position: 9
    },
    {
      id: 'seed-11',
      season: 17,
      episode: 15,
      air_date: '2025-12-05',
      question_text: 'Which award is given to the best film at the International Film Festival of India?',
      options: ['Swarna Kamal', 'Dadasaheb Phalke Award', 'Padma Bhushan', 'Rajat Kamal'],
      correct_option_index: 3,
      category: 'Awards & Honours',
      subcategory: 'Film awards',
      difficulty_tier: 'Tier 3',
      prize_level_asked_at: 320000,
      source: 'seed',
      tags: ['awards', 'film', 'festivals'],
      seen_count: 0,
      last_correct: null,
      ladder_position: 13
    },
    {
      id: 'seed-12',
      season: 10,
      episode: 6,
      air_date: '2018-12-18',
      question_text: 'Which Indian state is famous for the Konark Sun Temple?',
      options: ['Odisha', 'Tamil Nadu', 'Karnataka', 'Andhra Pradesh'],
      correct_option_index: 0,
      category: 'Art & Culture',
      subcategory: 'heritage',
      difficulty_tier: 'Tier 2',
      prize_level_asked_at: 40000,
      source: 'seed',
      tags: ['heritage', 'odisha', 'temples'],
      seen_count: 0,
      last_correct: null,
      ladder_position: 7
    }
  ];
}

function normalizeText(value) {
  return (value || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function computeSimilarity(a, b) {
  const x = normalizeText(a);
  const y = normalizeText(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const longer = x.length > y.length ? x : y;
  const shorter = x.length > y.length ? y : x;
  if (longer.length === 0) return 1;
  const editDistance = levenshteinDistance(longer, shorter);
  return 1 - editDistance / longer.length;
}

function levenshteinDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[a.length][b.length];
}

function dedupeQuestion(question, existingQuestions) {
  return !existingQuestions.some((item) => computeSimilarity(item.question_text, question.question_text) > 0.88);
}

function calculateTierFromPrize(prizeValue) {
  if (!prizeValue || Number(prizeValue) <= 40000) return 'Tier 1';
  if (Number(prizeValue) <= 320000) return 'Tier 2';
  if (Number(prizeValue) <= 3200000) return 'Tier 3';
  return 'Tier 4';
}

function determineTier(question) {
  if (question.difficulty_tier) return question.difficulty_tier;
  if (typeof question.ladder_position === 'number' && question.ladder_position >= 1) {
    if (question.ladder_position <= 5) return 'Tier 1';
    if (question.ladder_position <= 10) return 'Tier 2';
    if (question.ladder_position <= 15) return 'Tier 3';
    return 'Tier 4';
  }
  return calculateTierFromPrize(question.prize_level_asked_at || 5000);
}

function parseOptions(rawOptions, fallbackCount = 4) {
  if (Array.isArray(rawOptions)) {
    const options = rawOptions.map((option) => String(option).trim()).filter(Boolean);
    if (options.length >= 2) {
      const padded = [...options];
      while (padded.length < fallbackCount) padded.push('');
      return padded.slice(0, fallbackCount);
    }
  }
  return Array.from({ length: fallbackCount }, () => '');
}

function parseCsvToRows(content) {
  const rows = [];
  let current = '';
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(current);
      current = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(current);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      current = '';
    } else {
      current += char;
    }
  }

  if (current.length || row.length) {
    row.push(current);
    if (row.some((cell) => cell.trim())) rows.push(row);
  }

  return rows;
}

function getCategoryCounts() {
  return state.questions.reduce((acc, question) => {
    const category = question.category || 'Miscellaneous/Trivia';
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});
}

function getTierCounts() {
  return state.questions.reduce((acc, question) => {
    const tier = determineTier(question);
    acc[tier] = (acc[tier] || 0) + 1;
    return acc;
  }, {});
}

function getTagPairs() {
  const pairs = {};
  state.questions.forEach((question) => {
    const tags = [...new Set((question.tags || []).map((tag) => String(tag).trim()).filter(Boolean))];
    for (let i = 0; i < tags.length; i += 1) {
      for (let j = i + 1; j < tags.length; j += 1) {
        const key = [tags[i], tags[j]].sort().join(' | ');
        pairs[key] = (pairs[key] || 0) + 1;
      }
    }
  });
  return pairs;
}

function getTopicSignals() {
  const topicHits = {};
  state.questions.forEach((question) => {
    const rawTags = [...(question.tags || [])];
    rawTags.forEach((tag) => {
      const clean = tag.trim();
      if (!clean) return;
      topicHits[clean] = (topicHits[clean] || 0) + 1;
    });
  });
  return Object.entries(topicHits).sort((a, b) => b[1] - a[1]).slice(0, 8);
}

function getPriorityScore(question) {
  const totalQuestions = Math.max(state.questions.length, 1);
  const categoryShare = getCategoryCounts()[question.category || 'Miscellaneous/Trivia'] / totalQuestions;
  const currentSeason = 18;
  const seasonWeight = question.season >= currentSeason - 2 ? 1.7 : question.season >= currentSeason - 5 ? 1.2 : 0.8;
  const tierWeight = { 'Tier 1': 1, 'Tier 2': 1.25, 'Tier 3': 1.5, 'Tier 4': 2 }[determineTier(question)] || 1;
  const tagCountWeight = (question.tags || []).length * 0.5;
  const seenPenalty = question.seen_count ? question.seen_count * 0.3 : 0;
  const recencyBoost = question.source === 'current_affairs' ? 1.3 : 0;
  return Math.round((categoryShare * 150 + seasonWeight * 70 + tierWeight * 30 + tagCountWeight + recencyBoost) - seenPenalty);
}

function renderSummary() {
  const total = state.questions.length;
  const categoryCounts = getCategoryCounts();
  const sortedCategories = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]);
  const topCategory = sortedCategories[0] || ['No data', 0];
  const tierCounts = getTierCounts();
  const priorityQueue = [...state.questions].sort((a, b) => getPriorityScore(b) - getPriorityScore(a)).slice(0, 5);

  document.getElementById('statTotalQuestions').textContent = total;
  document.getElementById('statRecentTopics').textContent = getTopicSignals().length;
  document.getElementById('summaryTopCategory').textContent = topCategory[0];
  document.getElementById('summaryTopCategoryValue').textContent = `${topCategory[1]} questions`;
  document.getElementById('summaryTierMix').textContent = Object.entries(tierCounts).map(([key, value]) => `${key}: ${value}`).join(' • ');
  document.getElementById('summaryTarget').textContent = priorityQueue[0] ? `${getPriorityScore(priorityQueue[0])} / 100` : 'N/A';

  const list = document.getElementById('priorityList');
  if (!priorityQueue.length) {
    list.innerHTML = '<div class="empty-state">No study queue yet. Add questions to begin.</div>';
    return;
  }

  list.innerHTML = priorityQueue.map((question) => `
    <div class="priority-item">
      <div class="meta">
        <strong>${question.category}</strong>
        <small>${question.question_text.slice(0, 74)}${question.question_text.length > 74 ? '…' : ''}</small>
      </div>
      <span class="badge">${getPriorityScore(question)}</span>
    </div>
  `).join('');

  const repeatTopicList = document.getElementById('repeatTopicsList');
  const topTopics = getTopicSignals().slice(0, 6);
  repeatTopicList.innerHTML = topTopics.map(([tag, count]) => `
    <li class="repeat-topic">
      <div class="meta">
        <strong>${tag}</strong>
        <small>appears in ${count} records</small>
      </div>
      <span class="badge">${count}</span>
    </li>
  `).join('');

  document.getElementById('analysisCategoryCount').textContent = Object.keys(categoryCounts).length;
  const strongestPair = Object.entries(getTagPairs()).sort((a, b) => b[1] - a[1])[0];
  document.getElementById('analysisFocusLabel').textContent = strongestPair ? strongestPair[0].split(' | ')[0] : '—';
  document.getElementById('analysisTopTag').textContent = strongestPair ? strongestPair[0].split(' | ')[0] : '—';
}

function renderCategoryChart() {
  const container = document.getElementById('categoryChart');
  const counts = getCategoryCounts();
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...Object.values(counts), 1);

  container.innerHTML = sorted.map(([label, value]) => `
    <div class="chart-row">
      <div class="chart-label">${label}</div>
      <div class="chart-bar-track"><span class="chart-bar" style="width:${(value / max) * 100}%"></span></div>
      <div class="chart-value">${value}</div>
    </div>
  `).join('');
}

function renderTierChart() {
  const container = document.getElementById('tierChart');
  const counts = getTierCounts();
  const sorted = Object.entries(counts).sort((a, b) => {
    const order = { 'Tier 1': 1, 'Tier 2': 2, 'Tier 3': 3, 'Tier 4': 4 };
    return order[a[0]] - order[b[0]];
  });

  const max = Math.max(...Object.values(counts), 1);
  container.innerHTML = sorted.map(([label, value]) => `
    <div class="chart-row">
      <div class="chart-label">${label}</div>
      <div class="chart-bar-track"><span class="chart-bar" style="width:${(value / max) * 100}%"></span></div>
      <div class="chart-value">${value}</div>
    </div>
  `).join('');
}

function renderTopicSignals() {
  const container = document.getElementById('repeatTopicChart');
  const signals = getTopicSignals();
  if (!signals.length) {
    container.innerHTML = '<div class="empty-state">No recurring topics yet.</div>';
    return;
  }

  container.innerHTML = signals.map(([tag, count]) => `
    <div class="repeat-topic">
      <div class="meta">
        <strong>${tag}</strong>
        <small>high-overlap tag</small>
      </div>
      <span class="badge">${count}</span>
    </div>
  `).join('');
}

function renderClusterList() {
  const container = document.getElementById('tagClusterList');
  const pairs = Object.entries(getTagPairs()).sort((a, b) => b[1] - a[1]).slice(0, 12);
  if (!pairs.length) {
    container.innerHTML = '<div class="empty-state">Add tags to reveal study clusters.</div>';
    return;
  }

  container.innerHTML = pairs.map(([pair, count]) => `
    <span class="cluster-pill">${pair} <strong>× ${count}</strong></span>
  `).join('');
}

function renderAnalysis() {
  renderCategoryChart();
  renderTierChart();
  renderTopicSignals();
  renderClusterList();
}

function renderFilters() {
  const categorySelect = document.getElementById('filterCategory');
  const categories = ['all', ...CATEGORY_TAXONOMY];

  categorySelect.innerHTML = categories.map((category) => `
    <option value="${category}">${category === 'all' ? 'All categories' : category}</option>
  `).join('');
  categorySelect.value = state.filters.category;

  document.getElementById('filterTier').value = state.filters.tier;
  document.getElementById('filterSearch').value = state.filters.search;
}

function getFilteredQuestions() {
  const searchTerm = state.filters.search.trim().toLowerCase();
  return [...state.questions].filter((question) => {
    const categoryMatch = state.filters.category === 'all' || question.category === state.filters.category;
    const tierMatch = state.filters.tier === 'all' || determineTier(question) === state.filters.tier;
    const searchMatch = !searchTerm || question.question_text.toLowerCase().includes(searchTerm) || (question.tags || []).join(' ').toLowerCase().includes(searchTerm);
    return categoryMatch && tierMatch && searchMatch;
  }).sort((a, b) => getPriorityScore(b) - getPriorityScore(a));
}

function renderDrill() {
  const list = document.getElementById('drillList');
  const filteredQuestions = getFilteredQuestions();

  if (!filteredQuestions.length) {
    list.innerHTML = '<div class="empty-state">No questions match the current filters.</div>';
    return;
  }

  list.innerHTML = filteredQuestions.map((question) => `
    ${(() => {
      const answered = question.last_result === 'correct' || question.last_result === 'incorrect';
      return `
    <article class="question-card">
      <div class="header-row">
        <span class="meta-pill">${question.category}</span>
        <span class="badge">Priority ${getPriorityScore(question)}</span>
      </div>
      <h4>${question.question_text}</h4>
      <div class="question-meta">
        <span class="meta-pill">${determineTier(question)}</span>
        <span class="meta-pill">${question.tags?.slice(0, 2).join(', ') || 'untagged'}</span>
      </div>
      <ul class="option-list">
        ${(question.options || []).map((option, index) => `
          <li class="${answered && index === Number(question.correct_option_index) ? 'correct' : ''}">${String.fromCharCode(65 + index)}. ${option || '—'}</li>
        `).join('')}
      </ul>
      ${answered ? `<p class="answer-feedback ${question.last_result === 'correct' ? 'success' : 'danger'}">${question.last_result === 'correct' ? 'Correct. Keep this in active recall.' : `Review this one. Correct answer: ${String.fromCharCode(65 + Number(question.correct_option_index))}.`}</p>` : '<p class="helper-text">Answer mentally, then record your result.</p>'}
      <div class="action-row">
        <button class="secondary-button" data-action="incorrect" data-id="${question.id}" type="button">Mark wrong</button>
        <button class="primary-button" data-action="correct" data-id="${question.id}" type="button">Mark correct</button>
      </div>
    </article>
      `;
    })()}
  `).join('');
}

function renderReference() {
  // static informational panel; no dynamic behavior required
}

function attachListeners() {
  document.querySelectorAll('.nav-button').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedTab = button.dataset.tab;
      document.querySelectorAll('.nav-button').forEach((navButton) => navButton.classList.toggle('active', navButton === button));
      document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === `tab-${state.selectedTab}`));
    });
  });

  document.getElementById('filterCategory').addEventListener('change', (event) => {
    state.filters.category = event.target.value;
    renderDrill();
  });

  document.getElementById('filterTier').addEventListener('change', (event) => {
    state.filters.tier = event.target.value;
    renderDrill();
  });

  document.getElementById('filterSearch').addEventListener('input', (event) => {
    state.filters.search = event.target.value;
    renderDrill();
  });

  document.getElementById('drillList').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const question = state.questions.find((item) => item.id === button.dataset.id);
    if (!question) return;

    question.seen_count = (question.seen_count || 0) + 1;
    question.last_result = button.dataset.action;
    question.last_correct = button.dataset.action === 'correct' ? new Date().toISOString().slice(0, 10) : null;
    persistQuestions();
    renderSummary();
    renderDrill();
  });
}

function exportBankToJson() {
  const payload = JSON.stringify(state.questions, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'factflow-bank.json';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function renderAll() {
  renderSummary();
  renderAnalysis();
  renderFilters();
  renderDrill();
  renderCorpusCoverage();
}

function renderCorpusCoverage() {
  const summary = document.getElementById('corpusCoverageSummary');
  const grid = document.getElementById('corpusCoverageGrid');
  if (!summary || !grid) return;
  if (!state.corpus) {
    summary.textContent = 'Bundled archive could not be loaded. Serve the project over HTTP to enable it.';
    grid.innerHTML = '';
    return;
  }
  const total = state.corpus.coverage.reduce((sum, item) => sum + Number(item.questions || 0), 0);
  summary.textContent = `${total} normalized questions from a third-party episode archive. Coverage is partial and answers are not independently verified.`;
  grid.innerHTML = state.corpus.coverage.map((item) => `
    <div class="coverage-item">
      <strong>Season ${item.season}</strong>
      <span>${item.questions} questions · ${item.pages} episode pages</span>
    </div>
  `).join('');
}

async function init() {
  const versionLabel = document.getElementById('appVersionLabel');
  if (versionLabel) {
    versionLabel.textContent = `v${APP_VERSION}`;
  }

  await loadState();
  attachListeners();
  renderAll();
}

init();

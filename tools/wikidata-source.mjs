const WIKIDATA_ENDPOINTS = [
  'https://qlever.dev/api/wikidata',
  'https://query.wikidata.org/sparql'
];
export const WIKIDATA_SOURCE_VERSION = 3;

function relationQuery(where, orderBy = '?item') {
  return `
SELECT DISTINCT ?item ?itemLabel ?answer ?answerLabel WHERE {
  ${where}
  ?item rdfs:label ?itemLabel.
  ?answer rdfs:label ?answerLabel.
  FILTER(LANG(?itemLabel) = "en")
  FILTER(LANG(?answerLabel) = "en")
}
ORDER BY ${orderBy}`;
}

export const WIKIDATA_PROFILES = [
  {
    id: 'india-person-birthplace',
    multiplier: 2,
    category: 'Miscellaneous/Trivia',
    tier: 'Tier 2',
    tags: ['india', 'people', 'birthplace'],
    acceptAnswer: (answer) => !/\b(?:district|taluk|ashram|bhavan|hospital|university|presidency|state|province|county)\b/i.test(answer),
    question: (item) => `In which place was ${item} born?`,
    explanation: (item, answer) => `Wikidata records ${answer} as the birthplace of ${item}.`,
    query: relationQuery(`
      ?item wdt:P31 wd:Q5; wdt:P27 wd:Q668; wdt:P19 ?answer; wikibase:sitelinks ?sitelinks.
      FILTER(?sitelinks >= 25)
    `, 'DESC(?sitelinks) ?item')
  },
  {
    id: 'india-film-director',
    multiplier: 2,
    category: 'Cinema (Bollywood)',
    tier: 'Tier 2',
    tags: ['india', 'film', 'director'],
    question: (item) => `Who directed the Indian film “${item}”?`,
    explanation: (item, answer) => `Wikidata lists ${answer} as the director of ${item}.`,
    query: relationQuery(`
      ?item wdt:P31 wd:Q11424; wdt:P495 wd:Q668; wdt:P57 ?answer; wikibase:sitelinks ?sitelinks.
      FILTER(?sitelinks >= 15)
    `, 'DESC(?sitelinks) ?item')
  },
  {
    id: 'india-book-author',
    multiplier: 2,
    category: 'Literature & Authors',
    tier: 'Tier 3',
    tags: ['india', 'book', 'author'],
    question: (item) => `Who wrote the Indian literary work “${item}”?`,
    explanation: (item, answer) => `Wikidata lists ${answer} as the author of ${item}.`,
    query: relationQuery(`
      VALUES ?workType { wd:Q571 wd:Q8261 wd:Q7725634 }
      ?item wdt:P31 ?workType; wdt:P495 wd:Q668; wdt:P50 ?answer; wikibase:sitelinks ?sitelinks.
      FILTER(?sitelinks >= 8)
    `, 'DESC(?sitelinks) ?item')
  },
  {
    id: 'india-state-capital',
    multiplier: 1,
    category: 'Geography (India)',
    tier: 'Tier 1',
    tags: ['india', 'state', 'capital'],
    question: (item) => `What is the capital of ${item}?`,
    explanation: (item, answer) => `Wikidata records ${answer} as the capital of ${item}.`,
    query: relationQuery(`
      ?item wdt:P300 ?isoCode; wdt:P36 ?answer.
      FILTER(STRSTARTS(STR(?isoCode), "IN-"))
      FILTER NOT EXISTS { ?item wdt:P576 ?endDate }
    `)
  },
  {
    id: 'world-country-capital',
    multiplier: 1,
    category: 'Geography (World)',
    tier: 'Tier 1',
    tags: ['world', 'country', 'capital'],
    question: (item) => `What is the capital of ${item}?`,
    explanation: (item, answer) => `Wikidata records ${answer} as the capital of ${item}.`,
    query: relationQuery(`
      ?item wdt:P31 wd:Q6256; wdt:P297 ?isoCode; wdt:P36 ?answer.
      FILTER NOT EXISTS { ?item wdt:P576 ?endDate }
    `)
  },
  {
    id: 'world-country-currency',
    multiplier: 1,
    category: 'Business & Economy',
    tier: 'Tier 2',
    tags: ['world', 'country', 'currency'],
    question: (item) => `Which currency is associated with ${item}?`,
    explanation: (item, answer) => `Wikidata records ${answer} as the currency of ${item}.`,
    query: relationQuery(`
      ?item wdt:P31 wd:Q6256; wdt:P297 ?isoCode; wdt:P38 ?answer.
      FILTER NOT EXISTS { ?item wdt:P576 ?endDate }
    `)
  },
  {
    id: 'world-heritage-country',
    multiplier: 1,
    category: 'Art & Culture',
    tier: 'Tier 3',
    tags: ['world', 'heritage', 'country'],
    question: (item) => `In which country is the UNESCO World Heritage Site “${item}” located?`,
    explanation: (item, answer) => `Wikidata locates ${item} in ${answer}.`,
    query: relationQuery(`
      ?item wdt:P1435 wd:Q9259; wdt:P17 ?answer; wikibase:sitelinks ?sitelinks.
      FILTER(?sitelinks >= 20)
    `, 'DESC(?sitelinks) ?item')
  },
  {
    id: 'india-athlete-sport',
    multiplier: 2,
    category: 'Sports',
    tier: 'Tier 2',
    tags: ['india', 'athlete', 'sport'],
    question: (item) => `With which sport is ${item} associated?`,
    explanation: (item, answer) => `Wikidata associates ${item} with ${answer}.`,
    query: relationQuery(`
      ?item wdt:P31 wd:Q5; wdt:P27 wd:Q668; wdt:P641 ?answer; wikibase:sitelinks ?sitelinks.
      FILTER(?sitelinks >= 20)
    `, 'DESC(?sitelinks) ?item')
  },
  {
    id: 'chemical-element-symbol',
    multiplier: 1,
    category: 'Science & Technology',
    tier: 'Tier 1',
    tags: ['science', 'chemistry', 'element'],
    question: (item) => `What is the chemical symbol for ${item}?`,
    explanation: (item, answer) => `The chemical symbol recorded for ${item} is ${answer}.`,
    query: `
SELECT DISTINCT ?item ?itemLabel ?answerLabel WHERE {
  ?item wdt:P31 wd:Q11344; wdt:P246 ?answerLabel; wdt:P1086 ?atomicNumber.
  ?item rdfs:label ?itemLabel.
  FILTER(LANG(?itemLabel) = "en")
  FILTER(?atomicNumber <= 118)
}
ORDER BY ?item`
  }
];

function hash(value) {
  let result = 2166136261;
  for (const character of String(value)) {
    result ^= character.codePointAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function normalized(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function hasBrokenEncoding(value) {
  return /\uFFFD|\u00C3[\u0080-\u00BF]|\u00C2[\u0080-\u00BF]|â(?:€™|€œ|€|€“|€”|€¦)/u.test(String(value || ''));
}

function entityId(uri) {
  return String(uri || '').match(/\bQ\d+$/)?.[0] || '';
}

function rotate(values, amount) {
  if (!values.length) return values;
  const offset = amount % values.length;
  return [...values.slice(offset), ...values.slice(0, offset)];
}

export function buildWikidataQuestions(profile, bindings, accessedAt = new Date().toISOString().slice(0, 10)) {
  const candidates = bindings.map((binding) => ({
    itemId: entityId(binding.item?.value),
    itemUrl: binding.item?.value || '',
    itemLabel: String(binding.itemLabel?.value || '').trim(),
    answerId: entityId(binding.answer?.value),
    answerLabel: String(binding.answerLabel?.value || '').trim()
  })).filter((row) => row.itemId
    && row.itemLabel.length >= 2 && row.itemLabel.length <= 120
    && row.answerLabel.length >= 1 && row.answerLabel.length <= 100
    && normalized(row.itemLabel) !== normalized(row.answerLabel)
    && (!profile.acceptAnswer || profile.acceptAnswer(row.answerLabel))
    && !hasBrokenEncoding(row.itemLabel)
    && !hasBrokenEncoding(row.answerLabel)
    && !/^Q\d+$/.test(row.itemLabel)
    && !/^Q\d+$/.test(row.answerLabel));
  const grouped = new Map();
  for (const row of candidates) {
    if (!grouped.has(row.itemId)) grouped.set(row.itemId, []);
    grouped.get(row.itemId).push(row);
  }
  const rows = [...grouped.values()]
    .filter((group) => new Set(group.map((row) => normalized(row.answerLabel))).size === 1)
    .map((group) => group[0]);
  const answerPool = [...new Map(rows.map((row) => [normalized(row.answerLabel), row.answerLabel])).values()];
  if (answerPool.length < 4) return [];

  return rows.flatMap((row) => {
    const correctIdentity = normalized(row.answerLabel);
    const candidates = answerPool.filter((answer) => normalized(answer) !== correctIdentity);
    const ordered = rotate(candidates, hash(`${profile.id}:${row.itemId}`) % candidates.length);
    const distractors = ordered.slice(0, 3);
    if (distractors.length !== 3) return [];
    const correctSlot = hash(`${row.itemId}:correct-slot`) % 4;
    const options = [...distractors];
    options.splice(correctSlot, 0, row.answerLabel);
    const canonicalKey = `wd-${profile.id}-${row.itemId}`;
    return [{
      id: canonicalKey,
      canonical_key: canonicalKey,
      season: null,
      episode: null,
      air_date: null,
      question_text: profile.question(row.itemLabel),
      options,
      correct_option_index: correctSlot,
      question_type: 'practice',
      category: profile.category,
      subcategory: profile.id,
      difficulty_tier: profile.tier,
      prize_level_asked_at: null,
      source: 'Wikidata structured facts',
      source_schema_version: WIKIDATA_SOURCE_VERSION,
      source_url: row.itemUrl,
      source_accessed_at: accessedAt,
      tags: profile.tags,
      language_original: 'en',
      translation_status: 'not required',
      explanation: profile.explanation(row.itemLabel, row.answerLabel),
      provenance_status: 'Wikidata structured fact; options generated from same-type facts; answer not independently verified'
    }];
  });
}

async function fetchProfile(profile, offset, requested) {
  const query = `${profile.query}\nLIMIT ${requested}\nOFFSET ${offset}`;
  const errors = [];
  for (const endpoint of WIKIDATA_ENDPOINTS) {
    try {
      const url = `${endpoint}?query=${encodeURIComponent(query)}&format=json`;
      const response = await fetch(url, {
        headers: {
          accept: 'application/sparql-results+json',
          'user-agent': 'FactFlow/18 (+https://github.com/axionaut/FactFlow)'
        },
        signal: AbortSignal.timeout(20000)
      });
      if (!response.ok) throw new Error(`${response.status}`);
      const payload = await response.json();
      return Array.isArray(payload?.results?.bindings) ? payload.results.bindings : [];
    } catch (error) {
      errors.push(`${new URL(endpoint).hostname}: ${error.message}`);
    }
  }
  throw new Error(`Wikidata ${profile.id} failed (${errors.join(', ')})`);
}

export async function gatherWikidataQuestions(previousState = {}, options = {}) {
  const baseBatchSize = Math.max(1, Number(options.batchSize || 4));
  const nextState = { ...previousState };
  const questions = [];
  const errors = [];
  for (let start = 0; start < WIKIDATA_PROFILES.length; start += 1) {
    const group = WIKIDATA_PROFILES.slice(start, start + 1);
    const results = await Promise.all(group.map(async (profile) => {
      const offset = Math.max(0, Number(previousState[profile.id]?.offset || 0));
      const requested = baseBatchSize * profile.multiplier;
      try {
        const bindings = await fetchProfile(profile, offset, requested + 8);
        return { profile, offset, requested, bindings };
      } catch (error) {
        return { profile, offset, requested, error };
      }
    }));
    for (const result of results) {
      const attemptedAt = new Date().toISOString();
      if (result.error) {
        errors.push(`${result.profile.id}: ${result.error.message}`);
        nextState[result.profile.id] = { ...(previousState[result.profile.id] || {}), last_attempted_at: attemptedAt, last_error: result.error.message };
        continue;
      }
      const built = buildWikidataQuestions(result.profile, result.bindings).slice(0, result.requested);
      questions.push(...built);
      nextState[result.profile.id] = {
        offset: result.bindings.length < result.requested + 8 ? 0 : result.offset + result.requested,
        last_attempted_at: attemptedAt,
        last_result_count: result.bindings.length,
        exhausted: result.bindings.length < result.requested + 8
      };
    }
  }
  return { questions, state: nextState, errors };
}

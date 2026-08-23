import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gatherWikidataQuestions, WIKIDATA_SOURCE_VERSION } from './wikidata-source.mjs';

const IQGARAGE_INDEX_URL = 'https://www.iqgarage.com/kbc-questions-and-answers/';
const GKSECTION_INDEX_URL = 'https://www.gksection.com/hindi/hindi-kbc-season-9-quiz/';
const OUTPUT_PATH = new URL('../data/kbc-corpus.json', import.meta.url);
const REVIEWED_TRANSLATIONS_PATH = new URL('../data/gksection-reviewed-en.json', import.meta.url);
const OFFLINE = process.argv.includes('--offline');
const MAX_NEW_IQGARAGE_PAGES = Math.max(1, Number(process.env.IQGARAGE_PAGE_LIMIT || 6));
const MAX_NEW_GKSECTION_PAGES = Math.max(1, Number(process.env.GKSECTION_PAGE_LIMIT || 6));
const WIKIDATA_BATCH_SIZE = Math.max(1, Number(process.env.WIKIDATA_BATCH_SIZE || 4));
const REMOVED_SOURCES = new Set(['Open Trivia DB', 'The Trivia API']);

function decodeHtml(value = '') {
  if (/[ÃƒÃ¢]/.test(value)) value = Buffer.from(value, 'latin1').toString('utf8');
  return String(value)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#039;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/Ã¢â‚¬â„¢/g, '’')
    .replace(/Ã¢â‚¬Å“|Ã¢â‚¬Â/g, '"')
    .replace(/Ã‚/g, '');
}

function htmlToLines(html) {
  const article = html.match(/<article[\s\S]*?<\/article>/i)?.[0]
    || html.match(/<main[\s\S]*?<\/main>/i)?.[0]
    || html;
  return decodeHtml(article
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>|<\/h\d>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function normalizedIdentity(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function questionIdentity(question) {
  return normalizedIdentity(question.canonical_key || question.question_text || question.question_text_hi);
}

function hasPlayableStructure(question) {
  const options = Array.isArray(question?.options) ? question.options : [];
  const answer = Number(question?.correct_option_index);
  return options.length === 4
    && options.every((option) => String(option).trim())
    && new Set(options.map(normalizedIdentity)).size === 4
    && Number.isInteger(answer)
    && answer >= 0
    && answer < 4
    && /^https:\/\//.test(String(question?.source_url || ''));
}

function parseOptionLine(line) {
  const matches = [...line.matchAll(/(?:^|\s)([A-D])[.)]\s*(.+?)(?=\s+[A-D][.)]\s*|$)/gi)];
  return matches.length < 2 ? null : matches.map((match) => match[2].trim());
}

function cleanEnglishQuestion(value) {
  return value
    .replace(/^\((?:[\d,]+|FFF)\)\s*/i, '')
    .replace(/^(?:fastest\s+finger\s+first\s+)?question\s*(?:no\.?\s*)?\d*\s*[:.)-]\s*/i, '')
    .replace(/^q\.?\s*\d+\s*[:.)-]\s*/i, '')
    .trim();
}

function categoryFor(text) {
  const value = String(text).toLowerCase();
  if (/cricket|football|tennis|olympic|sport|player|tournament|hockey|chess/.test(value)) return 'Sports';
  if (/film|actor|actress|cinema|movie|bollywood|song|director/.test(value)) return 'Cinema (Bollywood)';
  if (/constitution|parliament|president|prime minister|government|minister|lok sabha|rajya sabha/.test(value)) return 'Polity & Constitution';
  if (/river|state|city|district|mountain|country|capital|located|geograph/.test(value)) return 'Geography (India)';
  if (/science|planet|space|chemical|physics|biology|disease|organ|technology/.test(value)) return 'Science & Technology';
  if (/author|book|novel|poem|wrote|writer/.test(value)) return 'Literature & Authors';
  if (/god|goddess|ramayana|mahabharata|religion|temple|myth/.test(value)) return 'Mythology & Religion';
  if (/king|emperor|battle|dynasty|independence|century|ancient|history/.test(value)) return 'Indian History';
  if (/award|honour|prize/.test(value)) return 'Awards & Honours';
  if (/dance|festival|painting|music|culture/.test(value)) return 'Art & Culture';
  if (/company|business|bank|economy|rupee|industry/.test(value)) return 'Business & Economy';
  return 'Miscellaneous/Trivia';
}

function tagsFor(text) {
  const stop = new Set(['which', 'what', 'when', 'where', 'whose', 'these', 'following', 'from', 'with', 'that', 'this', 'have', 'does', 'name', 'called', 'into', 'most', 'first', 'known', 'used', 'according', 'india', 'indian']);
  return [...new Set(String(text).toLowerCase().match(/[a-z][a-z-]{3,}/g) || [])]
    .filter((word) => !stop.has(word)).slice(0, 5);
}

function parseIqgarageQuestions(html, metadata) {
  const lines = htmlToLines(html);
  const records = [];
  for (let index = 0; index < lines.length; index += 1) {
    const prizeMatch = lines[index].match(/^\(([\d,]+|FFF)\)\s*/i);
    const numbered = /^(?:(?:fastest\s+finger\s+first\s+)?question|q\.?)\s*(?:no\.?\s*)?\d*\s*[:.)-]/i.test(lines[index]);
    if (!prizeMatch && !numbered) continue;
    if (prizeMatch?.[1].toUpperCase() === 'FFF') continue;
    const questionText = cleanEnglishQuestion(lines[index]);
    if (questionText.length < 12 || questionText.length > 500) continue;
    let options = parseOptionLine(lines[index + 1] || '');
    let answerLineIndex = index + 2;
    if (!options) {
      const optionLines = [];
      for (let cursor = index + 1; cursor <= Math.min(index + 5, lines.length - 1); cursor += 1) {
        const match = lines[cursor].match(/^([A-D])[.)]\s*(.+)$/i);
        if (!match) break;
        optionLines.push(match[2].trim());
        answerLineIndex = cursor + 1;
      }
      if (optionLines.length === 4) options = optionLines;
    }
    if (!options || options.length !== 4) continue;
    let answer = '';
    for (let cursor = answerLineIndex; cursor <= Math.min(answerLineIndex + 4, lines.length - 1); cursor += 1) {
      const match = lines[cursor].match(/^(?:right\s+)?ans(?:wer)?\.?\s*[:.)-]\s*(.*)$/i);
      if (match) { answer = match[1].trim(); break; }
    }
    let correctOptionIndex = /^[A-D]$/i.test(answer) ? answer.toUpperCase().charCodeAt(0) - 65 : -1;
    if (correctOptionIndex < 0) {
      const normalizedAnswer = normalizedIdentity(answer);
      correctOptionIndex = options.findIndex((option) => normalizedIdentity(option).includes(normalizedAnswer));
    }
    if (correctOptionIndex < 0 || correctOptionIndex > 3) continue;
    const combined = `${questionText} ${options.join(' ')}`;
    records.push({
      id: `iqg-s${metadata.season}-e${metadata.episode}-${records.length + 1}`,
      season: metadata.season, episode: metadata.episode, air_date: metadata.airDate,
      question_text: questionText, options, correct_option_index: correctOptionIndex,
      question_type: new Set(options.map(normalizedIdentity)).size === 4 ? 'practice' : 'archive', category: categoryFor(combined), subcategory: '', difficulty_tier: '',
      prize_level_asked_at: prizeMatch ? Number(prizeMatch[1].replace(/,/g, '')) : null,
      source: 'IQgarage episode archive', source_url: metadata.url,
      source_accessed_at: new Date().toISOString().slice(0, 10), tags: tagsFor(combined),
      ladder_position: records.length + 1,
      provenance_status: 'third-party KBC transcript; answer supplied by IQgarage; not independently verified'
    });
  }
  return records;
}

function iqgarageLinks(indexHtml) {
  const markers = [
    { season: 9, marker: 'KBC Season 9' }, { season: 8, marker: 'KBC Season 8' },
    { season: 7, marker: 'KBC Season 7' }, { season: 6, marker: 'KBC Season 6' }
  ].map((item) => ({ ...item, index: indexHtml.indexOf(item.marker) }));
  const links = [];
  for (const [markerIndex, current] of markers.entries()) {
    if (current.index < 0) continue;
    const next = markers[markerIndex + 1];
    const section = indexHtml.slice(current.index, next?.index > current.index ? next.index : current.index + 70000);
    for (const match of section.matchAll(/href=["'](https?:\/\/www\.iqgarage\.com\/kbc-questions-and-answers\/[^"'#?]+)["']/gi)) {
      const url = match[1].replace(/\/$/, '') + '/';
      if (/play-|register|questions-and-answers\/$/.test(url)) continue;
      const slug = new URL(url).pathname;
      const episodeMatch = slug.match(/episode[-_ ]?(\d+)/i) || slug.match(/ep[-_ ]?(\d+)/i);
      links.push({ season: current.season, episode: Number(episodeMatch?.[1] || 0), airDate: '', url });
    }
  }
  return [...new Map(links.map((item) => [item.url, item])).values()];
}

function gksectionLinks(indexHtml) {
  const links = [];
  for (const match of indexHtml.matchAll(/href=["']([^"'#]+)["']/gi)) {
    let url;
    try { url = new URL(decodeHtml(match[1]), GKSECTION_INDEX_URL); } catch { continue; }
    if (url.hostname !== 'www.gksection.com') continue;
    const slug = url.pathname.replace(/\/$/, '');
    const seasonMatch = slug.match(/^\/kbc-(\d+)-/i);
    if (!seasonMatch || !/questions|episode/i.test(slug) || !/hindi|kbc-9-|kbc-1[4-7]-questions/i.test(slug)) continue;
    const season = Number(seasonMatch[1]);
    if (season < 9 || season > 17) continue;
    const episodeMatch = slug.match(/episode-(\d+)/i);
    links.push({ season, episode: Number(episodeMatch?.[1] || 0), airDate: '', url: `${url.origin}${slug}/` });
  }
  return [...new Map(links.map((item) => [item.url, item])).values()];
}

function parseGksectionQuestions(html, metadata) {
  const lines = htmlToLines(html);
  const records = [];
  for (let index = 0; index < lines.length; index += 1) {
    const questionMatch = lines[index].match(/^(?:Q|प्रश्न|प्रश्‍न)\s*(\d+)\s*[.:।-]\s*(.+)$/iu);
    if (!questionMatch) continue;
    const questionTextHi = questionMatch[2].trim();
    if (questionTextHi.length < 8 || questionTextHi.length > 600) continue;
    const optionMatches = [];
    let answerMatch = null;
    for (let cursor = index + 1; cursor <= Math.min(index + 16, lines.length - 1); cursor += 1) {
      if (/^(?:Q|प्रश्न|प्रश्‍न)\s*\d+\s*[.:।-]/iu.test(lines[cursor])) break;
      const option = lines[cursor].match(/^([A-D])\s*[.:.)-]\s*(.+)$/i);
      if (option) optionMatches.push([option[1].toUpperCase(), option[2].trim()]);
      const answer = lines[cursor].match(/^(?:उत्तर|Answer)\s*:\s*([A-D])\s*[.:)]?/iu);
      if (answer) { answerMatch = answer; break; }
    }
    if (optionMatches.length !== 4 || !answerMatch) continue;
    if (optionMatches.some(([letter], optionIndex) => letter.charCodeAt(0) - 65 !== optionIndex)) continue;
    const optionsHi = optionMatches.map(([, value]) => value);
    const correctOptionIndex = answerMatch[1].toUpperCase().charCodeAt(0) - 65;
    const canonicalKey = `gks-${normalizedIdentity(new URL(metadata.url).pathname)}-${records.length + 1}`;
    records.push({
      id: canonicalKey, canonical_key: canonicalKey, season: metadata.season, episode: metadata.episode || null,
      air_date: metadata.airDate, question_text: questionTextHi, options: optionsHi,
      question_text_hi: questionTextHi, options_hi: optionsHi, correct_option_index: correctOptionIndex,
      question_type: 'translation_pending', category: 'Miscellaneous/Trivia', subcategory: '',
      difficulty_tier: '', prize_level_asked_at: null,
      source: 'GKSection Hindi KBC archive', source_url: metadata.url,
      source_accessed_at: new Date().toISOString().slice(0, 10), tags: [], ladder_position: records.length + 1,
      language_original: 'hi', translation_status: 'pending on-device English translation',
      provenance_status: 'third-party KBC transcript; answer supplied by source; English translation pending'
    });
  }
  return records;
}

function prepareReviewedQuestion(question) {
  const combined = `${question.question_text} ${(question.options || []).join(' ')}`;
  return {
    air_date: null, subcategory: '', prize_level_asked_at: null,
    source_accessed_at: new Date().toISOString().slice(0, 10), tags: tagsFor(combined), ...question,
    question_type: 'practice', source: 'GKSection translated KBC archive', language_original: 'hi',
    translation_status: 'reviewed English translation',
    provenance_status: 'third-party KBC transcript; English translation reviewed; answer supplied by source'
  };
}

async function fetchText(url, label) {
  const response = await fetch(url, { headers: { 'user-agent': 'FactFlow corpus updater/15 (+https://github.com/axionaut/FactFlow)' } });
  if (!response.ok) throw new Error(`${label} returned ${response.status}`);
  return response.text();
}

function eligibleForRetry(page) {
  if (!page) return true;
  if (!page.last_attempted_at) return false;
  const elapsed = Date.now() - Date.parse(`${page.last_attempted_at}T00:00:00Z`);
  return Number.isFinite(elapsed) && elapsed >= 7 * 24 * 60 * 60 * 1000;
}

async function main() {
  let previousCorpus = { questions: [], pages: [], translation_pages: [] };
  try { previousCorpus = JSON.parse(await readFile(OUTPUT_PATH, 'utf8')); } catch { /* First run. */ }
  const reviewedPayload = JSON.parse(await readFile(REVIEWED_TRANSLATIONS_PATH, 'utf8'));
  const reviewedQuestions = (reviewedPayload.questions || []).map(prepareReviewedQuestion);
  const reviewedUrls = new Set(reviewedQuestions.map((question) => question.source_url));
  const questions = (previousCorpus.questions || [])
    .map((question) => question.source === 'IQgarage episode archive' && hasPlayableStructure(question)
      ? {
          ...question,
          question_type: 'practice',
          provenance_status: 'third-party KBC transcript; answer supplied by IQgarage; not independently verified'
        }
      : question)
    .filter((question) => !REMOVED_SOURCES.has(question.source))
    .filter((question) => question.translation_status !== 'reviewed English translation')
    .filter((question) => question.source !== 'Wikidata structured facts'
      || Number(question.source_schema_version) === WIKIDATA_SOURCE_VERSION);
  const fallbackAttemptDate = String(previousCorpus.generated_at || new Date().toISOString()).slice(0, 10);
  const withAttemptDate = (page) => (page.status !== 'reviewed' && !(Number(page.status) >= 200 && Number(page.status) < 300 && Number(page.questions) > 0) && !page.last_attempted_at)
    ? { ...page, last_attempted_at: fallbackAttemptDate }
    : page;
  const pageMap = new Map((previousCorpus.pages || []).map(withAttemptDate).map((page) => [page.url, page]));
  const translationPageMap = new Map((previousCorpus.translation_pages || []).map(withAttemptDate).map((page) => [page.url, page]));
  let wikidataState = Number(previousCorpus.wikidata_source_version) === WIKIDATA_SOURCE_VERSION
    ? previousCorpus.wikidata_state || {}
    : {};
  for (const url of reviewedUrls) {
    const pageQuestions = reviewedQuestions.filter((question) => question.source_url === url);
    translationPageMap.set(url, { season: pageQuestions[0]?.season || null, episode: pageQuestions[0]?.episode || null,
      url, status: 'reviewed', questions: pageQuestions.length });
  }

  if (!OFFLINE) {
    try {
      const known = new Set([...pageMap.values()].filter((page) => Number(page.status) >= 200 && Number(page.status) < 300 && Number(page.questions) > 0).map((page) => page.url));
      const links = iqgarageLinks(await fetchText(IQGARAGE_INDEX_URL, 'IQgarage index'))
        .filter((link) => !known.has(link.url) && eligibleForRetry(pageMap.get(link.url)))
        .slice(0, MAX_NEW_IQGARAGE_PAGES);
      for (const [position, link] of links.entries()) {
        try {
          const extracted = parseIqgarageQuestions(await fetchText(link.url, 'IQgarage page'), link);
          questions.push(...extracted); pageMap.set(link.url, { ...link, status: 200, questions: extracted.length, last_attempted_at: new Date().toISOString().slice(0, 10) });
        } catch (error) { pageMap.set(link.url, { ...link, status: 0, questions: 0, error: error.message, last_attempted_at: new Date().toISOString().slice(0, 10) }); }
        process.stdout.write(`\r${position + 1}/${links.length} new IQgarage pages`);
      }
    } catch (error) { console.warn(`IQgarage refresh unavailable: ${error.message}`); }

    try {
      const known = new Set([...translationPageMap.values()]
        .filter((page) => page.status === 'reviewed' || (Number(page.status) >= 200 && Number(page.status) < 300 && Number(page.questions) > 0))
        .map((page) => page.url));
      const links = gksectionLinks(await fetchText(GKSECTION_INDEX_URL, 'GKSection index'))
        .filter((link) => !known.has(link.url) && eligibleForRetry(translationPageMap.get(link.url)))
        .slice(0, MAX_NEW_GKSECTION_PAGES);
      for (const [position, link] of links.entries()) {
        try {
          const extracted = parseGksectionQuestions(await fetchText(link.url, 'GKSection page'), link);
          questions.push(...extracted); translationPageMap.set(link.url, { ...link, status: 200, questions: extracted.length, last_attempted_at: new Date().toISOString().slice(0, 10) });
        } catch (error) { translationPageMap.set(link.url, { ...link, status: 0, questions: 0, error: error.message, last_attempted_at: new Date().toISOString().slice(0, 10) }); }
        process.stdout.write(`\r${position + 1}/${links.length} new GKSection pages`);
      }
    } catch (error) { console.warn(`GKSection refresh unavailable: ${error.message}`); }

    const wikidata = await gatherWikidataQuestions(wikidataState, { batchSize: WIKIDATA_BATCH_SIZE });
    questions.push(...wikidata.questions);
    wikidataState = wikidata.state;
    if (wikidata.errors.length) console.warn(`Wikidata refresh warnings: ${wikidata.errors.join('; ')}`);
    process.stdout.write(`\nWikidata supplied ${wikidata.questions.length} playable questions.`);
  }

  const reviewedQuestionTexts = new Set(reviewedQuestions.map((question) => normalizedIdentity(question.question_text)));
  const sourceQuestions = questions.map((question) => question.source === 'IQgarage episode archive'
      && reviewedQuestionTexts.has(normalizedIdentity(question.question_text))
    ? {
        ...question,
        question_type: 'archive',
        provenance_status: 'third-party KBC transcript; duplicate of a validated English question; retained as pattern evidence'
      }
    : question);
  const combinedQuestions = [...new Map([...sourceQuestions, ...reviewedQuestions].map((question) => [questionIdentity(question), question])).values()];
  const previousKeys = new Set((previousCorpus.questions || []).map(questionIdentity));
  const addedQuestions = combinedQuestions.filter((question) => !previousKeys.has(questionIdentity(question)));
  const removedGenericCount = (previousCorpus.questions || []).filter((question) => REMOVED_SOURCES.has(question.source)).length;
  const pages = [...pageMap.values()];
  const translationPages = [...translationPageMap.values()];
  const seasons = [...new Set(combinedQuestions.map((question) => Number(question.season)).filter(Boolean))].sort((a, b) => a - b);
  const coverage = seasons.map((season) => {
    const seasonQuestions = combinedQuestions.filter((question) => Number(question.season) === season);
    return { season, questions: seasonQuestions.length,
      playable: seasonQuestions.filter((question) => question.question_type === 'practice').length,
      pending_translation: seasonQuestions.filter((question) => question.question_type === 'translation_pending').length,
      pages: new Set(seasonQuestions.map((question) => question.source_url).filter(Boolean)).size };
  });
  const payload = {
    schema_version: 3, generated_at: new Date().toISOString(),
    corpus_scope: 'India-first KBC practice combining historical KBC archives with accumulating structured facts; not an official Sony corpus.',
    sources: [
      { name: 'GKSection Hindi KBC archive', url: GKSECTION_INDEX_URL, license: 'No explicit reuse license found; retain original Hindi, attribution, and source URL. Permission is required for public redistribution.' },
      { name: 'IQgarage KBC Questions and Answers', url: IQGARAGE_INDEX_URL, license: 'No explicit reuse license found. Structurally valid records are playable with source-supplied answers and attribution; malformed or duplicate records remain archive-only. Permission is required for public redistribution.' },
      { name: 'Wikidata structured facts', url: 'https://www.wikidata.org/wiki/Wikidata:Data_access', license: 'Structured data is available under CC0. FactFlow generates four-option practice questions from same-type facts and retains entity links.' },
      { name: 'SonyLIV KBC Play Along', url: 'https://origin-staticv2.sonyliv.com/UI_icons/KBC_Hindi_Terms/KBC16_PAG_FAQ.pdf', license: 'Official provenance reference only; SonyLIV content is not scraped or bundled.' }
    ],
    coverage, fresh_questions: addedQuestions.filter((question) => question.question_type === 'practice').length,
    playable_questions: combinedQuestions.filter((question) => question.question_type === 'practice').length,
    translation_pending: combinedQuestions.filter((question) => question.question_type === 'translation_pending').length,
    removed_generic_questions: removedGenericCount, pages, translation_pages: translationPages,
    wikidata_source_version: WIKIDATA_SOURCE_VERSION, wikidata_state: wikidataState, questions: combinedQuestions
  };
  const previousComparable = JSON.stringify({ questions: previousCorpus.questions || [], pages: previousCorpus.pages || [],
    translation_pages: previousCorpus.translation_pages || [], wikidata_source_version: previousCorpus.wikidata_source_version || 0,
    wikidata_state: previousCorpus.wikidata_state || {}, sources: previousCorpus.sources || [] });
  const nextComparable = JSON.stringify({ questions: payload.questions, pages: payload.pages,
    translation_pages: payload.translation_pages, wikidata_source_version: payload.wikidata_source_version,
    wikidata_state: payload.wikidata_state, sources: payload.sources });
  if (!OFFLINE && previousComparable === nextComparable) {
    process.stdout.write('\nNo corpus changes; bundled data left untouched.\n'); return;
  }
  await mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  process.stdout.write(`\nWrote ${combinedQuestions.length} questions (${addedQuestions.length} added, ${removedGenericCount} generic trivia removed) to ${OUTPUT_PATH.pathname}\n`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

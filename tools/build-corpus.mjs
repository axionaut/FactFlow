import { mkdir, readFile, writeFile } from 'node:fs/promises';

const INDEX_URL = 'https://www.iqgarage.com/kbc-questions-and-answers/';
const TRIVIA_URL = 'https://opentdb.com/api.php?amount=50&type=multiple';
const TRIVIA_API_URL = 'https://the-trivia-api.com/v2/questions?limit=50';
const OUTPUT_PATH = new URL('../data/kbc-corpus.json', import.meta.url);

function decodeHtml(value) {
  if (/[Ãâ]/.test(value)) {
    value = Buffer.from(value, 'latin1').toString('utf8');
  }
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#039;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/â€™/g, '’')
    .replace(/â€œ|â€/g, '"')
    .replace(/Â/g, '');
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

function cleanQuestion(value) {
  return value
    .replace(/^\((?:[\d,]+|FFF)\)\s*/i, '')
    .replace(/^(?:fastest\s+finger\s+first\s+)?question\s*(?:no\.?\s*)?\d*\s*[:.)-]\s*/i, '')
    .replace(/^q\.?\s*\d+\s*[:.)-]\s*/i, '')
    .trim();
}

function parseOptionLine(line) {
  const matches = [...line.matchAll(/(?:^|\s)([A-D])[.)]\s*(.+?)(?=\s+[A-D][.)]\s*|$)/gi)];
  if (matches.length < 2) return null;
  return matches.map((match) => match[2].trim());
}

function categoryFor(text) {
  const value = text.toLowerCase();
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
  const stop = new Set(['which', 'what', 'when', 'where', 'whose', 'these', 'following', 'from', 'with', 'that', 'this', 'have', 'does', 'name', 'called', 'india', 'indian']);
  return [...new Set(text.toLowerCase().match(/[a-z][a-z-]{3,}/g) || [])]
    .filter((word) => !stop.has(word))
    .slice(0, 5);
}

function isKbcCompatible(text, category = '') {
  const value = `${text} ${category}`.toLowerCase();
  return !/anime|manga|video game|gaming|xbox|playstation|nintendo|minecraft|fortnite|club penguin|superhero|comic book|cartoon|role-playing game|mmorpg/.test(value);
}

function shuffleOptions(options, correctAnswer) {
  const shuffled = [...options].sort(() => Math.random() - 0.5);
  return { options: shuffled, correctOptionIndex: shuffled.indexOf(correctAnswer) };
}

async function fetchFreshTrivia() {
  const response = await fetch(TRIVIA_URL);
  if (!response.ok) throw new Error(`Trivia API returned ${response.status}`);
  const payload = await response.json();
  if (payload.response_code !== 0 || !Array.isArray(payload.results)) return [];

  return payload.results.map((item, index) => {
    const questionText = decodeHtml(item.question);
    const correctAnswer = decodeHtml(item.correct_answer);
    const { options, correctOptionIndex } = shuffleOptions([
      correctAnswer,
      ...item.incorrect_answers.map((answer) => decodeHtml(answer))
    ], correctAnswer);
    const combined = `${questionText} ${options.join(' ')}`;
    return {
      id: `trivia-${Date.now()}-${index + 1}`,
      season: null,
      episode: null,
      air_date: new Date().toISOString().slice(0, 10),
      question_text: questionText,
      options,
      correct_option_index: correctOptionIndex,
      question_type: 'practice',
      category: item.category === 'Science: Computers' ? 'Science & Technology' : 'Miscellaneous/Trivia',
      subcategory: item.category,
      difficulty_tier: item.difficulty === 'hard' ? 'Tier 4' : item.difficulty === 'medium' ? 'Tier 2' : 'Tier 1',
      prize_level_asked_at: null,
      source: 'Open Trivia DB',
      source_url: 'https://opentdb.com/',
      source_accessed_at: new Date().toISOString().slice(0, 10),
      tags: tagsFor(combined),
      seen_count: 0,
      last_correct: null,
      ladder_position: null,
      provenance_status: 'public trivia API; answer supplied by source'
    };
  }).filter((question) => isKbcCompatible(question.question_text, question.subcategory));
}

async function fetchTheTriviaApi() {
  const response = await fetch(TRIVIA_API_URL);
  if (!response.ok) throw new Error(`The Trivia API returned ${response.status}`);
  const results = await response.json();
  if (!Array.isArray(results)) return [];

  return results.map((item, index) => {
    const questionText = decodeHtml(item.question?.text || '');
    const correctAnswer = decodeHtml(item.correctAnswer || '');
    const { options, correctOptionIndex } = shuffleOptions([
      correctAnswer,
      ...(item.incorrectAnswers || []).map((answer) => decodeHtml(answer))
    ], correctAnswer);
    const combined = `${questionText} ${options.join(' ')}`;
    return {
      id: `trivia-api-${Date.now()}-${index + 1}`,
      season: null,
      episode: null,
      air_date: new Date().toISOString().slice(0, 10),
      question_text: questionText,
      options,
      correct_option_index: correctOptionIndex,
      question_type: 'practice',
      category: 'Miscellaneous/Trivia',
      subcategory: item.category || '',
      difficulty_tier: item.difficulty === 'hard' ? 'Tier 4' : item.difficulty === 'medium' ? 'Tier 2' : 'Tier 1',
      prize_level_asked_at: null,
      source: 'The Trivia API',
      source_url: 'https://the-trivia-api.com/',
      source_accessed_at: new Date().toISOString().slice(0, 10),
      tags: tagsFor(combined),
      seen_count: 0,
      last_correct: null,
      ladder_position: null,
      provenance_status: 'public trivia API; answer supplied by source'
    };
  }).filter((question) => question.question_text && question.options.length === 4 && question.correct_option_index >= 0 && isKbcCompatible(question.question_text, question.subcategory));
}

function parseQuestions(html, metadata) {
  const lines = htmlToLines(html);
  const records = [];
  for (let index = 0; index < lines.length; index += 1) {
    const prizeMatch = lines[index].match(/^\(([\d,]+|FFF)\)\s*/i);
    const numberedQuestion = /^(?:(?:fastest\s+finger\s+first\s+)?question|q\.?)\s*(?:no\.?\s*)?\d*\s*[:.)-]/i.test(lines[index]);
    if (!prizeMatch && !numberedQuestion) continue;
    if (prizeMatch?.[1].toUpperCase() === 'FFF') continue;
    const questionText = cleanQuestion(lines[index]);
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
      if (match) {
        answer = match[1].trim();
        break;
      }
    }
    let correctOptionIndex = /^[A-D]$/i.test(answer) ? answer.toUpperCase().charCodeAt(0) - 65 : -1;
    if (correctOptionIndex < 0) {
      const normalizedAnswer = answer.toLowerCase().replace(/[^a-z0-9]/g, '');
      correctOptionIndex = options.findIndex((option) => option.toLowerCase().replace(/[^a-z0-9]/g, '').includes(normalizedAnswer));
    }
    if (correctOptionIndex < 0 || correctOptionIndex > 3) continue;

    const combined = `${questionText} ${options.join(' ')}`;
    records.push({
      id: `iqg-s${metadata.season}-e${metadata.episode}-${records.length + 1}`,
      season: metadata.season,
      episode: metadata.episode,
      air_date: metadata.airDate,
      question_text: questionText,
      options,
      correct_option_index: correctOptionIndex,
      question_type: 'archive',
      category: categoryFor(combined),
      subcategory: '',
      difficulty_tier: '',
      prize_level_asked_at: prizeMatch ? Number(prizeMatch[1].replace(/,/g, '')) : null,
      source: 'IQgarage episode archive',
      source_url: metadata.url,
      source_accessed_at: new Date().toISOString().slice(0, 10),
      tags: tagsFor(combined),
      seen_count: 0,
      last_correct: null,
      ladder_position: records.length + 1,
      provenance_status: 'third-party transcript; answer not independently verified'
    });
  }
  return records;
}

function archiveLinks(indexHtml) {
  const startMarkers = [
    { season: 9, marker: 'KBC Season 9' },
    { season: 8, marker: 'KBC Season 8' },
    { season: 7, marker: 'KBC Season 7' },
    { season: 6, marker: 'KBC Season 6' }
  ].map((item) => ({ ...item, index: indexHtml.indexOf(item.marker) }));
  const links = [];
  for (let markerIndex = 0; markerIndex < startMarkers.length; markerIndex += 1) {
    const current = startMarkers[markerIndex];
    const next = startMarkers[markerIndex + 1];
    const section = indexHtml.slice(current.index, next?.index > current.index ? next.index : current.index + 70000);
    for (const match of section.matchAll(/href=["'](https?:\/\/www\.iqgarage\.com\/kbc-questions-and-answers\/[^"'#?]+)["']/gi)) {
      const url = match[1].replace(/\/$/, '') + '/';
      if (/play-|register|questions-and-answers\/$/.test(url)) continue;
      const slug = new URL(url).pathname;
      const episodeMatch = slug.match(/episode[-_ ]?(\d+)/i) || slug.match(/ep[-_ ]?(\d+)/i);
      const dateMatch = slug.match(/(january|february|march|april|may|june|july|august|september|october|november|december)[-_](\d{1,2})/i);
      links.push({ season: current.season, episode: Number(episodeMatch?.[1] || 0), airDate: '', url, dateMatch });
    }
  }
  return [...new Map(links.map((item) => [item.url, item])).values()];
}

async function main() {
  let previousCorpus = { questions: [], pages: [] };
  try {
    previousCorpus = JSON.parse(await readFile(OUTPUT_PATH, 'utf8'));
  } catch {
    // First run starts with an empty corpus.
  }

  const indexResponse = await fetch(INDEX_URL);
  if (!indexResponse.ok) throw new Error(`Archive index returned ${indexResponse.status}`);
  const links = archiveLinks(await indexResponse.text());
  const knownPages = new Set((previousCorpus.pages || []).map((page) => page.url));
  const newLinks = links.filter((link) => !knownPages.has(link.url));
  const questions = (previousCorpus.questions || []).map((question) => ({
    ...question,
    question_type: question.source === 'Open Trivia DB' || question.source === 'The Trivia API' ? 'practice' : 'archive'
  }));
  const pages = [...(previousCorpus.pages || [])];
  for (const [position, link] of newLinks.entries()) {
    const response = await fetch(link.url);
    if (!response.ok) {
      pages.push({ ...link, status: response.status, questions: 0 });
      continue;
    }
    const extracted = parseQuestions(await response.text(), link);
    questions.push(...extracted);
    pages.push({ season: link.season, episode: link.episode, url: link.url, status: response.status, questions: extracted.length });
    process.stdout.write(`\r${position + 1}/${newLinks.length} new pages; ${questions.length} questions`);
  }

  const deduped = [...new Map(questions.map((question) => [question.question_text.toLowerCase().replace(/[^a-z0-9]/g, ''), question])).values()];
  const freshTrivia = [];
  for (const gather of [fetchFreshTrivia, fetchTheTriviaApi]) {
    try {
      freshTrivia.push(...await gather());
    } catch (error) {
      console.warn(`Fresh trivia source unavailable: ${error.message}`);
    }
  }
  const combinedQuestions = [...new Map([...deduped, ...freshTrivia]
    .filter((question) => question.question_type !== 'practice' || isKbcCompatible(question.question_text, question.subcategory))
    .map((question) => [question.question_text.toLowerCase().replace(/[^a-z0-9]/g, ''), question])).values()];
  const payload = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    corpus_scope: 'Public KBC archive plus freshly gathered general-knowledge questions; not an official Sony corpus.',
    sources: [
      { name: 'IQgarage KBC Questions and Answers', url: INDEX_URL, license: 'No explicit reuse license found; retain attribution and review before redistribution.' },
      { name: 'Open Trivia DB', url: 'https://opentdb.com/', license: 'CC BY-SA 4.0; retain attribution.' }
      , { name: 'The Trivia API', url: 'https://the-trivia-api.com/', license: 'Check source terms before redistribution.' }
    ],
    coverage: [6, 7, 8, 9].map((season) => ({ season, questions: deduped.filter((item) => item.season === season).length, pages: pages.filter((item) => item.season === season && item.questions > 0).length })),
    fresh_questions: freshTrivia.length,
    pages,
    questions: combinedQuestions
  };
  await mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  process.stdout.write(`\nWrote ${combinedQuestions.length} questions (${freshTrivia.length} fresh) to ${OUTPUT_PATH.pathname}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// Derives a KBC question profile from the scraped archive.
// The archive is NEVER a source of practice questions: questions already asked
// on KBC will not be asked again. It exists only to teach the app what KBC asks,
// so fresh questions can be generated to match that shape.

const ARCHIVE_SOURCES = new Set([
  'IQgarage episode archive',
  'GKSection Hindi KBC archive',
  'GKSection translated KBC archive'
]);

export function isArchiveQuestion(question) {
  return ARCHIVE_SOURCES.has(question?.source);
}

// KBC's dominant shape is set membership ("Which of these four is X?"),
// not attribute lookup ("What is the capital of X?"). Generators are weighted
// toward whichever shape the archive actually favours.
export function questionShape(text) {
  const value = String(text || '').toLowerCase();
  if (/which of (these|the following)|who among|which one of/.test(value)) return 'membership';
  if (/^(in |on |at )?wh(ich|ere|o|at|ose)\b/.test(value)) return 'lookup';
  return 'statement';
}

function share(counts) {
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0) || 1;
  return Object.fromEntries(
    Object.entries(counts)
      .map(([key, value]) => [key, Number((value / total).toFixed(4))])
      .sort((first, second) => second[1] - first[1])
  );
}

// Prize level is KBC's own difficulty signal; map it onto the app's tiers.
export function tierForPrize(prize) {
  const value = Number(prize) || 0;
  if (!value) return 'Tier 2';
  if (value <= 5000) return 'Tier 1';
  if (value <= 80000) return 'Tier 2';
  if (value <= 1250000) return 'Tier 3';
  return 'Tier 4';
}

export function buildPatternProfile(questions = []) {
  const archive = questions.filter(isArchiveQuestion);
  const categories = {};
  const shapes = {};
  const tiers = {};
  for (const question of archive) {
    const category = question.category || 'Miscellaneous/Trivia';
    categories[category] = (categories[category] || 0) + 1;
    const shape = questionShape(question.question_text);
    shapes[shape] = (shapes[shape] || 0) + 1;
    const tier = tierForPrize(question.prize_level_asked_at);
    tiers[tier] = (tiers[tier] || 0) + 1;
  }
  return {
    derived_from: archive.length,
    derived_at: new Date().toISOString(),
    note: 'Archive questions are pattern evidence only and are never served as practice.',
    category_mix: share(categories),
    shape_mix: share(shapes),
    tier_mix: share(tiers)
  };
}

// How far each category is from its KBC-representative share, given what the
// practice pool currently holds. Positive means the pool is under-supplied.
export function categoryGaps(profile, practiceQuestions = []) {
  const have = {};
  for (const question of practiceQuestions) {
    const category = question.category || 'Miscellaneous/Trivia';
    have[category] = (have[category] || 0) + 1;
  }
  const total = practiceQuestions.length || 1;
  return Object.entries(profile?.category_mix || {})
    .map(([category, target]) => ({
      category,
      target,
      actual: Number(((have[category] || 0) / total).toFixed(4)),
      gap: Number((target - (have[category] || 0) / total).toFixed(4))
    }))
    .sort((first, second) => second.gap - first.gap);
}

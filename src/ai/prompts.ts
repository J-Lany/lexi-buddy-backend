export type LevelCode = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type AgeGroupCode = 'child' | 'teenager' | 'adult';

type TrainingLevel = 'beginner' | 'intermediate' | 'advanced';
type TrainingAgeGroup = 'child' | 'teenager' | 'adult';

export type TrainingTypeKey =
  | 'definition_quiz'
  | 'gap_filling'
  | 'phrase_fail'
  | 'collocation_check';

export type LangContext = {
  targetLanguage?: string | null;
  nativeLanguage?: string | null;
  instructionLanguage?: string | null;
};

const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  english: 'English',
  spanish: 'Spanish',
  french: 'French',
  german: 'German',
  italian: 'Italian',
  chinese: 'Chinese',
  japanese: 'Japanese',
  korean: 'Korean',
  turkish: 'Turkish',
  kazakh: 'Kazakh',
  russian: 'Russian',
};

export function getLanguageDisplayName(language?: string | null): string {
  if (!language) return 'English';
  return LANGUAGE_DISPLAY_NAMES[language.toLowerCase()] ?? 'English';
}

function resolveInstructionLanguageName(ctx: LangContext): string {
  const isTarget = ctx.instructionLanguage === 'target';
  return isTarget
    ? getLanguageDisplayName(ctx.targetLanguage)
    : getLanguageDisplayName(ctx.nativeLanguage);
}

export function mapLevelToTraining(
  level?: string | null,
): TrainingLevel | undefined {
  if (!level) return undefined;
  const l = level.toUpperCase() as LevelCode;
  if (l === 'A1' || l === 'A2') return 'beginner';
  if (l === 'B1' || l === 'B2') return 'intermediate';
  if (l === 'C1' || l === 'C2') return 'advanced';
  return undefined;
}

function buildTrainingPrompt(
  level: TrainingLevel,
  ageGroup: TrainingAgeGroup,
  targetLangName: string,
  instructionLangName: string,
): string {
  const levelDescriptions: Record<TrainingLevel, string> = {
    beginner: 'a beginner-level',
    intermediate: 'an intermediate-level',
    advanced: 'an advanced-level',
  };

  const ageDescriptions: Record<TrainingAgeGroup, string> = {
    child: 'a child',
    teenager: 'a teenager',
    adult: 'an adult',
  };

  const styleByAge: Record<TrainingAgeGroup, Record<TrainingLevel, string>> = {
    child: {
      beginner: `Use only simple, short sentences and clear language appropriate for kids. Choose topics and examples relevant and interesting for children.`,
      intermediate: `Use clear language and vocabulary around intermediate level, appropriate for kids. Choose topics and examples relevant and interesting for children.`,
      advanced: `Use diverse but still clear language appropriate for kids. Choose topics and examples relevant and interesting for children.`,
    },
    teenager: {
      beginner: `Use simple, short sentences and clear language. Choose topics and examples relevant and interesting for teenagers.`,
      intermediate: `Use modern, clear ${targetLangName} at intermediate level. Choose topics and examples relevant and interesting for teenagers.`,
      advanced: `Use diverse, sophisticated, but clear and modern ${targetLangName}. Choose topics and examples relevant and interesting for teenagers.`,
    },
    adult: {
      beginner: `Use simple, short sentences and clear language. Choose topics and examples relevant and interesting for adults.`,
      intermediate: `Use modern, clear ${targetLangName} at intermediate level. Choose topics and examples relevant and interesting for adults.`,
      advanced: `Use diverse, sophisticated, but clear and modern ${targetLangName}. Choose topics and examples relevant and interesting for adults.`,
    },
  };

  return `I am ${ageDescriptions[ageGroup]} and ${levelDescriptions[level]} student of ${targetLangName}. Write all instructions, questions, and explanations in ${instructionLangName}. ${styleByAge[ageGroup][level]}`;
}

export function getTrainingPrompt(params: {
  level?: string | null;
  ageGroup?: string | null;
  langContext: LangContext;
}): string | undefined {
  const trainingLevel = mapLevelToTraining(params.level);
  const trainingAgeGroup = params.ageGroup as AgeGroupCode;

  if (!trainingLevel || !trainingAgeGroup) return undefined;

  const targetLangName = getLanguageDisplayName(
    params.langContext.targetLanguage,
  );
  const instructionLangName = resolveInstructionLanguageName(
    params.langContext,
  );

  return buildTrainingPrompt(
    trainingLevel,
    trainingAgeGroup,
    targetLangName,
    instructionLangName,
  );
}

export function getTranslatePrompt(
  words: string[],
  meta?: {
    topic?: string;
    level?: string | null;
    ageGroup?: string | null;
    langContext?: LangContext;
  },
): string {
  const ctx: LangContext = meta?.langContext ?? {};
  const targetLangName = getLanguageDisplayName(ctx.targetLanguage);
  const nativeLangName = getLanguageDisplayName(ctx.nativeLanguage);

  const profile = getTrainingPrompt({
    level: meta?.level,
    ageGroup: meta?.ageGroup,
    langContext: ctx,
  });

  const topicPart = meta?.topic
    ? `The overall topic/context is: ${meta.topic}.\nUse translations and synonyms that are natural in this context.`
    : '';

  return `
${profile ?? ''}
You are helping a ${targetLangName} teacher prepare vocabulary for learners.

For each phrase:
1. Correct spelling if needed (the phrase is in ${targetLangName}).
2. Provide the most accurate and natural ${nativeLangName} translation (idiomatic if needed, not word-for-word).
3. Provide 0–3 very simple ${targetLangName} synonyms that a learner at this level could understand.

${topicPart}

Return ONLY a JSON array, no other text. Each element MUST be:

{
  "term": "original ${targetLangName} phrase",
  "translation": "${nativeLangName} translation",
  "synonyms": ["simple ${targetLangName} synonym 1", "simple ${targetLangName} synonym 2", ...]
}

If there are no good simple synonyms, use an empty array [].

Target phrases:
${words.map((w) => `- ${w}`).join('\n')}
  `.trim();
}

export const trainingTypePrompts: Record<TrainingTypeKey, string> = {
  definition_quiz: `
You are creating multiple-choice questions that test the meaning of target phrases.

For each target phrase:
- Create exactly ONE question.

CRITICAL OUTPUT RULES:
- Use "multiple_choice" as questionType.
- "question" should focus on meaning/definition. Keep it short and clear.
- "answers" MUST contain EXACTLY 3 options:
  - 1 correct definition (isCorrect: true)
  - 2 plausible but incorrect definitions (isCorrect: false)
- Do NOT include "A/B/C" labels or numbering inside answer texts.
- The incorrect options must be believable (not silly), but clearly wrong.

LEVEL ADAPTATION:
- Beginner: very simple wording, very common vocabulary, no complicated grammar.
- Intermediate: clear modern language, slightly richer vocabulary, still learner-friendly.
- Advanced: natural modern language, more nuanced definitions, still clear.

OUTPUT QUALITY:
- Avoid trick questions.
- Avoid rare idioms unless the target phrase itself is rare.
- Explanation must be short (1–2 sentences) and learner-friendly.
`.trim(),

  gap_filling: `
You are creating gap-filling questions where the student types the missing phrase.

For each target phrase:
- Write ONE natural sentence that clearly shows the phrase in context.
- Replace the target phrase (or its core part) with a gap "____".
- The sentence must make the intended meaning obvious.

CRITICAL OUTPUT RULES:
- Use "gap_fill" as questionType.
- "question" MUST be the full sentence containing exactly ONE "____". The sentence MUST be written in the TARGET language (the language being learned), NOT in the instruction language.
- "answers" MUST contain EXACTLY 1 answer object:
  - text = the missing target phrase (the correct fill)
  - isCorrect = true
- Do NOT include any wrong answer options.
- Do NOT include multiple gaps.
- Do NOT add hints like "(use …)" inside the question.

LEVEL ADAPTATION:
- Beginner: short sentence, very simple surrounding words.
- Intermediate: natural everyday sentence, clear context.
- Advanced: natural, slightly richer context, still unambiguous.

EXPLANATION:
- 1–2 short sentences:
  - why the phrase fits this context
  - optionally a quick meaning reminder (simple)
`.trim(),

  phrase_fail: `
You are creating multiple-choice questions where the learner must identify INCORRECT usage of a target phrase.

For each target phrase:
- Write EXACTLY THREE standalone sentences that include the target phrase.
  - 2 sentences use the phrase correctly (natural grammar + correct meaning).
  - 1 sentence uses the phrase incorrectly.

IMPORTANT: The incorrect sentence should be wrong mainly because of meaning/context (wrong usage),
not because of a tiny grammar detail.

CRITICAL OUTPUT RULES:
- Use "multiple_choice" as questionType.
- "question" MUST be a short instruction only. Do NOT include the sentences in "question".
- "answers" MUST contain EXACTLY 3 answers.
- Each answer "text" MUST be ONE sentence only.
- Do NOT number the sentences and do NOT prefix with A/B/C.
- Exactly ONE answer must have isCorrect: true — it MUST be the incorrect sentence.
- The two correct sentences must be different (not near-duplicates).

LEVEL ADAPTATION:
- Beginner: keep sentences short; make the incorrect usage obviously wrong by meaning (not grammar traps).
- Intermediate: natural sentences; the incorrect one should still be clearly wrong.
- Advanced: can be a bit more nuanced, but still clearly wrong.

EXPLANATION:
- 1–2 short sentences:
  - briefly explain why the incorrect one is wrong
  - briefly explain what the phrase actually means / how it's used
`.trim(),

  collocation_check: `
You are creating collocation practice for a target phrase where the student types the missing phrase.

For each target phrase:
- Create 3–4 short collocations or mini-sentences.
- In EACH line, replace the target phrase with a gap "____".
- All lines must fit the SAME missing phrase naturally.
- Keep each line short and clear.

CRITICAL OUTPUT RULES:
- Use "open_text" as questionType.
- "question" MUST contain the 3–4 lines, each on a NEW line.
- Each line MUST contain exactly ONE "____".
- "answers" MUST contain EXACTLY 1 answer object:
  - text = the target phrase that fits the lines
  - isCorrect = true
- Do NOT include any wrong answer options.
- Do NOT include extra commentary outside the JSON fields.

LEVEL ADAPTATION:
- Beginner: very common collocations, very short lines, simple surrounding words.
- Intermediate: natural everyday collocations, still clear.
- Advanced: richer collocations, but still unambiguous.

EXPLANATION:
- 1–2 short sentences:
  - explain why the phrase fits these collocations
  - optionally clarify the meaning briefly
`.trim(),
};

export function getAssignmentPrompt(params: {
  trainingType: TrainingTypeKey;
  terms: string[];
  questionsCount: number;
  topic?: string;
  level?: string | null;
  ageGroup?: string | null;
  langContext: LangContext;
}): string {
  const {
    trainingType,
    terms,
    questionsCount,
    topic,
    level,
    ageGroup,
    langContext,
  } = params;

  const targetLangName = getLanguageDisplayName(langContext.targetLanguage);
  const instructionLangName = resolveInstructionLanguageName(langContext);
  const profile = getTrainingPrompt({ level, ageGroup, langContext });
  const typePrompt = trainingTypePrompts[trainingType];

  const topicPart = topic
    ? `Lesson/topic: ${topic}. Use examples and contexts that fit this topic.`
    : '';

  const termsList = terms.map((t) => `- ${t}`).join('\n');

  return `
${profile ?? ''}

You are a ${targetLangName} teaching assistant.
All instructions, questions, and explanations MUST be written in ${instructionLangName}.
Create ${questionsCount} exercise items in STRICT JSON.

${topicPart}

Exercise type key: ${trainingType}
Target phrases (in ${targetLangName}):
${termsList}

COUNT RULES:
- Return EXACTLY ${questionsCount} questions.
- Prefer 1 question per target phrase.
- If there are more phrases than ${questionsCount}, pick the most important ones.
- If there are fewer phrases than ${questionsCount}, you may create extra questions using some phrases again (use different contexts).

TASK INSTRUCTIONS (VERY IMPORTANT):
${typePrompt}

LANGUAGE RULES:
- Target phrases are in ${targetLangName} — keep them as-is.
${
  trainingType === 'gap_filling'
    ? `- "question" (the sentence with ____) MUST be in ${targetLangName} — the language the student is learning.
- "explanation" MUST be in ${instructionLangName}.`
    : `- All questions, answer texts, and explanations MUST be in ${instructionLangName}.`
}
- Do NOT mix languages within a single field.

OUTPUT FORMAT (STRICT JSON):
Return ONLY a JSON array. No markdown. No comments. No extra text.

Each element MUST be an object:

{
  "question": "string (in ${trainingType === 'gap_filling' ? targetLangName : instructionLangName})",
  "questionType": "multiple_choice" | "gap_fill" | "open_text",
  "answers": [
    { "text": "answer text", "isCorrect": true | false }
  ],
  "explanation": "short, simple explanation (in ${instructionLangName})"
}

GLOBAL RULES:
- Always include "questionType".
- Always include "answers" (array).
- There must be EXACTLY ONE answer where "isCorrect": true.
- If there are other answers, they MUST have "isCorrect": false.
- "explanation" MUST be short (1–2 sentences), clear, learner-friendly.
- Do NOT use difficult vocabulary in explanations.

TYPE RULES (must match the exercise type):
- definition_quiz  -> questionType MUST be "multiple_choice" and answers length MUST be exactly 3.
- gap_filling      -> questionType MUST be "gap_fill" and answers length MUST be exactly 1 (only the correct phrase).
- phrase_fail      -> questionType MUST be "multiple_choice" and answers length MUST be exactly 3 (sentences).
- collocation_check-> questionType MUST be "open_text" and answers length MUST be exactly 1 (only the correct phrase).
`.trim();
}

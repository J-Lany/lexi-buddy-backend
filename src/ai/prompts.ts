export type LevelCode = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type AgeGroupCode = 'UNDER_18' | 'BETWEEN_18_35' | 'OVER_35';

type TrainingLevel = 'beginner' | 'intermediate' | 'advanced';
type TrainingAgeGroup = 'child' | 'teen' | 'adult';

export type TrainingTypeKey =
  | 'definition_quiz'
  | 'gap_filling'
  | 'phrase_fail'
  | 'collocation_check';

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

export function mapAgeGroupToTraining(
  ageGroup?: string | null,
): TrainingAgeGroup | undefined {
  if (!ageGroup) return undefined;
  const a = ageGroup as AgeGroupCode;
  if (a === 'UNDER_18') return 'teen';
  if (a === 'BETWEEN_18_35') return 'adult';
  if (a === 'OVER_35') return 'adult';
  return undefined;
}

export const trainingPrompts: Record<
  TrainingLevel,
  Record<TrainingAgeGroup, string>
> = {
  beginner: {
    child:
      'I am a child and a beginner-level student of English. Use only simple, short sentences and clear language appropriate for kids. Choose topics and examples relevant and interesting for children.',
    teen: 'I am a teenager and a beginner-level student of English. Use simple, short sentences and clear language. Choose topics and examples relevant and interesting for teenagers.',
    adult:
      'I am an adult and a beginner-level student of English. Use simple, short sentences and clear language. Choose topics and examples relevant and interesting for adults.',
  },
  intermediate: {
    child:
      'I am a child and an intermediate-level student of English. Use clear language and vocabulary around intermediate level, appropriate for kids. Choose topics and examples relevant and interesting for children.',
    teen: 'I am a teenager and an intermediate-level student of English. Use modern, clear English at intermediate level. Choose topics and examples relevant and interesting for teenagers.',
    adult:
      'I am an adult and an intermediate-level student of English. Use modern, clear English at intermediate level. Choose topics and examples relevant and interesting for adults.',
  },
  advanced: {
    child:
      'I am a child and an advanced-level student of English. Use diverse but still clear language appropriate for kids. Choose topics and examples relevant and interesting for children.',
    teen: 'I am a teenager and an advanced-level student of English. Use diverse, sophisticated, but clear and modern English. Choose topics and examples relevant and interesting for teenagers.',
    adult:
      'I am an adult and an advanced-level student of English. Use diverse, sophisticated, but clear and modern English. Choose topics and examples relevant and interesting for adults.',
  },
};

export function getTrainingPrompt(params: {
  level?: string | null;
  ageGroup?: string | null;
}): string | undefined {
  const trainingLevel = mapLevelToTraining(params.level);
  const trainingAgeGroup = mapAgeGroupToTraining(params.ageGroup);

  if (!trainingLevel || !trainingAgeGroup) return undefined;

  return trainingPrompts[trainingLevel]?.[trainingAgeGroup];
}

export function getTranslatePrompt(
  words: string[],
  meta?: { topic?: string; level?: string | null; ageGroup?: string | null },
): string {
  const profile = getTrainingPrompt({
    level: meta?.level,
    ageGroup: meta?.ageGroup,
  });

  const topicPart = meta?.topic
    ? `The overall topic/context is: ${meta.topic}.\nUse translations and synonyms that are natural in this context.`
    : '';

  return `
${profile ?? ''}
You are helping an English teacher prepare vocabulary for learners.

For each phrase:
1. Correct spelling if needed.
2. Provide the most accurate and natural Russian translation (idiomatic if needed, not word-for-word).
3. Provide 0–3 very simple English synonyms that a learner at this level could understand.

${topicPart}

Return ONLY a JSON array, no other text. Each element MUST be:

{
  "term": "original English phrase",
  "translation": "Russian translation",
  "synonyms": ["simple synonym 1", "simple synonym 2", ...]
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
- The question must test understanding of the phrase's meaning (definition).
- Use learner-friendly language, matching the student's level.

Each question must:
- Use "multiple_choice" as questionType.
- Have 1 correct definition and 2–3 incorrect but plausible definitions in "answers".
`,

  gap_filling: `
You are creating gap-filling questions.

For each target phrase:
- Write ONE natural sentence that clearly shows the phrase in context.
- Replace the phrase (or its core part) in the sentence with a gap "____".

Each question must:
- Use "gap_fill" as questionType.
- Use the full sentence with the gap as "question".
- Put the correct phrase as one answer with isCorrect: true.
- Add 1–2 common but wrong alternatives as other answers with isCorrect: false.
`,

  phrase_fail: `
You are creating questions where the learner must identify WRONG usage of a phrase.

For each target phrase:
- Write THREE sentences with this phrase:
  - 2 sentences use the phrase correctly (natural, correct context).
  - 1 sentence uses the phrase incorrectly (unnatural or wrong meaning).
- The learner must choose the incorrect sentence.

Each question must:
- Use "multiple_choice" as questionType.
- Use a single string in "question" that contains the 3 sentences, separated by line breaks (\\n).
- In "answers", each answer is one of these sentences:
  - The incorrect sentence must have isCorrect: true.
  - The two correct sentences must have isCorrect: false.
`,

  collocation_check: `
You are creating questions about natural collocations with the target phrase.

For each target phrase:
- Create 3–4 short collocations or mini-phrases where the target phrase is the missing part (gap "____") or the key word.
- The learner must choose the correct phrase that fits all (or most) collocations naturally.

Each question must:
- Use "multiple_choice" as questionType.
- Use the collocations (with a gap ____ for the missing phrase) in "question".
- In "answers":
  - One option is the correct target phrase with isCorrect: true.
  - 2–3 other options are plausible but wrong phrases with isCorrect: false.
`,
};

export function getAssignmentPrompt(params: {
  trainingType: TrainingTypeKey;
  terms: string[];
  questionsCount: number;
  topic?: string;
  level?: string | null;
  ageGroup?: string | null;
}): string {
  const { trainingType, terms, questionsCount, topic, level, ageGroup } =
    params;

  const profile = getTrainingPrompt({ level, ageGroup });
  const typePrompt = trainingTypePrompts[trainingType];

  const topicPart = topic
    ? `Lesson/topic: ${topic}. Use examples and contexts that fit this topic.`
    : '';

  const termsList = terms.map((t) => `- ${t}`).join('\n');

  return `
${profile ?? ''}
You are an English teaching assistant.

${topicPart}

You will generate exercises of type: ${trainingType}.
You have the following target phrases:
${termsList}

Number of questions to generate: ${questionsCount}.
Preferably, create one question per target phrase. 
If there are more target phrases than questionsCount, choose the most important phrases.
If there are fewer phrases than questionsCount, you may create more than one question for some phrases.

TASK INSTRUCTIONS (VERY IMPORTANT):
${typePrompt}

OUTPUT FORMAT (STRICT JSON):
Return ONLY a JSON array, nothing else before or after it.
The array must contain EXACTLY ${questionsCount} elements.

Each element MUST be an object with the following shape:

{
  "question": "string",                     // question text shown to the student
  "questionType": "multiple_choice" | "gap_fill" | "open_text",
  "answers": [
    { "text": "answer text", "isCorrect": true | false }
  ],
  "explanation": "short, simple explanation of why the correct answer is correct and why the other options are wrong"
}

Rules:
- For "definition_quiz": questionType MUST be "multiple_choice".
- For "gap_filling": questionType MUST be "gap_fill".
- For "phrase_fail": questionType MUST be "multiple_choice".
- For "collocation_check": questionType MUST be "multiple_choice".
- In every question, there must be EXACTLY ONE answer where "isCorrect": true.
- All other answers MUST have "isCorrect": false.
- "explanation" MUST be a short (1–2 sentences), clear, learner-friendly explanation.
- Explanations should NOT introduce new advanced vocabulary that the learner does not know.
- Do NOT include explanations, comments, or any extra fields outside the JSON array.
`.trim();
}

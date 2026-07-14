import { StudentBotInternalRepository } from './student-bot-internal.repository';

describe('StudentBotInternalRepository — getAssignmentPayload', () => {
  let repo: StudentBotInternalRepository;
  let prisma: { assignment: { findUnique: jest.Mock } };

  beforeEach(() => {
    prisma = { assignment: { findUnique: jest.fn() } };
    repo = new StudentBotInternalRepository(prisma as any);
  });

  function mockAssignment(additionalInstructions: string | null) {
    prisma.assignment.findUnique.mockResolvedValueOnce({
      id: 1,
      type: { name: 'definition_quiz' },
      lesson: {
        id: 10,
        title: 'Lesson',
        targetLanguage: 'english',
        nativeLanguage: 'russian',
        instructionLanguage: 'russian',
        level: 'A1',
        ageCategory: null,
        topic: 'Greetings',
        additionalInstructions,
        vocab: [],
      },
      questions: [],
    });
  }

  it('includes additionalInstructions in the returned lesson when present', async () => {
    mockAssignment('Please focus on pronunciation.');

    const payload = await repo.getAssignmentPayload(1);

    expect(payload?.lesson.additionalInstructions).toBe(
      'Please focus on pronunciation.',
    );
  });

  it('returns additionalInstructions as null (not dropped/undefined) when the lesson has none', async () => {
    mockAssignment(null);

    const payload = await repo.getAssignmentPayload(1);

    expect(payload).toHaveProperty('lesson.additionalInstructions', null);
  });

  it('returns null when the assignment does not exist', async () => {
    prisma.assignment.findUnique.mockResolvedValueOnce(null);

    const payload = await repo.getAssignmentPayload(999);

    expect(payload).toBeNull();
  });
});

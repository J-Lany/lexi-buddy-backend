/* eslint-disable @typescript-eslint/unbound-method */
import { NotFoundException } from '@nestjs/common';
import { StudentBotInternalService } from './student-bot-internal.service';
import { StudentBotInternalRepository } from 'repositories/student-bot-internal.repository';
import { ActivityService } from 'common/modules/activity/activity.service';

describe('StudentBotInternalService (unit, manual DI)', () => {
  let service: StudentBotInternalService;
  let repo: jest.Mocked<StudentBotInternalRepository>;
  let activity: jest.Mocked<ActivityService>;

  beforeEach(() => {
    repo = {
      findStudentIdByTelegramId: jest.fn(),
      findLessonsForStudent: jest.fn(),
      findStudentProfileByTelegramId: jest.fn(),
      findAssignmentsForStudentInLesson: jest.fn(),
      findLessonMaterials: jest.fn(),
      isAssignmentAssignedToStudent: jest.fn(),
      getAssignmentPayload: jest.fn(),
      createNewAttemptAndGetPayload: jest.fn(),
      saveAttemptResultsAndComplete: jest.fn(),
    } as any;

    activity = {
      touchUserLastVisit: jest.fn().mockResolvedValue(undefined),
    } as any;

    service = new StudentBotInternalService(repo, activity);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // getStudentLessonsByTelegramId
  // ─────────────────────────────────────────────────────────────────────────

  describe('getStudentLessonsByTelegramId', () => {
    it('should throw NotFoundException when telegramId not found', async () => {
      repo.findStudentIdByTelegramId.mockResolvedValueOnce(null);

      await expect(
        service.getStudentLessonsByTelegramId(12345),
      ).rejects.toThrow(NotFoundException);
      expect(repo.findLessonsForStudent).not.toHaveBeenCalled();
    });

    it('should touch lastVisit and return mapped lessons', async () => {
      repo.findStudentIdByTelegramId.mockResolvedValueOnce(7);
      repo.findLessonsForStudent.mockResolvedValueOnce([
        {
          id: 1,
          title: 'English Basics',
          targetLanguage: 'english',
          nativeLanguage: 'russian',
          level: 'A1',
          topic: 'Greetings',
        },
      ] as any);

      const result = await service.getStudentLessonsByTelegramId(12345);

      expect(activity.touchUserLastVisit).toHaveBeenCalledWith(7);
      expect(result.items).toEqual([
        {
          lessonId: 1,
          title: 'English Basics',
          targetLanguage: 'english',
          nativeLanguage: 'russian',
          level: 'A1',
          topic: 'Greetings',
        },
      ]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // getStudentProfileByTelegramId
  // ─────────────────────────────────────────────────────────────────────────

  describe('getStudentProfileByTelegramId', () => {
    it('should throw NotFoundException when profile not found', async () => {
      repo.findStudentProfileByTelegramId.mockResolvedValueOnce(null as any);

      await expect(
        service.getStudentProfileByTelegramId(12345),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return profile and touch lastVisit', async () => {
      const profile = { id: 7, username: 'petr', firstName: 'Пётр' };
      repo.findStudentProfileByTelegramId.mockResolvedValueOnce(profile as any);

      const result = await service.getStudentProfileByTelegramId(12345);

      expect(activity.touchUserLastVisit).toHaveBeenCalledWith(7);
      expect(result).toBe(profile);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // getAssignmentPreviewByTelegramId
  // ─────────────────────────────────────────────────────────────────────────

  describe('getAssignmentPreviewByTelegramId', () => {
    it('should throw NotFoundException when telegramId not found', async () => {
      repo.findStudentIdByTelegramId.mockResolvedValueOnce(null);

      await expect(
        service.getAssignmentPreviewByTelegramId(12345, 1),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when assignment not assigned to this student', async () => {
      repo.findStudentIdByTelegramId.mockResolvedValueOnce(7);
      repo.isAssignmentAssignedToStudent.mockResolvedValueOnce(null as any);

      await expect(
        service.getAssignmentPreviewByTelegramId(12345, 99),
      ).rejects.toThrow(NotFoundException);

      // Must not fetch assignment payload for a non-assigned one
      expect(repo.getAssignmentPayload).not.toHaveBeenCalled();
    });

    it('should return assignment when properly assigned to the student', async () => {
      repo.findStudentIdByTelegramId.mockResolvedValueOnce(7);
      repo.isAssignmentAssignedToStudent.mockResolvedValueOnce({
        id: 1,
      } as any);
      const payload = {
        id: 1,
        type: { name: 'definition_quiz' },
        questions: [],
      };
      repo.getAssignmentPayload.mockResolvedValueOnce(payload as any);

      const result = await service.getAssignmentPreviewByTelegramId(12345, 1);

      expect(result).toEqual({ assignment: payload });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // startNewAssignmentAttemptByTelegramId
  // ─────────────────────────────────────────────────────────────────────────

  describe('startNewAssignmentAttemptByTelegramId', () => {
    it('should throw NotFoundException when telegramId not found', async () => {
      repo.findStudentIdByTelegramId.mockResolvedValueOnce(null);

      await expect(
        service.startNewAssignmentAttemptByTelegramId(12345, 1),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when assignment not found or not assigned', async () => {
      repo.findStudentIdByTelegramId.mockResolvedValueOnce(7);
      repo.createNewAttemptAndGetPayload.mockResolvedValueOnce(null as any);

      await expect(
        service.startNewAssignmentAttemptByTelegramId(12345, 99),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return attempt info with attemptsPolicy on success', async () => {
      repo.findStudentIdByTelegramId.mockResolvedValueOnce(7);
      repo.createNewAttemptAndGetPayload.mockResolvedValueOnce({
        studentAssignment: { id: 55, attemptNo: 1, status: 'IN_PROGRESS' },
        assignment: { id: 1, questions: [] },
      } as any);

      const result = await service.startNewAssignmentAttemptByTelegramId(
        12345,
        1,
      );

      expect(result.attemptId).toBe(55);
      expect(result.attemptNo).toBe(1);
      expect(result.attemptsPolicy).toEqual({
        maxAttempts: 3,
        showCorrectOnAttempt: 3,
        appliesToQuestionTypes: ['gap_fill', 'open_text'],
      });
      expect(activity.touchUserLastVisit).toHaveBeenCalledWith(7);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // submitAssignmentAttemptByTelegramId
  // ─────────────────────────────────────────────────────────────────────────

  describe('submitAssignmentAttemptByTelegramId', () => {
    const dto = {
      telegramId: 12345,
      attemptId: 55,
      results: [
        {
          questionId: 1,
          attempts: [
            {
              attempt: 1,
              answer: 'cat',
              isCorrect: true,
              responseTimeMs: 1200,
            },
          ],
        },
      ],
    };

    it('should throw NotFoundException when telegramId not found', async () => {
      repo.findStudentIdByTelegramId.mockResolvedValueOnce(null);

      await expect(
        service.submitAssignmentAttemptByTelegramId(dto as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when attempt not found', async () => {
      repo.findStudentIdByTelegramId.mockResolvedValueOnce(7);
      repo.saveAttemptResultsAndComplete.mockResolvedValueOnce(null as any);

      await expect(
        service.submitAssignmentAttemptByTelegramId(dto as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return saved result on success', async () => {
      const saved = { attemptId: 55, score: 1.0, status: 'COMPLETED' };
      repo.findStudentIdByTelegramId.mockResolvedValueOnce(7);
      repo.saveAttemptResultsAndComplete.mockResolvedValueOnce(saved as any);

      const result = await service.submitAssignmentAttemptByTelegramId(
        dto as any,
      );

      expect(result).toBe(saved);
      expect(repo.saveAttemptResultsAndComplete).toHaveBeenCalledWith({
        userId: 7,
        attemptId: 55,
        results: dto.results,
        clientSessionId: null,
      });
    });
  });
});

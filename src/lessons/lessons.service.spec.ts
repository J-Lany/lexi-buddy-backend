/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { LessonsService } from './lessons.service';
import { LessonRepository } from 'repositories/lesson.repository';
import { AssignmentRepository } from 'repositories/assignment.repository';
import { UserRepository } from 'repositories/user.repository';
import { AiService } from 'ai/ai.service';
import { PrismaService } from 'common/modules/prisma/prisma.service';
import { TelegramNotificationsService } from 'common/modules/notifications/telegram-notifications.service';
import { DeleteLessonScope } from './dto/delete-lesson.dto';

describe('LessonsService (unit, manual DI)', () => {
  let service: LessonsService;

  let prisma: jest.Mocked<
    Pick<PrismaService, '$transaction' | 'userContact' | 'user'>
  >;
  let telegramNotifications: jest.Mocked<TelegramNotificationsService>;
  let lessonRepo: jest.Mocked<LessonRepository>;
  let assignmentRepo: jest.Mocked<AssignmentRepository>;
  let userRepo: jest.Mocked<UserRepository>;
  let ai: jest.Mocked<AiService>;

  // Reusable transaction mock — caller can override individual methods per test
  let mockTx: {
    lesson: { findUnique: jest.Mock };
    groupMember: { findMany: jest.Mock };
    studentAssignedAssignment: { findMany: jest.Mock; createMany: jest.Mock };
    groupLesson: { createMany: jest.Mock };
  };

  beforeEach(() => {
    mockTx = {
      lesson: { findUnique: jest.fn() },
      groupMember: { findMany: jest.fn() },
      studentAssignedAssignment: { findMany: jest.fn(), createMany: jest.fn() },
      groupLesson: { createMany: jest.fn() },
    };

    prisma = {
      $transaction: jest.fn().mockImplementation((fn: any) => fn(mockTx)),
      userContact: { findMany: jest.fn() } as any,
      user: { findUnique: jest.fn() } as any,
    } as any;

    telegramNotifications = {
      sendLessonAssigned: jest.fn(),
    } as any;

    lessonRepo = {
      findById: jest.fn(),
      findCreatorById: jest.fn(),
      findAllByTeacher: jest.fn(),
      createLesson: jest.fn(),
      replaceLessonVocab: jest.fn(),
      archiveLesson: jest.fn(),
      hardDeleteLesson: jest.fn(),
    } as any;

    assignmentRepo = {
      findAssignmentTypeByName: jest.fn(),
      getQuestionTypeMap: jest.fn(),
      createAssignmentWithQuestionsAndAnswers: jest.fn(),
    } as any;

    userRepo = {
      findById: jest.fn(),
    } as any;

    ai = {
      translateVocab: jest.fn(),
      generateAssignment: jest.fn(),
    } as any;

    service = new LessonsService(
      prisma as any,
      telegramNotifications,
      lessonRepo,
      assignmentRepo,
      userRepo,
      ai,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // getLessonForTeacher
  // ─────────────────────────────────────────────────────────────────────────

  describe('getLessonForTeacher', () => {
    it('should throw NotFoundException when lesson does not exist', async () => {
      lessonRepo.findById.mockResolvedValueOnce(null as any);

      await expect(service.getLessonForTeacher(1, 42)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when caller is not the lesson owner', async () => {
      lessonRepo.findById.mockResolvedValueOnce({
        id: 1,
        createdById: 99, // owner
        assignments: [],
        vocab: [],
        groupLessons: [],
      } as any);

      await expect(
        service.getLessonForTeacher(1, 42), // caller = 42, owner = 99
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return lesson with empty students/vocab when owner calls', async () => {
      lessonRepo.findById.mockResolvedValueOnce({
        id: 1,
        title: 'Test Lesson',
        createdById: 42,
        topic: null,
        level: null,
        ageCategory: null,
        additionalInstructions: null,
        materialLinks: [],
        targetLanguage: 'english',
        nativeLanguage: 'russian',
        instructionLanguage: 'native',
        assignments: [],
        vocab: [],
        groupLessons: [],
      } as any);

      const result = await service.getLessonForTeacher(1, 42);

      expect(result.id).toBe(1);
      expect(result.students).toEqual([]);
      expect(result.vocab).toEqual([]);
      expect(result.assignments).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // deleteLesson
  // ─────────────────────────────────────────────────────────────────────────

  describe('deleteLesson', () => {
    it('should throw NotFoundException when lesson does not exist', async () => {
      lessonRepo.findCreatorById.mockResolvedValueOnce(null as any);

      await expect(
        service.deleteLesson(1, 42, DeleteLessonScope.ALL),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when caller is not owner', async () => {
      lessonRepo.findCreatorById.mockResolvedValueOnce({
        id: 1,
        createdById: 99,
      } as any);

      await expect(
        service.deleteLesson(1, 42, DeleteLessonScope.ALL),
      ).rejects.toThrow(ForbiddenException);
    });

    it('scope=me → calls archiveLesson, not hardDeleteLesson', async () => {
      lessonRepo.findCreatorById.mockResolvedValueOnce({
        id: 1,
        createdById: 42,
      } as any);
      lessonRepo.archiveLesson.mockResolvedValueOnce(undefined as any);

      const result = await service.deleteLesson(1, 42, DeleteLessonScope.ME);

      expect(lessonRepo.archiveLesson).toHaveBeenCalledWith(1);
      expect(lessonRepo.hardDeleteLesson).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: true });
    });

    it('scope=all → calls hardDeleteLesson, not archiveLesson', async () => {
      lessonRepo.findCreatorById.mockResolvedValueOnce({
        id: 1,
        createdById: 42,
      } as any);
      lessonRepo.hardDeleteLesson.mockResolvedValueOnce(undefined as any);

      const result = await service.deleteLesson(1, 42, DeleteLessonScope.ALL);

      expect(lessonRepo.hardDeleteLesson).toHaveBeenCalledWith(1);
      expect(lessonRepo.archiveLesson).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: true });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // updateVocab
  // ─────────────────────────────────────────────────────────────────────────

  describe('updateVocab', () => {
    it('should throw NotFoundException when lesson not found', async () => {
      lessonRepo.findById.mockResolvedValueOnce(null as any);

      await expect(
        service.updateVocab(
          1,
          { items: [{ term: 'cat', synonyms: [] }] } as any,
          42,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when caller is not the owner', async () => {
      lessonRepo.findById.mockResolvedValueOnce({
        id: 1,
        createdById: 99,
      } as any);

      await expect(
        service.updateVocab(1, { items: [] } as any, 42),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should call replaceLessonVocab with mapped items', async () => {
      lessonRepo.findById.mockResolvedValueOnce({
        id: 1,
        createdById: 42,
      } as any);
      lessonRepo.replaceLessonVocab.mockResolvedValueOnce([] as any);

      await service.updateVocab(
        1,
        {
          items: [{ term: 'cat', translation: 'кот', synonyms: ['kitty'] }],
        } as any,
        42,
      );

      expect(lessonRepo.replaceLessonVocab).toHaveBeenCalledWith(1, [
        { term: 'cat', translation: 'кот', synonyms: ['kitty'] },
      ]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // updateAssignments
  // ─────────────────────────────────────────────────────────────────────────

  describe('updateAssignments', () => {
    it('should throw ForbiddenException when caller is not lesson owner', async () => {
      lessonRepo.findById.mockResolvedValueOnce({
        id: 1,
        createdById: 99,
      } as any);

      await expect(
        service.updateAssignments(
          1,
          { type: 'definition_quiz', questions: [] } as any,
          42,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when assignment type not found', async () => {
      lessonRepo.findById.mockResolvedValueOnce({
        id: 1,
        createdById: 42,
      } as any);
      assignmentRepo.getQuestionTypeMap.mockResolvedValueOnce({
        multiple_choice: 1,
      });
      assignmentRepo.findAssignmentTypeByName.mockResolvedValueOnce(
        null as any,
      );

      await expect(
        service.updateAssignments(
          1,
          { type: 'unknown_type', questions: [] } as any,
          42,
        ),
      ).rejects.toThrow('Assignment type "unknown_type" not found');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // assignLesson
  // ─────────────────────────────────────────────────────────────────────────

  describe('assignLesson', () => {
    it('should throw BadRequestException when neither studentIds nor groupIds provided', async () => {
      await expect(service.assignLesson(1, {}, 42)).rejects.toThrow(
        'studentIds or groupIds must be provided',
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when both arrays are empty', async () => {
      await expect(
        service.assignLesson(1, { studentIds: [], groupIds: [] }, 42),
      ).rejects.toThrow('studentIds or groupIds must be provided');
    });

    it('should throw NotFoundException when lesson not found inside transaction', async () => {
      mockTx.lesson.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.assignLesson(1, { studentIds: [10] }, 42),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when lesson belongs to another teacher', async () => {
      mockTx.lesson.findUnique.mockResolvedValueOnce({
        id: 1,
        title: 'Lesson',
        createdById: 99, // not the caller
        assignments: [{ id: 10 }],
      });

      await expect(
        service.assignLesson(1, { studentIds: [10] }, 42),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return created:0 when lesson has no assignments', async () => {
      mockTx.lesson.findUnique.mockResolvedValueOnce({
        id: 1,
        title: 'Lesson',
        createdById: 42,
        assignments: [], // no assignments
      });

      const result = await service.assignLesson(1, { studentIds: [10] }, 42);

      expect(result.created).toBe(0);
      expect(
        mockTx.studentAssignedAssignment.createMany,
      ).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when teacher is not member of requested group', async () => {
      mockTx.lesson.findUnique.mockResolvedValueOnce({
        id: 1,
        title: 'Lesson',
        createdById: 42,
        assignments: [{ id: 10 }],
      });
      // Teacher membership check returns empty — teacher not in group 99
      mockTx.groupMember.findMany.mockResolvedValueOnce([]);

      await expect(
        service.assignLesson(1, { groupIds: [99] }, 42),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when trying to assign to student not linked to teacher', async () => {
      mockTx.lesson.findUnique.mockResolvedValueOnce({
        id: 1,
        title: 'Lesson',
        createdById: 42,
        assignments: [{ id: 10 }],
      });
      // allowedDirectStudentIds check returns [] — student 77 not linked to teacher
      mockTx.groupMember.findMany.mockResolvedValueOnce([]);

      await expect(
        service.assignLesson(1, { studentIds: [77] }, 42),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should deduplicate: already-assigned pairs are skipped, only missing ones created', async () => {
      mockTx.lesson.findUnique.mockResolvedValueOnce({
        id: 1,
        title: 'Lesson',
        createdById: 42,
        assignments: [{ id: 10 }, { id: 11 }],
      });
      // Student 5 is linked to teacher via a group
      mockTx.groupMember.findMany.mockResolvedValueOnce([{ userId: 5 }]);
      // Assignment 10 already assigned to student 5, assignment 11 is not
      mockTx.studentAssignedAssignment.findMany.mockResolvedValueOnce([
        { userId: 5, assignmentId: 10 },
      ]);
      mockTx.studentAssignedAssignment.createMany.mockResolvedValueOnce({
        count: 1,
      });

      // No telegram notifications needed in this case
      (prisma.userContact as any).findMany = jest
        .fn()
        .mockResolvedValueOnce([]);

      const result = await service.assignLesson(1, { studentIds: [5] }, 42);

      expect(mockTx.studentAssignedAssignment.createMany).toHaveBeenCalledWith({
        data: [{ userId: 5, assignmentId: 11 }], // only the missing one
        skipDuplicates: true,
      });
      expect(result.created).toBe(1);
    });
  });
});

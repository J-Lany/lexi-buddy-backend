import { PrismaClient, RoleScope, Level, AgeGroup } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function getOrCreateRole(
  name: string,
  scope: RoleScope,
  description?: string,
) {
  const existing = await prisma.role.findFirst({ where: { name, scope } });
  if (existing) return existing;

  return prisma.role.create({ data: { name, scope, description } });
}

async function getOrCreateContactType(name: string, displayName: string) {
  const existing = await prisma.contactType.findUnique({ where: { name } });
  if (existing) return existing;

  return prisma.contactType.create({ data: { name, displayName } });
}

async function getOrCreateAssignmentType(name: string, description?: string) {
  const existing = await prisma.assignmentType.findUnique({ where: { name } });
  if (existing) return existing;

  return prisma.assignmentType.create({ data: { name, description } });
}

async function getOrCreateQuestionType(name: string) {
  const existing = await prisma.assignmentQuestionType.findUnique({
    where: { name },
  });
  if (existing) return existing;

  return prisma.assignmentQuestionType.create({ data: { name } });
}

// --- CORE SEED (для всех окружений) ---
async function seedCore() {
  console.log('Seeding CORE data (roles, contact types)...');

  // роли
  await getOrCreateRole(
    'teacher',
    RoleScope.GLOBAL,
    'Глобальная роль преподавателя',
  );
  await getOrCreateRole(
    'student',
    RoleScope.GLOBAL,
    'Глобальная роль студента',
  );

  await getOrCreateRole(
    'teacher',
    RoleScope.GROUP,
    'Роль преподавателя внутри группы',
  );
  await getOrCreateRole(
    'student',
    RoleScope.GROUP,
    'Роль студента внутри группы',
  );

  // типы контактов
  await getOrCreateContactType('email', 'Email');
  await getOrCreateContactType('telegram', 'Telegram ID');

  console.log('Core data seeded');
}

// helpers (dev seed)
async function findUserByEmail(email: string, contactTypeId: number) {
  const existing = await prisma.userContact.findFirst({
    where: { contactValue: email, contactTypeId },
    include: { user: true },
  });

  return existing?.user ?? null;
}

async function ensureUniqueUsername(base: string | null | undefined) {
  if (!base) return null;

  const normalized = base.trim();
  if (!normalized) return null;

  const existing = await prisma.user.findUnique({
    where: { username: normalized },
  });

  if (!existing) return normalized;

  const suffix = Math.floor(Math.random() * 1_000_000);
  return `${normalized}_${suffix}`;
}

/**
 * Создаёт 1-2 тестовых урока в группе + немного прогресса для указанного студента.
 * АДАПТИРОВАНО под новую схему:
 * - Lesson больше НЕ содержит groupId
 * - связь с группой через GroupLesson
 */
async function seedTestLessons(params: {
  groupId: number;
  createdById: number;
  studentId: number;
}) {
  const { groupId, createdById, studentId } = params;

  const typeQuiz = await getOrCreateAssignmentType(
    'Definition Quiz',
    'Выбор определения',
  );
  const typeGap = await getOrCreateAssignmentType(
    'Gap Filling',
    'Вставь пропущенное слово',
  );

  const qtMcq = await getOrCreateQuestionType('multiple_choice');
  const qtGap = await getOrCreateQuestionType('gap_fill');

  // ---------- LESSON 1 ----------
  const lesson1Title = 'Lesson 1: Greetings';

  // ищем урок, который уже привязан к этой группе через GroupLesson
  let lesson1 = await prisma.lesson.findFirst({
    where: {
      title: lesson1Title,
      groupLessons: {
        some: {
          groupId,
        },
      },
    },
    select: { id: true },
  });

  if (!lesson1) {
    // создаём урок БЕЗ groupId
    lesson1 = await prisma.lesson.create({
      data: {
        createdById,
        title: lesson1Title,
        level: Level.A1,
        topic: 'Greetings',
        description: 'Тестовый урок для разработки (приветствия).',
        vocab: {
          create: [
            { term: 'hello', translation: 'привет' },
            { term: 'goodbye', translation: 'пока' },
            { term: 'please', translation: 'пожалуйста' },
          ],
        },
        assignments: {
          create: [
            {
              typeId: typeQuiz.id,
              questions: {
                create: [
                  {
                    text: 'Choose the correct translation for "hello".',
                    questionTypeId: qtMcq.id,
                    answers: {
                      create: [
                        { text: 'привет', isCorrect: true },
                        { text: 'пока', isCorrect: false },
                        { text: 'спасибо', isCorrect: false },
                      ],
                    },
                  },
                ],
              },
            },
            {
              typeId: typeGap.id,
              questions: {
                create: [
                  {
                    text: 'Fill the gap: "____!" (a polite word)',
                    questionTypeId: qtGap.id,
                    answers: {
                      create: [{ text: 'please', isCorrect: true }],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      select: { id: true },
    });

    // привязываем урок к группе через GroupLesson
    await prisma.groupLesson.create({
      data: {
        groupId,
        lessonId: lesson1.id,
      },
    });

    console.log(`Created lesson: "${lesson1Title}" and linked to group`);
  } else {
    console.log(`Lesson already exists for this group: "${lesson1Title}"`);
  }

  const lesson1Assignments = await prisma.assignment.findMany({
    where: { lessonId: lesson1.id },
    select: { id: true },
    orderBy: { id: 'asc' },
  });

  // ---------- LESSON 2 ----------
  const lesson2Title = 'Lesson 2: Family';

  let lesson2 = await prisma.lesson.findFirst({
    where: {
      title: lesson2Title,
      groupLessons: {
        some: {
          groupId,
        },
      },
    },
    select: { id: true },
  });

  if (!lesson2) {
    lesson2 = await prisma.lesson.create({
      data: {
        createdById,
        title: lesson2Title,
        level: Level.A1,
        topic: 'Family',
        description: 'Тестовый урок (семья).',
        vocab: {
          create: [
            { term: 'mother', translation: 'мама' },
            { term: 'father', translation: 'папа' },
            { term: 'sister', translation: 'сестра' },
          ],
        },
        assignments: {
          create: [
            {
              typeId: typeQuiz.id,
              questions: {
                create: [
                  {
                    text: 'Choose the correct translation for "mother".',
                    questionTypeId: qtMcq.id,
                    answers: {
                      create: [
                        { text: 'мама', isCorrect: true },
                        { text: 'папа', isCorrect: false },
                        { text: 'брат', isCorrect: false },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      select: { id: true },
    });

    await prisma.groupLesson.create({
      data: {
        groupId,
        lessonId: lesson2.id,
      },
    });

    console.log(`Created lesson: "${lesson2Title}" and linked to group`);
  } else {
    console.log(`Lesson already exists for this group: "${lesson2Title}"`);
  }

  // ---------- Student progress seed ----------
  async function ensureStudentAssignment(p: {
    assignmentId: number;
    status: 'PENDING' | 'COMPLETED' | 'GRADED';
    score?: number | null;
    submittedAt?: Date | null;
    gradedAt?: Date | null;
  }) {
    const existing = await prisma.studentAssignment.findFirst({
      where: { userId: studentId, assignmentId: p.assignmentId },
      select: { id: true },
    });

    if (existing) return;

    await prisma.studentAssignment.create({
      data: {
        userId: studentId,
        assignmentId: p.assignmentId,
        status: p.status,
        score: p.score ?? null,
        submittedAt: p.submittedAt ?? null,
        gradedAt: p.gradedAt ?? null,
      },
    });
  }

  // Пример: в lesson1 студент сделал 1 из 2
  if (lesson1Assignments[0]) {
    await ensureStudentAssignment({
      assignmentId: lesson1Assignments[0].id,
      status: 'GRADED',
      score: 1,
      submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 24), // вчера
      gradedAt: new Date(Date.now() - 1000 * 60 * 60 * 23), // чуть позже
    });
  }

  if (lesson1Assignments[1]) {
    await ensureStudentAssignment({
      assignmentId: lesson1Assignments[1].id,
      status: 'PENDING',
    });
  }

  console.log('Seeded test lessons + student progress');
}

// --- DEV/STAGING SEED (тестовые юзеры и группа) ---
async function seedDevData() {
  console.log('Seeding DEV data (test users, groups)...');

  const teacherPassword = 'Password123';
  const hashedPassword = await argon2.hash(teacherPassword);
  const teacherEmail = 'anna.ivanovna@example.com';

  const student1TelegramId = 111111111;
  const student1TelegramUsername = 'petka';

  const student2TelegramId = 222222222;
  const student2TelegramUsername = 'mariska';

  const globalTeacherRole = await prisma.role.findFirst({
    where: { name: 'teacher', scope: RoleScope.GLOBAL },
  });
  const globalStudentRole = await prisma.role.findFirst({
    where: { name: 'student', scope: RoleScope.GLOBAL },
  });

  const contactTypeEmail = await prisma.contactType.findUnique({
    where: { name: 'email' },
  });
  const contactTypeTelegram = await prisma.contactType.findUnique({
    where: { name: 'telegram' },
  });

  if (
    !globalTeacherRole ||
    !globalStudentRole ||
    !contactTypeEmail ||
    !contactTypeTelegram
  ) {
    throw new Error('Core data not seeded properly before dev seed');
  }

  const contactTypeEmailId = contactTypeEmail.id;
  const contactTypeTelegramId = contactTypeTelegram.id;

  // -----------------------
  // TEACHER
  // -----------------------
  let teacherUser = await findUserByEmail(teacherEmail, contactTypeEmailId);

  if (teacherUser) {
    console.log(`Teacher already exists with email ${teacherEmail}`);
  } else {
    teacherUser = await prisma.user.create({
      data: {
        firstName: 'Анна',
        lastName: 'Ивановна',
        roleId: globalTeacherRole.id,
        verified: true,
        passwordHash: hashedPassword,
        contacts: {
          create: [
            {
              contactValue: teacherEmail,
              contactTypeId: contactTypeEmailId,
              isPrimary: true,
              verified: true,
            },
          ],
        },
      },
    });

    console.log(
      `Created teacher user with email ${teacherEmail}, password: ${teacherPassword}`,
    );
  }

  if (!teacherUser) throw new Error('Teacher not found/created');

  // -----------------------
  // STUDENT 1
  // -----------------------
  const student1Email = 'petr_petrov@example.com';
  let student1 = await findUserByEmail(student1Email, contactTypeEmailId);

  if (student1) {
    console.log(`Student1 already exists with email ${student1Email}`);
  } else {
    const username = await ensureUniqueUsername(student1TelegramUsername);

    student1 = await prisma.user.create({
      data: {
        username,
        firstName: 'Пётр',
        lastName: 'Петров',
        roleId: globalStudentRole.id,
        verified: true,
        level: Level.A1,
        ageGroup: AgeGroup.BETWEEN_18_35,
        contacts: {
          create: [
            {
              contactValue: student1Email,
              contactTypeId: contactTypeEmailId,
              isPrimary: true,
              verified: true,
            },
            {
              contactValue: String(student1TelegramId),
              contactTypeId: contactTypeTelegramId,
              isPrimary: false,
              verified: true,
            },
          ],
        },
      },
    });

    console.log(
      `Created student1 with email ${student1Email}, telegramId=${student1TelegramId}`,
    );
  }

  if (!student1) throw new Error('Student1 not found/created');

  // -----------------------
  // STUDENT 2
  // -----------------------
  const student2Email = 'maria_sidorova@example.com';
  let student2 = await findUserByEmail(student2Email, contactTypeEmailId);

  if (student2) {
    console.log(`Student2 already exists with email ${student2Email}`);
  } else {
    const username = await ensureUniqueUsername(student2TelegramUsername);

    student2 = await prisma.user.create({
      data: {
        username,
        firstName: 'Мария',
        lastName: 'Сидорова',
        roleId: globalStudentRole.id,
        verified: true,
        level: Level.C1,
        ageGroup: AgeGroup.UNDER_18,
        contacts: {
          create: [
            {
              contactValue: student2Email,
              contactTypeId: contactTypeEmailId,
              isPrimary: true,
              verified: true,
            },
            {
              contactValue: String(student2TelegramId),
              contactTypeId: contactTypeTelegramId,
              isPrimary: false,
              verified: true,
            },
          ],
        },
      },
    });

    console.log(
      `Created student2 with email ${student2Email}, telegramId=${student2TelegramId}`,
    );
  }

  if (!student2) throw new Error('Student2 not found/created');

  // -----------------------
  // GROUP (teacher + 2 students)
  // -----------------------
  const groupTeacherRole = await prisma.role.findFirst({
    where: { name: 'teacher', scope: RoleScope.GROUP },
  });
  const groupStudentRole = await prisma.role.findFirst({
    where: { name: 'student', scope: RoleScope.GROUP },
  });

  if (!groupTeacherRole || !groupStudentRole) {
    throw new Error('Group roles not found during dev seed');
  }

  const groupName = 'Группа А1 (Продвинутый)';
  const existingGroup = await prisma.group.findFirst({
    where: { name: groupName },
    select: { id: true },
  });

  if (!existingGroup) {
    await prisma.group.create({
      data: {
        name: groupName,
        description: 'Тестовая группа для разработки',
        members: {
          create: [
            {
              userId: teacherUser.id,
              roleId: groupTeacherRole.id,
              isActive: true,
            },
            {
              userId: student1.id,
              roleId: groupStudentRole.id,
              isActive: true,
            },
            {
              userId: student2.id,
              roleId: groupStudentRole.id,
              isActive: true,
            },
          ],
        },
      },
    });

    console.log(`Created group "${groupName}" with teacher + 2 students`);
  } else {
    console.log(`Group "${groupName}" already exists`);
  }

  const actualGroup = await prisma.group.findFirst({
    where: { name: groupName },
    select: { id: true },
  });
  if (!actualGroup) throw new Error('Group not found after creation');

  // -----------------------
  // TEST LESSONS + PROGRESS (for student1)
  // -----------------------
  await seedTestLessons({
    groupId: actualGroup.id,
    createdById: teacherUser.id,
    studentId: student1.id,
  });
}

async function main() {
  console.log('Start seeding ...');

  await seedCore();

  if (process.env.NODE_ENV !== 'production') {
    await seedDevData();
  } else {
    console.log('NODE_ENV=production, skipping dev data seed');
  }

  console.log('Seeding finished');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

import { PrismaClient, RoleScope, Level, AgeGroup } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// ---------- helpers ----------
async function findUserByEmail(email: string, contactTypeId: number) {
  const existing = await prisma.userContact.findFirst({
    where: { contactValue: email, contactTypeId },
    include: { user: true },
  });
  return existing?.user ?? null;
}

// ---------- CORE ----------
async function seedCore() {
  console.log('Seeding CORE data...');

  // roles (unique: @@unique([name, scope]))
  await prisma.role.upsert({
    where: { name_scope: { name: 'teacher', scope: RoleScope.GLOBAL } },
    update: { description: 'Глобальная роль преподавателя' },
    create: {
      name: 'teacher',
      scope: RoleScope.GLOBAL,
      description: 'Глобальная роль преподавателя',
    },
  });

  await prisma.role.upsert({
    where: { name_scope: { name: 'student', scope: RoleScope.GLOBAL } },
    update: { description: 'Глобальная роль студента' },
    create: {
      name: 'student',
      scope: RoleScope.GLOBAL,
      description: 'Глобальная роль студента',
    },
  });

  await prisma.role.upsert({
    where: { name_scope: { name: 'teacher', scope: RoleScope.GROUP } },
    update: { description: 'Роль преподавателя внутри группы' },
    create: {
      name: 'teacher',
      scope: RoleScope.GROUP,
      description: 'Роль преподавателя внутри группы',
    },
  });

  await prisma.role.upsert({
    where: { name_scope: { name: 'student', scope: RoleScope.GROUP } },
    update: { description: 'Роль студента внутри группы' },
    create: {
      name: 'student',
      scope: RoleScope.GROUP,
      description: 'Роль студента внутри группы',
    },
  });

  // contact types (unique: @@unique([name]))
  await prisma.contactType.upsert({
    where: { name: 'email' },
    update: { displayName: 'Email' },
    create: { name: 'email', displayName: 'Email' },
  });

  await prisma.contactType.upsert({
    where: { name: 'telegram' },
    update: { displayName: 'Telegram ID' },
    create: { name: 'telegram', displayName: 'Telegram ID' },
  });

  // assignment types (unique: @@unique([name]))
  const assignmentTypes = [
    ['definition_quiz', 'Definition Quiz'],
    ['gap_filling', 'Gap Filling'],
    ['phrase_fail', 'Phrase Fail'],
    ['collocation_check', 'Collocation Check'],
  ] as const;

  for (const [name, description] of assignmentTypes) {
    await prisma.assignmentType.upsert({
      where: { name },
      update: { description },
      create: { name, description },
    });
  }

  // question types (unique: @@unique([name]))
  const questionTypes = ['multiple_choice', 'gap_fill', 'open_text'] as const;
  for (const name of questionTypes) {
    await prisma.assignmentQuestionType.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  console.log('CORE seeded');
}

// ---------- TEST DATA (optional) ----------
async function seedTestData() {
  console.log('Seeding TEST data...');

  const globalTeacherRole = await prisma.role.findFirst({
    where: { name: 'teacher', scope: RoleScope.GLOBAL },
  });
  const globalStudentRole = await prisma.role.findFirst({
    where: { name: 'student', scope: RoleScope.GLOBAL },
  });
  const groupTeacherRole = await prisma.role.findFirst({
    where: { name: 'teacher', scope: RoleScope.GROUP },
  });
  const groupStudentRole = await prisma.role.findFirst({
    where: { name: 'student', scope: RoleScope.GROUP },
  });

  const emailType = await prisma.contactType.findUnique({
    where: { name: 'email' },
  });
  const tgType = await prisma.contactType.findUnique({
    where: { name: 'telegram' },
  });

  if (
    !globalTeacherRole ||
    !globalStudentRole ||
    !groupTeacherRole ||
    !groupStudentRole ||
    !emailType ||
    !tgType
  ) {
    throw new Error(
      'Core data missing (roles/contact types). Run core seed first.',
    );
  }

  // Teacher
  const teacherEmail = 'anna.ivanovna@example.com';
  const teacherPassword = 'Password123';
  let teacher = await findUserByEmail(teacherEmail, emailType.id);

  if (!teacher) {
    teacher = await prisma.user.create({
      data: {
        firstName: 'Анна',
        lastName: 'Ивановна',
        roleId: globalTeacherRole.id,
        verified: true,
        passwordHash: await argon2.hash(teacherPassword),
        contacts: {
          create: [
            {
              contactValue: teacherEmail,
              contactTypeId: emailType.id,
              isPrimary: true,
              verified: true,
            },
          ],
        },
      },
    });
    console.log(
      `Created teacher ${teacherEmail} (password: ${teacherPassword})`,
    );
  } else {
    console.log(`Teacher exists: ${teacherEmail}`);
  }

  // Students
  const studentsData = [
    {
      email: 'petr_petrov@example.com',
      username: 'petka',
      firstName: 'Пётр',
      lastName: 'Петров',
      level: Level.A1,
      ageGroup: AgeGroup.BETWEEN_18_35,
      telegramId: '111111111',
    },
    {
      email: 'maria_sidorova@example.com',
      username: 'mariska',
      firstName: 'Мария',
      lastName: 'Сидорова',
      level: Level.C1,
      ageGroup: AgeGroup.UNDER_18,
      telegramId: '222222222',
    },
  ] as const;

  const students = [];
  for (const s of studentsData) {
    let u = await findUserByEmail(s.email, emailType.id);
    if (!u) {
      u = await prisma.user.create({
        data: {
          username: s.username,
          firstName: s.firstName,
          lastName: s.lastName,
          roleId: globalStudentRole.id,
          verified: true,
          level: s.level,
          ageGroup: s.ageGroup,
          contacts: {
            create: [
              {
                contactValue: s.email,
                contactTypeId: emailType.id,
                isPrimary: true,
                verified: true,
              },
              {
                contactValue: s.telegramId,
                contactTypeId: tgType.id,
                isPrimary: false,
                verified: true,
              },
            ],
          },
        },
      });
      console.log(`Created student ${s.email}`);
    } else {
      console.log(`Student exists: ${s.email}`);
    }
    students.push(u);
  }

  // Group (name not unique => find/create)
  const groupName = 'Группа А1 (Тестовая)';
  let group = await prisma.group.findFirst({
    where: { name: groupName, archived: false },
    select: { id: true },
  });

  if (!group) {
    group = await prisma.group.create({
      data: { name: groupName, description: 'Тестовая группа для разработки' },
      select: { id: true },
    });
    console.log(`Created group "${groupName}"`);
  } else {
    console.log(`Group exists "${groupName}" (id=${group.id})`);
  }

  // Ensure memberships (unique: @@unique([groupId, userId]) => upsert ok)
  const memberships = [
    { userId: teacher.id, roleId: groupTeacherRole.id },
    { userId: students[0].id, roleId: groupStudentRole.id },
    { userId: students[1].id, roleId: groupStudentRole.id },
  ];

  for (const m of memberships) {
    await prisma.groupMember.upsert({
      where: { groupId_userId: { groupId: group.id, userId: m.userId } },
      update: { roleId: m.roleId, isActive: true, removedAt: null },
      create: {
        groupId: group.id,
        userId: m.userId,
        roleId: m.roleId,
        isActive: true,
      },
    });
  }

  console.log('TEST data seeded');
}

// ---------- main ----------
async function main() {
  console.log('Start seeding...');

  await seedCore();

  // best practice: explicit flag for test data
  if (process.env.NODE_ENV === 'development') {
    await seedTestData();
  } else {
    console.log('SEED_TEST_DATA!=true, skipping test data');
  }

  console.log('Done');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

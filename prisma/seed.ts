import { PrismaClient, RoleScope, Level, AgeGroup } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function getOrCreateRole(
  name: string,
  scope: RoleScope,
  description?: string,
) {
  const existing = await prisma.role.findFirst({
    where: { name, scope },
  });

  if (existing) return existing;

  return prisma.role.create({
    data: { name, scope, description },
  });
}

async function getOrCreateContactType(name: string, displayName: string) {
  const existing = await prisma.contactType.findUnique({
    where: { name },
  });

  if (existing) return existing;

  return prisma.contactType.create({
    data: { name, displayName },
  });
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

// --- DEV/STAGING SEED (тестовые юзеры и группа) ---
async function seedDevData() {
  console.log('Seeding DEV data (test users, groups)...');

  const teacherPassword = 'Password123';
  const hashedPassword = await argon2.hash(teacherPassword);
  const teacherEmail = 'anna.ivanovna@example.com';

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

  // учитель
  const existingTeacherContact = await prisma.userContact.findFirst({
    where: {
      contactValue: teacherEmail,
      contactTypeId: contactTypeEmail.id,
    },
    include: {
      user: true,
    },
  });

  let teacherUser;

  if (existingTeacherContact) {
    teacherUser = existingTeacherContact.user;
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
              contactTypeId: contactTypeEmail.id,
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

  // студенты
  const contactTypeEmailId = contactTypeEmail.id;
  const contactTypeTelegramId = contactTypeTelegram.id;

  // студент 1
  const student1Email = 'petr_petrov@example.com';

  const existingStudent1Contact = await prisma.userContact.findFirst({
    where: {
      contactValue: student1Email,
      contactTypeId: contactTypeEmailId,
    },
    include: { user: true },
  });

  let student1;

  if (existingStudent1Contact) {
    student1 = existingStudent1Contact.user;
  } else {
    student1 = await prisma.user.create({
      data: {
        firstName: 'Пётр',
        lastName: 'Петров',
        roleId: globalStudentRole.id,
        verified: true,
        level: Level.INTERMEDIATE,
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
              contactValue: 'petka',
              contactTypeId: contactTypeTelegramId,
              isPrimary: false,
              verified: true,
            },
          ],
        },
      },
    });
  }

  // студент 2
  const student2Email = 'maria_sidorova@example.com';

  const existingStudent2Contact = await prisma.userContact.findFirst({
    where: {
      contactValue: student2Email,
      contactTypeId: contactTypeEmailId,
    },
    include: { user: true },
  });

  let student2;

  if (existingStudent2Contact) {
    student2 = existingStudent2Contact.user;
  } else {
    student2 = await prisma.user.create({
      data: {
        firstName: 'Мария',
        lastName: 'Сидорова',
        roleId: globalStudentRole.id,
        verified: true,
        level: Level.BEGINNER,
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
              contactValue: 'mariska',
              contactTypeId: contactTypeTelegramId,
              isPrimary: false,
              verified: true,
            },
          ],
        },
      },
    });
  }

  // группы
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

  let group = await prisma.group.findFirst({
    where: { name: groupName },
  });

  if (!group) {
    group = await prisma.group.create({
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

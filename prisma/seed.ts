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

// helpers (dev seed)
async function findUserByEmail(email: string, contactTypeId: number) {
  const existing = await prisma.userContact.findFirst({
    where: {
      contactValue: email,
      contactTypeId,
    },
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

  // если занято — делаем уникальным
  const suffix = Math.floor(Math.random() * 1_000_000);
  return `${normalized}_${suffix}`;
}

// --- DEV/STAGING SEED (тестовые юзеры и группа) ---
async function seedDevData() {
  console.log('Seeding DEV data (test users, groups)...');

  const teacherPassword = 'Password123';
  const hashedPassword = await argon2.hash(teacherPassword);
  const teacherEmail = 'anna.ivanovna@example.com';

  // test telegram data (цифровые id + username)
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
    // username может конфликтовать, поэтому для учителя не задаём или делаем уникальным
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
        username, // TG username (handle) — хранится в User.username
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
              // ВАЖНО: telegramId — цифры, но в БД строкой
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

  const group = await prisma.group.findFirst({
    where: { name: groupName },
  });

  if (!group) {
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

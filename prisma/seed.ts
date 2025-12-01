import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2'; // Импортируем библиотеку argon2

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding ...');

  // --- 0. Создаем пароль и хешируем его с Argon2 ---
  const teacherPassword = 'Password123';
  // Argon2.hash() возвращает промис с хешем
  const hashedPassword = await argon2.hash(teacherPassword);
  const teacherEmail = 'anna.ivanovna@example.com';

  // --- 1. Создаем базовые роли ---
  const roleTeacher = await prisma.role.create({
    data: { name: 'teacher', scope: 'global', description: 'Преподаватель' },
  });
  const roleStudent = await prisma.role.create({
    data: { name: 'student', scope: 'global', description: 'Студент' },
  });

  // --- 2. Создаем типы контактов ---
  const contactTypeEmail = await prisma.contactType.create({
    data: { name: 'email', displayName: 'Email' },
  });
  const contactTypeTelegram = await prisma.contactType.create({
    data: { name: 'telegram', displayName: 'Telegram ID' },
  });

  // --- 3. Создаем пользователя-учителя С ХЕШЕМ ПАРОЛЯ Argon2 ---
  const teacherUser = await prisma.user.create({
    data: {
      firstName: 'Анна',
      lastName: 'Ивановна',
      roleId: roleTeacher.id,
      verified: true,
      passwordHash: hashedPassword, // Сохраняем хеш
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

  // --- 4. Создаем студентов ---
  const student1 = await prisma.user.create({
    data: {
      firstName: 'Петр',
      lastName: 'Петров',
      roleId: roleStudent.id,
      verified: true,
      level: 'B1',
      contacts: {
        create: [
          {
            contactValue: 'petr_petrov@example.com',
            contactTypeId: contactTypeEmail.id,
            isPrimary: true,
            verified: true,
          },
          // !!! ТЕЛЕГРАМ ID ДЛЯ ТЕСТИРОВАНИЯ !!!
          {
            contactValue: 'petka',
            contactTypeId: contactTypeTelegram.id,
            isPrimary: false,
            verified: true,
          },
        ],
      },
    },
  });

  // Создадим второго студента без телеграм ID, чтобы проверить логику фильтрации
  const student2 = await prisma.user.create({
    data: {
      firstName: 'Мария',
      lastName: 'Сидорова',
      roleId: roleStudent.id,
      level: 'A2',
      verified: true,
      contacts: {
        create: [
          {
            contactValue: 'petr_petrov@example.com',
            contactTypeId: contactTypeEmail.id,
            isPrimary: true,
            verified: true,
          },
          {
            contactValue: 'mariska',
            contactTypeId: contactTypeTelegram.id,
            isPrimary: false,
            verified: true,
          },
        ],
      },
    },
  });

  // --- 5. Создаем группу и привязываем учителя и студентов ---
  await prisma.group.create({
    data: {
      name: 'Группа А1 (Продвинутый)',
      teacherId: teacherUser.id, // Привязываем учителя
      students: {
        create: [
          { studentId: student1.id }, // Добавляем Петра в группу
          { studentId: student2.id }, // Добавляем Марию в группу
        ],
      },
    },
  });

  console.log(
    `Seeding finished. Teacher Email: ${teacherEmail}, Password: ${teacherPassword}`,
  );
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

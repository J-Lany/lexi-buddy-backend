import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  await prisma.role.createMany({
    data: [
      { name: 'teacher', description: 'Teacher', scope: 'global' },
      { name: 'student', description: 'Student', scope: 'global' },
      { name: 'admin', description: 'Administrator', scope: 'global' },
    ],
    skipDuplicates: true,
  });

  await prisma.contactType.createMany({
    data: [
      { name: 'email', displayName: 'Email' },
      { name: 'telegram', displayName: 'Telegram' },
    ],
    skipDuplicates: true,
  });
}

main();

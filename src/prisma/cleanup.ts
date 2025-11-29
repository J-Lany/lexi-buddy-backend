import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
async function main() {
  await prisma.userContact.deleteMany();
  await prisma.user.deleteMany();
}

main()
  .then(() => console.log('Done'))
  .catch(console.error)
  .finally(() => prisma.$disconnect());

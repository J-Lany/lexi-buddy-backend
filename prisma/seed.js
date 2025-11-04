"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
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
//# sourceMappingURL=seed.js.map
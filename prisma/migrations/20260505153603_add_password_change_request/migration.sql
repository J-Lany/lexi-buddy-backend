-- CreateTable
CREATE TABLE "PasswordChangeRequest" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordChangeRequest_userId_key" ON "PasswordChangeRequest"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordChangeRequest_token_key" ON "PasswordChangeRequest"("token");

-- AddForeignKey
ALTER TABLE "PasswordChangeRequest" ADD CONSTRAINT "PasswordChangeRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

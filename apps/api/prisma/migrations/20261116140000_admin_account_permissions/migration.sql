ALTER TABLE "User"
  ADD COLUMN "adminPermissionsCustomized" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "adminPermissionCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

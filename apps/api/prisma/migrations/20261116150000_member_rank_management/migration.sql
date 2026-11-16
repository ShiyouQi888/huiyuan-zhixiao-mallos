CREATE SEQUENCE IF NOT EXISTS "Rank_id_seq";
SELECT setval('"Rank_id_seq"', COALESCE((SELECT MAX("id") FROM "Rank"), 0) + 1, false);
ALTER TABLE "Rank" ALTER COLUMN "id" SET DEFAULT nextval('"Rank_id_seq"');
ALTER SEQUENCE "Rank_id_seq" OWNED BY "Rank"."id";

ALTER TABLE "Rank" ADD COLUMN "status" SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE "User" ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;

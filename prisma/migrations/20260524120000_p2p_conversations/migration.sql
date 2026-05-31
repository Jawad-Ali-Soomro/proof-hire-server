-- P2P conversations: one thread per user pair (directKey), not per contract.

ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "directKey" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Conversation" c
SET "directKey" = sub.key
FROM (
  SELECT
    c2."id" AS conv_id,
    CASE
      WHEN ct."clientId" < ct."freelancerId" THEN ct."clientId"::text || ':' || ct."freelancerId"::text
      ELSE ct."freelancerId"::text || ':' || ct."clientId"::text
    END AS key
  FROM "Conversation" c2
  INNER JOIN "Contract" ct ON ct."id" = c2."contractId"
  WHERE c2."contractId" IS NOT NULL
) sub
WHERE c."id" = sub.conv_id AND c."directKey" IS NULL;

-- Merge duplicate threads for the same pair (keep lowest conversation id).
UPDATE "Message" m
SET "conversationId" = dup.keep_id
FROM (
  SELECT "directKey", MIN("id") AS keep_id
  FROM "Conversation"
  WHERE "directKey" IS NOT NULL
  GROUP BY "directKey"
  HAVING COUNT(*) > 1
) dup
INNER JOIN "Conversation" c ON c."directKey" = dup."directKey" AND c."id" <> dup.keep_id
WHERE m."conversationId" = c."id";

DELETE FROM "ConversationParticipant" cp
USING "Conversation" c,
(
  SELECT "directKey", MIN("id") AS keep_id
  FROM "Conversation"
  WHERE "directKey" IS NOT NULL
  GROUP BY "directKey"
  HAVING COUNT(*) > 1
) dup
WHERE c."directKey" = dup."directKey"
  AND c."id" <> dup.keep_id
  AND cp."conversationId" = c."id";

DELETE FROM "Conversation" c
USING (
  SELECT "directKey", MIN("id") AS keep_id
  FROM "Conversation"
  WHERE "directKey" IS NOT NULL
  GROUP BY "directKey"
  HAVING COUNT(*) > 1
) dup
WHERE c."directKey" = dup."directKey" AND c."id" <> dup.keep_id;

CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_directKey_key" ON "Conversation"("directKey");

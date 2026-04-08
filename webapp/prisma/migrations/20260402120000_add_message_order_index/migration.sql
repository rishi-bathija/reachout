-- Add order_index to messages and backfill ordering
ALTER TABLE "messages" ADD COLUMN "order_index" INTEGER NOT NULL DEFAULT 0;

WITH ordered AS (
  SELECT id,
         connection_id,
         ROW_NUMBER() OVER (PARTITION BY connection_id ORDER BY created_at ASC, id ASC) - 1 AS rn
  FROM "messages"
)
UPDATE "messages" m
SET "order_index" = o.rn
FROM ordered o
WHERE m.id = o.id;

CREATE INDEX "messages_connection_id_order_index_idx" ON "messages" ("connection_id", "order_index");

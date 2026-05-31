-- Project and milestone reference links: [{ "title": "...", "url": "https://..." }]
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "links" JSONB;

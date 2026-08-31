ALTER TABLE "ShiftArchive" ADD COLUMN "shift" INTEGER;

UPDATE "ShiftArchive"
SET "shift" = CASE
  WHEN "shiftLabel" ~* '(^|[^0-9])2([^0-9]|$)|malam|night' THEN 2
  ELSE 1
END;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "ShiftArchive"
    GROUP BY "lineId", "date", "shift"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate ShiftArchive rows exist; review them before migration';
  END IF;
END $$;

ALTER TABLE "ShiftArchive" ALTER COLUMN "shift" SET NOT NULL;
CREATE UNIQUE INDEX "ShiftArchive_lineId_date_shift_key"
ON "ShiftArchive"("lineId", "date", "shift");

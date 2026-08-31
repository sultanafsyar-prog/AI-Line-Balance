CREATE OR REPLACE FUNCTION "set_shift_archive_shift"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."shift" IS NULL THEN
    NEW."shift" := CASE
      WHEN NEW."shiftLabel" ~* '(^|[^0-9])2([^0-9]|$)|malam|night' THEN 2
      ELSE 1
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ShiftArchive_set_shift"
BEFORE INSERT ON "ShiftArchive"
FOR EACH ROW EXECUTE FUNCTION "set_shift_archive_shift"();

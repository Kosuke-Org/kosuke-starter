-- Custom SQL migration file, put your code below! --
-- Moves records.updated_at forward on every update that does not set it, so a
-- Cron's plain `UPDATE records SET data = ...` still marks the record changed.
-- It always advances, even for two updates in the same millisecond.
CREATE TRIGGER `records_touch_updated_at`
AFTER UPDATE ON `records`
FOR EACH ROW WHEN NEW.`updated_at` = OLD.`updated_at`
BEGIN
	UPDATE `records`
	SET `updated_at` = max(
		CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER),
		OLD.`updated_at` + 1
	)
	WHERE `id` = NEW.`id`;
END;

CREATE TABLE `records` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`data` text DEFAULT '{}' NOT NULL,
	`sort_order` real DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "records_data_is_object" CHECK(json_valid(data) AND json_type(data) = 'object')
);
--> statement-breakpoint
CREATE INDEX `records_sort_order_idx` ON `records` (`sort_order`,`created_at`);--> statement-breakpoint
DROP TABLE `notes`;
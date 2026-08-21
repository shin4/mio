ALTER TABLE `session` ADD `immutable_hash` text;--> statement-breakpoint
ALTER TABLE `session` ADD `total_cache_hit_tokens` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `session` ADD `total_cache_miss_tokens` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `session` ADD `protocol` text;

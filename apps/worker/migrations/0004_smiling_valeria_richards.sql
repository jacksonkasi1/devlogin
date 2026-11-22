ALTER TABLE `accounts` ADD `tags` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts` ADD `favicon` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `tags` text DEFAULT '[]' NOT NULL;
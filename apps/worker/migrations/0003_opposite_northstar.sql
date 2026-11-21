CREATE TABLE `mcp_tokens` (
	`user_id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`encrypted_token` text NOT NULL,
	`created_at` text NOT NULL,
	`last_used_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_tokens_token_hash_unique` ON `mcp_tokens` (`token_hash`);--> statement-breakpoint
ALTER TABLE `users` ADD `can_edit` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `can_backup` integer DEFAULT true NOT NULL;
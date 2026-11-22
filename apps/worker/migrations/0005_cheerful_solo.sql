CREATE TABLE `personal_items` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`icon` text DEFAULT '' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`encrypted_fields` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

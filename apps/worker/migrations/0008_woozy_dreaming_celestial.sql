ALTER TABLE `attachments` ADD `account_id` text REFERENCES accounts(id) ON DELETE SET NULL;

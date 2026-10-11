ALTER TABLE `accounts` ADD `icon` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts` ADD `notes` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts` ADD `websites` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `icon` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE accounts SET websites = (
  SELECT json_group_array(json_object('url', site.value, 'login_path', projects.login_path, 'selectors', json(projects.selectors)))
  FROM projects, json_each(projects.urls) AS site
  WHERE projects.id = accounts.project_id AND (
    accounts.environment = '' OR
    (CASE WHEN instr(substr(site.value, instr(site.value, '://') + 3), '/') = 0 THEN site.value ELSE substr(site.value, 1, instr(site.value, '://') + 1 + instr(substr(site.value, instr(site.value, '://') + 3), '/')) END) =
    (CASE WHEN instr(substr(accounts.environment, instr(accounts.environment, '://') + 3), '/') = 0 THEN accounts.environment ELSE substr(accounts.environment, 1, instr(accounts.environment, '://') + 1 + instr(substr(accounts.environment, instr(accounts.environment, '://') + 3), '/')) END)
  )
) WHERE websites IS NULL;

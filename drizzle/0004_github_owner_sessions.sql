CREATE TABLE `github_owner_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `github_owner_sessions_expires_idx` ON `github_owner_sessions` (`expires_at`);
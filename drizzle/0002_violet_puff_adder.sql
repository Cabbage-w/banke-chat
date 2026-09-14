CREATE TABLE `accounts` (
	`username` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL,
	`password_hash` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`user`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_user_unique` ON `accounts` (`user`);
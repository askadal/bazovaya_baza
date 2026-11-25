CREATE TABLE `catalog_edits` (
	`product_id` text PRIMARY KEY NOT NULL,
	`section` text,
	`category` text,
	`rating` integer DEFAULT 50 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL,
	CONSTRAINT "rating_range" CHECK("rating" >= 0 AND "rating" <= 100),
	CONSTRAINT "category_pair" CHECK(("section" IS NULL AND "category" IS NULL) OR ("section" IS NOT NULL AND "category" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `catalog_owner` (
	`id` integer PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "one_owner" CHECK("id" = 1)
);

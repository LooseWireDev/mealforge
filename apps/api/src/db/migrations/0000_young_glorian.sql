CREATE TABLE `grocery_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` integer NOT NULL,
	`name` text NOT NULL,
	`normalized_key` text NOT NULL,
	`quantity_text` text DEFAULT '' NOT NULL,
	`section` text DEFAULT 'other' NOT NULL,
	`checked` integer DEFAULT false NOT NULL,
	`is_manual` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `meal_plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `grocery_items_plan_id_normalized_key_unique` ON `grocery_items` (`plan_id`,`normalized_key`);--> statement-breakpoint
CREATE TABLE `meal_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`week_start` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meal_plans_week_start_unique` ON `meal_plans` (`week_start`);--> statement-breakpoint
CREATE TABLE `meals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` integer NOT NULL,
	`recipe_id` integer NOT NULL,
	`day_of_week` integer NOT NULL,
	`meal_type` text DEFAULT 'dinner' NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `meal_plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meals_plan_id_day_of_week_meal_type_unique` ON `meals` (`plan_id`,`day_of_week`,`meal_type`);--> statement-breakpoint
CREATE TABLE `recipe_ingredients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipe_id` integer NOT NULL,
	`name` text NOT NULL,
	`quantity` real,
	`unit` text,
	`section` text DEFAULT 'other' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`servings` integer DEFAULT 4 NOT NULL,
	`prep_minutes` integer,
	`cook_minutes` integer,
	`tags` text DEFAULT '[]' NOT NULL,
	`steps_markdown` text NOT NULL,
	`is_favorite` integer DEFAULT false NOT NULL,
	`source` text DEFAULT 'agent' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);

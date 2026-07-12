PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_meal_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text,
	`status` text DEFAULT 'upcoming' NOT NULL,
	`is_favorite` integer DEFAULT false NOT NULL,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_meal_plans`("id", "name", "status", "is_favorite", "completed_at", "created_at", "updated_at")
SELECT
	"id",
	'Week of ' || "week_start",
	CASE
		WHEN "week_start" < date('now', 'localtime', '-6 days', 'weekday 1') THEN 'completed'
		WHEN "week_start" = date('now', 'localtime', '-6 days', 'weekday 1') THEN 'active'
		ELSE 'upcoming'
	END,
	0,
	CASE
		WHEN "week_start" < date('now', 'localtime', '-6 days', 'weekday 1')
			THEN CAST(strftime('%s', "week_start", '+7 days') AS INTEGER) * 1000
		ELSE NULL
	END,
	"created_at",
	"updated_at"
FROM `meal_plans`;--> statement-breakpoint
DROP TABLE `meal_plans`;--> statement-breakpoint
ALTER TABLE `__new_meal_plans` RENAME TO `meal_plans`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `meal_plans_one_active` ON `meal_plans` (`status`) WHERE "meal_plans"."status" = 'active';--> statement-breakpoint
DROP INDEX `meals_plan_id_day_of_week_meal_type_unique`;--> statement-breakpoint
ALTER TABLE `meals` ADD `sort_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `meals` SET `sort_order` = (
	SELECT COUNT(*) FROM `meals` m2
	WHERE m2.`plan_id` = `meals`.`plan_id`
		AND (m2.`day_of_week` < `meals`.`day_of_week`
			OR (m2.`day_of_week` = `meals`.`day_of_week` AND m2.`id` < `meals`.`id`))
);--> statement-breakpoint
UPDATE `meals` SET `meal_type` = CASE lower(trim(`meal_type`))
	WHEN 'breakfast' THEN 'breakfast'
	WHEN 'lunch' THEN 'lunch'
	WHEN 'snack' THEN 'snack'
	WHEN 'snacks' THEN 'snack'
	ELSE 'dinner'
END;--> statement-breakpoint
ALTER TABLE `meals` DROP COLUMN `day_of_week`;--> statement-breakpoint
ALTER TABLE `recipes` ADD `meal_types` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
UPDATE `recipes` SET `meal_types` = (
	SELECT json_group_array(mt) FROM (
		SELECT DISTINCT `meal_type` AS mt FROM `meals`
		WHERE `meals`.`recipe_id` = `recipes`.`id`
		ORDER BY mt
	)
)
WHERE `id` IN (SELECT DISTINCT `recipe_id` FROM `meals`);
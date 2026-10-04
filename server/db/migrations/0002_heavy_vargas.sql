CREATE TABLE "appointment_tags" (
	"appointment_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "appointment_tags_appointment_id_tag_id_pk" PRIMARY KEY("appointment_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"key" text NOT NULL,
	CONSTRAINT "tags_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "appointment_tags" ADD CONSTRAINT "appointment_tags_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_tags" ADD CONSTRAINT "appointment_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- RATTRAPAGE, écrit à la main : les intitulés deviennent des tags AVANT que la colonne ne
-- disparaisse. Sans ces deux requêtes, tout ce qui a été saisi serait perdu.
--
-- La clé de dédoublonnage est ici `lower(regexp_replace(btrim(title), '\s+', ' ', 'g'))` :
-- c'est EXACTEMENT la règle de `tagKey` (app/utils/tags.ts). La changer dans l'un oblige à la
-- changer dans l'autre. Pas de repli des accents : l'extension `unaccent` n'est pas garantie
-- sur Neon, et une seconde règle approximative créerait des doublons silencieux.
--
-- `GROUP BY` sur la clé, et non `DISTINCT` sur le couple : « Courses » et « courses » ont la
-- même clé, donc UN SEUL tag (l'index unique refuserait les deux). `min` garde un nom stable,
-- et le nom est lui aussi normalisé (espaces réduits) : un tag affiché garde le même aspect
-- que s'il avait été créé depuis l'écran.
INSERT INTO "tags" ("name", "key")
SELECT min(regexp_replace(btrim("title"), '\s+', ' ', 'g')),
       lower(regexp_replace(btrim("title"), '\s+', ' ', 'g'))
FROM "appointments"
WHERE btrim("title") <> ''
GROUP BY lower(regexp_replace(btrim("title"), '\s+', ' ', 'g'));--> statement-breakpoint
-- Un intitulé par créneau, donc un seul lien, en position 0.
INSERT INTO "appointment_tags" ("appointment_id", "tag_id", "position")
SELECT a."id", t."id", 0
FROM "appointments" a
JOIN "tags" t ON t."key" = lower(regexp_replace(btrim(a."title"), '\s+', ' ', 'g'))
WHERE btrim(a."title") <> '';--> statement-breakpoint
ALTER TABLE "appointments" DROP COLUMN "title";
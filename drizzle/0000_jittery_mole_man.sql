CREATE TABLE "accessed" (
	"blob" varchar(64) PRIMARY KEY NOT NULL,
	"timestamp" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blobs" (
	"sha256" varchar(64) PRIMARY KEY NOT NULL,
	"type" text,
	"size" integer NOT NULL,
	"uploaded" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owners" (
	"id" serial PRIMARY KEY NOT NULL,
	"blob" varchar(64) NOT NULL,
	"pubkey" varchar(64) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "owners" ADD CONSTRAINT "owners_blob_blobs_sha256_fk" FOREIGN KEY ("blob") REFERENCES "public"."blobs"("sha256") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accessed_timestamp" ON "accessed" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "blobs_uploaded" ON "blobs" USING btree ("uploaded");--> statement-breakpoint
CREATE INDEX "owners_pubkey" ON "owners" USING btree ("pubkey");
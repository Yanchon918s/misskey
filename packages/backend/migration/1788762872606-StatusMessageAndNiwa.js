/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class StatusMessageAndNiwa1788762872606 {
    name = 'StatusMessageAndNiwa1788762872606';

    async up(queryRunner) {
        await queryRunner.query('ALTER TABLE "user_profile" ADD "statusMessage" character varying(80)');
        await queryRunner.query('ALTER TABLE "user_profile" ADD "statusExpiresAt" TIMESTAMP WITH TIME ZONE');
        await queryRunner.query('ALTER TABLE "user_profile" ADD "niwaLastWateredAt" TIMESTAMP WITH TIME ZONE');
        await queryRunner.query('CREATE TABLE "niwa_garden" ("id" character varying(32) NOT NULL, "waterCount" integer NOT NULL DEFAULT 0, CONSTRAINT "PK_niwa_garden" PRIMARY KEY ("id"))');
    }

    async down(queryRunner) {
        await queryRunner.query('DROP TABLE "niwa_garden"');
        await queryRunner.query('ALTER TABLE "user_profile" DROP COLUMN "niwaLastWateredAt"');
        await queryRunner.query('ALTER TABLE "user_profile" DROP COLUMN "statusExpiresAt"');
        await queryRunner.query('ALTER TABLE "user_profile" DROP COLUMN "statusMessage"');
    }
}

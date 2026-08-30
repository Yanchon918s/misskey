/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class NoCrawleDefaultTrue1788130633380 {
    name = 'NoCrawleDefaultTrue1788130633380'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user_profile" ALTER COLUMN "noCrawle" SET DEFAULT true`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user_profile" ALTER COLUMN "noCrawle" SET DEFAULT false`);
    }
}

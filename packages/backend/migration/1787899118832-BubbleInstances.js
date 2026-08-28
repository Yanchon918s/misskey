/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class BubbleInstances1787899118832 {
	name = 'BubbleInstances1787899118832';

	async up(queryRunner) {
		await queryRunner.query('ALTER TABLE "meta" ADD "bubbleInstances" character varying(1024) array NOT NULL DEFAULT \'{}\'');
	}

	async down(queryRunner) {
		await queryRunner.query('ALTER TABLE "meta" DROP COLUMN "bubbleInstances"');
	}
}

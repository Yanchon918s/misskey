/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// 承認制の登録。設計は Elythia (https://github.com/Elythia-Network/elythia, AGPL-3.0) の
// migration 000075〜000079 に倣う。
//
// down は申請と申請フォームの定義を消す (data loss)。承認済みで未登録の申請者は登録できなくなるので、
// 承認制を無効にしてから流すこと。
export class SignupApplication1792356476214 {
    name = 'SignupApplication1792356476214'

    async up(queryRunner) {
        await queryRunner.query(`CREATE TABLE "signup_application" ("id" character varying(32) NOT NULL, "claimCodeHash" character varying(64) NOT NULL, "status" character varying(16) NOT NULL DEFAULT 'pending', "answers" jsonb NOT NULL DEFAULT '[]', "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "processedAt" TIMESTAMP WITH TIME ZONE, "processedById" character varying(32), "usedById" character varying(32), CONSTRAINT "PK_signup_application" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_signup_application_claimCodeHash" ON "signup_application" ("claimCodeHash") `);
        await queryRunner.query(`CREATE INDEX "IDX_signup_application_status" ON "signup_application" ("status") `);
        await queryRunner.query(`ALTER TABLE "meta" ADD "approvalRequiredForSignup" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "signupApplicationForm" jsonb NOT NULL DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "user_pending" ADD "signupApplicationId" character varying(32)`);
        await queryRunner.query(`CREATE INDEX "IDX_user_pending_signupApplicationId" ON "user_pending" ("signupApplicationId") `);
    }

    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX "public"."IDX_user_pending_signupApplicationId"`);
        await queryRunner.query(`ALTER TABLE "user_pending" DROP COLUMN "signupApplicationId"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "signupApplicationForm"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "approvalRequiredForSignup"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_signup_application_status"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_signup_application_claimCodeHash"`);
        await queryRunner.query(`DROP TABLE "signup_application"`);
    }
}

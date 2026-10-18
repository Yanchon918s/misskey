/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// 承認制の登録の申請。
// Elythia (https://github.com/Elythia-Network/elythia, AGPL-3.0) の signup_application
// (migration 000075〜000079) の設計を TypeScript へ移したもの。
//
// 承認待ちを user 行として持たないための箱で、user は承認後の登録時に初めて作られる。
// このテーブルを知らない上流の Misskey に戻しても、承認待ちが有効なアカウントになることはない。

import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';

/**
 * pending   -> approved / rejected (審査)
 * approved  -> completed           (登録)
 * pending   -> expired             (放置)
 * approved  -> expired             (放置)
 *
 * rejected / expired / completed は終端。再申請は別の行になる。
 */
export const signupApplicationStatuses = ['pending', 'approved', 'rejected', 'expired', 'completed'] as const;
export type SignupApplicationStatus = typeof signupApplicationStatuses[number];

export const signupApplicationFormFieldTypes = ['text', 'textarea'] as const;

/**
 * 管理者が定義する申請フォームの 1 項目 (meta.signupApplicationForm の要素)。
 */
export type SignupApplicationFormField = {
	label: string;
	type: typeof signupApplicationFormFieldTypes[number];
	required: boolean;
	/**
	 * 回答の最大文字数。省略時は既定値。
	 */
	maxLength?: number;
};

export type SignupApplicationAnswer = {
	/**
	 * 提出時の設問のラベル。定義を後から変えても審査画面が壊れないように、回答と一緒に保存する。
	 * 申請者に送らせると審査画面に偽のラベルを流し込めるので、サーバーが定義から埋める。
	 */
	label: string;
	value: string;
};

@Entity('signup_application')
@Index('IDX_signup_application_status', ['status'])
export class MiSignupApplication {
	@PrimaryColumn({ ...id(), primaryKeyConstraintName: 'PK_signup_application' })
	public id: string;

	/**
	 * 申請者に 1 度だけ見せるクレームコードの SHA-256 (hex)。
	 * コードは状態確認と登録の両方の入口になるので、平文では保存しない。
	 */
	@Index('IDX_signup_application_claimCodeHash', { unique: true })
	@Column('varchar', {
		length: 64,
	})
	public claimCodeHash: string;

	@Column('varchar', {
		length: 16, default: 'pending',
	})
	public status: SignupApplicationStatus;

	@Column('jsonb', {
		default: [],
	})
	public answers: SignupApplicationAnswer[];

	@Column('timestamp with time zone')
	public expiresAt: Date;

	@Column('timestamp with time zone', {
		nullable: true,
	})
	public processedAt: Date | null;

	/**
	 * 審査したモデレーター。監査用の記録なので外部キーは張らない
	 * (モデレーターのアカウントを消しても申請の履歴は残す)。
	 */
	@Column({
		...id(),
		nullable: true,
	})
	public processedById: string | null;

	/**
	 * この申請から作られたアカウント。processedById と同じ理由で外部キーは張らない。
	 */
	@Column({
		...id(),
		nullable: true,
	})
	public usedById: string | null;
}

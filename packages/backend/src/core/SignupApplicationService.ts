/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// 承認制の登録の申請を扱う。
// Elythia (https://github.com/Elythia-Network/elythia, AGPL-3.0) の internal/core/signupapplication と
// internal/core/signupform の設計を TypeScript へ移したもの。
//
// 承認待ちを user 行として持たないのが設計の核で、user が作られるのは承認後の登録時だけ。
// 本人性は申請時に 1 度だけ見せるクレームコードが担保し、サーバーにはそのハッシュしか残さない。

import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { In, IsNull, LessThanOrEqual, MoreThan } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { MiMeta, SignupApplicationsRepository } from '@/models/_.js';
import type {
	MiSignupApplication,
	SignupApplicationAnswer,
	SignupApplicationFormField,
	SignupApplicationStatus,
} from '@/models/SignupApplication.js';
import { IdService } from '@/core/IdService.js';
import { RoleService } from '@/core/RoleService.js';
import { NotificationService } from '@/core/NotificationService.js';
import { LoggerService } from '@/core/LoggerService.js';
import { bindThis } from '@/decorators.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';
import type Logger from '@/logger.js';

/**
 * 申請の有効期限。承認したときは、そこからもう一度この長さだけ登録の猶予を与える。
 */
export const SIGNUP_APPLICATION_TTL = 1000 * 60 * 60 * 24 * 7;

/**
 * 上限を置かないと、管理者が項目を増やしすぎて申請ページが使えなくなったり、
 * 1 件の申請で DB を膨らませたりできてしまう。
 */
export const SIGNUP_APPLICATION_MAX_FORM_FIELDS = 10;
export const SIGNUP_APPLICATION_MAX_LABEL_LENGTH = 100;
export const SIGNUP_APPLICATION_MAX_ANSWER_LENGTH = 2000;
export const SIGNUP_APPLICATION_DEFAULT_ANSWER_LENGTH = 500;

/**
 * captcha が 1 つも有効でないときに申請を守るフォームトークン。
 * captcha の代替ではなく、フォームを開かずに endpoint を直接叩く bot を止めるだけのもの。
 */
const FORM_TOKEN_MIN_WAIT_MS = 1000 * 3;
const FORM_TOKEN_TTL_SEC = 60 * 30;
const FORM_TOKEN_KEY_PREFIX = 'signupApplicationFormToken';

const LIVE_STATUSES = ['pending', 'approved'] as const satisfies SignupApplicationStatus[];

export type SignupApplicationErrorCode =
	| 'NO_SUCH_APPLICATION'
	| 'APPLICATION_EXPIRED'
	| 'APPLICATION_NOT_PENDING'
	| 'FORM_CHANGED'
	| 'ANSWER_REQUIRED'
	| 'ANSWER_TOO_LONG'
	| 'INVALID_ANSWER'
	| 'FORM_TOKEN_INVALID'
	| 'FORM_TOKEN_TOO_SOON';

export class SignupApplicationError extends Error {
	constructor(public code: SignupApplicationErrorCode) {
		super(code);
	}
}

/**
 * クレームコードから DB に保存する値を作る。
 * 総当たりへの耐性はコード自身のエントロピーが担うので、伸長はしない。
 */
export function hashSignupApplicationClaimCode(claimCode: string): string {
	return createHash('sha256').update(claimCode).digest('hex');
}

// jsonb は NUL (\u0000) と対にならないサロゲートを含む文字列を受け付けず、クエリごと失敗する。
// 申請は未認証で叩けるので、ここで弾かないと誰でも 500 を起こせる。
// eslint-disable-next-line no-control-regex
const UNSTORABLE_CHARACTERS = /\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/**
 * jsonb に保存できない文字を取り除く (管理者が定義するフォームの項目名向け)。
 */
export function removeUnstorableCharacters(text: string): string {
	return text.replace(new RegExp(UNSTORABLE_CHARACTERS.source, 'g'), '');
}

/**
 * 送られた回答を現在のフォーム定義と突き合わせる。
 *
 * 値は定義と同じ順序の配列で受け取り、ラベルは定義から埋める。
 * 申請の途中で管理者が定義を変えた場合は、黙って詰め合わせずにやり直してもらう。
 */
export function buildSignupApplicationAnswers(fields: SignupApplicationFormField[], values: string[]): SignupApplicationAnswer[] {
	if (values.length !== fields.length) {
		throw new SignupApplicationError('FORM_CHANGED');
	}

	return fields.map((field, i) => {
		const value = values[i].trim();

		if (UNSTORABLE_CHARACTERS.test(value)) {
			throw new SignupApplicationError('INVALID_ANSWER');
		}

		if (field.required && value === '') {
			throw new SignupApplicationError('ANSWER_REQUIRED');
		}

		const maxLength = Math.min(field.maxLength ?? SIGNUP_APPLICATION_DEFAULT_ANSWER_LENGTH, SIGNUP_APPLICATION_MAX_ANSWER_LENGTH);
		// サロゲートペアを 2 文字と数えないように、コードポイント単位で数える
		if ([...value].length > maxLength) {
			throw new SignupApplicationError('ANSWER_TOO_LONG');
		}

		return { label: field.label, value };
	});
}

@Injectable()
export class SignupApplicationService {
	private logger: Logger;

	constructor(
		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		@Inject(DI.signupApplicationsRepository)
		private signupApplicationsRepository: SignupApplicationsRepository,

		private idService: IdService,
		private roleService: RoleService,
		private notificationService: NotificationService,
		private loggerService: LoggerService,
	) {
		this.logger = this.loggerService.getLogger('signup-application');
	}

	/**
	 * 申請を受け付け、クレームコードを発行する。
	 *
	 * コードの平文を返すのはここだけ。保存するのはハッシュなので、失くした申請者には再申請してもらうしかない。
	 */
	@bindThis
	public async apply(answers: SignupApplicationAnswer[]): Promise<{ application: MiSignupApplication; claimCode: string; }> {
		const now = Date.now();
		const claimCode = randomBytes(20).toString('hex');

		const application = await this.signupApplicationsRepository.insertOne({
			id: this.idService.gen(now),
			claimCodeHash: hashSignupApplicationClaimCode(claimCode),
			status: 'pending',
			answers,
			expiresAt: new Date(now + SIGNUP_APPLICATION_TTL),
			processedAt: null,
			processedById: null,
			usedById: null,
		});

		// 申請は保存済みなので、通知に失敗しても申請自体は成立させる
		await this.notifyModerators(application).catch(err => {
			this.logger.error('Failed to notify moderators of a signup application', { error: err });
		});

		return { application, claimCode };
	}

	@bindThis
	private async notifyModerators(application: MiSignupApplication): Promise<void> {
		const moderatorIds = await this.roleService.getModeratorIds({
			includeAdmins: true,
			includeRoot: true,
			excludeExpire: true,
		});

		// 回答は載せない。運営者が定義した任意の項目なので個人情報が入りうるうえ、
		// 申請を消しても通知の側に複製が残ってしまう。読むときは申請の行から引く。
		for (const moderatorId of moderatorIds) {
			this.notificationService.createNotification(moderatorId, 'signupApplicationReceived', {
				signupApplicationId: application.id,
			});
		}
	}

	/**
	 * クレームコードが指す申請を返す。期限を過ぎていれば、その場で期限切れにする。
	 *
	 * 期限切れの申請もそのまま返す (申請者にはもう一度申請するよう案内する)。
	 * 総当たりへの耐性はコードのエントロピー (160bit) とレート制限が担う。
	 */
	@bindThis
	public async findByClaimCode(claimCode: string): Promise<MiSignupApplication | null> {
		if (claimCode === '') return null;

		const application = await this.signupApplicationsRepository.findOneBy({
			claimCodeHash: hashSignupApplicationClaimCode(claimCode),
		});
		if (application == null) return null;

		return await this.expireIfStale(application);
	}

	@bindThis
	private async expireIfStale(application: MiSignupApplication, now = new Date()): Promise<MiSignupApplication> {
		if (!(LIVE_STATUSES as SignupApplicationStatus[]).includes(application.status)) return application;
		if (application.expiresAt.getTime() > now.getTime()) return application;

		await this.signupApplicationsRepository.update({
			id: application.id,
			status: In(LIVE_STATUSES),
			expiresAt: LessThanOrEqual(now),
		}, {
			status: 'expired',
		});

		return { ...application, status: 'expired' };
	}

	/**
	 * 期限を過ぎた申請をまとめて期限切れにする。
	 * 申請者が見に来るまで反映されない分を、審査画面を開いたときに実態へ寄せる。
	 */
	@bindThis
	public async expireStale(): Promise<void> {
		await this.signupApplicationsRepository.update({
			status: In(LIVE_STATUSES),
			expiresAt: LessThanOrEqual(new Date()),
		}, {
			status: 'expired',
		});
	}

	@bindThis
	public async approve(applicationId: MiSignupApplication['id'], moderatorId: string): Promise<MiSignupApplication> {
		return await this.review(applicationId, moderatorId, 'approved');
	}

	@bindThis
	public async reject(applicationId: MiSignupApplication['id'], moderatorId: string): Promise<MiSignupApplication> {
		return await this.review(applicationId, moderatorId, 'rejected');
	}

	@bindThis
	private async review(applicationId: MiSignupApplication['id'], moderatorId: string, status: 'approved' | 'rejected'): Promise<MiSignupApplication> {
		const now = new Date();

		// 審査待ちで期限内の行だけを条件付きで更新する。
		// 素の read-modify-write にすると、承認と却下が同時に通るような取り違えが起きる。
		const result = await this.signupApplicationsRepository.update({
			id: applicationId,
			status: 'pending',
			expiresAt: MoreThan(now),
		}, {
			status,
			processedAt: now,
			processedById: moderatorId,
			// 承認したら、そこから登録の猶予を数え直す (審査に時間がかかっても登録の時間を残す)
			...(status === 'approved' ? { expiresAt: new Date(now.getTime() + SIGNUP_APPLICATION_TTL) } : {}),
		});

		if ((result.affected ?? 0) === 0) {
			const current = await this.signupApplicationsRepository.findOneBy({ id: applicationId });
			if (current == null) throw new SignupApplicationError('NO_SUCH_APPLICATION');
			if (current.status === 'pending') {
				// 期限切れを審査させない。掃除は遅れて反映されるので、行はまだ pending のまま残っている。
				// 期限切れは審査の結果ではないので processedBy / processedAt は立てない。
				await this.expireIfStale(current, now);
				throw new SignupApplicationError('APPLICATION_EXPIRED');
			}
			throw new SignupApplicationError('APPLICATION_NOT_PENDING');
		}

		return await this.signupApplicationsRepository.findOneByOrFail({ id: applicationId });
	}

	/**
	 * 承認済みの申請を、アカウント作成のために確保する (approved -> completed)。
	 *
	 * 確保できるのは 1 回だけなので、承認済みの申請者が別々のユーザー名で同時に登録しても、
	 * アカウントは 1 つしか作られない。アカウント作成に失敗したら {@link releaseRegistration} で戻す。
	 *
	 * @returns 確保できた場合は true
	 */
	@bindThis
	public async claimForRegistration(applicationId: MiSignupApplication['id']): Promise<boolean> {
		const result = await this.signupApplicationsRepository.update({
			id: applicationId,
			status: 'approved',
			expiresAt: MoreThan(new Date()),
		}, {
			status: 'completed',
		});

		return (result.affected ?? 0) > 0;
	}

	/**
	 * {@link claimForRegistration} で確保した申請を承認済みに戻す。アカウントと紐付け済みの申請は戻さない。
	 */
	@bindThis
	public async releaseRegistration(applicationId: MiSignupApplication['id']): Promise<void> {
		await this.signupApplicationsRepository.update({
			id: applicationId,
			status: 'completed',
			usedById: IsNull(),
		}, {
			status: 'approved',
		});
	}

	@bindThis
	public async completeRegistration(applicationId: MiSignupApplication['id'], userId: string): Promise<void> {
		await this.signupApplicationsRepository.update({
			id: applicationId,
			status: 'completed',
		}, {
			usedById: userId,
		});
	}

	/**
	 * 本物の captcha が 1 つも有効でないときだけ、申請にフォームトークンを要求する。
	 * testcaptcha は本物として数えない。テスト時は既存の captcha と同じく無効にする。
	 */
	@bindThis
	public isFormTokenRequired(): boolean {
		if (process.env.NODE_ENV === 'test') return false;

		const m = this.meta;
		const hasRealCaptcha =
			(m.enableHcaptcha && m.hcaptchaSecretKey != null) ||
			(m.enableMcaptcha && m.mcaptchaSecretKey != null && m.mcaptchaSitekey != null && m.mcaptchaInstanceUrl != null) ||
			(m.enableRecaptcha && m.recaptchaSecretKey != null) ||
			(m.enableTurnstile && m.turnstileSecretKey != null);

		return !hasRealCaptcha;
	}

	/**
	 * 要求しない構成では空のトークンを返す (画面は「空なら送信を抑えない」だけで済む)。
	 */
	@bindThis
	public async issueFormToken(): Promise<{ token: string; minWaitSeconds: number; }> {
		if (!this.isFormTokenRequired()) {
			return { token: '', minWaitSeconds: 0 };
		}

		const token = secureRndstr(32);
		await this.redisClient.set(`${FORM_TOKEN_KEY_PREFIX}:${token}`, Date.now().toString(), 'EX', FORM_TOKEN_TTL_SEC);

		return {
			token,
			// 切り捨てると画面のほうが短く待ち、正規の利用者が FORM_TOKEN_TOO_SOON を見る
			minWaitSeconds: Math.ceil(FORM_TOKEN_MIN_WAIT_MS / 1000),
		};
	}

	/**
	 * フォームトークンを検証して消費する。早すぎる送信ではトークンを消費しないので、待てば同じトークンで通る。
	 */
	@bindThis
	public async verifyFormToken(token: string | null | undefined): Promise<void> {
		if (!this.isFormTokenRequired()) return;

		if (token == null || token === '') {
			throw new SignupApplicationError('FORM_TOKEN_INVALID');
		}

		const key = `${FORM_TOKEN_KEY_PREFIX}:${token}`;
		const issuedAt = await this.redisClient.get(key);
		if (issuedAt == null) {
			throw new SignupApplicationError('FORM_TOKEN_INVALID');
		}

		if (Date.now() - Number(issuedAt) < FORM_TOKEN_MIN_WAIT_MS) {
			throw new SignupApplicationError('FORM_TOKEN_TOO_SOON');
		}

		// 同じトークンでの同時送信は、先に消せた 1 件だけを通す
		const deleted = await this.redisClient.del(key);
		if (deleted !== 1) {
			throw new SignupApplicationError('FORM_TOKEN_INVALID');
		}
	}
}

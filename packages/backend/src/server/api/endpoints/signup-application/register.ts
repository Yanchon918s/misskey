/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { IsNull } from 'typeorm';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import type { Config } from '@/config.js';
import type { MiMeta, UsedUsernamesRepository, UserPendingsRepository, UsersRepository } from '@/models/_.js';
import { SignupApplicationService } from '@/core/SignupApplicationService.js';
import { SignupService } from '@/core/SignupService.js';
import { EmailService } from '@/core/EmailService.js';
import { IdService } from '@/core/IdService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { L_CHARS, secureRndstr } from '@/misc/secure-rndstr.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['signup-application'],

	requireCredential: false,

	description: 'Create an account from an approved signup application. When email is required for signup, a confirmation link is sent instead and the account is created when the link is opened.',

	limit: {
		duration: 1000 * 60 * 60,
		max: 10,
	},

	errors: {
		unavailable: {
			message: 'Approval-based signup is not enabled.',
			code: 'UNAVAILABLE',
			id: '6d80a335-6b46-421e-8791-dce22c919a97',
		},
		noSuchApplication: {
			message: 'No such application.',
			code: 'NO_SUCH_APPLICATION',
			id: 'c08ffadd-0c77-4765-9258-1280e64bc9e8',
		},
		notApproved: {
			message: 'This application is not approved.',
			code: 'NOT_APPROVED',
			id: 'b2edd339-b4c2-435c-8d32-d3ebd1bc8375',
		},
		invalidUsername: {
			message: 'This username cannot be used.',
			code: 'INVALID_USERNAME',
			id: 'a06b22a9-08b8-43b7-a346-2e67f3790718',
		},
		invalidPassword: {
			message: 'This password cannot be used.',
			code: 'INVALID_PASSWORD',
			id: '4eb5fc07-a7c3-443c-a993-49b792d366fa',
		},
		duplicatedUsername: {
			message: 'This username is already taken.',
			code: 'DUPLICATED_USERNAME',
			id: 'bbbb8bb6-4c80-4032-9a41-33d7a30a77af',
		},
		usedUsername: {
			message: 'This username is not available.',
			code: 'USED_USERNAME',
			id: '2c81b295-2daf-4da1-81e1-4eddfe6fd949',
		},
		emailRequired: {
			message: 'An email address is required for signup.',
			code: 'EMAIL_REQUIRED',
			id: '1ff00533-f85b-465a-8c9f-8129324bf77b',
		},
		emailUnavailable: {
			message: 'This email address is not available.',
			code: 'EMAIL_UNAVAILABLE',
			id: 'c35051ba-df65-47fa-8ec0-b67da4ebab78',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			status: {
				type: 'string',
				optional: false, nullable: false,
				enum: ['registered', 'emailConfirmationRequired'],
			},
			// アカウントを作った場合だけ返す。メールの確認を挟む場合は、確認リンクを開いた時点でサインインする
			token: {
				type: 'string',
				optional: false, nullable: true,
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		claimCode: { type: 'string', minLength: 1, maxLength: 128 },
		username: { type: 'string', minLength: 1, maxLength: 128 },
		password: { type: 'string', minLength: 1 },
		emailAddress: { type: 'string', nullable: true, maxLength: 128 },
	},
	required: ['claimCode', 'username', 'password'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private serverSettings: MiMeta,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.usedUsernamesRepository)
		private usedUsernamesRepository: UsedUsernamesRepository,

		@Inject(DI.userPendingsRepository)
		private userPendingsRepository: UserPendingsRepository,

		private signupApplicationService: SignupApplicationService,
		private signupService: SignupService,
		private emailService: EmailService,
		private idService: IdService,
		private utilityService: UtilityService,
		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps) => {
			if (!this.serverSettings.approvalRequiredForSignup) {
				throw new ApiError(meta.errors.unavailable);
			}

			// 申請の状態はここで引き直す。画面が古い状態を握っていても、承認されていない申請は通さない。
			// メールアドレスの検証は外部サービスを呼びうるので、コードを持たない相手には先に進ませない
			const application = await this.signupApplicationService.findByClaimCode(ps.claimCode);
			if (application == null) {
				throw new ApiError(meta.errors.noSuchApplication);
			}
			if (application.status !== 'approved') {
				throw new ApiError(meta.errors.notApproved);
			}

			if (!this.userEntityService.validateLocalUsername(ps.username)) {
				throw new ApiError(meta.errors.invalidUsername);
			}

			if (!this.userEntityService.validatePassword(ps.password)) {
				throw new ApiError(meta.errors.invalidPassword);
			}

			const emailAddress = this.serverSettings.emailRequiredForSignup ? ps.emailAddress : null;
			if (this.serverSettings.emailRequiredForSignup) {
				if (emailAddress == null || emailAddress === '') {
					throw new ApiError(meta.errors.emailRequired);
				}

				const res = await this.emailService.validateEmailForAccount(emailAddress);
				if (!res.available) {
					throw new ApiError(meta.errors.emailUnavailable);
				}
			}

			if (emailAddress != null) {
				await this.checkUsernameAvailability(ps.username);

				const code = secureRndstr(16, { chars: L_CHARS });
				const salt = await bcrypt.genSalt(8);
				const hash = await bcrypt.hash(ps.password, salt);

				// 前回の試行の確認リンクを無効にする。
				// 残すと、届いたメールをすべて確認して 1 つの承認から複数のアカウントを作れてしまう。
				// (確認時の申請の確保は 1 回しか通らないので、それでも 2 つ目のアカウントは作られない)
				await this.userPendingsRepository.delete({ signupApplicationId: application.id });

				await this.userPendingsRepository.insert({
					id: this.idService.gen(),
					code,
					email: emailAddress,
					username: ps.username,
					password: hash,
					signupApplicationId: application.id,
				});

				const link = `${this.config.url}/signup-complete/${code}`;

				this.emailService.sendEmail(emailAddress, 'Signup',
					`To complete signup, please click this link:<br><a href="${link}">${link}</a>`,
					`To complete signup, please click this link: ${link}`);

				return {
					status: 'emailConfirmationRequired' as const,
					token: null,
				};
			}

			// 申請の確保とアカウント作成の間に別の登録が割り込んでも、確保は 1 回しか通らない
			if (!await this.signupApplicationService.claimForRegistration(application.id)) {
				throw new ApiError(meta.errors.notApproved);
			}

			let created: Awaited<ReturnType<SignupService['signup']>>;
			try {
				created = await this.signupService.signup({
					username: ps.username,
					password: ps.password,
				});
			} catch (err) {
				// 申請は使われなかったので、承認済みに戻してやり直せるようにする
				await this.signupApplicationService.releaseRegistration(application.id);
				throw this.toApiError(err);
			}

			await this.signupApplicationService.completeRegistration(application.id, created.account.id);

			return {
				status: 'registered' as const,
				token: created.secret,
			};
		});
	}

	/**
	 * メールの確認を挟む場合はアカウントをまだ作らないので、使えないユーザー名をここで先に弾く。
	 * (SignupService.signup と同じ判定。確認時にもう一度判定される)
	 */
	private async checkUsernameAvailability(username: string): Promise<void> {
		const usernameLower = username.toLowerCase();

		if (await this.usersRepository.exists({ where: { usernameLower, host: IsNull() } })) {
			throw new ApiError(meta.errors.duplicatedUsername);
		}

		if (await this.usedUsernamesRepository.exists({ where: { username: usernameLower } })) {
			throw new ApiError(meta.errors.usedUsername);
		}

		if (this.serverSettings.rootUserId != null) {
			const isPreserved = this.serverSettings.preservedUsernames.map(x => x.toLowerCase()).includes(usernameLower);
			const hasProhibitedWords = this.utilityService.isKeyWordIncluded(usernameLower, this.serverSettings.prohibitedWordsForNameOfUser);
			if (isPreserved || hasProhibitedWords) {
				throw new ApiError(meta.errors.usedUsername);
			}
		}
	}

	private toApiError(err: unknown): unknown {
		if (!(err instanceof Error)) return err;

		switch (err.message) {
			case 'INVALID_USERNAME': return new ApiError(meta.errors.invalidUsername);
			case 'INVALID_PASSWORD': return new ApiError(meta.errors.invalidPassword);
			case 'DUPLICATED_USERNAME': return new ApiError(meta.errors.duplicatedUsername);
			// SignupService はトランザクション内で重複を見つけたとき、この文言で投げる
			case ' the username is already used': return new ApiError(meta.errors.duplicatedUsername);
			case 'USED_USERNAME': return new ApiError(meta.errors.usedUsername);
			default: return err;
		}
	}
}

/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import type { MiMeta } from '@/models/_.js';
import { CaptchaService } from '@/core/CaptchaService.js';
import {
	SignupApplicationError,
	SignupApplicationService,
	SIGNUP_APPLICATION_MAX_FORM_FIELDS,
	buildSignupApplicationAnswers,
} from '@/core/SignupApplicationService.js';
import { SignupApplicationEntityService } from '@/core/entities/SignupApplicationEntityService.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['signup-application'],

	requireCredential: false,

	description: 'Apply for an account on a server that requires approval for signup. The claim code in the response is shown only once.',

	// 申請フォームは誰でも叩けるので、captcha とこの制限が防波堤になる
	limit: {
		duration: 1000 * 60 * 60,
		max: 5,
	},

	errors: {
		unavailable: {
			message: 'Approval-based signup is not enabled.',
			code: 'UNAVAILABLE',
			id: '6abf765c-dfe4-4ff7-aa66-b4191d3602b7',
		},
		captchaFailed: {
			message: 'Captcha verification failed.',
			code: 'CAPTCHA_FAILED',
			id: '8a39badf-bcfa-4aa4-9d91-c26d98e12ad9',
		},
		formChanged: {
			message: 'The application form has changed. Reload and try again.',
			code: 'FORM_CHANGED',
			id: '68f478c3-3912-4f3c-b575-0fa4c824ec5e',
		},
		answerRequired: {
			message: 'A required answer is missing.',
			code: 'ANSWER_REQUIRED',
			id: '41be5b15-ada0-455e-8c6d-8c89cf2de2db',
		},
		answerTooLong: {
			message: 'An answer is too long.',
			code: 'ANSWER_TOO_LONG',
			id: '852fbbe9-3524-4ac9-a9c6-ccb258bc97d4',
		},
		invalidAnswer: {
			message: 'An answer contains characters that cannot be stored.',
			code: 'INVALID_ANSWER',
			id: 'f4c025c0-fb32-40b8-98a3-382f7ea39c0e',
		},
		formTokenInvalid: {
			message: 'The form token is invalid or expired. Reload the form and try again.',
			code: 'FORM_TOKEN_INVALID',
			id: 'a2af56e2-3909-4ced-a433-9abd9e951923',
		},
		formTokenTooSoon: {
			message: 'The form was submitted too quickly.',
			code: 'FORM_TOKEN_TOO_SOON',
			id: '9e1ba411-62de-4342-a9fc-301e381328a3',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			claimCode: {
				type: 'string',
				optional: false, nullable: false,
			},
			application: {
				type: 'object',
				optional: false, nullable: false,
				ref: 'SignupApplicationStatus',
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		// 現在のフォーム定義と同じ順序の回答。ラベルはサーバーが定義から埋めるので送らせない
		answers: {
			type: 'array',
			maxItems: SIGNUP_APPLICATION_MAX_FORM_FIELDS,
			items: { type: 'string' },
		},
		formToken: { type: 'string', nullable: true, maxLength: 64 },
		'hcaptcha-response': { type: 'string', nullable: true },
		'g-recaptcha-response': { type: 'string', nullable: true },
		'turnstile-response': { type: 'string', nullable: true },
		'm-captcha-response': { type: 'string', nullable: true },
		'testcaptcha-response': { type: 'string', nullable: true },
	},
	required: ['answers'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		private captchaService: CaptchaService,
		private signupApplicationService: SignupApplicationService,
		private signupApplicationEntityService: SignupApplicationEntityService,
	) {
		super(meta, paramDef, async (ps) => {
			if (!this.serverSettings.approvalRequiredForSignup) {
				throw new ApiError(meta.errors.unavailable);
			}

			try {
				// 回答の検証は DB にも captcha にも触れないので先に行う。
				// captcha のトークンは使い捨てなので、入力の不備で焼かずに済む。
				const answers = buildSignupApplicationAnswers(this.serverSettings.signupApplicationForm, ps.answers);

				// ただしテスト時はこの機構は障害となるため無効にする (/api/signup と同じ)
				if (process.env.NODE_ENV !== 'test') {
					await this.verifyCaptcha(ps).catch(() => {
						throw new ApiError(meta.errors.captchaFailed);
					});
				}

				// フォームトークンは行を作る直前に検証する。
				// 回答の不備で消費してしまうと、直して送り直した利用者がフォームを開き直す羽目になる。
				await this.signupApplicationService.verifyFormToken(ps.formToken);

				const { application, claimCode } = await this.signupApplicationService.apply(answers);

				return {
					claimCode,
					application: this.signupApplicationEntityService.packStatus(application),
				};
			} catch (err) {
				if (err instanceof SignupApplicationError) {
					switch (err.code) {
						case 'FORM_CHANGED': throw new ApiError(meta.errors.formChanged);
						case 'ANSWER_REQUIRED': throw new ApiError(meta.errors.answerRequired);
						case 'ANSWER_TOO_LONG': throw new ApiError(meta.errors.answerTooLong);
						case 'INVALID_ANSWER': throw new ApiError(meta.errors.invalidAnswer);
						case 'FORM_TOKEN_INVALID': throw new ApiError(meta.errors.formTokenInvalid);
						case 'FORM_TOKEN_TOO_SOON': throw new ApiError(meta.errors.formTokenTooSoon);
					}
				}
				throw err;
			}
		});
	}

	/**
	 * 有効な provider をすべて検証する (/api/signup と同じ)。
	 */
	private async verifyCaptcha(ps: {
		'hcaptcha-response'?: string | null;
		'g-recaptcha-response'?: string | null;
		'turnstile-response'?: string | null;
		'm-captcha-response'?: string | null;
		'testcaptcha-response'?: string | null;
	}): Promise<void> {
		const m = this.serverSettings;

		if (m.enableHcaptcha && m.hcaptchaSecretKey) {
			await this.captchaService.verifyHcaptcha(m.hcaptchaSecretKey, ps['hcaptcha-response']);
		}

		if (m.enableMcaptcha && m.mcaptchaSecretKey && m.mcaptchaSitekey && m.mcaptchaInstanceUrl) {
			await this.captchaService.verifyMcaptcha(m.mcaptchaSecretKey, m.mcaptchaSitekey, m.mcaptchaInstanceUrl, ps['m-captcha-response']);
		}

		if (m.enableRecaptcha && m.recaptchaSecretKey) {
			await this.captchaService.verifyRecaptcha(m.recaptchaSecretKey, ps['g-recaptcha-response']);
		}

		if (m.enableTurnstile && m.turnstileSecretKey) {
			await this.captchaService.verifyTurnstile(m.turnstileSecretKey, ps['turnstile-response']);
		}

		if (m.enableTestcaptcha) {
			await this.captchaService.verifyTestcaptcha(ps['testcaptcha-response']);
		}
	}
}

/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import type { MiMeta } from '@/models/_.js';
import { SignupApplicationService } from '@/core/SignupApplicationService.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['signup-application'],

	requireCredential: false,

	description: 'Issue a token that has to be sent with signup-application/apply when no captcha is enabled. Returns an empty token when it is not required.',

	limit: {
		duration: 1000 * 60 * 60,
		max: 30,
	},

	errors: {
		unavailable: {
			message: 'Approval-based signup is not enabled.',
			code: 'UNAVAILABLE',
			id: '6384732e-5f9f-4cbf-b8d4-98afb7c063c8',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			token: {
				type: 'string',
				optional: false, nullable: false,
			},
			minWaitSeconds: {
				type: 'integer',
				optional: false, nullable: false,
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		private signupApplicationService: SignupApplicationService,
	) {
		super(meta, paramDef, async () => {
			if (!this.serverSettings.approvalRequiredForSignup) {
				throw new ApiError(meta.errors.unavailable);
			}

			return await this.signupApplicationService.issueFormToken();
		});
	}
}

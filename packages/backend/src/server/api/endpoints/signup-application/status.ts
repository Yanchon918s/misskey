/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import type { MiMeta } from '@/models/_.js';
import { SignupApplicationService } from '@/core/SignupApplicationService.js';
import { SignupApplicationEntityService } from '@/core/entities/SignupApplicationEntityService.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['signup-application'],

	requireCredential: false,

	description: 'Show the state of the signup application that the claim code stands for.',

	limit: {
		duration: 1000 * 60 * 60,
		max: 60,
	},

	errors: {
		unavailable: {
			message: 'Approval-based signup is not enabled.',
			code: 'UNAVAILABLE',
			id: '4d9cd67d-b60a-4ac5-80c3-1163b9269a98',
		},
		noSuchApplication: {
			message: 'No such application.',
			code: 'NO_SUCH_APPLICATION',
			id: '69559a56-75d3-4c4a-8b7b-664749028b90',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
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
		claimCode: { type: 'string', minLength: 1, maxLength: 128 },
	},
	required: ['claimCode'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		private signupApplicationService: SignupApplicationService,
		private signupApplicationEntityService: SignupApplicationEntityService,
	) {
		super(meta, paramDef, async (ps) => {
			if (!this.serverSettings.approvalRequiredForSignup) {
				throw new ApiError(meta.errors.unavailable);
			}

			const application = await this.signupApplicationService.findByClaimCode(ps.claimCode);
			if (application == null) {
				throw new ApiError(meta.errors.noSuchApplication);
			}

			return {
				application: this.signupApplicationEntityService.packStatus(application),
			};
		});
	}
}

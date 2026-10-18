/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { SignupApplicationError, SignupApplicationService } from '@/core/SignupApplicationService.js';
import { SignupApplicationEntityService } from '@/core/entities/SignupApplicationEntityService.js';

export const meta = {
	tags: ['admin', 'signup-application'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:invite-codes',

	errors: {
		noSuchApplication: {
			message: 'No such signup application.',
			code: 'NO_SUCH_APPLICATION',
			id: 'a06c7bd7-f5b0-4b7b-93dd-8511460e129e',
		},
		applicationExpired: {
			message: 'This signup application has expired.',
			code: 'APPLICATION_EXPIRED',
			id: '326374f1-1155-4daa-a167-d36af2e6069c',
		},
		applicationNotPending: {
			message: 'This signup application is not awaiting review.',
			code: 'APPLICATION_NOT_PENDING',
			id: '31dbbd58-f4cf-43e8-8801-60f289322937',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'SignupApplication',
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		applicationId: { type: 'string', format: 'misskey:id' },
	},
	required: ['applicationId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private moderationLogService: ModerationLogService,
		private signupApplicationService: SignupApplicationService,
		private signupApplicationEntityService: SignupApplicationEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			let application;
			try {
				application = await this.signupApplicationService.reject(ps.applicationId, me.id);
			} catch (err) {
				if (err instanceof SignupApplicationError) {
					switch (err.code) {
						case 'NO_SUCH_APPLICATION': throw new ApiError(meta.errors.noSuchApplication);
						case 'APPLICATION_EXPIRED': throw new ApiError(meta.errors.applicationExpired);
						case 'APPLICATION_NOT_PENDING': throw new ApiError(meta.errors.applicationNotPending);
					}
				}
				throw err;
			}

			this.moderationLogService.log(me, 'rejectSignupApplication', {
				applicationId: application.id,
			});

			return await this.signupApplicationEntityService.pack(application, me);
		});
	}
}

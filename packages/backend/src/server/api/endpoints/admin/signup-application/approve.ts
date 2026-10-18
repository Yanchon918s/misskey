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
			id: 'bd5c2f8b-5c23-4479-9d04-3d40d1c70e6a',
		},
		applicationExpired: {
			message: 'This signup application has expired.',
			code: 'APPLICATION_EXPIRED',
			id: 'c31a54f3-75d6-4bdf-b421-04667ea40d89',
		},
		applicationNotPending: {
			message: 'This signup application is not awaiting review.',
			code: 'APPLICATION_NOT_PENDING',
			id: 'f74fdc6f-3cbb-46c0-91f8-85d67dc48c5d',
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
				application = await this.signupApplicationService.approve(ps.applicationId, me.id);
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

			this.moderationLogService.log(me, 'approveSignupApplication', {
				applicationId: application.id,
			});

			return await this.signupApplicationEntityService.pack(application, me);
		});
	}
}

/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { UserProfilesRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';

export const meta = {
	tags: ['account'],
	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:account',
	limit: { duration: 60000, max: 10 },
	res: { type: 'object', optional: false, nullable: false, ref: 'MeDetailed' },
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		message: { type: 'string', maxLength: 80, nullable: true },
		expiresIn: { type: 'integer', minimum: 1, maximum: 1440, nullable: true },
	},
	required: ['message', 'expiresIn'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,
		private userEntityService: UserEntityService,
		private globalEventService: GlobalEventService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const message = ps.message?.trim() || null;
			await this.userProfilesRepository.update(me.id, {
				statusMessage: message,
				statusExpiresAt: message && ps.expiresIn != null ? new Date(Date.now() + ps.expiresIn * 60000) : null,
			});
			const packed = await this.userEntityService.pack(me.id, me, { schema: 'MeDetailed' });
			this.globalEventService.publishMainStream(me.id, 'meUpdated', packed);
			return packed;
		});
	}
}

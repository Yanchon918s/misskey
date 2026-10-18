/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { SignupApplicationsRepository } from '@/models/_.js';
import { QueryService } from '@/core/QueryService.js';
import { SignupApplicationService } from '@/core/SignupApplicationService.js';
import { SignupApplicationEntityService } from '@/core/entities/SignupApplicationEntityService.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['admin', 'signup-application'],

	requireCredential: true,
	requireModerator: true,
	// 承認は招待コードの発行と同じくアカウント作成につながるので、招待コードの権限を流用する
	kind: 'read:admin:invite-codes',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'SignupApplication',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		// processed は却下・期限切れ・登録済みをまとめたもの
		status: { type: 'string', enum: ['pending', 'approved', 'processed', 'all'], default: 'pending' },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.signupApplicationsRepository)
		private signupApplicationsRepository: SignupApplicationsRepository,

		private queryService: QueryService,
		private signupApplicationService: SignupApplicationService,
		private signupApplicationEntityService: SignupApplicationEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			// 期限切れは申請者が見に来たときにしか反映されないので、一覧の前に実態へ寄せる。
			// そうしないと「審査待ちに見えるのに承認できない」行が並ぶ。
			await this.signupApplicationService.expireStale();

			const query = this.queryService.makePaginationQuery(this.signupApplicationsRepository.createQueryBuilder('application'), ps.sinceId, ps.untilId);

			switch (ps.status) {
				case 'pending': query.andWhere('application.status = \'pending\''); break;
				case 'approved': query.andWhere('application.status = \'approved\''); break;
				case 'processed': query.andWhere('application.status IN (\'rejected\', \'expired\', \'completed\')'); break;
			}

			const applications = await query.limit(ps.limit).getMany();

			return await this.signupApplicationEntityService.packMany(applications, me);
		});
	}
}

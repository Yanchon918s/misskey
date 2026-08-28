/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { InstancesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['federation'],

	requireCredential: false,

	allowGet: true,
	cacheSec: 60 * 60,

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				softwareName: {
					type: 'string',
					optional: false, nullable: false,
				},
				count: {
					type: 'integer',
					optional: false, nullable: false,
				},
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
		@Inject(DI.instancesRepository)
		private instancesRepository: InstancesRepository,
	) {
		super(meta, paramDef, async () => {
			const softwareExpression = 'COALESCE(NULLIF(LOWER(BTRIM(instance."softwareName")), \'\'), \'unknown\')';
			const rows = await this.instancesRepository.createQueryBuilder('instance')
				.select(softwareExpression, 'softwareName')
				.addSelect('COUNT(*)', 'count')
				.groupBy(softwareExpression)
				.orderBy('COUNT(*)', 'DESC')
				.addOrderBy(softwareExpression, 'ASC')
				.getRawMany<{ softwareName: string; count: string }>();

			return rows.map(row => ({
				softwareName: row.softwareName,
				count: Number(row.count),
			}));
		});
	}
}

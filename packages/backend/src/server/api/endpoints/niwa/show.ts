/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { NiwaService } from '@/core/NiwaService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';

export const meta = {
	tags: ['niwa'],
	requireCredential: true,
	kind: 'read:niwa',
	res: {
		type: 'object', optional: false, nullable: false,
		properties: {
			waterCount: { type: 'integer', optional: false, nullable: false },
			growthStage: { type: 'integer', optional: false, nullable: false },
			nextGrowthAt: { type: 'integer', optional: false, nullable: true },
			weeklyTheme: { type: 'integer', optional: false, nullable: false },
			wateredToday: { type: 'boolean', optional: false, nullable: false },
			nextWateringAt: { type: 'string', format: 'date-time', optional: false, nullable: false },
		},
	},
} as const;

export const paramDef = { type: 'object', properties: {}, required: [] } as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private niwaService: NiwaService) {
		super(meta, paramDef, async (ps, me) => this.niwaService.show(me.id));
	}
}

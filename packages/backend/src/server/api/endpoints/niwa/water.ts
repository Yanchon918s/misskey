/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { NiwaService } from '@/core/NiwaService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { meta as showMeta } from './show.js';

export const meta = {
	tags: ['niwa'],
	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:niwa',
	limit: { duration: 60000, max: 30 },
	res: showMeta.res,
} as const;

export const paramDef = { type: 'object', properties: {}, required: [] } as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private niwaService: NiwaService) {
		super(meta, paramDef, async (ps, me) => this.niwaService.water(me.id));
	}
}

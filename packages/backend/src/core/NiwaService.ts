/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { MiNiwaGarden } from '@/models/NiwaGarden.js';
import { MiUserProfile } from '@/models/UserProfile.js';

const DAY = 86400000;

@Injectable()
export class NiwaService {
	constructor(
		@Inject(DI.db)
		private db: DataSource,
	) {}

	@bindThis
	public async show(userId: string, manager: EntityManager = this.db.manager, now = new Date()) {
		const [garden, profile] = await Promise.all([
			manager.findOneBy(MiNiwaGarden, { id: 'main' }),
			manager.findOneByOrFail(MiUserProfile, { userId }),
		]);
		const dayStart = Math.floor(now.getTime() / DAY) * DAY;
		const waterCount = garden?.waterCount ?? 0;
		const growthStage = Math.min(5, Math.floor(Math.sqrt(waterCount)));
		return {
			waterCount,
			growthStage,
			nextGrowthAt: growthStage < 5 ? (growthStage + 1) ** 2 : null,
			weeklyTheme: Math.floor(dayStart / (DAY * 7)) % 4,
			wateredToday: profile.niwaLastWateredAt != null && profile.niwaLastWateredAt.getTime() >= dayStart,
			nextWateringAt: new Date(dayStart + DAY).toISOString(),
		};
	}

	@bindThis
	public async water(userId: string) {
		return this.db.transaction(async manager => {
			const now = new Date();
			const dayStart = new Date(Math.floor(now.getTime() / DAY) * DAY);
			// 同じアカウントの同時リクエストは条件付きUPDATEで一度だけ受け付ける。
			const result = await manager.createQueryBuilder().update(MiUserProfile)
				.set({ niwaLastWateredAt: now })
				.where('"userId" = :userId', { userId })
				.andWhere('("niwaLastWateredAt" IS NULL OR "niwaLastWateredAt" < :dayStart)', { dayStart })
				.execute();
			if (result.affected === 1) {
				await manager.createQueryBuilder().insert().into(MiNiwaGarden)
					.values({ id: 'main', waterCount: 0 }).orIgnore().execute();
				await manager.increment(MiNiwaGarden, { id: 'main' }, 'waterCount', 1);
			}
			return this.show(userId, manager, now);
		});
	}
}

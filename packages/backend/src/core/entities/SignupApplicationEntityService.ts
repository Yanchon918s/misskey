/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { UsersRepository } from '@/models/_.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiUser } from '@/models/User.js';
import type { MiSignupApplication } from '@/models/SignupApplication.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import { UserEntityService } from './UserEntityService.js';

@Injectable()
export class SignupApplicationEntityService {
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private userEntityService: UserEntityService,
		private idService: IdService,
	) {
	}

	/**
	 * 申請者本人に見せる形。審査した人など、管理者向けの情報は含めない。
	 */
	@bindThis
	public packStatus(application: MiSignupApplication): Packed<'SignupApplicationForApplicant'> {
		return {
			status: application.status,
			createdAt: this.idService.parse(application.id).date.toISOString(),
			expiresAt: application.expiresAt.toISOString(),
		};
	}

	@bindThis
	public async packMany(
		applications: MiSignupApplication[],
		me: { id: MiUser['id'] },
	): Promise<Packed<'SignupApplication'>[]> {
		// 審査した人・登録した人は監査用の記録で外部キーを張っていない。
		// アカウントが消えていれば null として出す。
		const userIds = [...new Set(applications.flatMap(x => [x.processedById, x.usedById]).filter(x => x != null))];
		const users = userIds.length > 0 ? await this.usersRepository.findBy({ id: In(userIds) }) : [];
		const packedUsers = new Map((await this.userEntityService.packMany(users, me)).map(u => [u.id, u]));

		return applications.map(application => ({
			id: application.id,
			createdAt: this.idService.parse(application.id).date.toISOString(),
			expiresAt: application.expiresAt.toISOString(),
			status: application.status,
			answers: application.answers,
			processedAt: application.processedAt ? application.processedAt.toISOString() : null,
			processedBy: application.processedById != null ? packedUsers.get(application.processedById) ?? null : null,
			usedBy: application.usedById != null ? packedUsers.get(application.usedById) ?? null : null,
		}));
	}

	@bindThis
	public async pack(
		application: MiSignupApplication,
		me: { id: MiUser['id'] },
	): Promise<Packed<'SignupApplication'>> {
		return (await this.packMany([application], me))[0];
	}
}

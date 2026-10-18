/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { Test } from '@nestjs/testing';
import * as Redis from 'ioredis';
import { GlobalModule } from '@/GlobalModule.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { LoggerService } from '@/core/LoggerService.js';
import { NotificationService } from '@/core/NotificationService.js';
import { RoleService } from '@/core/RoleService.js';
import {
	SIGNUP_APPLICATION_TTL,
	SignupApplicationError,
	SignupApplicationService,
	buildSignupApplicationAnswers,
	hashSignupApplicationClaimCode,
} from '@/core/SignupApplicationService.js';
import type { SignupApplicationsRepository } from '@/models/_.js';
import type { SignupApplicationFormField } from '@/models/SignupApplication.js';
import type { TestingModule } from '@nestjs/testing';

function errorCodeOf(fn: () => unknown): string | null {
	try {
		fn();
	} catch (err) {
		if (err instanceof SignupApplicationError) return err.code;
		throw err;
	}
	return null;
}

async function asyncErrorCodeOf(promise: Promise<unknown>): Promise<string | null> {
	try {
		await promise;
	} catch (err) {
		if (err instanceof SignupApplicationError) return err.code;
		throw err;
	}
	return null;
}

describe('buildSignupApplicationAnswers', () => {
	const fields: SignupApplicationFormField[] = [
		{ label: '参加の動機', type: 'textarea', required: true },
		{ label: 'Fediverse のアカウント', type: 'text', required: false, maxLength: 10 },
	];

	test('ラベルは定義から埋め、値は前後の空白を落とす', () => {
		expect(buildSignupApplicationAnswers(fields, ['  よろしく  ', ''])).toEqual([
			{ label: '参加の動機', value: 'よろしく' },
			{ label: 'Fediverse のアカウント', value: '' },
		]);
	});

	test('項目なしのフォームには空の回答で申請できる', () => {
		expect(buildSignupApplicationAnswers([], [])).toEqual([]);
	});

	test('回答の数が定義と合わなければフォームが変わったとみなす', () => {
		expect(errorCodeOf(() => buildSignupApplicationAnswers(fields, ['a']))).toBe('FORM_CHANGED');
		expect(errorCodeOf(() => buildSignupApplicationAnswers(fields, ['a', 'b', 'c']))).toBe('FORM_CHANGED');
	});

	test('必須の項目が空白だけなら受け付けない', () => {
		expect(errorCodeOf(() => buildSignupApplicationAnswers(fields, ['   ', '']))).toBe('ANSWER_REQUIRED');
	});

	test('文字数はコードポイント単位で数える', () => {
		// サロゲートペアの絵文字 10 文字は UTF-16 では 20 単位だが、上限 10 文字に収まる
		expect(errorCodeOf(() => buildSignupApplicationAnswers(fields, ['a', '🌱'.repeat(10)]))).toBeNull();
		expect(errorCodeOf(() => buildSignupApplicationAnswers(fields, ['a', '🌱'.repeat(11)]))).toBe('ANSWER_TOO_LONG');
	});

	test('最大文字数を省いた項目は既定の 500 文字まで', () => {
		expect(errorCodeOf(() => buildSignupApplicationAnswers(fields, ['あ'.repeat(500), '']))).toBeNull();
		expect(errorCodeOf(() => buildSignupApplicationAnswers(fields, ['あ'.repeat(501), '']))).toBe('ANSWER_TOO_LONG');
	});

	test('定義の最大文字数が上限を超えていても 2000 文字で切る', () => {
		const wide: SignupApplicationFormField[] = [{ label: 'x', type: 'textarea', required: false, maxLength: 100000 }];
		expect(errorCodeOf(() => buildSignupApplicationAnswers(wide, ['a'.repeat(2000)]))).toBeNull();
		expect(errorCodeOf(() => buildSignupApplicationAnswers(wide, ['a'.repeat(2001)]))).toBe('ANSWER_TOO_LONG');
	});

	test('jsonb に保存できない文字 (NUL、対にならないサロゲート) を弾く', () => {
		expect(errorCodeOf(() => buildSignupApplicationAnswers(fields, ['a\u0000b', '']))).toBe('INVALID_ANSWER');
		expect(errorCodeOf(() => buildSignupApplicationAnswers(fields, ['a\uD83Db', '']))).toBe('INVALID_ANSWER');
		expect(errorCodeOf(() => buildSignupApplicationAnswers(fields, ['a\uDF31b', '']))).toBe('INVALID_ANSWER');
	});
});

describe('hashSignupApplicationClaimCode', () => {
	test('SHA-256 の hex を返す', () => {
		expect(hashSignupApplicationClaimCode('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
	});
});

describe('SignupApplicationService', () => {
	let app: TestingModule;
	let service: SignupApplicationService;
	let repository: SignupApplicationsRepository;
	let redisClient: Redis.Redis;

	// vitest の restoreMocks で実装が戻らないように、記録は素の関数で取る
	let moderatorIds: string[] = [];
	const notifications: { notifieeId: string; type: string; data: unknown }[] = [];

	beforeAll(async () => {
		app = await Test.createTestingModule({
			imports: [
				GlobalModule,
			],
			providers: [
				SignupApplicationService,
				IdService,
			],
		})
			.useMocker((token) => {
				if (token === NotificationService) {
					return {
						createNotification: (notifieeId: string, type: string, data: unknown) => {
							notifications.push({ notifieeId, type, data });
						},
					};
				} else if (token === RoleService) {
					return {
						getModeratorIds: async () => moderatorIds,
					};
				} else if (token === LoggerService) {
					return {
						getLogger: () => ({ error: () => {}, warn: () => {}, info: () => {}, debug: () => {}, succ: () => {} }),
					};
				} else if (typeof token === 'function') {
					return mockDeep<typeof token>();
				}
			})
			.compile();

		app.enableShutdownHooks();

		service = app.get<SignupApplicationService>(SignupApplicationService);
		repository = app.get<SignupApplicationsRepository>(DI.signupApplicationsRepository);
		redisClient = app.get<Redis.Redis>(DI.redis);
	});

	beforeEach(() => {
		moderatorIds = [];
		notifications.length = 0;
	});

	afterEach(async () => {
		await repository.createQueryBuilder().delete().execute();
	});

	afterAll(async () => {
		await app.close();
	});

	async function expire(id: string) {
		await repository.update({ id }, { expiresAt: new Date(Date.now() - 1000) });
	}

	describe('apply', () => {
		test('クレームコードは平文で保存せず、7 日後に期限を切る', async () => {
			const before = Date.now();
			const { application, claimCode } = await service.apply([{ label: 'q', value: 'a' }]);

			const stored = await repository.findOneByOrFail({ id: application.id });
			expect(stored.claimCodeHash).toBe(hashSignupApplicationClaimCode(claimCode));
			expect(stored.claimCodeHash).not.toBe(claimCode);
			expect(stored.status).toBe('pending');
			expect(stored.answers).toEqual([{ label: 'q', value: 'a' }]);
			expect(stored.expiresAt.getTime()).toBeGreaterThanOrEqual(before + SIGNUP_APPLICATION_TTL);
			expect(stored.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + SIGNUP_APPLICATION_TTL);
		});

		test('申請のたびに別のコードを発行する', async () => {
			const a = await service.apply([]);
			const b = await service.apply([]);
			expect(a.claimCode).not.toBe(b.claimCode);
		});

		test('モデレーターへ回答を含めずに通知する', async () => {
			moderatorIds = ['mod1', 'mod2'];
			const { application } = await service.apply([{ label: 'q', value: '秘密' }]);

			expect(notifications).toEqual([
				{ notifieeId: 'mod1', type: 'signupApplicationReceived', data: { signupApplicationId: application.id } },
				{ notifieeId: 'mod2', type: 'signupApplicationReceived', data: { signupApplicationId: application.id } },
			]);
		});
	});

	describe('findByClaimCode', () => {
		test('コードが指す申請を返す', async () => {
			const { application, claimCode } = await service.apply([]);
			expect((await service.findByClaimCode(claimCode))?.id).toBe(application.id);
		});

		test('存在しないコード・空のコードには null を返す', async () => {
			await service.apply([]);
			expect(await service.findByClaimCode('nonexistent')).toBeNull();
			expect(await service.findByClaimCode('')).toBeNull();
		});

		test('期限を過ぎた申請はその場で期限切れにする', async () => {
			const { application, claimCode } = await service.apply([]);
			await expire(application.id);

			expect((await service.findByClaimCode(claimCode))?.status).toBe('expired');
			expect((await repository.findOneByOrFail({ id: application.id })).status).toBe('expired');
		});
	});

	describe('approve / reject', () => {
		test('承認すると審査した人と日時を残し、登録の猶予を数え直す', async () => {
			const { application } = await service.apply([]);
			await repository.update({ id: application.id }, { expiresAt: new Date(Date.now() + 1000 * 60) });

			const approved = await service.approve(application.id, 'mod1');

			expect(approved.status).toBe('approved');
			expect(approved.processedById).toBe('mod1');
			expect(approved.processedAt).not.toBeNull();
			expect(approved.expiresAt.getTime()).toBeGreaterThan(Date.now() + SIGNUP_APPLICATION_TTL - 1000 * 60);
		});

		test('却下すると審査した人と日時を残す', async () => {
			const { application } = await service.apply([]);

			const rejected = await service.reject(application.id, 'mod1');

			expect(rejected.status).toBe('rejected');
			expect(rejected.processedById).toBe('mod1');
		});

		test('審査済みの申請は審査し直せない', async () => {
			const { application } = await service.apply([]);
			await service.approve(application.id, 'mod1');

			expect(await asyncErrorCodeOf(service.reject(application.id, 'mod2'))).toBe('APPLICATION_NOT_PENDING');
			expect(await asyncErrorCodeOf(service.approve(application.id, 'mod2'))).toBe('APPLICATION_NOT_PENDING');
			expect((await repository.findOneByOrFail({ id: application.id })).processedById).toBe('mod1');
		});

		test('期限切れの申請は審査できず、期限切れにする (審査の記録は立てない)', async () => {
			const { application } = await service.apply([]);
			await expire(application.id);

			expect(await asyncErrorCodeOf(service.approve(application.id, 'mod1'))).toBe('APPLICATION_EXPIRED');

			const stored = await repository.findOneByOrFail({ id: application.id });
			expect(stored.status).toBe('expired');
			expect(stored.processedById).toBeNull();
			expect(stored.processedAt).toBeNull();
		});

		test('存在しない申請', async () => {
			expect(await asyncErrorCodeOf(service.approve('0000000000', 'mod1'))).toBe('NO_SUCH_APPLICATION');
		});

		test('同時に審査しても結果は 1 つだけ', async () => {
			const { application } = await service.apply([]);

			const results = await Promise.allSettled([
				service.approve(application.id, 'mod1'),
				service.reject(application.id, 'mod2'),
			]);

			expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
		});
	});

	describe('登録のための確保', () => {
		test('承認済みの申請は 1 回だけ確保できる', async () => {
			const { application } = await service.apply([]);
			await service.approve(application.id, 'mod1');

			const results = await Promise.all([
				service.claimForRegistration(application.id),
				service.claimForRegistration(application.id),
			]);

			expect(results.filter(x => x)).toHaveLength(1);
			expect((await repository.findOneByOrFail({ id: application.id })).status).toBe('completed');
		});

		test('審査待ち・期限切れの申請は確保できない', async () => {
			const pending = await service.apply([]);
			expect(await service.claimForRegistration(pending.application.id)).toBe(false);

			const expired = await service.apply([]);
			await service.approve(expired.application.id, 'mod1');
			await expire(expired.application.id);
			expect(await service.claimForRegistration(expired.application.id)).toBe(false);
		});

		test('アカウント作成に失敗したら承認済みに戻す', async () => {
			const { application } = await service.apply([]);
			await service.approve(application.id, 'mod1');
			await service.claimForRegistration(application.id);

			await service.releaseRegistration(application.id);

			expect((await repository.findOneByOrFail({ id: application.id })).status).toBe('approved');
			expect(await service.claimForRegistration(application.id)).toBe(true);
		});

		test('アカウントと紐付けた申請は戻さない', async () => {
			const { application } = await service.apply([]);
			await service.approve(application.id, 'mod1');
			await service.claimForRegistration(application.id);
			await service.completeRegistration(application.id, 'user1');

			await service.releaseRegistration(application.id);

			const stored = await repository.findOneByOrFail({ id: application.id });
			expect(stored.status).toBe('completed');
			expect(stored.usedById).toBe('user1');
		});
	});

	test('expireStale は期限を過ぎた審査待ち・承認済みだけを期限切れにする', async () => {
		const pending = await service.apply([]);
		const approved = await service.apply([]);
		const rejected = await service.apply([]);
		const live = await service.apply([]);
		await service.approve(approved.application.id, 'mod1');
		await service.reject(rejected.application.id, 'mod1');
		await expire(pending.application.id);
		await expire(approved.application.id);
		await expire(rejected.application.id);

		await service.expireStale();

		const statusOf = async (id: string) => (await repository.findOneByOrFail({ id })).status;
		expect(await statusOf(pending.application.id)).toBe('expired');
		expect(await statusOf(approved.application.id)).toBe('expired');
		expect(await statusOf(rejected.application.id)).toBe('rejected');
		expect(await statusOf(live.application.id)).toBe('pending');
	});

	describe('フォームトークン', () => {
		test('テスト時は要求せず、空のトークンを返す', async () => {
			expect(service.isFormTokenRequired()).toBe(false);
			expect(await service.issueFormToken()).toEqual({ token: '', minWaitSeconds: 0 });
			await service.verifyFormToken(null);
		});

		test('要求する構成では、最短の待ち時間を過ぎてから 1 回だけ使える', async () => {
			vi.spyOn(service, 'isFormTokenRequired').mockReturnValue(true);

			const { token, minWaitSeconds } = await service.issueFormToken();
			expect(token).not.toBe('');
			expect(minWaitSeconds).toBeGreaterThan(0);

			// 早すぎる送信ではトークンを消費しない
			expect(await asyncErrorCodeOf(service.verifyFormToken(token))).toBe('FORM_TOKEN_TOO_SOON');

			await redisClient.set(`signupApplicationFormToken:${token}`, (Date.now() - minWaitSeconds * 1000).toString(), 'EX', 60);
			expect(await asyncErrorCodeOf(service.verifyFormToken(token))).toBeNull();
			expect(await asyncErrorCodeOf(service.verifyFormToken(token))).toBe('FORM_TOKEN_INVALID');
		});

		test('要求する構成では、トークンなし・知らないトークンを弾く', async () => {
			vi.spyOn(service, 'isFormTokenRequired').mockReturnValue(true);

			expect(await asyncErrorCodeOf(service.verifyFormToken(null))).toBe('FORM_TOKEN_INVALID');
			expect(await asyncErrorCodeOf(service.verifyFormToken(''))).toBe('FORM_TOKEN_INVALID');
			expect(await asyncErrorCodeOf(service.verifyFormToken('unknown'))).toBe('FORM_TOKEN_INVALID');
		});
	});
});

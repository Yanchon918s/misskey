/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { afterAll, beforeAll, describe, test, vi } from 'vitest';
import { api, castAsError, initTestDb, signup } from '../utils.js';
import type { UserToken } from '../utils.js';
import type * as misskey from 'misskey-js';
import { MiUserPending } from '@/models/UserPending.js';

describe('承認制の登録', () => {
	let root: misskey.entities.SignupResponse;
	let alice: misskey.entities.SignupResponse;

	const errorCodeOf = (body: unknown) => castAsError(body as Record<string, unknown>).error.code;

	const updateMeta = async (params: misskey.Endpoints['admin/update-meta']['req']) => {
		const res = await api('admin/update-meta', params, root);
		assert.strictEqual(res.status, 204);
	};

	const applyFor = async (answers: string[] = []) => {
		const res = await api('signup-application/apply', { answers });
		assert.strictEqual(res.status, 200, JSON.stringify(res.body));
		return res.body;
	};

	// 審査画面の一覧から、最初の回答の値で申請を探す
	const findApplicationId = async (firstAnswer: string) => {
		const list = await api('admin/signup-application/list', { status: 'all', limit: 100 }, root);
		assert.strictEqual(list.status, 200);
		const found = list.body.find(x => x.answers[0]?.value === firstAnswer);
		assert.ok(found, `no application answered ${firstAnswer}`);
		return found.id;
	};

	// テストファイルごとに DB を作り直すので、設定を戻す後始末は置かない。
	// (最後に update-meta を叩くと、その後に非同期で書くモデレーションログがサーバーの停止と競合する)
	beforeAll(async () => {
		root = await signup({ username: 'root' });
		alice = await signup({ username: 'alice' });
	}, 1000 * 60 * 2);

	describe('無効のとき (既定)', () => {
		test('公開 meta で無効になっている', async () => {
			const res = await api('meta', {});
			assert.strictEqual(res.status, 200);
			assert.strictEqual(res.body.approvalRequiredForSignup, false);
		});

		test('申請・照会・登録の口は閉じている', async () => {
			const apply = await api('signup-application/apply', { answers: [] });
			assert.strictEqual(apply.status, 400);
			assert.strictEqual(errorCodeOf(apply.body), 'UNAVAILABLE');

			const status = await api('signup-application/status', { claimCode: 'x' });
			assert.strictEqual(errorCodeOf(status.body), 'UNAVAILABLE');

			const register = await api('signup-application/register', { claimCode: 'x', username: 'nobody', password: 'test' });
			assert.strictEqual(errorCodeOf(register.body), 'UNAVAILABLE');

			const formToken = await api('signup-application/form-token', {});
			assert.strictEqual(errorCodeOf(formToken.body), 'UNAVAILABLE');
		});

		test('招待コードなしの /api/signup はこれまでどおり通る', async () => {
			const res = await api('signup', { username: 'beforeapproval', password: 'test' });
			assert.strictEqual(res.status, 200);
		});
	});

	describe('有効のとき', () => {
		beforeAll(async () => {
			await updateMeta({
				approvalRequiredForSignup: true,
				// 登録を開いたまま承認制にしようとしても、招待コードのない登録は閉じる
				disableRegistration: false,
				signupApplicationForm: [
					{ label: '  参加の動機  ', type: 'textarea', required: true },
					{ label: 'Fediverse のアカウント', type: 'text', required: false, maxLength: 20 },
				],
			});
		});

		test('公開 meta に設定とフォームが出て、招待コードのない登録は閉じている', async () => {
			const res = await api('meta', {});
			assert.strictEqual(res.status, 200);
			assert.strictEqual(res.body.approvalRequiredForSignup, true);
			assert.strictEqual(res.body.disableRegistration, true);
			assert.deepStrictEqual(res.body.signupApplicationForm, [
				{ label: '参加の動機', type: 'textarea', required: true },
				{ label: 'Fediverse のアカウント', type: 'text', required: false, maxLength: 20 },
			]);
		});

		test('承認制の間は登録を開放できない', async () => {
			await updateMeta({ disableRegistration: false });
			const res = await api('admin/meta', {}, root);
			assert.strictEqual(res.body.disableRegistration, true);
		});

		test('フォームの定義を検証する', async () => {
			const blankLabel = await api('admin/update-meta', { signupApplicationForm: [{ label: '   ', type: 'text', required: false }] }, root);
			assert.strictEqual(blankLabel.status, 400);

			const tooMany = await api('admin/update-meta', {
				signupApplicationForm: [...Array(11)].map((_, i) => ({ label: `q${i}`, type: 'text' as const, required: false })),
			}, root);
			assert.strictEqual(tooMany.status, 400);
		});

		test('招待コードのない /api/signup は 403', async () => {
			const res = await api('signup', { username: 'withoutinvitation', password: 'test' });
			assert.strictEqual(res.status, 403);
		});

		test('招待コードがあれば /api/signup で登録できる', async () => {
			const invite = await api('admin/invite/create', { count: 1 }, root);
			assert.strictEqual(invite.status, 200);

			const res = await api('signup', { username: 'invited', password: 'test', invitationCode: invite.body[0].code });
			assert.strictEqual(res.status, 200);

			const reuse = await api('signup', { username: 'invited2', password: 'test', invitationCode: invite.body[0].code });
			assert.strictEqual(reuse.status, 400);

			const wrong = await api('signup', { username: 'invited3', password: 'test', invitationCode: 'wrong' });
			assert.strictEqual(wrong.status, 400);
		});

		test('フォームトークンはテスト時は要求されない', async () => {
			const res = await api('signup-application/form-token', {});
			assert.strictEqual(res.status, 200);
			assert.deepStrictEqual(res.body, { token: '', minWaitSeconds: 0 });
		});

		test('回答を検証する', async () => {
			const changed = await api('signup-application/apply', { answers: ['a'] });
			assert.strictEqual(errorCodeOf(changed.body), 'FORM_CHANGED');

			const required = await api('signup-application/apply', { answers: ['   ', ''] });
			assert.strictEqual(errorCodeOf(required.body), 'ANSWER_REQUIRED');

			const tooLong = await api('signup-application/apply', { answers: ['a', 'x'.repeat(21)] });
			assert.strictEqual(errorCodeOf(tooLong.body), 'ANSWER_TOO_LONG');

			const invalid = await api('signup-application/apply', { answers: ['a\u0000', ''] });
			assert.strictEqual(errorCodeOf(invalid.body), 'INVALID_ANSWER');
		});

		test('申請・審査・登録', async () => {
			const applied = await applyFor(['よろしくお願いします', '@carol@example.com']);
			assert.strictEqual(typeof applied.claimCode, 'string');
			assert.strictEqual(applied.application.status, 'pending');

			// 承認前は登録できない
			const early = await api('signup-application/register', { claimCode: applied.claimCode, username: 'carol', password: 'test' });
			assert.strictEqual(errorCodeOf(early.body), 'NOT_APPROVED');

			// 審査画面には提出時のラベル付きで出る。クレームコードは出ない
			const list = await api('admin/signup-application/list', { status: 'pending' }, root);
			assert.strictEqual(list.status, 200);
			const listed = list.body.find(x => x.answers[0]?.value === 'よろしくお願いします');
			assert.ok(listed);
			assert.deepStrictEqual(listed.answers, [
				{ label: '参加の動機', value: 'よろしくお願いします' },
				{ label: 'Fediverse のアカウント', value: '@carol@example.com' },
			]);
			assert.ok(!JSON.stringify(list.body).includes(applied.claimCode));

			const approved = await api('admin/signup-application/approve', { applicationId: listed.id }, root);
			assert.strictEqual(approved.status, 200);
			assert.strictEqual(approved.body.status, 'approved');
			assert.strictEqual(approved.body.processedBy?.id, root.id);

			const status = await api('signup-application/status', { claimCode: applied.claimCode });
			assert.strictEqual(status.status, 200);
			assert.strictEqual(status.body.application.status, 'approved');

			const registered = await api('signup-application/register', { claimCode: applied.claimCode, username: 'carol', password: 'test' });
			assert.strictEqual(registered.status, 200, JSON.stringify(registered.body));
			assert.strictEqual(registered.body.status, 'registered');
			assert.ok(registered.body.token);

			const me = await api('i', {}, { token: registered.body.token } as UserToken);
			assert.strictEqual(me.status, 200);
			assert.strictEqual(me.body.username, 'carol');

			// 1 つの承認から作れるアカウントは 1 つだけ
			const again = await api('signup-application/register', { claimCode: applied.claimCode, username: 'carol2', password: 'test' });
			assert.strictEqual(errorCodeOf(again.body), 'NOT_APPROVED');

			const completed = await api('signup-application/status', { claimCode: applied.claimCode });
			assert.strictEqual(completed.body.application.status, 'completed');

			const processed = await api('admin/signup-application/list', { status: 'processed' }, root);
			assert.strictEqual(processed.body.find(x => x.id === listed.id)?.usedBy?.username, 'carol');
		});

		test('使えないユーザー名なら承認済みのまま残り、やり直せる', async () => {
			const applied = await applyFor(['retry', '']);
			const id = await findApplicationId('retry');
			await api('admin/signup-application/approve', { applicationId: id }, root);

			const duplicated = await api('signup-application/register', { claimCode: applied.claimCode, username: 'alice', password: 'test' });
			assert.strictEqual(errorCodeOf(duplicated.body), 'DUPLICATED_USERNAME');

			const invalid = await api('signup-application/register', { claimCode: applied.claimCode, username: 'not valid', password: 'test' });
			assert.strictEqual(errorCodeOf(invalid.body), 'INVALID_USERNAME');

			const status = await api('signup-application/status', { claimCode: applied.claimCode });
			assert.strictEqual(status.body.application.status, 'approved');

			const registered = await api('signup-application/register', { claimCode: applied.claimCode, username: 'dave', password: 'test' });
			assert.strictEqual(registered.status, 200, JSON.stringify(registered.body));
		});

		test('却下された申請からは登録できない', async () => {
			const applied = await applyFor(['reject', '']);
			const id = await findApplicationId('reject');

			const rejected = await api('admin/signup-application/reject', { applicationId: id }, root);
			assert.strictEqual(rejected.status, 200);
			assert.strictEqual(rejected.body.status, 'rejected');

			const again = await api('admin/signup-application/approve', { applicationId: id }, root);
			assert.strictEqual(errorCodeOf(again.body), 'APPLICATION_NOT_PENDING');

			const status = await api('signup-application/status', { claimCode: applied.claimCode });
			assert.strictEqual(status.body.application.status, 'rejected');

			const register = await api('signup-application/register', { claimCode: applied.claimCode, username: 'erin', password: 'test' });
			assert.strictEqual(errorCodeOf(register.body), 'NOT_APPROVED');
		});

		test('知らないクレームコード', async () => {
			const status = await api('signup-application/status', { claimCode: 'unknown' });
			assert.strictEqual(errorCodeOf(status.body), 'NO_SUCH_APPLICATION');

			const register = await api('signup-application/register', { claimCode: 'unknown', username: 'frank', password: 'test' });
			assert.strictEqual(errorCodeOf(register.body), 'NO_SUCH_APPLICATION');
		});

		test('審査はモデレーターしかできない', async () => {
			const list = await api('admin/signup-application/list', {}, alice);
			assert.strictEqual(list.status, 403);

			const approve = await api('admin/signup-application/approve', { applicationId: '0000000000' }, alice);
			assert.strictEqual(approve.status, 403);

			const anonymous = await api('admin/signup-application/list', {});
			assert.strictEqual(anonymous.status, 401);
		});

		test('存在しない申請の審査', async () => {
			const res = await api('admin/signup-application/approve', { applicationId: '0000000000' }, root);
			assert.strictEqual(errorCodeOf(res.body), 'NO_SUCH_APPLICATION');
		});

		test('申請を受けるとモデレーターへ通知が届き、申請者以外へは届かない', async () => {
			await applyFor(['notify', '']);

			await vi.waitFor(async () => {
				const res = await api('i/notifications', { includeTypes: ['signupApplicationReceived'] }, root);
				assert.strictEqual(res.status, 200);
				assert.ok(res.body.length > 0);
				const notification = res.body[0];
				assert.strictEqual(notification.type, 'signupApplicationReceived');
			});

			const others = await api('i/notifications', { includeTypes: ['signupApplicationReceived'] }, alice);
			assert.strictEqual(others.body.length, 0);
		});

		test('審査はモデレーションログに残る', async () => {
			const approved = await api('admin/show-moderation-logs', { type: 'approveSignupApplication' }, root);
			assert.ok(approved.body.length > 0);
			assert.strictEqual(approved.body[0].userId, root.id);

			const rejected = await api('admin/show-moderation-logs', { type: 'rejectSignupApplication' }, root);
			assert.ok(rejected.body.length > 0);
		});

		describe('メールアドレスが必須のとき', () => {
			beforeAll(async () => {
				// 実在確認でネットワークに出ないようにする
				await updateMeta({ emailRequiredForSignup: true, enableActiveEmailValidation: false });
			});

			afterAll(async () => {
				await updateMeta({ emailRequiredForSignup: false });
			});

			test('確認メールを挟み、確認リンクを開いた時点で登録が完了する', async () => {
				const applied = await applyFor(['mail', '']);
				const id = await findApplicationId('mail');
				await api('admin/signup-application/approve', { applicationId: id }, root);

				const withoutEmail = await api('signup-application/register', { claimCode: applied.claimCode, username: 'grace', password: 'test' });
				assert.strictEqual(errorCodeOf(withoutEmail.body), 'EMAIL_REQUIRED');

				const first = await api('signup-application/register', { claimCode: applied.claimCode, username: 'grace', password: 'test', emailAddress: 'grace@example.com' });
				assert.strictEqual(first.status, 200, JSON.stringify(first.body));
				assert.deepStrictEqual(first.body, { status: 'emailConfirmationRequired', token: null });

				// やり直すと前の確認リンクは無効になる
				const second = await api('signup-application/register', { claimCode: applied.claimCode, username: 'grace', password: 'test', emailAddress: 'grace@example.com' });
				assert.strictEqual(second.status, 200);

				const connection = await initTestDb(true);
				const pendings = await connection.getRepository(MiUserPending).findBy({ signupApplicationId: id });
				connection.destroy();
				assert.strictEqual(pendings.length, 1);

				// 確認するまではアカウントを作らない
				assert.strictEqual((await api('signup-application/status', { claimCode: applied.claimCode })).body.application.status, 'approved');

				const confirmed = await api('signup-pending', { code: pendings[0].code });
				assert.strictEqual(confirmed.status, 200, JSON.stringify(confirmed.body));

				assert.strictEqual((await api('signup-application/status', { claimCode: applied.claimCode })).body.application.status, 'completed');

				const processed = await api('admin/signup-application/list', { status: 'processed', limit: 100 }, root);
				assert.strictEqual(processed.body.find(x => x.id === id)?.usedBy?.username, 'grace');
			});
		});
	});

	describe('無効に戻したとき', () => {
		test('申請の口は閉じ、登録は閉じたまま', async () => {
			await updateMeta({ approvalRequiredForSignup: false });

			const meta = await api('admin/meta', {}, root);
			assert.strictEqual(meta.body.approvalRequiredForSignup, false);
			assert.strictEqual(meta.body.disableRegistration, true);

			const apply = await api('signup-application/apply', { answers: [] });
			assert.strictEqual(errorCodeOf(apply.body), 'UNAVAILABLE');

			// 審査画面は残る
			const list = await api('admin/signup-application/list', { status: 'all' }, root);
			assert.strictEqual(list.status, 200);
			assert.ok(list.body.length > 0);
		});
	});
});

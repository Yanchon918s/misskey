/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { packUserStatus } from '@/misc/user-status.js';

describe('ステータスメッセージの有効期限', () => {
	const expiresAt = new Date('2026-09-07T12:00:00Z');
	const profile = { statusMessage: '作業中', statusExpiresAt: expiresAt };

	test('期限の直前まで表示する', () => {
		expect(packUserStatus(profile, expiresAt.getTime() - 1)).toEqual({ statusMessage: '作業中', statusExpiresAt: expiresAt.toISOString() });
	});

	test('期限ちょうどから本文と期限を返さない', () => {
		expect(packUserStatus(profile, expiresAt.getTime())).toEqual({ statusMessage: null, statusExpiresAt: null });
	});

	test('期限なしのステータスを保持する', () => {
		expect(packUserStatus({ ...profile, statusExpiresAt: null })).toEqual({ statusMessage: '作業中', statusExpiresAt: null });
	});

	test('空のステータスに期限が残っていても表示しない', () => {
		expect(packUserStatus({ statusMessage: '', statusExpiresAt: expiresAt }, 0)).toEqual({ statusMessage: null, statusExpiresAt: null });
	});
});

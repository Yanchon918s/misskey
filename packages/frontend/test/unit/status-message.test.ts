/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import MkUserStatus from '@/components/MkUserStatus.vue';

describe('ステータスメッセージの表示', () => {
	afterEach(() => {
		cleanup();
		vi.useRealTimers();
	});

	test('開いたままのプロフィールでも期限が来ると消える', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-09-07T00:00:00Z'));
		const view = render(MkUserStatus, { props: { message: '作業中', expiresAt: '2026-09-07T00:00:01Z' } });
		expect(view.queryByText('作業中')).not.toBeNull();
		await vi.advanceTimersByTimeAsync(1000);
		await nextTick();
		expect(view.queryByText('作業中')).toBeNull();
	});

	test('期限切れの保存データは最初から表示しない', () => {
		const view = render(MkUserStatus, { props: { message: '期限切れ', expiresAt: '2000-01-01T00:00:00Z' } });
		expect(view.queryByText('期限切れ')).toBeNull();
	});

	test('期限なしのステータスは残り、解除が反映される', async () => {
		const view = render(MkUserStatus, { props: { message: '通話できます', expiresAt: null } });
		expect(view.queryByText('通話できます')).not.toBeNull();
		await view.rerender({ message: null, expiresAt: null });
		expect(view.queryByText('通話できます')).toBeNull();
	});
});

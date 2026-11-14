/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import MkWidgets from '@/components/MkWidgets.vue';

describe('提供終了したウィジェットの保存済み配置', () => {
	afterEach(cleanup);

	test.each([false, true])('編集モード=%s でも残存するNIWAを描画しない', (edit) => {
		const savedWidgets = [
			{ id: 'retired', name: 'niwa', data: {} },
			{ id: 'memo', name: 'memo', data: {} },
		];
		const { container } = render(MkWidgets, {
			props: { widgets: savedWidgets, edit },
			global: {
				stubs: {
					MkSelect: true,
					MkButton: true,
					MkDraggable: {
						props: ['modelValue'],
						template: '<div><slot v-for="item in modelValue" :item="item"/></div>',
					},
					'widget-memo': { template: '<div data-testid="memo"/>' },
				},
			},
		});
		expect(container.querySelector('widget-niwa')).toBeNull();
		expect(container.querySelectorAll('[data-testid="memo"]')).toHaveLength(1);
		expect(container.querySelectorAll('[data-testid="customize-container"]')).toHaveLength(edit ? 1 : 0);
		expect(savedWidgets).toHaveLength(2);
	});
});

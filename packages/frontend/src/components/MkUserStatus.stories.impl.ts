/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/no-default-export */
import type { StoryObj } from '@storybook/vue3';
import MkUserStatus from './MkUserStatus.vue';

export const Default = {
	render(args) {
		return { components: { MkUserStatus }, setup: () => ({ args }), template: '<MkUserStatus v-bind="args"/>' };
	},
	args: { message: '🫠 溶けています。涼しくなったら戻ります。', expiresAt: null },
} satisfies StoryObj<typeof MkUserStatus>;

export const Expired = {
	...Default,
	args: { ...Default.args, expiresAt: '2000-01-01T00:00:00.000Z' },
} satisfies StoryObj<typeof MkUserStatus>;

export const Long = {
	...Default,
	args: { message: '🌱'.repeat(80), expiresAt: null },
} satisfies StoryObj<typeof MkUserStatus>;

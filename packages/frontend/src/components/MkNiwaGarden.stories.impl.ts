/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/no-default-export */
import type { StoryObj } from '@storybook/vue3';
import MkNiwaGarden from './MkNiwaGarden.vue';

export const Default = {
	render(args) {
		return { components: { MkNiwaGarden }, setup: () => ({ args }), template: '<div style="width: 320px"><MkNiwaGarden v-bind="args"/></div>' };
	},
	args: {
		garden: { waterCount: 0, growthStage: 0, nextGrowthAt: 1, weeklyTheme: 0, wateredToday: false, nextWateringAt: '2026-09-08T00:00:00.000Z' },
	},
} satisfies StoryObj<typeof MkNiwaGarden>;

export const Grown = {
	...Default,
	args: { garden: { ...Default.args.garden, waterCount: 25, growthStage: 5, nextGrowthAt: null, weeklyTheme: 2, wateredToday: true } },
} satisfies StoryObj<typeof MkNiwaGarden>;

export const Busy = {
	...Default,
	args: { ...Default.args, busy: true },
} satisfies StoryObj<typeof MkNiwaGarden>;

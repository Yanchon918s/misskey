/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/no-default-export */
import type { StoryObj } from '@storybook/vue3';
import { HttpResponse, http } from 'msw';
import MkNiwa from './MkNiwa.vue';

export const Default = {
	render() {
		return { components: { MkNiwa }, template: '<div style="width: 320px"><MkNiwa/></div>' };
	},
	parameters: {
		msw: {
			handlers: [
				http.post('/api/niwa/show', () => HttpResponse.json({ waterCount: 4, growthStage: 2, nextGrowthAt: 9, weeklyTheme: 0, wateredToday: false, nextWateringAt: '2026-09-08T00:00:00.000Z' })),
				http.post('/api/niwa/water', () => HttpResponse.json({ waterCount: 5, growthStage: 2, nextGrowthAt: 9, weeklyTheme: 0, wateredToday: true, nextWateringAt: '2026-09-08T00:00:00.000Z' })),
			],
		},
	},
} satisfies StoryObj<typeof MkNiwa>;

export const Error = {
	...Default,
	parameters: { msw: { handlers: [http.post('/api/niwa/show', () => HttpResponse.error())] } },
} satisfies StoryObj<typeof MkNiwa>;

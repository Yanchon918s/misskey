<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root" class="_gaps_m">
	<div :class="$style.scene" role="img" :aria-label="i18n.tsx._niwa.growth({ n: garden.growthStage })">
		<div :class="$style.sky" aria-hidden="true">{{ sky }}</div>
		<div :class="$style.plants" aria-hidden="true">
			<span v-for="(plant, index) in plants" :key="index" :class="$style.plant">{{ plant }}</span>
		</div>
		<div :class="$style.ground" aria-hidden="true"></div>
	</div>
	<div :class="$style.summary" aria-live="polite">
		<b>{{ i18n.tsx._niwa.totalWaterings({ n: garden.waterCount }) }}</b>
		<div>{{ garden.nextGrowthAt == null ? i18n.ts._niwa.flourishing : i18n.tsx._niwa.untilNextGrowth({ n: garden.nextGrowthAt - garden.waterCount }) }}</div>
	</div>
	<MkButton primary rounded full :disabled="busy || garden.wateredToday" @click="water">
		<i class="ti ti-droplet" aria-hidden="true"></i>
		{{ garden.wateredToday ? i18n.ts._niwa.watered : i18n.ts._niwa.water }}
	</MkButton>
	<div v-if="garden.wateredToday" :class="$style.next">{{ i18n.tsx._niwa.nextWatering({ time: new Date(garden.nextWateringAt).toLocaleString() }) }}</div>
</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type { Endpoints } from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	garden: Endpoints['niwa/show']['res'];
	busy?: boolean;
}>();
const emit = defineEmits<{ (ev: 'water'): void }>();
const themes = ['🌼', '🍄', '🍞', '✨'];
const sky = computed(() => ['☀️', '☁️', '🌤️', '🌙'][props.garden.weeklyTheme % 4]);
const plants = computed(() => {
	const stage = props.garden.growthStage;
	if (stage === 0) return ['🪨', '🌰', '🪨'];
	return Array.from({ length: stage * 2 + 1 }, (_, index) => {
		if (index % 3 === 0) return stage >= 3 ? '🌳' : '🌱';
		return stage >= 2 ? themes[props.garden.weeklyTheme % 4] : '🌱';
	});
});

function water() {
	if (props.busy || props.garden.wateredToday) return;
	emit('water');
}
</script>

<style lang="scss" module>
.root {
	padding: 20px;
}

.scene {
	position: relative;
	overflow: hidden;
	border-radius: var(--MI-radius);
	background: linear-gradient(var(--MI_THEME-accentedBg), var(--MI_THEME-panel));
	min-height: 180px;
}

.sky {
	padding: 18px 24px;
	font-size: 32px;
	text-align: right;
}

.plants {
	position: relative;
	z-index: 1;
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	align-items: end;
	gap: 4px;
	padding: 8px 12px 24px;
}

.plant {
	font-size: clamp(22px, 5cqw, 42px);
	line-height: 1.3;
}

.ground {
	position: absolute;
	inset: auto 0 0;
	height: 36px;
	background: var(--MI_THEME-accentedBg);
	border-top: 2px solid var(--MI_THEME-accent);
}

.summary {
	text-align: center;
	line-height: 1.7;
}

.next {
	font-size: 0.85em;
	text-align: center;
	overflow-wrap: anywhere;
	color: var(--MI_THEME-fgTransparentWeak);
}
</style>

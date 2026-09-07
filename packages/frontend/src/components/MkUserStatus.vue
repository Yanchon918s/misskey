<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="active" :class="$style.root" class="_selectable">
	<i class="ti ti-message-circle" aria-hidden="true"></i>
	<span :class="$style.message">{{ message }}</span>
</div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { useInterval } from '@@/js/use-interval.js';

const props = defineProps<{
	message?: string | null;
	expiresAt?: string | null;
}>();

const now = ref(Date.now());
const active = computed(() => props.message && (!props.expiresAt || Date.parse(props.expiresAt) > now.value));
useInterval(() => { now.value = Date.now(); }, 1000, { immediate: true, afterMounted: true });
</script>

<style lang="scss" module>
.root {
	display: flex;
	align-items: baseline;
	gap: 8px;
	padding: 12px 16px;
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
}

.message {
	white-space: pre-wrap;
	overflow-wrap: anywhere;
	min-width: 0;
}
</style>

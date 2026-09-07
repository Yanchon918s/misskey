<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps_m">
	<MkUserStatus :message="$i.statusMessage" :expiresAt="$i.statusExpiresAt"/>
	<MkInput v-model="message" :max="80" :disabled="saving">
		<template #label>{{ i18n.ts._statusMessage.title }}</template>
		<template #caption>
			<div>{{ i18n.ts._statusMessage.description }}</div>
			<div aria-live="polite">{{ i18n.tsx._statusMessage.characterCount({ n: characterCount }) }}</div>
		</template>
	</MkInput>
	<div class="_buttons">
		<MkButton v-for="preset in presets" :key="preset" small :disabled="saving" @click="message = preset">{{ preset }}</MkButton>
	</div>
	<MkSelect v-model="expiresIn" :items="durationItems" :disabled="saving">
		<template #label>{{ i18n.ts._statusMessage.duration }}</template>
	</MkSelect>
	<div class="_buttons">
		<MkButton primary :disabled="saving || characterCount > 80" @click="save(false)">{{ i18n.ts.save }}</MkButton>
		<MkButton :disabled="saving" @click="save(true)">{{ i18n.ts._statusMessage.clear }}</MkButton>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkUserStatus from '@/components/MkUserStatus.vue';
import { ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';

const $i = ensureSignin();
const message = ref($i.statusMessage && (!$i.statusExpiresAt || Date.parse($i.statusExpiresAt) > Date.now()) ? $i.statusMessage : '');
const expiresIn = ref<number | null>(120);
const saving = ref(false);
const characterCount = computed(() => Array.from(message.value).length);
const presets = [i18n.ts._statusMessage.working, i18n.ts._statusMessage.free, i18n.ts._statusMessage.available, i18n.ts._statusMessage.melting];
const durations = [30, 60, 120, 240, 480, 1440].map(value => ({ value, label: i18n.tsx._statusMessage.minutes({ n: value }) }));
// null は自分で解除するまで表示する。
const durationItems: { value: number | null; label: string }[] = [...durations, { value: null, label: i18n.ts.indefinitely }];

async function save(clear: boolean) {
	if (saving.value || (!clear && characterCount.value > 80)) return;
	saving.value = true;
	try {
		const updated = await os.apiWithDialog('i/update-status', { message: clear ? null : message.value, expiresIn: expiresIn.value });
		Object.assign($i, updated);
		message.value = updated.statusMessage ?? '';
	} catch {
		// エラー表示はapiWithDialogが担当する。入力は再試行のため残す。
	} finally {
		saving.value = false;
	}
}
</script>

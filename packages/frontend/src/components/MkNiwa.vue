<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div>
	<MkInfo v-if="!$i">{{ i18n.ts.signinRequired }}</MkInfo>
	<template v-else>
		<MkError v-if="error" @retry="refresh"/>
		<MkNiwaGarden v-if="garden" :garden="garden" :busy="busy" @water="water"/>
		<MkLoading v-else-if="!error"/>
	</template>
</div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import type { Endpoints } from 'misskey-js';
import { useInterval } from '@@/js/use-interval.js';
import MkNiwaGarden from '@/components/MkNiwaGarden.vue';
import MkInfo from '@/components/MkInfo.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';

const garden = ref<Endpoints['niwa/show']['res'] | null>(null);
const busy = ref(false);
const error = ref(false);

async function refresh() {
	if (!$i || busy.value) return;
	busy.value = true;
	try {
		garden.value = await misskeyApi('niwa/show');
		error.value = false;
	} catch {
		error.value = true;
	} finally {
		busy.value = false;
	}
}

async function water() {
	if (!$i || busy.value || garden.value?.wateredToday) return;
	busy.value = true;
	try {
		garden.value = await misskeyApi('niwa/water');
		error.value = false;
	} catch {
		error.value = true;
	} finally {
		busy.value = false;
	}
}

useInterval(refresh, 60000, { immediate: true, afterMounted: true });
</script>

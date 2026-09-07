<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader>
	<div class="_spacer _gaps_m" style="--MI_SPACER-w: 700px;">
		<MkInfo>{{ i18n.ts._niwa.description }}</MkInfo>
		<MkNiwa class="_panel"/>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import MkNiwa from '@/components/MkNiwa.vue';
import MkInfo from '@/components/MkInfo.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';

definePage(() => ({ title: i18n.ts._niwa.title, icon: 'ti ti-seeding' }));
</script>

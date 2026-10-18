<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-FileCopyrightText: mk-go project
SPDX-License-Identifier: AGPL-3.0-only
-->

<!--
	承認制の登録の審査画面。
	shiroha-a/misskey-ts (https://github.com/shiroha-a/misskey-ts) の pages/admin/signup-applications.vue
	(commit 14f28f5708 ほか) を元にしている。

	承認してもこの時点ではアカウントを作らない。申請者がクレームコードを持って戻ってきたときに初めて作られる。
	有効・無効の切り替えはモデレーションの設定にある (審査のたびに設定が目に入って誤操作しないように分けている)。
-->

<template>
<PageWithHeader :actions="headerActions">
	<div class="_spacer" style="--MI_SPACER-w: 800px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<div class="_gaps_m">
			<MkInfo v-if="!instance.approvalRequiredForSignup">{{ i18n.ts._signupApplication._errors.unavailable }}</MkInfo>

			<MkSelect v-model="status" :items="statusDef">
				<template #label>{{ i18n.ts.state }}</template>
			</MkSelect>

			<MkPagination :paginator="paginator">
				<template #empty><MkResult type="empty" :text="i18n.ts._signupApplication._admin.noApplications"/></template>

				<template #default="{ items }">
					<div class="_gaps_s">
						<MkFolder v-for="application in items" :key="application.id" :defaultOpen="application.status === 'pending'">
							<template #icon><i class="ti ti-user-plus"></i></template>
							<template #label><MkTime :time="application.createdAt" mode="detail"/></template>
							<template #suffix>
								<span :style="{ color: statusColor(application.status) }">{{ i18n.ts._signupApplication._status[application.status] }}</span>
							</template>
							<template v-if="application.status === 'pending'" #footer>
								<div class="_buttons">
									<MkButton primary rounded @click="approve(application)"><i class="ti ti-check"></i> {{ i18n.ts._signupApplication._admin.approve }}</MkButton>
									<MkButton danger rounded @click="reject(application)"><i class="ti ti-x"></i> {{ i18n.ts._signupApplication._admin.reject }}</MkButton>
								</div>
							</template>

							<div class="_gaps_s">
								<MkKeyValue v-for="(answer, i) in application.answers" :key="i">
									<template #key>{{ answer.label }}</template>
									<template #value><div :class="$style.answer" class="_selectable">{{ answer.value !== '' ? answer.value : i18n.ts._signupApplication._admin.noAnswer }}</div></template>
								</MkKeyValue>

								<div :class="$style.meta">
									<MkKeyValue oneline>
										<template #key>{{ i18n.ts._signupApplication._admin.appliedAt }}</template>
										<template #value><MkTime :time="application.createdAt" mode="detail"/></template>
									</MkKeyValue>
									<MkKeyValue v-if="application.status === 'pending' || application.status === 'approved'" oneline>
										<template #key>{{ i18n.ts._signupApplication._admin.expiresAt }}</template>
										<template #value><MkTime :time="application.expiresAt" mode="detail"/></template>
									</MkKeyValue>
									<MkKeyValue v-if="application.processedAt != null" oneline>
										<template #key>{{ i18n.ts._signupApplication._admin.processedAt }}</template>
										<template #value><MkTime :time="application.processedAt" mode="detail"/></template>
									</MkKeyValue>
									<MkKeyValue v-if="application.processedBy != null" oneline>
										<template #key>{{ i18n.ts._signupApplication._admin.processedBy }}</template>
										<template #value><MkA :to="`/admin/user/${application.processedBy.id}`" class="_link"><MkAcct :user="application.processedBy"/></MkA></template>
									</MkKeyValue>
									<MkKeyValue v-if="application.usedBy != null" oneline>
										<template #key>{{ i18n.ts._signupApplication._admin.usedBy }}</template>
										<template #value><MkA :to="`/admin/user/${application.usedBy.id}`" class="_link"><MkAcct :user="application.usedBy"/></MkA></template>
									</MkKeyValue>
								</div>
							</div>
						</MkFolder>
					</div>
				</template>
			</MkPagination>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, markRaw } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkKeyValue from '@/components/MkKeyValue.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkSelect from '@/components/MkSelect.vue';
import { useMkSelect } from '@/composables/use-mkselect.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import { definePage } from '@/page.js';
import { Paginator } from '@/utility/paginator.js';

const {
	model: status,
	def: statusDef,
} = useMkSelect({
	items: [
		{ label: i18n.ts._signupApplication._status.pending, value: 'pending' },
		{ label: i18n.ts._signupApplication._status.approved, value: 'approved' },
		{ label: i18n.ts._signupApplication._admin.processed, value: 'processed' },
		{ label: i18n.ts.all, value: 'all' },
	],
	initialValue: 'pending',
});

const paginator = markRaw(new Paginator('admin/signup-application/list', {
	limit: 10,
	computedParams: computed(() => ({
		status: status.value,
	})),
}));

function statusColor(s: Misskey.entities.SignupApplication['status']): string | undefined {
	switch (s) {
		case 'pending': return 'var(--MI_THEME-warn)';
		case 'approved':
		case 'completed': return 'var(--MI_THEME-success)';
		case 'rejected': return 'var(--MI_THEME-error)';
		default: return undefined;
	}
}

async function approve(application: Misskey.entities.SignupApplication) {
	const { canceled } = await os.confirm({
		type: 'question',
		text: i18n.ts._signupApplication._admin.approveConfirm,
	});
	if (canceled) return;

	const updated = await os.apiWithDialog('admin/signup-application/approve', { applicationId: application.id });
	paginator.updateItem(application.id, () => updated);
}

async function reject(application: Misskey.entities.SignupApplication) {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts._signupApplication._admin.rejectConfirm,
	});
	if (canceled) return;

	const updated = await os.apiWithDialog('admin/signup-application/reject', { applicationId: application.id });
	paginator.updateItem(application.id, () => updated);
}

const headerActions = computed(() => [{
	icon: 'ti ti-refresh',
	text: i18n.ts.reload,
	handler: () => paginator.reload(),
}]);

definePage(() => ({
	title: i18n.ts._signupApplication._admin.applications,
	icon: 'ti ti-user-plus',
}));
</script>

<style lang="scss" module>
// 回答は自由記述。長い行や改行をそのまま出すと横に溢れる
.answer {
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

.meta {
	font-size: 0.9em;
	opacity: 0.8;
}
</style>

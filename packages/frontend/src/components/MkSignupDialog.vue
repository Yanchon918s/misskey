<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="dialog"
	:width="500"
	:height="600"
	@close="onClose"
	@closed="emit('closed')"
>
	<template #header>{{ i18n.ts.signup }}</template>

	<div style="overflow-x: clip;">
		<Transition
			mode="out-in"
			:enterActiveClass="$style.transition_x_enterActive"
			:leaveActiveClass="$style.transition_x_leaveActive"
			:enterFromClass="$style.transition_x_enterFrom"
			:leaveToClass="$style.transition_x_leaveTo"
		>
			<template v-if="!isAcceptedServerRule">
				<XServerRules @done="isAcceptedServerRule = true" @cancel="onClose"/>
			</template>
			<template v-else-if="instance.approvalRequiredForSignup && !useInvitationCode">
				<!-- 承認制のときは、申請から始めるか招待コードで登録するかを選んでもらう -->
				<div class="_spacer _gaps_m" style="--MI_SPACER-min: 20px; --MI_SPACER-max: 28px;">
					<div>{{ i18n.ts._signupApplication.dialogDescription }}</div>
					<div class="_buttonsCenter">
						<MkButton primary rounded gradate data-testid="signup-application-start" @click="goToApplication"><i class="ti ti-send"></i> {{ i18n.ts._signupApplication.apply }}</MkButton>
					</div>
					<div :class="$style.note">{{ i18n.ts._signupApplication.haveInvitationCode }}</div>
					<div class="_buttonsCenter">
						<MkButton rounded @click="useInvitationCode = true"><i class="ti ti-key"></i> {{ i18n.ts._signupApplication.useInvitationCode }}</MkButton>
					</div>
				</div>
			</template>
			<template v-else>
				<XSignup :autoSet="autoSet" @signup="onSignup" @signupEmailPending="onSignupEmailPending"/>
			</template>
		</Transition>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { useTemplateRef, ref } from 'vue';
import * as Misskey from 'misskey-js';
import XSignup from '@/components/MkSignupDialog.form.vue';
import XServerRules from '@/components/MkSignupDialog.rules.vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import { useRouter } from '@/router.js';

const props = withDefaults(defineProps<{
	autoSet?: boolean;
}>(), {
	autoSet: false,
});

const emit = defineEmits<{
	(ev: 'done', res: Misskey.entities.SignupResponse): void;
	(ev: 'cancelled'): void;
	(ev: 'closed'): void;
}>();

const dialog = useTemplateRef('dialog');

const isAcceptedServerRule = ref(false);
const useInvitationCode = ref(false);

const router = useRouter();

function goToApplication() {
	onClose();
	router.push('/signup-application');
}

function onClose() {
	emit('cancelled');
	dialog.value?.close();
}

function onSignup(res: Misskey.entities.SignupResponse) {
	emit('done', res);
	dialog.value?.close();
}

function onSignupEmailPending() {
	dialog.value?.close();
}
</script>

<style lang="scss" module>
.transition_x_enterActive,
.transition_x_leaveActive {
	transition: opacity 0.3s cubic-bezier(0,0,.35,1), transform 0.3s cubic-bezier(0,0,.35,1);
}
.transition_x_enterFrom {
	opacity: 0;
	transform: translateX(50px);
}
.transition_x_leaveTo {
	opacity: 0;
	transform: translateX(-50px);
}

.note {
	font-size: 0.9em;
	opacity: 0.8;
	text-align: center;
}
</style>

<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<SearchMarker path="/admin/moderation" :label="i18n.ts.moderation" :keywords="['moderation']" icon="ti ti-shield" :inlining="['serverRules']">
			<div class="_gaps_m">
				<SearchMarker :keywords="['open', 'registration']">
					<MkSwitch :modelValue="enableRegistration" :disabled="approvalRequiredForSignup" @update:modelValue="onChange_enableRegistration">
						<template #label><SearchLabel>{{ i18n.ts._serverSettings.openRegistration }}</SearchLabel></template>
						<template #caption>
							<div v-if="approvalRequiredForSignup">{{ i18n.ts._signupApplication._admin.openRegistrationDisabledWhileApproval }}</div>
							<div><SearchText>{{ i18n.ts._serverSettings.thisSettingWillAutomaticallyOffWhenModeratorsInactive }}</SearchText></div>
							<div><i class="ti ti-alert-triangle" style="color: var(--MI_THEME-warn);"></i> <SearchText>{{ i18n.ts._serverSettings.openRegistrationWarning }}</SearchText></div>
						</template>
					</MkSwitch>
				</SearchMarker>

				<SearchMarker :keywords="['approval', 'application', 'registration', 'signup']">
					<MkSwitch :modelValue="approvalRequiredForSignup" @update:modelValue="onChange_approvalRequiredForSignup">
						<template #label><SearchLabel>{{ i18n.ts._signupApplication._admin.approvalRequiredForSignup }}</SearchLabel></template>
						<template #caption>
							<div><SearchText>{{ i18n.ts._signupApplication._admin.approvalRequiredForSignupDescription }}</SearchText></div>
							<div>{{ i18n.ts._signupApplication._admin.approvalRequiredForSignupNote }}</div>
							<div v-if="approvalRequiredForSignup"><MkA to="/admin/signup-applications" class="_link">{{ i18n.ts._signupApplication._admin.applications }}</MkA></div>
						</template>
					</MkSwitch>
				</SearchMarker>

				<MkFolder v-if="approvalRequiredForSignup">
					<template #icon><i class="ti ti-forms"></i></template>
					<template #label>{{ i18n.ts._signupApplication._admin.form }}</template>
					<template #suffix>{{ i18n.tsx._signupApplication._admin.fieldCount({ n: signupApplicationForm.length }) }}</template>
					<template #footer>
						<div class="_buttons">
							<MkButton primary rounded @click="save_signupApplicationForm"><i class="ti ti-check"></i> {{ i18n.ts.save }}</MkButton>
						</div>
					</template>

					<div class="_gaps_m">
						<div :class="$style.caption">{{ i18n.ts._signupApplication._admin.formDescription }}</div>

						<div v-for="(field, i) in signupApplicationForm" :key="field.key" class="_gaps_s" :class="$style.formField">
							<MkInput v-model="field.label">
								<template #label>{{ i18n.ts._signupApplication._admin.fieldLabel }}</template>
							</MkInput>
							<MkSelect v-model="field.type" :items="fieldTypeDef">
								<template #label>{{ i18n.ts._signupApplication._admin.fieldType }}</template>
							</MkSelect>
							<MkInput v-model="field.maxLength" type="number" :min="1" :max="maxAnswerLength">
								<template #label>{{ i18n.ts._signupApplication._admin.fieldMaxLength }}</template>
								<template #caption>{{ i18n.tsx._signupApplication._admin.fieldMaxLengthDescription({ default: defaultAnswerLength, max: maxAnswerLength }) }}</template>
							</MkInput>
							<MkSwitch v-model="field.required">
								<template #label>{{ i18n.ts._signupApplication._admin.fieldRequired }}</template>
							</MkSwitch>
							<div class="_buttons">
								<MkButton danger rounded @click="removeSignupApplicationFormField(i)"><i class="ti ti-trash"></i> {{ i18n.ts._signupApplication._admin.removeField }}</MkButton>
							</div>
						</div>

						<div class="_buttons">
							<MkButton rounded :disabled="signupApplicationForm.length >= maxFormFields" @click="addSignupApplicationFormField"><i class="ti ti-plus"></i> {{ i18n.ts._signupApplication._admin.addField }}</MkButton>
						</div>
						<div v-if="signupApplicationForm.length >= maxFormFields" :class="$style.caption">{{ i18n.tsx._signupApplication._admin.maxFieldsReached({ n: maxFormFields }) }}</div>
					</div>
				</MkFolder>

				<SearchMarker :keywords="['email', 'required', 'signup']">
					<MkSwitch v-model="emailRequiredForSignup" @change="onChange_emailRequiredForSignup">
						<template #label><SearchLabel>{{ i18n.ts.emailRequiredForSignup }}</SearchLabel> ({{ i18n.ts.recommended }})</template>
						<template v-if="approvalRequiredForSignup" #caption>{{ i18n.ts._signupApplication._admin.emailRequiredNote }}</template>
					</MkSwitch>
				</SearchMarker>

				<SearchMarker :keywords="['ugc', 'content', 'visibility', 'visitor', 'guest']">
					<MkSelect v-model="ugcVisibilityForVisitor" :items="ugcVisibilityForVisitorDef" @update:modelValue="onChange_ugcVisibilityForVisitor">
						<template #label><SearchLabel>{{ i18n.ts._serverSettings.userGeneratedContentsVisibilityForVisitor }}</SearchLabel></template>
						<template #caption>
							<div><SearchText>{{ i18n.ts._serverSettings.userGeneratedContentsVisibilityForVisitor_description }}</SearchText></div>
							<div><i class="ti ti-alert-triangle" style="color: var(--MI_THEME-warn);"></i> <SearchText>{{ i18n.ts._serverSettings.userGeneratedContentsVisibilityForVisitor_description2 }}</SearchText></div>
						</template>
					</MkSelect>
				</SearchMarker>

				<XServerRules/>

				<SearchMarker :keywords="['preserved', 'usernames']">
					<MkFolder>
						<template #icon><SearchIcon><i class="ti ti-lock-star"></i></SearchIcon></template>
						<template #label><SearchLabel>{{ i18n.ts.preservedUsernames }}</SearchLabel></template>

						<div class="_gaps">
							<MkTextarea v-model="preservedUsernames">
								<template #caption>{{ i18n.ts.preservedUsernamesDescription }}</template>
							</MkTextarea>
							<MkButton primary @click="save_preservedUsernames">{{ i18n.ts.save }}</MkButton>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker :keywords="['sensitive', 'words']">
					<MkFolder>
						<template #icon><SearchIcon><i class="ti ti-message-exclamation"></i></SearchIcon></template>
						<template #label><SearchLabel>{{ i18n.ts.sensitiveWords }}</SearchLabel></template>

						<div class="_gaps">
							<MkTextarea v-model="sensitiveWords">
								<template #caption>{{ i18n.ts.sensitiveWordsDescription }}<br>{{ i18n.ts.sensitiveWordsDescription2 }}</template>
							</MkTextarea>
							<MkButton primary @click="save_sensitiveWords">{{ i18n.ts.save }}</MkButton>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker :keywords="['prohibited', 'words']">
					<MkFolder>
						<template #icon><SearchIcon><i class="ti ti-message-x"></i></SearchIcon></template>
						<template #label><SearchLabel>{{ i18n.ts.prohibitedWords }}</SearchLabel></template>

						<div class="_gaps">
							<MkTextarea v-model="prohibitedWords">
								<template #caption>{{ i18n.ts.prohibitedWordsDescription }}<br>{{ i18n.ts.prohibitedWordsDescription2 }}</template>
							</MkTextarea>
							<MkButton primary @click="save_prohibitedWords">{{ i18n.ts.save }}</MkButton>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker :keywords="['prohibited', 'name', 'user']">
					<MkFolder>
						<template #icon><SearchIcon><i class="ti ti-user-x"></i></SearchIcon></template>
						<template #label><SearchLabel>{{ i18n.ts.prohibitedWordsForNameOfUser }}</SearchLabel></template>

						<div class="_gaps">
							<MkTextarea v-model="prohibitedWordsForNameOfUser">
								<template #caption>{{ i18n.ts.prohibitedWordsForNameOfUserDescription }}<br>{{ i18n.ts.prohibitedWordsDescription2 }}</template>
							</MkTextarea>
							<MkButton primary @click="save_prohibitedWordsForNameOfUser">{{ i18n.ts.save }}</MkButton>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker :keywords="['hidden', 'tags', 'hashtags']">
					<MkFolder>
						<template #icon><SearchIcon><i class="ti ti-eye-off"></i></SearchIcon></template>
						<template #label><SearchLabel>{{ i18n.ts.hiddenTags }}</SearchLabel></template>

						<div class="_gaps">
							<MkTextarea v-model="hiddenTags">
								<template #caption>{{ i18n.ts.hiddenTagsDescription }}</template>
							</MkTextarea>
							<MkButton primary @click="save_hiddenTags">{{ i18n.ts.save }}</MkButton>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker :keywords="['silenced', 'servers', 'hosts']">
					<MkFolder>
						<template #icon><SearchIcon><i class="ti ti-eye-off"></i></SearchIcon></template>
						<template #label><SearchLabel>{{ i18n.ts.silencedInstances }}</SearchLabel></template>

						<div class="_gaps">
							<MkTextarea v-model="silencedHosts">
								<template #caption>{{ i18n.ts.silencedInstancesDescription }}</template>
							</MkTextarea>
							<MkButton primary @click="save_silencedHosts">{{ i18n.ts.save }}</MkButton>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker :keywords="['media', 'silenced', 'servers', 'hosts']">
					<MkFolder>
						<template #icon><SearchIcon><i class="ti ti-eye-off"></i></SearchIcon></template>
						<template #label><SearchLabel>{{ i18n.ts.mediaSilencedInstances }}</SearchLabel></template>

						<div class="_gaps">
							<MkTextarea v-model="mediaSilencedHosts">
								<template #caption>{{ i18n.ts.mediaSilencedInstancesDescription }}</template>
							</MkTextarea>
							<MkButton primary @click="save_mediaSilencedHosts">{{ i18n.ts.save }}</MkButton>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker :keywords="['blocked', 'servers', 'hosts']">
					<MkFolder>
						<template #icon><SearchIcon><i class="ti ti-ban"></i></SearchIcon></template>
						<template #label><SearchLabel>{{ i18n.ts.blockedInstances }}</SearchLabel></template>

						<div class="_gaps">
							<MkTextarea v-model="blockedHosts">
								<template #caption>{{ i18n.ts.blockedInstancesDescription }}</template>
							</MkTextarea>
							<MkButton primary @click="save_blockedHosts">{{ i18n.ts.save }}</MkButton>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker :keywords="['bubble', 'timeline', 'servers', 'hosts']">
					<MkFolder>
						<template #icon><SearchIcon><i class="ti ti-bubble"></i></SearchIcon></template>
						<template #label><SearchLabel>{{ i18n.ts.bubbleTimeline }}</SearchLabel></template>

						<div class="_gaps">
							<MkTextarea v-model="bubbleInstances">
								<template #caption>{{ i18n.ts.bubbleTimelineDescription }}</template>
							</MkTextarea>
							<MkButton primary @click="save_bubbleInstances">{{ i18n.ts.save }}</MkButton>
						</div>
					</MkFolder>
				</SearchMarker>
			</div>
		</SearchMarker>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import * as Misskey from 'misskey-js';
import XServerRules from './server-rules.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useMkSelect } from '@/composables/use-mkselect.js';
import MkButton from '@/components/MkButton.vue';
import FormLink from '@/components/form/link.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkSelect from '@/components/MkSelect.vue';

const meta = await misskeyApi('admin/meta');

const enableRegistration = ref(!meta.disableRegistration);
const emailRequiredForSignup = ref(meta.emailRequiredForSignup);
const approvalRequiredForSignup = ref(meta.approvalRequiredForSignup);

// 上限はサーバー側 (SignupApplicationService) と揃える
const maxFormFields = 10;
const defaultAnswerLength = 500;
const maxAnswerLength = 2000;
// 編集中は行の削除で入力欄が入れ替わらないように、行ごとに固定の key を持たせる。
// maxLength は空欄のとき null で始め、MkInput (type="number") が空欄を NaN で返しても保存時に既定値として扱う
type EditableSignupApplicationFormField = Omit<Misskey.entities.SignupApplicationFormField, 'maxLength'> & { key: number; maxLength: number | null };
let nextSignupApplicationFormFieldKey = 0;
const signupApplicationForm = ref<EditableSignupApplicationFormField[]>(meta.signupApplicationForm.map(field => ({ ...field, key: nextSignupApplicationFormFieldKey++, maxLength: field.maxLength ?? null })));
const fieldTypeDef = [
	{ label: i18n.ts._signupApplication._admin.fieldTypeText, value: 'text' as const },
	{ label: i18n.ts._signupApplication._admin.fieldTypeTextarea, value: 'textarea' as const },
];
const {
	model: ugcVisibilityForVisitor,
	def: ugcVisibilityForVisitorDef,
} = useMkSelect({
	items: [
		{ label: i18n.ts._serverSettings._userGeneratedContentsVisibilityForVisitor.all, value: 'all' },
		{ label: i18n.ts._serverSettings._userGeneratedContentsVisibilityForVisitor.localOnly, value: 'local' },
		{ label: i18n.ts._serverSettings._userGeneratedContentsVisibilityForVisitor.none, value: 'none' },
	],
	initialValue: meta.ugcVisibilityForVisitor,
});
const sensitiveWords = ref(meta.sensitiveWords.join('\n'));
const prohibitedWords = ref(meta.prohibitedWords.join('\n'));
const prohibitedWordsForNameOfUser = ref(meta.prohibitedWordsForNameOfUser.join('\n'));
const hiddenTags = ref(meta.hiddenTags.join('\n'));
const preservedUsernames = ref(meta.preservedUsernames.join('\n'));
const blockedHosts = ref(meta.blockedHosts.join('\n'));
const silencedHosts = ref(meta.silencedHosts?.join('\n') ?? '');
const mediaSilencedHosts = ref(meta.mediaSilencedHosts.join('\n'));
const bubbleInstances = ref(meta.bubbleInstances.join('\n'));

async function onChange_enableRegistration(value: boolean) {
	if (value) {
		const { canceled } = await os.confirm({
			type: 'warning',
			text: i18n.ts.acknowledgeNotesAndEnable,
		});
		if (canceled) return;
	}

	enableRegistration.value = value;

	os.apiWithDialog('admin/update-meta', {
		disableRegistration: !value,
	}).then(() => {
		fetchInstance(true);
	});
}

async function onChange_approvalRequiredForSignup(value: boolean) {
	const prevApprovalRequiredForSignup = approvalRequiredForSignup.value;
	const prevEnableRegistration = enableRegistration.value;

	approvalRequiredForSignup.value = value;
	// 承認制にするとサーバーが招待コードのない登録を閉じる。解除しても自動では開かない
	if (value) enableRegistration.value = false;

	try {
		await os.apiWithDialog('admin/update-meta', {
			approvalRequiredForSignup: value,
		});
	} catch {
		// 保存できなかったので表示を実際の状態へ戻す
		approvalRequiredForSignup.value = prevApprovalRequiredForSignup;
		enableRegistration.value = prevEnableRegistration;
		return;
	}

	fetchInstance(true);
}

function addSignupApplicationFormField() {
	if (signupApplicationForm.value.length >= maxFormFields) return;
	signupApplicationForm.value.push({ key: nextSignupApplicationFormFieldKey++, label: '', type: 'text', required: false, maxLength: null });
}

function removeSignupApplicationFormField(index: number) {
	signupApplicationForm.value.splice(index, 1);
}

function save_signupApplicationForm() {
	os.apiWithDialog('admin/update-meta', {
		signupApplicationForm: signupApplicationForm.value.map(field => ({
			label: field.label,
			type: field.type,
			required: field.required,
			// 空欄は既定の文字数にする
			...(typeof field.maxLength === 'number' && Number.isFinite(field.maxLength) && field.maxLength > 0 ? { maxLength: field.maxLength } : {}),
		})),
	}).then(() => {
		fetchInstance(true);
	});
}

function onChange_emailRequiredForSignup(value: boolean) {
	os.apiWithDialog('admin/update-meta', {
		emailRequiredForSignup: value,
	}).then(() => {
		fetchInstance(true);
	});
}

function onChange_ugcVisibilityForVisitor(value: typeof ugcVisibilityForVisitor.value) {
	os.apiWithDialog('admin/update-meta', {
		ugcVisibilityForVisitor: value,
	}).then(() => {
		fetchInstance(true);
	});
}

function save_preservedUsernames() {
	os.apiWithDialog('admin/update-meta', {
		preservedUsernames: preservedUsernames.value.split('\n'),
	}).then(() => {
		fetchInstance(true);
	});
}

function save_sensitiveWords() {
	os.apiWithDialog('admin/update-meta', {
		sensitiveWords: sensitiveWords.value.split('\n'),
	}).then(() => {
		fetchInstance(true);
	});
}

function save_prohibitedWords() {
	os.apiWithDialog('admin/update-meta', {
		prohibitedWords: prohibitedWords.value.split('\n'),
	}).then(() => {
		fetchInstance(true);
	});
}

function save_prohibitedWordsForNameOfUser() {
	os.apiWithDialog('admin/update-meta', {
		prohibitedWordsForNameOfUser: prohibitedWordsForNameOfUser.value.split('\n'),
	}).then(() => {
		fetchInstance(true);
	});
}

function save_hiddenTags() {
	os.apiWithDialog('admin/update-meta', {
		hiddenTags: hiddenTags.value.split('\n'),
	}).then(() => {
		fetchInstance(true);
	});
}

function save_blockedHosts() {
	os.apiWithDialog('admin/update-meta', {
		blockedHosts: blockedHosts.value.split('\n') || [],
	}).then(() => {
		fetchInstance(true);
	});
}

function save_silencedHosts() {
	os.apiWithDialog('admin/update-meta', {
		silencedHosts: silencedHosts.value.split('\n') || [],
	}).then(() => {
		fetchInstance(true);
	});
}

function save_mediaSilencedHosts() {
	os.apiWithDialog('admin/update-meta', {
		mediaSilencedHosts: mediaSilencedHosts.value.split('\n') || [],
	}).then(() => {
		fetchInstance(true);
	});
}

function save_bubbleInstances() {
	os.apiWithDialog('admin/update-meta', {
		bubbleInstances: bubbleInstances.value.split('\n'),
	}).then(() => {
		fetchInstance(true);
	});
}

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.moderation,
	icon: 'ti ti-shield',
}));
</script>

<style lang="scss" module>
.caption {
	font-size: 0.85em;
	opacity: 0.8;
}

.formField {
	padding: 16px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: var(--MI-radius);
}
</style>

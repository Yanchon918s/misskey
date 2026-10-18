<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-FileCopyrightText: mk-go project
SPDX-License-Identifier: AGPL-3.0-only
-->

<!--
	承認制の登録の申請ページ。
	shiroha-a/misskey-ts (https://github.com/shiroha-a/misskey-ts) の pages/signup-application.vue
	(commit 0aa6df556a ほか、captcha の修正 b611cb8e00 / ac7456f394 / 4fe1549d3d を含む) を元にしている。

	申請してクレームコードを受け取り、そのコードで戻ってきて登録する。コードは 1 度しか表示されない。
-->

<template>
<PageWithHeader>
	<div class="_spacer" style="--MI_SPACER-w: 600px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<div class="_gaps_m">
			<MkInfo v-if="!instance.approvalRequiredForSignup" warn>{{ i18n.ts._signupApplication._errors.unavailable }}</MkInfo>

			<template v-else>
				<MkInfo v-if="errorMessage != null" warn>{{ errorMessage }}</MkInfo>

				<!-- 申請直後: コードを 1 度だけ見せる -->
				<template v-if="issuedCode !== ''">
					<MkInfo warn>
						<div><b>{{ i18n.ts._signupApplication.claimCodeIssued }}</b></div>
						<div>{{ i18n.ts._signupApplication.claimCodeIssuedDescription }}</div>
					</MkInfo>
					<MkInput :modelValue="issuedCode" readonly :spellcheck="false" data-testid="signup-application-claim-code">
						<template #label>{{ i18n.ts._signupApplication.claimCode }}</template>
						<template #prefix><i class="ti ti-key"></i></template>
					</MkInput>
					<div class="_buttons">
						<MkButton rounded @click="copyToClipboard(issuedCode)"><i class="ti ti-copy"></i> {{ i18n.ts.copy }}</MkButton>
						<MkButton primary rounded @click="issuedCode = ''"><i class="ti ti-check"></i> {{ i18n.ts._signupApplication.savedClaimCode }}</MkButton>
					</div>
				</template>

				<!-- 確認メールを送った -->
				<template v-else-if="confirmationSentTo != null">
					<MkInfo>{{ i18n.tsx._signupApplication.emailConfirmationSent({ email: confirmationSentTo }) }}</MkInfo>
					<div :class="$style.note">{{ i18n.ts._signupApplication.emailConfirmationNote }}</div>
					<div class="_buttons">
						<MkButton rounded @click="confirmationSentTo = null"><i class="ti ti-arrow-back"></i> {{ i18n.ts._signupApplication.backToRegistration }}</MkButton>
					</div>
				</template>

				<!-- コードで引いた申請の状態 -->
				<template v-else-if="application != null">
					<template v-if="application.status === 'pending'">
						<MkInfo>{{ i18n.ts._signupApplication.pendingDescription }}</MkInfo>
						<div :class="$style.note">
							<I18n :src="i18n.ts._signupApplication.validUntil" tag="span">
								<template #date><MkTime :time="application.expiresAt" mode="detail"/></template>
							</I18n>
						</div>
						<div class="_buttons">
							<MkButton rounded :disabled="busy" @click="refresh"><i class="ti ti-refresh"></i> {{ i18n.ts._signupApplication.checkStatus }}</MkButton>
						</div>
					</template>

					<template v-else-if="application.status === 'approved'">
						<MkInfo>{{ i18n.ts._signupApplication.approvedDescription }}</MkInfo>
						<div :class="$style.note">
							<I18n :src="i18n.ts._signupApplication.validUntil" tag="span">
								<template #date><MkTime :time="application.expiresAt" mode="detail"/></template>
							</I18n>
						</div>

						<MkInput v-model="username" type="text" pattern="^[a-zA-Z0-9_]{1,20}$" :spellcheck="false" autocomplete="username" :disabled="busy" data-testid="signup-application-username">
							<template #label>{{ i18n.ts.username }} <div v-tooltip:dialog="i18n.ts.usernameInfo" class="_button _help"><i class="ti ti-help-circle"></i></div></template>
							<template #prefix>@</template>
							<template #suffix>@{{ host }}</template>
						</MkInput>
						<MkInput v-model="password" type="password" autocomplete="new-password" :disabled="busy" data-testid="signup-application-password">
							<template #label>{{ i18n.ts.password }}</template>
							<template #prefix><i class="ti ti-lock"></i></template>
						</MkInput>
						<MkInput v-model="retypedPassword" type="password" autocomplete="new-password" :disabled="busy" data-testid="signup-application-password-retype">
							<template #label>{{ i18n.ts.password }} ({{ i18n.ts.retype }})</template>
							<template #prefix><i class="ti ti-lock"></i></template>
							<template v-if="retypedPassword !== '' && retypedPassword !== password" #caption><span style="color: var(--MI_THEME-error)"><i class="ti ti-alert-triangle ti-fw"></i> {{ i18n.ts.passwordNotMatched }}</span></template>
						</MkInput>
						<MkInput v-if="instance.emailRequiredForSignup" v-model="emailAddress" type="email" :spellcheck="false" :disabled="busy" data-testid="signup-application-email">
							<template #label>{{ i18n.ts.emailAddress }}</template>
							<template #prefix><i class="ti ti-mail"></i></template>
							<template #caption>{{ i18n.ts._signupApplication.emailConfirmationCaption }}</template>
						</MkInput>

						<div class="_buttons">
							<MkButton primary rounded :disabled="!canRegister" data-testid="signup-application-register" @click="register"><i class="ti ti-user-plus"></i> {{ i18n.ts.signup }}</MkButton>
						</div>
					</template>

					<template v-else-if="application.status === 'rejected'">
						<MkInfo warn>{{ i18n.ts._signupApplication.rejectedDescription }}</MkInfo>
						<div class="_buttons">
							<MkButton rounded @click="restart">{{ i18n.ts._signupApplication.applyAgain }}</MkButton>
						</div>
					</template>

					<template v-else-if="application.status === 'expired'">
						<MkInfo warn>{{ i18n.ts._signupApplication.expiredDescription }}</MkInfo>
						<div class="_buttons">
							<MkButton rounded @click="restart">{{ i18n.ts._signupApplication.applyAgain }}</MkButton>
						</div>
					</template>

					<template v-else-if="application.status === 'completed'">
						<MkInfo>{{ i18n.ts._signupApplication.completedDescription }}</MkInfo>
					</template>
				</template>

				<!-- 入口: 申請する / コードで戻る -->
				<template v-else>
					<div class="_gaps_s">
						<div>{{ i18n.ts._signupApplication.approvalRequired }}</div>
						<div :class="$style.note"><b>{{ i18n.ts._signupApplication.pageDescription }}</b></div>
					</div>

					<MkFolder :defaultOpen="true">
						<template #icon><i class="ti ti-send"></i></template>
						<template #label>{{ i18n.ts._signupApplication.apply }}</template>

						<div class="_gaps_m">
							<MkInfo v-if="form.length === 0">{{ i18n.ts._signupApplication.noFormFields }}</MkInfo>
							<template v-for="(field, i) in form" :key="i">
								<MkTextarea v-if="field.type === 'textarea'" v-model="answers[i]" :disabled="busy">
									<template #label>{{ field.label }}<span v-if="field.required" :class="$style.required"> *</span></template>
									<template #caption>{{ answerLengthCaption(field, i) }}</template>
								</MkTextarea>
								<MkInput v-else v-model="answers[i]" :disabled="busy">
									<template #label>{{ field.label }}<span v-if="field.required" :class="$style.required"> *</span></template>
									<template #caption>{{ answerLengthCaption(field, i) }}</template>
								</MkInput>
							</template>

							<MkCaptcha v-if="instance.enableHcaptcha" ref="hcaptcha" v-model="hCaptchaResponse" provider="hcaptcha" :sitekey="instance.hcaptchaSiteKey"/>
							<MkCaptcha v-if="instance.enableMcaptcha" ref="mcaptcha" v-model="mCaptchaResponse" provider="mcaptcha" :sitekey="instance.mcaptchaSiteKey" :instanceUrl="instance.mcaptchaInstanceUrl"/>
							<MkCaptcha v-if="instance.enableRecaptcha" ref="recaptcha" v-model="reCaptchaResponse" provider="recaptcha" :sitekey="instance.recaptchaSiteKey"/>
							<MkCaptcha v-if="instance.enableTurnstile" ref="turnstile" v-model="turnstileResponse" provider="turnstile" :sitekey="instance.turnstileSiteKey"/>
							<MkCaptcha v-if="instance.enableTestcaptcha" ref="testcaptcha" v-model="testcaptchaResponse" provider="testcaptcha" :sitekey="null"/>

							<div class="_buttons">
								<MkButton primary rounded :disabled="busy || waitingForForm || captchaIncomplete || answersIncomplete" data-testid="signup-application-apply" @click="apply"><i class="ti ti-send"></i> {{ i18n.ts._signupApplication.apply }}</MkButton>
							</div>
							<div v-if="waitingForForm && formTokenLoaded" :class="$style.note">{{ i18n.ts._signupApplication.waitingForForm }}</div>
							<template v-if="formTokenFailed">
								<div :class="$style.note">{{ i18n.ts._signupApplication.formTokenFailed }}</div>
								<div class="_buttons">
									<MkButton rounded @click="fetchFormToken"><i class="ti ti-refresh"></i> {{ i18n.ts.reload }}</MkButton>
								</div>
							</template>
						</div>
					</MkFolder>

					<MkFolder :defaultOpen="false">
						<template #icon><i class="ti ti-key"></i></template>
						<template #label>{{ i18n.ts._signupApplication.checkStatusWithCode }}</template>

						<div class="_gaps_m">
							<MkInput v-model="claimCode" :spellcheck="false" :disabled="busy" @enter="refresh">
								<template #label>{{ i18n.ts._signupApplication.claimCode }}</template>
								<template #prefix><i class="ti ti-key"></i></template>
							</MkInput>
							<div class="_buttons">
								<MkButton rounded :disabled="busy || claimCode.trim() === ''" @click="refresh"><i class="ti ti-search"></i> {{ i18n.ts._signupApplication.checkStatus }}</MkButton>
							</div>
						</div>
					</MkFolder>
				</template>
			</template>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { host } from '@@/js/config.js';
import type { Captcha } from '@/components/MkCaptcha.vue';
import MkButton from '@/components/MkButton.vue';
import MkCaptcha from '@/components/MkCaptcha.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import { login } from '@/accounts.js';

// サーバー側 (SignupApplicationService) と揃える
const DEFAULT_ANSWER_LENGTH = 500;
const MAX_ANSWER_LENGTH = 2000;

const form = computed(() => instance.approvalRequiredForSignup ? instance.signupApplicationForm : []);

// 定義と同じ順序の値の配列を送る。ラベルはサーバーが定義から埋めるので送らない
const answers = ref<string[]>(form.value.map(() => ''));

// サーバー情報の再取得で定義が変わったら、回答の数を合わせ直す (ずれたまま送ると FORM_CHANGED になる)
watch(form, (fields) => {
	if (answers.value.length !== fields.length) {
		answers.value = fields.map(() => '');
	}
});

const claimCode = ref('');
const issuedCode = ref('');
const application = ref<Misskey.entities.SignupApplicationStatus | null>(null);
const username = ref('');
const password = ref('');
const retypedPassword = ref('');
const emailAddress = ref('');
const confirmationSentTo = ref<string | null>(null);
const busy = ref(false);
const errorMessage = ref<string | null>(null);

// サーバーは有効な provider をすべて検証するので、有効なものはすべて送る
const hcaptcha = ref<Captcha | undefined>();
const mcaptcha = ref<Captcha | undefined>();
const recaptcha = ref<Captcha | undefined>();
const turnstile = ref<Captcha | undefined>();
const testcaptcha = ref<Captcha | undefined>();

const hCaptchaResponse = ref<string | null>(null);
const mCaptchaResponse = ref<string | null>(null);
const reCaptchaResponse = ref<string | null>(null);
const turnstileResponse = ref<string | null>(null);
const testcaptchaResponse = ref<string | null>(null);

// 有効な provider が 1 つでも未解答なら送信させない。
// 未解答のまま送ると CAPTCHA_FAILED になり、レート制限の枠と解答済みの側のトークンを無駄にする。
const captchaIncomplete = computed(() =>
	(instance.enableHcaptcha && !hCaptchaResponse.value) ||
	(instance.enableMcaptcha && !mCaptchaResponse.value) ||
	(instance.enableRecaptcha && !reCaptchaResponse.value) ||
	(instance.enableTurnstile && !turnstileResponse.value) ||
	(instance.enableTestcaptcha && !testcaptchaResponse.value));

const answersIncomplete = computed(() => form.value.some((field, i) => {
	const value = (answers.value[i] ?? '').trim();
	return (field.required && value === '') || [...value].length > maxLengthOf(field);
}));

const canRegister = computed(() =>
	!busy.value &&
	username.value !== '' &&
	password.value !== '' &&
	password.value === retypedPassword.value &&
	(!instance.emailRequiredForSignup || emailAddress.value !== ''));

//#region フォームトークン
// captcha が 1 つも有効でないときだけサーバーが要求する。要求しない構成では空のトークンが返る。
const formToken = ref('');
const formTokenReadyAt = ref(0);
// 取得が終わるまでは送信を抑える。届く前に押せると、400 で終わるうえレート制限の枠を消費する
const formTokenLoaded = ref(false);
const formTokenFailed = ref(false);
const now = ref(Date.now());
let ticker: number | null = null;

// 最短の滞在時間が明けるまで送信ボタンを抑える (サーバーでも同じ判定をする)
const waitingForForm = computed(() =>
	!formTokenLoaded.value || (formToken.value !== '' && now.value < formTokenReadyAt.value));

async function fetchFormToken() {
	try {
		const res = await misskeyApi('signup-application/form-token', {});
		formToken.value = res.token;
		formTokenReadyAt.value = Date.now() + res.minWaitSeconds * 1000;
		formTokenFailed.value = false;
	} catch {
		// 取得できなくても申請自体は試せる (要求する構成ならサーバーが弾く)。
		// ここで送信を塞ぐと、トークンを要求しない構成でも申請できなくなる。
		formToken.value = '';
		formTokenReadyAt.value = 0;
		formTokenFailed.value = true;
	} finally {
		formTokenLoaded.value = true;
	}
}

onMounted(() => {
	if (!instance.approvalRequiredForSignup) return;
	fetchFormToken();
	ticker = window.setInterval(() => { now.value = Date.now(); }, 500);
});

onUnmounted(() => {
	if (ticker != null) window.clearInterval(ticker);
});
//#endregion

function maxLengthOf(field: Misskey.entities.SignupApplicationFormField): number {
	return Math.min(field.maxLength ?? DEFAULT_ANSWER_LENGTH, MAX_ANSWER_LENGTH);
}

function answerLengthCaption(field: Misskey.entities.SignupApplicationFormField, i: number): string {
	// サーバーと同じくコードポイント単位で数える
	return i18n.tsx._signupApplication.answerLength({ current: [...(answers.value[i] ?? '').trim()].length, max: maxLengthOf(field) });
}

// captcha のトークンは使い捨てなので、失敗したらウィジェットを作り直してトークンも捨てる。
// MkCaptcha.reset() は v-model を戻さないので、捨てないと送信ボタンが活性のまま残る。
function resetCaptchas() {
	hcaptcha.value?.reset();
	mcaptcha.value?.reset();
	recaptcha.value?.reset();
	turnstile.value?.reset();
	testcaptcha.value?.reset();
	hCaptchaResponse.value = null;
	mCaptchaResponse.value = null;
	reCaptchaResponse.value = null;
	turnstileResponse.value = null;
	testcaptchaResponse.value = null;
}

function errorMessageOf(err: unknown): string {
	const code = (err as { code?: string } | null)?.code;
	const t = i18n.ts._signupApplication._errors;
	switch (code) {
		case 'UNAVAILABLE': return t.unavailable;
		case 'NO_SUCH_APPLICATION': return t.noSuchApplication;
		case 'NOT_APPROVED': return t.notApproved;
		case 'ANSWER_REQUIRED': return t.answerRequired;
		case 'ANSWER_TOO_LONG': return t.answerTooLong;
		case 'INVALID_ANSWER': return t.invalidAnswer;
		case 'FORM_CHANGED': return t.formChanged;
		case 'CAPTCHA_FAILED': return t.captchaFailed;
		case 'FORM_TOKEN_INVALID': return t.formTokenInvalid;
		case 'FORM_TOKEN_TOO_SOON': return t.formTokenTooSoon;
		case 'EMAIL_REQUIRED': return t.emailRequired;
		case 'EMAIL_UNAVAILABLE': return t.emailUnavailable;
		case 'INVALID_USERNAME': return t.invalidUsername;
		case 'INVALID_PASSWORD': return t.invalidPassword;
		case 'DUPLICATED_USERNAME':
		case 'USED_USERNAME': return t.usernameUnavailable;
		default: return t.unknown;
	}
}

async function apply() {
	busy.value = true;
	errorMessage.value = null;
	try {
		const res = await misskeyApi('signup-application/apply', {
			answers: answers.value,
			formToken: formToken.value,
			'hcaptcha-response': hCaptchaResponse.value,
			'm-captcha-response': mCaptchaResponse.value,
			'g-recaptcha-response': reCaptchaResponse.value,
			'turnstile-response': turnstileResponse.value,
			'testcaptcha-response': testcaptchaResponse.value,
		});
		// コードを表示するのはここだけ。サーバーにはハッシュしか残っていない
		issuedCode.value = res.claimCode;
		claimCode.value = res.claimCode;
		application.value = res.application;
	} catch (err) {
		errorMessage.value = errorMessageOf(err);
		resetCaptchas();
		// トークンが失効・使用済みなら取り直す。そのままだと何度送っても同じエラーになる
		if ((err as { code?: string } | null)?.code === 'FORM_TOKEN_INVALID') {
			await fetchFormToken();
		}
	} finally {
		busy.value = false;
	}
}

async function refresh() {
	if (claimCode.value.trim() === '') return;
	busy.value = true;
	errorMessage.value = null;
	try {
		const res = await misskeyApi('signup-application/status', {
			claimCode: claimCode.value.trim(),
		});
		application.value = res.application;
	} catch (err) {
		application.value = null;
		errorMessage.value = errorMessageOf(err);
	} finally {
		busy.value = false;
	}
}

function restart() {
	application.value = null;
	claimCode.value = '';
	answers.value = form.value.map(() => '');
	errorMessage.value = null;
	resetCaptchas();
}

async function register() {
	busy.value = true;
	errorMessage.value = null;
	try {
		const res = await misskeyApi('signup-application/register', {
			claimCode: claimCode.value.trim(),
			username: username.value,
			password: password.value,
			...(instance.emailRequiredForSignup ? { emailAddress: emailAddress.value } : {}),
		});

		// メールの確認を挟む場合は、確認リンクを開くまでアカウントは作られない
		if (res.status === 'emailConfirmationRequired' || res.token == null) {
			confirmationSentTo.value = emailAddress.value;
			return;
		}

		await os.alert({ type: 'success', text: i18n.ts._signupApplication.accountCreated });
		await login(res.token);
	} catch (err) {
		errorMessage.value = errorMessageOf(err);
	} finally {
		busy.value = false;
	}
}

definePage(() => ({
	title: i18n.ts._signupApplication.title,
	icon: 'ti ti-user-plus',
}));
</script>

<style lang="scss" module>
.note {
	font-size: 0.9em;
	opacity: 0.8;
}

.required {
	color: var(--MI_THEME-error);
}
</style>

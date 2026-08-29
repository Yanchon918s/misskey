<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<button
	ref="buttonEl"
	v-ripple="canInteract"
	class="_button"
	:class="[$style.root, { [$style.reacted]: myReaction == reaction, [$style.canToggle]: canInteract, [$style.small]: prefer.s.reactionsDisplaySize === 'small', [$style.large]: prefer.s.reactionsDisplaySize === 'large' }]"
	@click="onClick"
	@contextmenu.prevent.stop="menu"
>
	<MkReactionIcon style="pointer-events: none;" :class="prefer.s.limitWidthOfReaction ? $style.limitWidth : ''" :reaction="reaction" :emojiUrl="reactionEmojis[reaction.substring(1, reaction.length - 1)]"/>
	<span :class="$style.count">{{ count }}</span>
</button>
</template>

<script lang="ts" setup>
import { computed, inject, onMounted, useTemplateRef, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { getUnicodeEmoji } from '@@/js/emojilist.js';
import MkCustomEmojiDetailedDialog from './MkCustomEmojiDetailedDialog.vue';
import type { MenuItem } from '@/types/menu';
import XDetails from '@/components/MkReactionsViewer.details.vue';
import MkReactionIcon from '@/components/MkReactionIcon.vue';
import * as os from '@/os.js';
import { misskeyApi, misskeyApiGet } from '@/utility/misskey-api.js';
import { useTooltip } from '@/composables/use-tooltip.js';
import { $i } from '@/i.js';
import MkReactionEffect from '@/components/MkReactionEffect.vue';
import { i18n } from '@/i18n.js';
import * as sound from '@/utility/sound.js';
import { checkReactionPermissions } from '@/utility/check-reaction-permissions.js';
import { customEmojisMap } from '@/custom-emojis.js';
import { prefer } from '@/preferences.js';
import { DI } from '@/di.js';
import { noteEvents } from '@/composables/use-note-capture.js';
import { mute as muteEmoji, unmute as unmuteEmoji, checkMuted as isEmojiMuted } from '@/utility/emoji-mute.js';
import { haptic } from '@/utility/haptic.js';
import { parseRemoteCustomEmojiReaction, toLocalCustomEmojiReaction } from '@/utility/remote-reaction.js';

const props = defineProps<{
	noteId: Misskey.entities.Note['id'];
	reaction: string;
	reactionEmojis: Misskey.entities.Note['reactionEmojis'];
	myReaction: Misskey.entities.Note['myReaction'];
	count: number;
	isInitial: boolean;
}>();

const mock = inject(DI.mock, false);

const emit = defineEmits<{
	(ev: 'reactionToggled', emoji: string, newCount: number): void;
}>();

const buttonEl = useTemplateRef('buttonEl');

const emojiName = computed(() => props.reaction.replace(/:/g, '').replace(/@\./, ''));
const remoteReaction = computed(() => parseRemoteCustomEmojiReaction(props.reaction));
const localEmojiForRemoteReaction = computed(() => {
	if (remoteReaction.value == null) return null;
	return customEmojisMap.get(remoteReaction.value.name) ?? null;
});
const targetReaction = computed(() => remoteReaction.value && localEmojiForRemoteReaction.value
	? toLocalCustomEmojiReaction(remoteReaction.value.name)
	: props.reaction);

type ReactionEmoji = { name: string; url: string };

function resolveReactionEmoji(reaction: string): ReactionEmoji | undefined {
	if (!reaction.startsWith(':') || !reaction.endsWith(':')) return undefined;

	const reactionName = reaction.slice(1, -1);
	const localName = reactionName.replace(/@\.$/, '');
	const emoji = customEmojisMap.get(localName);
	return emoji == null ? undefined : { name: reactionName, url: emoji.url };
}

const targetEmoji = computed<{ name: string; url: string } | undefined>(() => {
	return resolveReactionEmoji(targetReaction.value);
});

const canToggle = computed(() => {
	const emoji = customEmojisMap.get(emojiName.value) ?? getUnicodeEmoji(props.reaction);

	// TODO
	//return !props.reaction.match(/@\w/) && $i && emoji && checkReactionPermissions($i, props.note, emoji);
	if ($i == null) return false;
	if (remoteReaction.value != null) return localEmojiForRemoteReaction.value != null;
	return emoji != null;
});
const canImport = computed(() => !mock && remoteReaction.value != null && localEmojiForRemoteReaction.value == null && $i != null && ($i.isAdmin || $i.policies.canManageCustomEmojis));
const canInteract = computed(() => canToggle.value || canImport.value);
const canGetInfo = computed(() => !props.reaction.match(/@\w/) && props.reaction.includes(':'));
const isLocalCustomEmoji = props.reaction[0] === ':' && props.reaction.includes('@.');

function onClick(ev: MouseEvent) {
	if (canToggle.value) {
		void toggleReaction(targetReaction.value, targetEmoji.value);
	} else if (canImport.value) {
		showRemoteReactionMenu(ev);
	}
}

async function toggleReaction(reaction: string, reactionEmoji: typeof targetEmoji.value) {
	const me = $i;
	if (me == null) return;

	const oldReaction = props.myReaction;
	if (oldReaction) {
		const confirm = await os.confirm({
			type: 'warning',
			text: oldReaction !== reaction ? i18n.ts.changeReactionConfirm : i18n.ts.cancelReactionConfirm,
		});
		if (confirm.canceled) return;

		if (oldReaction !== reaction) {
			sound.playMisskeySfx('reaction');
			haptic();
		}

		if (mock) {
			emit('reactionToggled', reaction, (props.count - 1));
			return;
		}

		misskeyApi('notes/reactions/delete', {
			noteId: props.noteId,
		}).then(() => {
			noteEvents.emit(`unreacted:${props.noteId}`, {
				userId: me.id,
				reaction: oldReaction,
			});
			if (oldReaction !== reaction) {
				misskeyApi('notes/reactions/create', {
					noteId: props.noteId,
					reaction,
				}).then(() => {
					const emoji = resolveReactionEmoji(reaction) ?? reactionEmoji;
					if (emoji == null) return;
					noteEvents.emit(`reacted:${props.noteId}`, {
						userId: me.id,
						reaction,
						emoji,
					});
				});
			}
		});
	} else {
		if (prefer.s.confirmOnReact) {
			const confirm = await os.confirm({
				type: 'question',
				text: i18n.tsx.reactAreYouSure({ emoji: reaction.replace('@.', '') }),
			});

			if (confirm.canceled) return;
		}

		sound.playMisskeySfx('reaction');
		haptic();

		if (mock) {
			emit('reactionToggled', reaction, (props.count + 1));
			return;
		}

		misskeyApi('notes/reactions/create', {
			noteId: props.noteId,
			reaction,
		}).then(() => {
			const emoji = resolveReactionEmoji(reaction) ?? reactionEmoji;
			if (emoji == null) return;

			noteEvents.emit(`reacted:${props.noteId}`, {
				userId: me.id,
				reaction,
				emoji,
			});
		});
		// TODO: 上位コンポーネントでやる
		//if (props.note.text && props.note.text.length > 100 && (Date.now() - new Date(props.note.createdAt).getTime() < 1000 * 3)) {
		//	claimAchievement('reactWithoutRead');
		//}
	}
}

async function findRemoteEmoji() {
	const target = remoteReaction.value;
	if (target == null) return null;

	let untilId: string | undefined;
	while (true) {
		const emojis = await misskeyApi('admin/emoji/list-remote', {
			host: target.host,
			query: target.name,
			limit: 100,
			...(untilId ? { untilId } : {}),
		});
		const exact = emojis.find(item => item.name === target.name);
		if (exact) return exact;
		if (emojis.length < 100) return null;
		untilId = emojis[emojis.length - 1].id;
	}
}

async function importRemoteEmoji(reactAfterImport: boolean) {
	if (!canImport.value || remoteReaction.value == null) return;

	const remoteEmoji = await os.promiseDialog(findRemoteEmoji());
	if (remoteEmoji == null) {
		await os.alert({
			type: 'error',
			title: i18n.ts.error,
			text: i18n.ts.notFound,
		});
		return;
	}

	await os.apiWithDialog('admin/emoji/copy', {
		emojiId: remoteEmoji.id,
	});
	if (!reactAfterImport) return;

	const importedEmoji = await misskeyApi('emoji', {
		name: remoteEmoji.name,
	});
	await toggleReaction(toLocalCustomEmojiReaction(importedEmoji.name), {
		name: `${importedEmoji.name}@.`,
		url: importedEmoji.url,
	});
}

function showRemoteReactionMenu(ev: MouseEvent) {
	if (!canImport.value || remoteReaction.value == null) return;

	os.popupMenu([{
		type: 'label',
		text: `:${remoteReaction.value.name}@${remoteReaction.value.host}:`,
	}, {
		text: i18n.ts.import,
		icon: 'ti ti-plus',
		action: () => importRemoteEmoji(false),
	}, {
		text: `${i18n.ts.doReaction} (${i18n.ts.import})`,
		icon: 'ti ti-mood-plus',
		action: () => importRemoteEmoji(true),
	}], ev.currentTarget ?? ev.target);
}

async function menu(ev) {
	let menuItems: MenuItem[] = [];

	if (canGetInfo.value) {
		menuItems.push({
			text: i18n.ts.info,
			icon: 'ti ti-info-circle',
			action: async () => {
				const { dispose } = os.popup(MkCustomEmojiDetailedDialog, {
					emoji: await misskeyApiGet('emoji', {
						name: props.reaction.replace(/:/g, '').replace(/@\./, ''),
					}),
				}, {
					closed: () => dispose(),
				});
			},
		});
	}

	if (isEmojiMuted(props.reaction).value) {
		menuItems.push({
			text: i18n.ts.emojiUnmute,
			icon: 'ti ti-mood-smile',
			action: () => {
				os.confirm({
					type: 'question',
					title: i18n.tsx.unmuteX({ x: isLocalCustomEmoji ? `:${emojiName.value}:` : props.reaction }),
				}).then(({ canceled }) => {
					if (canceled) return;
					unmuteEmoji(props.reaction);
				});
			},
		});
	} else {
		menuItems.push({
			text: i18n.ts.emojiMute,
			icon: 'ti ti-mood-off',
			action: () => {
				os.confirm({
					type: 'question',
					title: i18n.tsx.muteX({ x: isLocalCustomEmoji ? `:${emojiName.value}:` : props.reaction }),
				}).then(({ canceled }) => {
					if (canceled) return;
					muteEmoji(props.reaction);
				});
			},
		});
	}

	os.popupMenu(menuItems, ev.currentTarget ?? ev.target);
}

function anime() {
	if (window.document.hidden || !prefer.s.animation || buttonEl.value == null) return;

	const rect = buttonEl.value.getBoundingClientRect();
	const x = rect.left + 16;
	const y = rect.top + (buttonEl.value.offsetHeight / 2);
	const { dispose } = os.popup(MkReactionEffect, { reaction: props.reaction, x, y }, {
		end: () => dispose(),
	});
}

watch(() => props.count, (newCount, oldCount) => {
	if (oldCount < newCount) anime();
});

onMounted(() => {
	if (!props.isInitial) anime();
});

if (!mock) {
	useTooltip(buttonEl, async (showing) => {
		if (buttonEl.value == null) return;

		const reactions = await misskeyApiGet('notes/reactions', {
			noteId: props.noteId,
			type: props.reaction,
			limit: 10,
			_cacheKey_: props.count,
		});

		const users = reactions.map(x => x.user);
		if (buttonEl.value == null) return;

		const { dispose } = os.popup(XDetails, {
			showing,
			reaction: props.reaction,
			users,
			count: props.count,
			anchorElement: buttonEl.value,
		}, {
			closed: () => dispose(),
		});
	}, 100);
}
</script>

<style lang="scss" module>
.root {
	display: inline-flex;
	height: 42px;
	padding: 0 6px;
	font-size: 1.5em;
	border-radius: 6px;
	align-items: center;
	justify-content: center;

	&.canToggle {
		background: var(--MI_THEME-buttonBg);

		&:hover {
			background: rgba(0, 0, 0, 0.1);
		}
	}

	&:not(.canToggle) {
		cursor: default;
	}

	&.small {
		height: 32px;
		font-size: 1em;
		border-radius: 4px;

		> .count {
			font-size: 0.9em;
			line-height: 32px;
		}
	}

	&.large {
		height: 52px;
		font-size: 2em;
		border-radius: 8px;

		> .count {
			font-size: 0.6em;
			line-height: 52px;
		}
	}

	&.reacted, &.reacted:hover {
		background: var(--MI_THEME-accentedBg);
		color: var(--MI_THEME-accent);
		box-shadow: 0 0 0 1px var(--MI_THEME-accent) inset;

		> .count {
			color: var(--MI_THEME-accent);
		}

		> .icon {
			filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.5));
		}
	}
}

.limitWidth {
	max-width: 70px;
	object-fit: contain;
}

.count {
	font-size: 0.7em;
	line-height: 42px;
	margin: 0 0 0 4px;
}
</style>

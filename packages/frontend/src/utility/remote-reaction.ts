/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type RemoteCustomEmojiReaction = {
	name: string;
	host: string;
};

const remoteCustomEmojiReactionRegexp = /^:([\w+-]+)@([^:]+):$/;

export function parseRemoteCustomEmojiReaction(reaction: string): RemoteCustomEmojiReaction | null {
	const match = reaction.match(remoteCustomEmojiReactionRegexp);
	if (match == null || match[2] === '.') return null;

	return {
		name: match[1],
		host: match[2],
	};
}

export function toLocalCustomEmojiReaction(name: string): string {
	return `:${name}@.:`;
}

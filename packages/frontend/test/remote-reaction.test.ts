/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { parseRemoteCustomEmojiReaction, toLocalCustomEmojiReaction } from '@/utility/remote-reaction.js';

describe('remote reaction utility', () => {
	test('リモートカスタム絵文字リアクションを名前とホストに分解する', () => {
		expect(parseRemoteCustomEmojiReaction(':mk_wai@remote.example:')).toEqual({
			name: 'mk_wai',
			host: 'remote.example',
		});
	});

	test.each([
		':mk_wai:',
		':mk_wai@.:',
		'❤',
		':invalid@remote.example:extra',
	])('リモートカスタム絵文字リアクション以外は無視する: %s', (reaction) => {
		expect(parseRemoteCustomEmojiReaction(reaction)).toBeNull();
	});

	test('ローカルリアクションの正規形を生成する', () => {
		expect(toLocalCustomEmojiReaction('mk_wai')).toBe(':mk_wai@.:');
	});
});

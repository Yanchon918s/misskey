/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { Packed } from '@/misc/json-schema.js';
import type { MiLocalUser } from '@/models/User.js';
import { MetaService } from '@/core/MetaService.js';
import { RoleService } from '@/core/RoleService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import type Connection from '@/server/api/stream/Connection.js';
import { NoteStreamingHidingService } from '@/server/api/stream/NoteStreamingHidingService.js';
import { BubbleTimelineChannel } from '@/server/api/stream/channels/bubble-timeline.js';

describe('バブルタイムライン', () => {
	test('利用者のリアクションを共有ノートや未ログイン接続へ混入させない', async () => {
		const metaService = mock<MetaService>();
		metaService.fetch.mockResolvedValue({ bubbleInstances: ['example.com'] } as Awaited<ReturnType<MetaService['fetch']>>);
		const roleService = mock<RoleService>();
		roleService.getUserPolicies.mockResolvedValue({ btlAvailable: true } as Awaited<ReturnType<RoleService['getUserPolicies']>>);
		const hidingService = mock<NoteStreamingHidingService>();
		hidingService.filter.mockImplementation(async note => note);
		// 個人のリアクション取得だけを差し替え、上流のコピー処理は実際に実行する。
		const noteEntityService = Object.create(NoteEntityService.prototype) as NoteEntityService;
		vi.spyOn(noteEntityService, 'populateMyReaction').mockResolvedValue('👍');

		async function connect(userId: string | null) {
			const subscriber = mock<Connection['subscriber']>();
			const connection = Object.assign(mock<Connection>(), {
				user: userId == null ? undefined : mock<MiLocalUser>({ id: userId }),
				subscriber,
				userMutedInstances: new Set(),
				userIdsWhoMeMuting: new Set(),
				userIdsWhoBlockingMe: new Set(),
				userIdsWhoMeMutingRenotes: new Set(),
				mutingChannels: new Set(),
			});
			const channel = new BubbleTimelineChannel({ id: 'bubble', connection }, metaService, roleService, noteEntityService, hidingService);
			await channel.init({});
			const onNote = subscriber.on.mock.calls[0][1] as unknown as (note: Packed<'Note'>) => Promise<void>;
			return { channel, connection, onNote };
		}

		const user = { id: 'remote-user', host: 'example.com', requireSigninToViewContents: false };
		const note = {
			id: 'renote', userId: user.id, user, visibility: 'public', fileIds: [],
			renoteId: 'original',
			renote: { id: 'original', userId: user.id, user, reactions: { '👍': 1 } },
		} as unknown as Packed<'Note'>;
		const original = structuredClone(note);
		const alice = await connect('alice');
		const visitor = await connect(null);

		try {
			await alice.onNote(note);
			await visitor.onNote(note);
			expect(alice.connection.sendMessageToWs).toHaveBeenCalledWith('channel', {
				id: 'bubble', type: 'note', body: { ...note, renote: { ...note.renote, myReaction: '👍' } },
			});
			expect(note).toEqual(original);
			expect(visitor.connection.sendMessageToWs).toHaveBeenCalledWith('channel', {
				id: 'bubble', type: 'note', body: original,
			});
		} finally {
			alice.channel.dispose();
			visitor.channel.dispose();
		}
	});
});

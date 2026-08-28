/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Packed } from '@/misc/json-schema.js';
import { MetaService } from '@/core/MetaService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { bindThis } from '@/decorators.js';
import { RoleService } from '@/core/RoleService.js';
import { isRenotePacked, isQuotePacked } from '@/misc/is-renote.js';
import type { JsonObject } from '@/misc/json-value.js';
import Channel, { type ChannelRequest } from '../channel.js';
import { NoteStreamingHidingService } from '../NoteStreamingHidingService.js';

@Injectable({ scope: Scope.TRANSIENT })
export class BubbleTimelineChannel extends Channel {
	public readonly chName = 'bubbleTimeline';
	public static shouldShare = false;
	public static requireCredential = false as const;
	private withRenotes: boolean;
	private withFiles: boolean;
	private hosts: Set<string>;

	constructor(
		@Inject(REQUEST)
		request: ChannelRequest,

		private metaService: MetaService,
		private roleService: RoleService,
		private noteEntityService: NoteEntityService,
		private noteStreamingHidingService: NoteStreamingHidingService,
	) {
		super(request);
	}

	@bindThis
	public async init(params: JsonObject) {
		const policies = await this.roleService.getUserPolicies(this.user ? this.user.id : null);
		if (!policies.btlAvailable) return;

		const instance = await this.metaService.fetch();
		this.hosts = new Set(instance.bubbleInstances.map(host => host.trim().toLowerCase()).filter(Boolean));
		if (this.hosts.size === 0) return;

		this.withRenotes = !!(params.withRenotes ?? true);
		this.withFiles = !!(params.withFiles ?? false);
		this.subscriber.on('notesStream', this.onNote);
	}

	@bindThis
	private async onNote(note: Packed<'Note'>) {
		if (note.user.host == null || !this.hosts.has(note.user.host.toLowerCase())) return;
		if (this.withFiles && (note.fileIds == null || note.fileIds.length === 0)) return;
		if (note.visibility !== 'public') return;
		if (note.channelId != null) return;
		if (note.user.requireSigninToViewContents && this.user == null) return;
		if (note.renote && note.renote.user.requireSigninToViewContents && this.user == null) return;
		if (note.reply && note.reply.user.requireSigninToViewContents && this.user == null) return;
		if (isRenotePacked(note) && !isQuotePacked(note) && !this.withRenotes) return;
		if (this.isNoteMutedOrBlocked(note)) return;

		const filtered = await this.noteStreamingHidingService.filter(note, this.user?.id ?? null);
		if (!filtered) return;
		note = filtered; // eslint-disable-line no-param-reassign

		if (this.user && isRenotePacked(note) && !isQuotePacked(note) && note.renote && Object.keys(note.renote.reactions).length > 0) {
			note.renote.myReaction = await this.noteEntityService.populateMyReaction(note.renote, this.user.id);
		}

		this.send('note', note);
	}

	@bindThis
	public dispose() {
		this.subscriber.off('notesStream', this.onNote);
	}
}

/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export function packUserStatus(profile: { statusMessage?: string | null; statusExpiresAt?: Date | null }, now = Date.now()) {
	if (!profile.statusMessage || (profile.statusExpiresAt != null && profile.statusExpiresAt.getTime() <= now)) {
		return { statusMessage: null, statusExpiresAt: null };
	}
	return {
		statusMessage: profile.statusMessage,
		statusExpiresAt: profile.statusExpiresAt?.toISOString() ?? null,
	};
}

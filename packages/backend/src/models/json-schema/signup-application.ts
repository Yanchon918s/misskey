/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { signupApplicationFormFieldTypes, signupApplicationStatuses } from '@/models/SignupApplication.js';

export const packedSignupApplicationFormFieldSchema = {
	type: 'object',
	properties: {
		label: {
			type: 'string',
			optional: false, nullable: false,
		},
		type: {
			type: 'string',
			optional: false, nullable: false,
			enum: signupApplicationFormFieldTypes,
		},
		required: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		maxLength: {
			type: 'integer',
			optional: true, nullable: false,
		},
	},
} as const;

export const packedSignupApplicationAnswerSchema = {
	type: 'object',
	properties: {
		label: {
			type: 'string',
			optional: false, nullable: false,
		},
		value: {
			type: 'string',
			optional: false, nullable: false,
		},
	},
} as const;

/**
 * 申請者本人に見せる申請の状態。審査した人などの管理者向けの情報は含めない。
 */
export const packedSignupApplicationStatusSchema = {
	type: 'object',
	properties: {
		status: {
			type: 'string',
			optional: false, nullable: false,
			enum: signupApplicationStatuses,
		},
		createdAt: {
			type: 'string',
			optional: false, nullable: false,
			format: 'date-time',
		},
		expiresAt: {
			type: 'string',
			optional: false, nullable: false,
			format: 'date-time',
		},
	},
} as const;

/**
 * 審査画面向けの申請。クレームコードはハッシュしか持っていないので含めようがない。
 */
export const packedSignupApplicationSchema = {
	type: 'object',
	properties: {
		id: {
			type: 'string',
			optional: false, nullable: false,
			format: 'id',
			example: 'xxxxxxxxxx',
		},
		createdAt: {
			type: 'string',
			optional: false, nullable: false,
			format: 'date-time',
		},
		expiresAt: {
			type: 'string',
			optional: false, nullable: false,
			format: 'date-time',
		},
		status: {
			type: 'string',
			optional: false, nullable: false,
			enum: signupApplicationStatuses,
		},
		answers: {
			type: 'array',
			optional: false, nullable: false,
			items: {
				type: 'object',
				optional: false, nullable: false,
				ref: 'SignupApplicationAnswer',
			},
		},
		processedAt: {
			type: 'string',
			optional: false, nullable: true,
			format: 'date-time',
		},
		processedBy: {
			type: 'object',
			optional: false, nullable: true,
			ref: 'UserLite',
		},
		usedBy: {
			type: 'object',
			optional: false, nullable: true,
			ref: 'UserLite',
		},
	},
} as const;

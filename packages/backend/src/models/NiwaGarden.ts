/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('niwa_garden')
export class MiNiwaGarden {
	@PrimaryColumn('varchar', { length: 32, primaryKeyConstraintName: 'PK_niwa_garden' })
	public id: string;

	@Column('integer', { default: 0 })
	public waterCount: number;
}

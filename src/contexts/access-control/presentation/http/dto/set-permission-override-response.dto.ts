import { ApiProperty } from '@nestjs/swagger';

import type { SetPermissionOverrideResult } from '../../../application/commands/set-permission-override/set-permission-override.command.js';

export class SetPermissionOverrideResponseDto {
  @ApiProperty({
    description: 'Identifier of the permission override.',
    example: 'override-id',
  })
  overrideId!: string;

  @ApiProperty({
    description: 'Whether the override was created or changed.',
    example: true,
  })
  changed!: boolean;

  static from(
    result: SetPermissionOverrideResult,
  ): SetPermissionOverrideResponseDto {
    return {
      overrideId: result.overrideId,
      changed: result.changed,
    };
  }
}

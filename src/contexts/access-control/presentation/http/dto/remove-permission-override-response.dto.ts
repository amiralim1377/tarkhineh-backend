import { ApiProperty } from '@nestjs/swagger';

import type { RemovePermissionOverrideResult } from '../../../application/commands/remove-permission-override/remove-permission-override.command.js';

export class RemovePermissionOverrideResponseDto {
  @ApiProperty({
    description: 'Identifier of the removed override.',
    example: 'override-id',
    nullable: true,
  })
  overrideId!: string | null;

  @ApiProperty({
    description: 'Whether an existing override was removed.',
    example: true,
  })
  removed!: boolean;

  static from(
    result: RemovePermissionOverrideResult,
  ): RemovePermissionOverrideResponseDto {
    return {
      overrideId: result.overrideId,
      removed: result.removed,
    };
  }
}

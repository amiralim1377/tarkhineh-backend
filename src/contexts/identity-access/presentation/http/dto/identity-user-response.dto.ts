import type { IdentityUser } from '../../../../domain/entities/identity-user.js';

export class IdentityUserResponseDto {
  readonly id: string;
  readonly email: string | null;
  readonly displayName: string | null;
  readonly emailVerifiedAt: string | null;

  private constructor(props: {
    id: string;
    email: string | null;
    displayName: string | null;
    emailVerifiedAt: string | null;
  }) {
    this.id = props.id;
    this.email = props.email;
    this.displayName = props.displayName;
    this.emailVerifiedAt = props.emailVerifiedAt;
  }

  static fromDomain(user: IdentityUser): IdentityUserResponseDto {
    return new IdentityUserResponseDto({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    });
  }
}

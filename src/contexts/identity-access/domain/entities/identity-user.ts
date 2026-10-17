export type IdentityUserStatus =
  | 'ACTIVE'
  | 'PENDING'
  | 'SUSPENDED';

export interface IdentityUserProps {
  id: string;
  email: string | null;
  emailVerifiedAt: Date | null;
  passwordHash: string | null;
  displayName: string | null;
  status: IdentityUserStatus;
}

export class IdentityUser {
  constructor(private readonly props: IdentityUserProps) {}

  get id(): string {
    return this.props.id;
  }

  get email(): string | null {
    return this.props.email;
  }

  get emailVerifiedAt(): Date | null {
    return this.props.emailVerifiedAt;
  }

  get passwordHash(): string | null {
    return this.props.passwordHash;
  }

  get displayName(): string | null {
    return this.props.displayName;
  }

  get status(): IdentityUserStatus {
    return this.props.status;
  }

  canLoginWithPassword(): boolean {
    return (
      this.props.status === 'ACTIVE' &&
      this.props.emailVerifiedAt !== null &&
      this.props.passwordHash !== null
    );
  }
}

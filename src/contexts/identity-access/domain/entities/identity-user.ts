import { Entity } from '../../../../shared/domain/entities/entity.js';
import { UniqueId } from '../../../../shared/domain/value-objects/unique-id.vo.js';

export type IdentityUserStatus = 'ACTIVE' | 'PENDING' | 'SUSPENDED';

export interface IdentityUserProps {
  id: string;
  email: string | null;
  emailVerifiedAt: Date | null;
  passwordHash: string | null;
  displayName: string | null;
  status: IdentityUserStatus;
}

export interface RegisterPendingIdentityUser {
  id?: string;
  email: string;
  passwordHash: string;
  displayName: string | null;
}

export interface ProvisionVerifiedIdentityUser {
  id?: string;
  email: string;
  emailVerifiedAt: Date;
  passwordHash: string;
  displayName: string | null;
}

export class IdentityUser extends Entity<UniqueId> {
  constructor(private readonly props: IdentityUserProps) {
    super(new UniqueId(props.id));
  }

  static registerPending(input: RegisterPendingIdentityUser): IdentityUser {
    const id = new UniqueId(input.id);

    return new IdentityUser({
      id: id.getValue(),
      email: input.email,
      emailVerifiedAt: null,
      passwordHash: input.passwordHash,
      displayName: input.displayName,
      status: 'PENDING',
    });
  }

  static provisionVerified(input: ProvisionVerifiedIdentityUser): IdentityUser {
    if (input.email.trim().length === 0) {
      throw new Error('A verified identity must have an email.');
    }

    if (!Number.isFinite(input.emailVerifiedAt.getTime())) {
      throw new Error('Email verification date must be valid.');
    }

    if (input.passwordHash.length === 0) {
      throw new Error('Password hash cannot be empty.');
    }

    const id = new UniqueId(input.id);

    return new IdentityUser({
      id: id.getValue(),
      email: input.email,
      emailVerifiedAt: input.emailVerifiedAt,
      passwordHash: input.passwordHash,
      displayName: input.displayName,
      status: 'ACTIVE',
    });
  }

  get id(): string {
    return this.getId().getValue();
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

  verifyEmail(verifiedAt: Date): boolean {
    if (
      !Number.isFinite(verifiedAt.getTime()) ||
      this.props.status !== 'PENDING' ||
      this.props.email === null ||
      this.props.emailVerifiedAt !== null
    ) {
      return false;
    }

    this.props.status = 'ACTIVE';
    this.props.emailVerifiedAt = verifiedAt;

    return true;
  }

  canLoginWithPassword(): boolean {
    return (
      this.props.status === 'ACTIVE' &&
      this.props.emailVerifiedAt !== null &&
      this.props.passwordHash !== null
    );
  }
}

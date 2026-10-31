import { Entity } from '../../../../shared/domain/entities/entity.js';
import { UniqueId } from '../../../../shared/domain/value-objects/unique-id.vo.js';
import {
  BRANCH_ERROR_CODE,
  InvalidBranchDataError,
} from '../errors/invalid-branch-data.error.js';
import { BranchSlug } from '../value-objects/branch-slug.vo.js';
import { BranchName } from '../value-objects/branch-name.vo.js';
import {
  BranchAddress,
  type BranchAddressInput,
} from '../value-objects/branch-address.vo.js';
import { BranchLocation } from '../value-objects/branch-location.vo.js';
import { BranchPhoneNumber } from '../value-objects/branch-phone-number.vo.js';
import { BranchTimeZone } from '../value-objects/branch-time-zone.vo.js';

// BRANCH TYPES

export type BranchStatus = 'ACTIVE' | 'INACTIVE';

export interface CreateBranchInput extends BranchAddressInput {
  readonly id?: string;
  readonly organizationId: string;
  readonly nameFa: string;
  readonly nameEn?: string | null;
  readonly slug: string;
  readonly status?: BranchStatus;
  readonly phoneNumber?: string | null;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
  readonly timeZoneId: string;
}

// Data used to reconstruct an existing branch.
export interface BranchProps {
  readonly id: string;
  readonly organizationId: string;
  readonly nameFa: string;
  readonly nameEn: string | null;
  readonly slug: string;
  readonly status: BranchStatus;
  readonly phoneNumber: string | null;
  readonly addressFa: string;
  readonly addressEn: string | null;
  readonly cityFa: string;
  readonly cityEn: string | null;
  readonly postalCode: string | null;
  readonly countryCode: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly timeZoneId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// Validated state used internally by the entity.
interface BranchState {
  readonly id: UniqueId;
  readonly organizationId: string;
  readonly name: BranchName;
  readonly slug: BranchSlug;
  readonly address: BranchAddress;
  readonly location: BranchLocation | null;
  readonly phoneNumber: BranchPhoneNumber | null;
  readonly timeZone: BranchTimeZone;
  readonly status: BranchStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// BRANCH ENTITY
export class Branch extends Entity<UniqueId> {
  private readonly _id: UniqueId;
  private readonly _organizationId: string;
  private _name: BranchName;
  private readonly _slug: BranchSlug;
  private _address: BranchAddress;
  private _location: BranchLocation | null;
  private _phoneNumber: BranchPhoneNumber | null;
  private _timeZone: BranchTimeZone;
  private _status: BranchStatus;
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  private constructor(props: BranchState) {
    super(props.id);
    this._id = props.id;
    this._organizationId = props.organizationId;
    this._name = props.name;
    this._slug = props.slug;
    this._address = props.address;
    this._location = props.location;
    this._phoneNumber = props.phoneNumber;
    this._timeZone = props.timeZone;
    this._status = props.status;
    this._createdAt = new Date(props.createdAt);
    this._updatedAt = new Date(props.updatedAt);
  }

  // CREATE
  static create(input: CreateBranchInput): Branch {
    const organizationId = input.organizationId.trim();

    if (organizationId.length === 0) {
      throw new InvalidBranchDataError(
        BRANCH_ERROR_CODE.ORGANIZATION_ID_REQUIRED,
        'Branch organization ID is required.',
      );
    }

    const id = input.id?.trim();

    if (input.id !== undefined && !id) {
      throw new InvalidBranchDataError(
        BRANCH_ERROR_CODE.ID_REQUIRED,
        'Branch ID is required.',
      );
    }

    const status = input.status ?? 'ACTIVE';

    if (status !== 'ACTIVE' && status !== 'INACTIVE') {
      throw new InvalidBranchDataError(
        BRANCH_ERROR_CODE.STATUS_INVALID,
        'Branch status is invalid.',
      );
    }

    const now = new Date();
    const branchId = new UniqueId(id);

    return new Branch({
      id: branchId,
      organizationId,
      name: BranchName.create(input.nameFa, input.nameEn),
      slug: BranchSlug.create(input.slug),
      address: BranchAddress.create({
        addressFa: input.addressFa,
        addressEn: input.addressEn,
        cityFa: input.cityFa,
        cityEn: input.cityEn,
        postalCode: input.postalCode,
        countryCode: input.countryCode,
      }),
      location: BranchLocation.create(input.latitude, input.longitude),
      phoneNumber: BranchPhoneNumber.create(input.phoneNumber),
      timeZone: BranchTimeZone.create(input.timeZoneId),
      status,
      createdAt: now,
      updatedAt: now,
    });
  }

  // RECONSTITUTE
  static reconstitute(props: BranchProps): Branch {
    const id = props.id.trim();

    if (id.length === 0) {
      throw new InvalidBranchDataError(
        BRANCH_ERROR_CODE.ID_REQUIRED,
        'Branch ID is required.',
      );
    }

    const organizationId = props.organizationId.trim();

    if (organizationId.length === 0) {
      throw new InvalidBranchDataError(
        BRANCH_ERROR_CODE.ORGANIZATION_ID_REQUIRED,
        'Branch organization ID is required.',
      );
    }

    if (props.status !== 'ACTIVE' && props.status !== 'INACTIVE') {
      throw new InvalidBranchDataError(
        BRANCH_ERROR_CODE.STATUS_INVALID,
        'Branch status is invalid.',
      );
    }

    const slug = BranchSlug.create(props.slug);

    if (slug.getValue() !== props.slug) {
      throw new InvalidBranchDataError(
        BRANCH_ERROR_CODE.SLUG_INVALID,
        'Persisted branch slug is not in canonical format.',
      );
    }

    if (
      !(props.createdAt instanceof Date) ||
      Number.isNaN(props.createdAt.getTime()) ||
      !(props.updatedAt instanceof Date) ||
      Number.isNaN(props.updatedAt.getTime())
    ) {
      throw new InvalidBranchDataError(
        BRANCH_ERROR_CODE.STATUS_INVALID,
        'Branch timestamps are invalid.',
      );
    }

    return new Branch({
      id: new UniqueId(id),
      organizationId,
      name: BranchName.create(props.nameFa, props.nameEn),
      slug,
      address: BranchAddress.create({
        addressFa: props.addressFa,
        addressEn: props.addressEn,
        cityFa: props.cityFa,
        cityEn: props.cityEn,
        postalCode: props.postalCode,
        countryCode: props.countryCode,
      }),
      location: BranchLocation.create(props.latitude, props.longitude),
      phoneNumber: BranchPhoneNumber.create(props.phoneNumber),
      timeZone: BranchTimeZone.create(props.timeZoneId),
      status: props.status,

      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    });
  }

  // GETTERS
  get id(): string {
    return this._id.getValue();
  }

  get organizationId(): string {
    return this._organizationId;
  }

  get nameFa(): string {
    return this._name.nameFa;
  }

  get nameEn(): string | null {
    return this._name.nameEn;
  }

  get slug(): string {
    return this._slug.getValue();
  }

  get status(): BranchStatus {
    return this._status;
  }

  get phoneNumber(): string | null {
    return this._phoneNumber?.value ?? null;
  }

  get addressFa(): string {
    return this._address.addressFa;
  }

  get addressEn(): string | null {
    return this._address.addressEn;
  }

  get cityFa(): string {
    return this._address.cityFa;
  }

  get cityEn(): string | null {
    return this._address.cityEn;
  }

  get postalCode(): string | null {
    return this._address.postalCode;
  }

  get countryCode(): string {
    return this._address.countryCode;
  }

  get latitude(): number | null {
    return this._location?.latitude ?? null;
  }

  get longitude(): number | null {
    return this._location?.longitude ?? null;
  }

  get timeZoneId(): string {
    return this._timeZone.value;
  }

  get createdAt(): Date {
    return new Date(this._createdAt);
  }

  get updatedAt(): Date {
    return new Date(this._updatedAt);
  }

  // DOMAIN BEHAVIORS

  rename(nameFa: string, nameEn?: string | null): void {
    const nextName = BranchName.create(
      nameFa,
      nameEn === undefined ? this._name.nameEn : nameEn,
    );

    if (this._name.equals(nextName)) {
      return;
    }

    this._name = nextName;
    this.touch();
  }

  updateAddress(input: BranchAddressInput): void {
    const nextAddress = BranchAddress.create(input);

    if (this._address.equals(nextAddress)) {
      return;
    }

    this._address = nextAddress;
    this.touch();
  }

  updateLocation(latitude: number | null, longitude: number | null): void {
    const nextLocation = BranchLocation.create(latitude, longitude);

    if (this._areLocationsEqual(this._location, nextLocation)) {
      return;
    }

    this._location = nextLocation;
    this.touch();
  }

  updatePhoneNumber(phoneNumber: string | null): void {
    const nextPhoneNumber = BranchPhoneNumber.create(phoneNumber);

    if (this._arePhoneNumbersEqual(this._phoneNumber, nextPhoneNumber)) {
      return;
    }

    this._phoneNumber = nextPhoneNumber;
    this.touch();
  }

  updateTimeZone(timeZoneId: string): void {
    const nextTimeZone = BranchTimeZone.create(timeZoneId);

    if (this._timeZone.equals(nextTimeZone)) {
      return;
    }

    this._timeZone = nextTimeZone;
    this.touch();
  }

  activate(): boolean {
    if (this._status === 'ACTIVE') {
      return false;
    }

    this._status = 'ACTIVE';
    this.touch();

    return true;
  }

  deactivate(): boolean {
    if (this._status === 'INACTIVE') {
      return false;
    }

    this._status = 'INACTIVE';
    this.touch();

    return true;
  }

  isActive(): boolean {
    return this._status === 'ACTIVE';
  }

  // PRIVATE METHODS

  private touch(): void {
    this._updatedAt = new Date();
  }

  private _areLocationsEqual(
    first: BranchLocation | null,
    second: BranchLocation | null,
  ): boolean {
    if (first === null || second === null) {
      return first === second;
    }

    return first.equals(second);
  }

  private _arePhoneNumbersEqual(
    first: BranchPhoneNumber | null,
    second: BranchPhoneNumber | null,
  ): boolean {
    if (first === null || second === null) {
      return first === second;
    }

    return first.equals(second);
  }
}

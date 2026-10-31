import {
  BRANCH_ERROR_CODE,
  InvalidBranchDataError,
} from '../errors/invalid-branch-data.error.js';

export class BranchLocation {
  private constructor(
    public readonly latitude: number,
    public readonly longitude: number,
  ) {}

  static create(
    latitude: number | null | undefined,
    longitude: number | null | undefined,
  ): BranchLocation | null {
    const hasLatitude = latitude !== null && latitude !== undefined;
    const hasLongitude = longitude !== null && longitude !== undefined;

    if (!hasLatitude && !hasLongitude) {
      return null;
    }

    if (
      !hasLatitude ||
      !hasLongitude ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new InvalidBranchDataError(
        BRANCH_ERROR_CODE.LOCATION_INVALID,
        'Branch coordinates are invalid.',
      );
    }

    return new BranchLocation(latitude, longitude);
  }

  equals(other: BranchLocation): boolean {
    return (
      this.latitude === other.latitude && this.longitude === other.longitude
    );
  }
}

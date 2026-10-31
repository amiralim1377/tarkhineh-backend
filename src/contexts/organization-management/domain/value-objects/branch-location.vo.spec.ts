import { describe, expect, it } from 'vitest';

import { BranchLocation } from './branch-location.vo.js';

import { BRANCH_ERROR_CODE } from '../errors/invalid-branch-data.error.js';

import { expectBranchDataError } from './branch-value-object.spec-helper.js';

describe('BranchLocation', () => {
  describe('create', () => {
    it('should create a valid location', () => {
      const result = BranchLocation.create(35.6892, 51.389);

      expect(result).not.toBeNull();
      expect(result?.latitude).toBe(35.6892);
      expect(result?.longitude).toBe(51.389);
    });

    it('should return null when both coordinates are null', () => {
      const result = BranchLocation.create(null, null);

      expect(result).toBeNull();
    });

    it('should return null when both coordinates are undefined', () => {
      const result = BranchLocation.create(undefined, undefined);

      expect(result).toBeNull();
    });

    it('should return null when both coordinates are absent', () => {
      const result = BranchLocation.create(null, undefined);

      expect(result).toBeNull();
    });

    it('should reject when latitude exists but longitude is missing', () => {
      expectBranchDataError(
        () => BranchLocation.create(35.6892, null),
        BRANCH_ERROR_CODE.LOCATION_INVALID,
      );
    });

    it('should reject when longitude exists but latitude is missing', () => {
      expectBranchDataError(
        () => BranchLocation.create(null, 51.389),
        BRANCH_ERROR_CODE.LOCATION_INVALID,
      );
    });

    it.each([
      {
        description: 'latitude below -90',
        latitude: -90.001,
        longitude: 0,
      },
      {
        description: 'latitude above 90',
        latitude: 90.001,
        longitude: 0,
      },
      {
        description: 'longitude below -180',
        latitude: 0,
        longitude: -180.001,
      },
      {
        description: 'longitude above 180',
        latitude: 0,
        longitude: 180.001,
      },
      {
        description: 'NaN latitude',
        latitude: Number.NaN,
        longitude: 0,
      },
      {
        description: 'NaN longitude',
        latitude: 0,
        longitude: Number.NaN,
      },
      {
        description: 'positive infinite latitude',
        latitude: Number.POSITIVE_INFINITY,
        longitude: 0,
      },
      {
        description: 'negative infinite latitude',
        latitude: Number.NEGATIVE_INFINITY,
        longitude: 0,
      },
      {
        description: 'positive infinite longitude',
        latitude: 0,
        longitude: Number.POSITIVE_INFINITY,
      },
      {
        description: 'negative infinite longitude',
        latitude: 0,
        longitude: Number.NEGATIVE_INFINITY,
      },
    ])('should reject $description', ({ latitude, longitude }) => {
      expectBranchDataError(
        () => BranchLocation.create(latitude, longitude),
        BRANCH_ERROR_CODE.LOCATION_INVALID,
      );
    });

    it('should accept minimum latitude and longitude boundaries', () => {
      const result = BranchLocation.create(-90, -180);

      expect(result?.latitude).toBe(-90);
      expect(result?.longitude).toBe(-180);
    });

    it('should accept maximum latitude and longitude boundaries', () => {
      const result = BranchLocation.create(90, 180);

      expect(result?.latitude).toBe(90);
      expect(result?.longitude).toBe(180);
    });

    it('should accept zero coordinates', () => {
      const result = BranchLocation.create(0, 0);

      expect(result?.latitude).toBe(0);
      expect(result?.longitude).toBe(0);
    });

    it('should accept negative decimal coordinates', () => {
      const result = BranchLocation.create(-35.6892, -51.389);

      expect(result?.latitude).toBe(-35.6892);
      expect(result?.longitude).toBe(-51.389);
    });
  });

  describe('equals', () => {
    it('should return true for equal locations', () => {
      const first = BranchLocation.create(35.6892, 51.389);
      const second = BranchLocation.create(35.6892, 51.389);

      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      expect(first!.equals(second!)).toBe(true);
    });

    it('should return false when latitude is different', () => {
      const first = BranchLocation.create(35.6892, 51.389);
      const second = BranchLocation.create(36.0, 51.389);

      expect(first!.equals(second!)).toBe(false);
    });

    it('should return false when longitude is different', () => {
      const first = BranchLocation.create(35.6892, 51.389);
      const second = BranchLocation.create(35.6892, 52.0);

      expect(first!.equals(second!)).toBe(false);
    });
  });
});

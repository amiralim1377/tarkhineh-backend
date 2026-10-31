import { describe, expect, it } from 'vitest';

import { BranchName } from './branch-name.vo.js';

import { BRANCH_ERROR_CODE } from '../errors/invalid-branch-data.error.js';

import { expectBranchDataError } from './branch-value-object.spec-helper.js';

describe('BranchName', () => {
  describe('create', () => {
    it('should create a branch name with Persian and English names', () => {
      const result = BranchName.create('شعبه مرکزی', 'Central Branch');

      expect(result.nameFa).toBe('شعبه مرکزی');
      expect(result.nameEn).toBe('Central Branch');
    });

    it('should create a branch name without English name', () => {
      const result = BranchName.create('شعبه مرکزی');

      expect(result.nameFa).toBe('شعبه مرکزی');
      expect(result.nameEn).toBeNull();
    });

    it('should accept null as English name', () => {
      const result = BranchName.create('شعبه مرکزی', null);

      expect(result.nameEn).toBeNull();
    });

    it('should normalize Persian and English names', () => {
      const result = BranchName.create('  شعبه مرکزی  ', '  Central Branch  ');

      expect(result.nameFa).toBe('شعبه مرکزی');
      expect(result.nameEn).toBe('Central Branch');
    });

    it('should convert empty English name to null', () => {
      const result = BranchName.create('شعبه مرکزی', '');

      expect(result.nameEn).toBeNull();
    });

    it('should convert whitespace-only English name to null', () => {
      const result = BranchName.create('شعبه مرکزی', '   ');

      expect(result.nameEn).toBeNull();
    });

    it.each(['', '   '])('should reject empty Persian name: "%s"', (nameFa) => {
      expectBranchDataError(
        () => BranchName.create(nameFa),
        BRANCH_ERROR_CODE.NAME_REQUIRED,
      );
    });

    it('should reject Persian name longer than 120 characters', () => {
      const nameFa = 'ش'.repeat(121);

      expectBranchDataError(
        () => BranchName.create(nameFa),
        BRANCH_ERROR_CODE.NAME_INVALID,
      );
    });

    it('should reject English name longer than 120 characters', () => {
      const nameEn = 'A'.repeat(121);

      expectBranchDataError(
        () => BranchName.create('شعبه مرکزی', nameEn),
        BRANCH_ERROR_CODE.NAME_INVALID,
      );
    });

    it('should accept names with exactly 120 characters', () => {
      const nameFa = 'ش'.repeat(120);
      const nameEn = 'A'.repeat(120);

      const result = BranchName.create(nameFa, nameEn);

      expect(result.nameFa).toBe(nameFa);
      expect(result.nameEn).toBe(nameEn);
    });
  });

  describe('equals', () => {
    it('should return true for equal branch names', () => {
      const first = BranchName.create('شعبه مرکزی', 'Central Branch');

      const second = BranchName.create('شعبه مرکزی', 'Central Branch');

      expect(first.equals(second)).toBe(true);
    });

    it('should return false when Persian names are different', () => {
      const first = BranchName.create('شعبه مرکزی', 'Central Branch');
      const second = BranchName.create('شعبه شمالی', 'Central Branch');

      expect(first.equals(second)).toBe(false);
    });

    it('should return false when English names are different', () => {
      const first = BranchName.create('شعبه مرکزی', 'Central Branch');
      const second = BranchName.create('شعبه مرکزی', 'Main Branch');

      expect(first.equals(second)).toBe(false);
    });

    it('should return false when one English name is null', () => {
      const first = BranchName.create('شعبه مرکزی');
      const second = BranchName.create('شعبه مرکزی', 'Central Branch');

      expect(first.equals(second)).toBe(false);
    });
  });
});

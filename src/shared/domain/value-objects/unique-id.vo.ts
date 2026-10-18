import { randomUUID } from 'node:crypto';

export class UniqueId {
  private readonly value: string;

  constructor(id?: string) {
    if (id !== undefined && id.trim().length === 0) {
      throw new Error('UniqueId cannot be empty.');
    }

    this.value = id ?? randomUUID();
  }

  getValue(): string {
    return this.value;
  }

  equals(other: UniqueId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

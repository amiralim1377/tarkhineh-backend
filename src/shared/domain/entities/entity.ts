import { UniqueId } from '../value-objects/unique-id.vo.js';

export abstract class Entity<TId extends UniqueId = UniqueId> {
  protected constructor(protected readonly entityId: TId) {}

  getId(): TId {
    return this.entityId;
  }

  equals(other: Entity<TId> | null | undefined): boolean {
    if (other == null) {
      return false;
    }

    if (this.constructor !== other.constructor) {
      return false;
    }

    return this.entityId.equals(other.entityId);
  }
}

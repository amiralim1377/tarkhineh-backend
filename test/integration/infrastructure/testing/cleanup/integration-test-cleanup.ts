type CleanupTask = () => Promise<unknown>;

export class IntegrationTestCleanup {
  private readonly tasks: CleanupTask[] = [];

  private isRunning = false;

  add(task: CleanupTask): void {
    if (this.isRunning) {
      throw new Error(
        'Cannot register cleanup tasks while cleanup is running.',
      );
    }

    this.tasks.push(task);
  }

  get pendingTasksCount(): number {
    return this.tasks.length;
  }

  async clean(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Cleanup is already running.');
    }

    this.isRunning = true;

    // Last In, First Out (LIFO)
    const tasks = this.tasks.splice(0).reverse();
    const errors: unknown[] = [];

    try {
      for (const task of tasks) {
        try {
          await task();
        } catch (error) {
          errors.push(error);
        }
      }
    } finally {
      this.isRunning = false;
    }

    if (errors.length > 0) {
      throw new AggregateError(
        errors,
        `Integration test cleanup failed with ${errors.length} error(s).`,
      );
    }
  }
}

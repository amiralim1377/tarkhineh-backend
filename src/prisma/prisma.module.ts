import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { PrismaTransactionRunner } from './transaction/prisma-transaction-runner.js';
import { TRANSACTION_RUNNER } from '../shared/application/ports/transaction-runner.port.js';

@Module({
  providers: [
    PrismaService,
    PrismaTransactionRunner,
    {
      provide: TRANSACTION_RUNNER,
      useExisting: PrismaTransactionRunner,
    },
  ],
  exports: [PrismaService, TRANSACTION_RUNNER],
})
export class PrismaModule {}

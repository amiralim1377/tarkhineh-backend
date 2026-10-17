import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { appCreate } from './app.create.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  appCreate(app);

  await app.listen(process.env.PORT ?? 3000);
}

await bootstrap().catch((error: unknown) => {
  console.error('Failed to start the application:', error);
  process.exitCode = 1;
});

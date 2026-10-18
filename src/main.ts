import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { appCreate } from './app.create.js';
import { setupSwagger } from './swagger/setup-swagger.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  appCreate(app);

  // Keep API documentation disabled in production by default.
  if (process.env.NODE_ENV !== 'production') {
    setupSwagger(app);
  }

  await app.listen(process.env.PORT ?? 3000);
}

await bootstrap().catch((error: unknown) => {
  console.error('Failed to start the application:', error);
  process.exitCode = 1;
});

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { appCreate } from './app.create.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  appCreate(app);

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

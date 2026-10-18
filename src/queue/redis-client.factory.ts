import { RedisConnection, createIORedisClient } from 'bullmq';
import { Redis as IORedis } from 'ioredis';

RedisConnection.clientFactory = (options) => {
  const client = new IORedis(options);

  return createIORedisClient(client);
};

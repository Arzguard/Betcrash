import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

export const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Redis => {
    const client = new Redis({
      host: config.get<string>('REDIS_HOST', 'localhost'),
      port: config.get<number>('REDIS_PORT', 6379),
      retryStrategy: (times) => Math.min(times * 100, 3000),
      lazyConnect: true,
    });

    client.on('connect', () => console.log('Redis connected'));
    client.on('error', (err) => console.error('Redis error:', err.message));

    return client;
  },
};

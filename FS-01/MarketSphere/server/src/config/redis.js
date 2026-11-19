import Redis from 'ioredis';
import { config } from './env.js';

let redisClient = null;
let disabledLogged = false;

export const getRedisClient = () => {
  if (!config.redis.enabled) {
    if (!disabledLogged) {
      console.log('[Redis] Redis is disabled (REDIS_ENABLED=false). Operating without Redis cache.');
      disabledLogged = true;
    }
    return null;
  }

  if (!redisClient) {
    const redisUrl = config.redis.url;
    const isUpstash =
      Boolean(redisUrl && redisUrl.includes('upstash.io')) ||
      Boolean(config.redis.host && config.redis.host.includes('upstash.io'));
    const isTls =
      Boolean(config.redis.tls) ||
      Boolean(redisUrl && redisUrl.startsWith('rediss://')) ||
      isUpstash;

    const commonOptions = {
      lazyConnect: true,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    };

    if (isTls) {
      commonOptions.tls = {};
    }

    if (redisUrl) {
      redisClient = new Redis(redisUrl, commonOptions);
    } else {
      redisClient = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password || undefined,
        ...commonOptions,
      });
    }

    redisClient.on('connect', () => {
      console.log('[Redis] Client connected');
    });

    redisClient.on('error', (err) => {
      console.warn(`[Redis] Connection warning: ${err.message}`);
    });
  }

  return redisClient;
};

export const connectRedis = async () => {
  if (!config.redis.enabled) {
    console.log('[Redis] Redis is disabled (REDIS_ENABLED=false). Skipping connection attempt.');
    return null;
  }

  try {
    const client = getRedisClient();
    if (!client) return null;
    await client.connect();
    return client;
  } catch (error) {
    console.warn(`[Redis] Could not connect: ${error.message}`);
  }
};


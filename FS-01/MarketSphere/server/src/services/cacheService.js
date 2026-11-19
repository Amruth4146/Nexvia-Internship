import { getRedisClient } from '../config/redis.js';

export const cacheService = {
  get: async (key) => {
    try {
      const client = getRedisClient();
      if (!client) return null;
      const data = await client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (err) {
      console.warn(`[Cache GET Warning] Key: ${key} - ${err.message}`);
      return null;
    }
  },

  set: async (key, value, ttlSeconds = 3600) => {
    try {
      const client = getRedisClient();
      if (!client) return false;
      const serialized = JSON.stringify(value);
      if (ttlSeconds) {
        await client.set(key, serialized, 'EX', ttlSeconds);
      } else {
        await client.set(key, serialized);
      }
      return true;
    } catch (err) {
      console.warn(`[Cache SET Warning] Key: ${key} - ${err.message}`);
      return false;
    }
  },

  del: async (key) => {
    try {
      const client = getRedisClient();
      if (!client) return false;
      await client.del(key);
      return true;
    } catch (err) {
      console.warn(`[Cache DEL Warning] Key: ${key} - ${err.message}`);
      return false;
    }
  },

  delPattern: async (pattern) => {
    try {
      const client = getRedisClient();
      if (!client) return false;
      const keys = await client.keys(pattern);
      if (keys.length > 0) {
        await client.del(...keys);
      }
      return true;
    } catch (err) {
      console.warn(`[Cache DEL Pattern Warning] Pattern: ${pattern} - ${err.message}`);
      return false;
    }
  },
};

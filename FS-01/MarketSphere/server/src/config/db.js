import mongoose from 'mongoose';
import { config } from './env.js';

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.mongo.uri, {
      user: config.mongo.user || undefined,
      pass: config.mongo.password || undefined,
    });
    console.log(`[MongoDB] Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`[MongoDB] Connection error: ${error.message}`);
    // Do not terminate process in development if DB is not yet running
    if (config.nodeEnv === 'production') {
      process.exit(1);
    }
  }
};


import app from './app.js';
import { config, validateEnv } from './config/env.js';
import { connectDB } from './config/db.js';
import { connectRedis } from './config/redis.js';
import { checkElasticConnection } from './config/elasticsearch.js';
import {
  startMutationPruningScheduler,
  stopMutationPruningScheduler,
} from './controllers/orderController.js';
import {
  startPaymentRecoveryScheduler,
  stopPaymentRecoveryScheduler,
} from './controllers/paymentController.js';

const startServer = async () => {
  // Validate production configuration before connecting services or binding ports
  validateEnv();

  // Attempt service connections
  await connectDB();
  await connectRedis();
  await checkElasticConnection();

  // Initialize background scheduled tasks
  startMutationPruningScheduler();
  startPaymentRecoveryScheduler();

  const server = app.listen(config.port, () => {
    console.log(`[MarketSphere Server] Running on http://localhost:${config.port}`);
    console.log(`[MarketSphere Server] Environment: ${config.nodeEnv}`);
  });

  const handleShutdown = (signal) => {
    console.log(`[MarketSphere Server] Received ${signal}, closing server gracefully...`);
    stopMutationPruningScheduler();
    stopPaymentRecoveryScheduler();
    server.close(() => {
      console.log('[MarketSphere Server] HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
};

startServer();


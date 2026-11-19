import { config } from './env.js';

/**
 * AWS S3 Storage Client Configuration
 * Note: Configured for AWS Mumbai region (ap-south-1).
 * When AWS credentials are not set, falls back to local or mock storage provider.
 */
export const s3Config = {
  region: config.aws.region,
  bucket: config.aws.s3Bucket,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  },
  isConfigured: Boolean(
    config.aws.accessKeyId &&
      config.aws.secretAccessKey &&
      config.aws.s3Bucket
  ),
};

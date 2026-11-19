import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config/env.js';

export const hashToken = (token) => {
  if (!token) return '';
  return crypto.createHash('sha256').update(token).digest('hex');
};

export const generateAccessToken = (userId, role) => {
  return jwt.sign(
    {
      id: userId.toString(),
      role,
    },
    config.jwt.secret,
    {
      expiresIn: config.jwt.expiresIn, // e.g. 15m
      algorithm: 'HS256',
    }
  );
};

export const generateRefreshToken = (userId) => {
  return jwt.sign(
    {
      id: userId.toString(),
      jti: crypto.randomBytes(16).toString('hex'), // Unique token identifier for secure rotation
    },
    config.jwt.refreshSecret,
    {
      expiresIn: config.jwt.refreshExpiresIn, // e.g. 7d
      algorithm: 'HS256',
    }
  );
};

export const verifyRefreshToken = (token) => {
  return jwt.verify(token, config.jwt.refreshSecret);
};

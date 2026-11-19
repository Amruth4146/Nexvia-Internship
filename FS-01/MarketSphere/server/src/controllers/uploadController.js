import multer from 'multer';
import { s3Service } from '../services/s3Service.js';
import { config } from '../config/env.js';

// Memory storage for streaming to S3
const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid image file type. Only JPEG, PNG, WEBP, and GIF are permitted.'));
    }
  },
});

export const uploadImage = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file uploaded' });
    }

    const result = await s3Service.uploadImage(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );

    res.status(200).json({
      success: true,
      message: 'Image uploaded successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getPresignedUrl = async (req, res, next) => {
  try {
    const { fileName, fileType } = req.body;
    if (!fileName || !fileType) {
      return res.status(400).json({
        success: false,
        message: 'fileName and fileType are required',
      });
    }

    const result = await s3Service.getPresignedUploadUrl(fileName, fileType);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteImage = async (req, res, next) => {
  try {
    const { keyOrUrl } = req.body;
    if (!keyOrUrl) {
      return res.status(400).json({ success: false, message: 'keyOrUrl is required' });
    }

    const result = await s3Service.deleteImage(keyOrUrl);
    res.status(200).json({
      success: true,
      message: 'Image deleted successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Public image view/download endpoint for private S3 storage
 * Redirects securely via CloudFront CDN or a temporary presigned GET URL (1 hour)
 */
export const viewImage = async (req, res, next) => {
  try {
    const key = req.params[0] || req.params.key || req.query.key;
    if (!key) {
      return res.status(400).json({ success: false, message: 'Image key is required' });
    }

    if (config.aws.cloudfrontDomain) {
      const domain = config.aws.cloudfrontDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
      return res.redirect(302, `https://${domain}/${key}`);
    }

    const downloadUrl = await s3Service.getPresignedDownloadUrl(key, 3600);
    return res.redirect(302, downloadUrl);
  } catch (error) {
    next(error);
  }
};


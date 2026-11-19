import { body } from 'express-validator';

export const productValidator = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Product title is required')
    .isLength({ min: 3, max: 200 })
    .withMessage('Title must be between 3 and 200 characters'),
  body('description')
    .trim()
    .notEmpty()
    .withMessage('Product description is required'),
  body('categoryId')
    .notEmpty()
    .withMessage('Category ID is required')
    .isMongoId()
    .withMessage('Valid Category ID is required'),
  body('price')
    .isFloat({ min: 0.01 })
    .withMessage('Price must be a number greater than 0'),
  body('discountPrice')
    .optional({ nullable: true, checkFalsy: true })
    .isFloat({ min: 0 })
    .withMessage('Discount price must be a positive number'),
  body('stock')
    .isInt({ min: 0 })
    .withMessage('Stock must be an integer 0 or greater'),
  body('sku')
    .trim()
    .notEmpty()
    .withMessage('SKU is required'),
  body('images')
    .isArray({ min: 1 })
    .withMessage('At least one product image is required'),
  body('gstRate')
    .optional()
    .isIn([0, 5, 12, 18, 28])
    .withMessage('GST rate must be one of [0, 5, 12, 18, 28]%'),
];


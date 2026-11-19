import { User } from '../models/User.js';
import { Vendor } from '../models/Vendor.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashToken,
} from '../utils/generateToken.js';
import { config } from '../config/env.js';

const getRefreshTokenCookieOptions = () => ({
  httpOnly: true,
  secure: config.nodeEnv === 'production',
  sameSite: config.nodeEnv === 'production' ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  path: '/',
});

export const register = async (req, res, next) => {
  try {
    const { name, email, password, role = 'customer', businessName, phone } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'A user with this email address already exists',
      });
    }

    const assignedRole = role === 'vendor' ? 'vendor' : 'customer';

    const user = await User.create({
      name,
      email,
      password,
      role: assignedRole,
      phone: phone || '',
    });

    let vendorRecord = null;
    if (assignedRole === 'vendor') {
      const storeName = businessName || `${name}'s Store`;
      const storeSlug = storeName
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '') + `-${Math.floor(1000 + Math.random() * 9000)}`;

      vendorRecord = await Vendor.create({
        userId: user._id,
        businessName: storeName,
        storeSlug,
        status: 'approved',
      });

      user.vendorId = vendorRecord._id;
      await user.save();
    }

    const token = generateAccessToken(user._id, user.role);
    const refreshToken = generateRefreshToken(user._id);

    // Secure Priority 3: Store SHA-256 hash in database rather than raw JWT
    user.refreshToken = hashToken(refreshToken);
    await user.save();

    // Set secure HttpOnly cookie
    res.cookie('refreshToken', refreshToken, getRefreshTokenCookieOptions());

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          phone: user.phone,
          avatar: user.avatar,
          vendorId: user.vendorId,
          vendor: vendorRecord,
        },
        token,
        refreshToken,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact support.',
      });
    }

    let vendor = null;
    if (user.role === 'vendor' && user.vendorId) {
      vendor = await Vendor.findById(user.vendorId);
    }

    const token = generateAccessToken(user._id, user.role);
    const refreshToken = generateRefreshToken(user._id);

    // Secure Priority 3: Store SHA-256 hash in database
    user.refreshToken = hashToken(refreshToken);
    await user.save();

    // Set secure HttpOnly cookie
    res.cookie('refreshToken', refreshToken, getRefreshTokenCookieOptions());

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          phone: user.phone,
          avatar: user.avatar,
          vendorId: user.vendorId,
          vendor,
        },
        token,
        refreshToken,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const refreshToken = async (req, res, next) => {
  try {
    const incomingToken = req.body?.refreshToken || req.cookies?.refreshToken;

    if (!incomingToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required',
      });
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(incomingToken);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token',
      });
    }

    const user = await User.findById(decoded.id).select('+refreshToken');
    const incomingHash = hashToken(incomingToken);

    if (!user || !user.refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token has been revoked or session expired',
      });
    }

    // Token Reuse Detection: If token is valid JWT for this user but does not match stored hash
    if (user.refreshToken !== incomingHash) {
      console.warn(`[Security Alert] Refresh token reuse detected for user ${user._id}. Revoking all sessions.`);
      user.refreshToken = null;
      await user.save();
      res.clearCookie('refreshToken', getRefreshTokenCookieOptions());
      return res.status(401).json({
        success: false,
        message: 'Compromised or reused refresh token. Please login again.',
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated',
      });
    }

    // Token Rotation: Issue fresh access token and fresh refresh token
    const newAccessToken = generateAccessToken(user._id, user.role);
    const newRefreshToken = generateRefreshToken(user._id);

    // Invalidate old token by saving new hash
    user.refreshToken = hashToken(newRefreshToken);
    await user.save();

    res.cookie('refreshToken', newRefreshToken, getRefreshTokenCookieOptions());

    res.status(200).json({
      success: true,
      data: {
        token: newAccessToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    res.clearCookie('refreshToken', getRefreshTokenCookieOptions());
    if (req.user) {
      await User.findByIdAndUpdate(req.user._id, { $unset: { refreshToken: 1 } });
    }
    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    let vendor = null;
    if (user.role === 'vendor' && user.vendorId) {
      vendor = await Vendor.findById(user.vendorId);
    }

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          phone: user.phone,
          avatar: user.avatar,
          vendorId: user.vendorId,
          vendor,
          wishlist: user.wishlist,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const { name, phone, avatar } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (name) user.name = name;
    if (phone) user.phone = phone;
    if (avatar) user.avatar = avatar;

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};

export const getWishlist = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate({
      path: 'wishlist',
      populate: { path: 'categoryId', select: 'name slug' },
    });
    res.status(200).json({
      success: true,
      data: user.wishlist || [],
    });
  } catch (error) {
    next(error);
  }
};

export const toggleWishlist = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const user = await User.findById(req.user._id);

    const isFav = user.wishlist.some((id) => id.toString() === productId);
    if (isFav) {
      user.wishlist = user.wishlist.filter((id) => id.toString() !== productId);
    } else {
      user.wishlist.push(productId);
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: isFav ? 'Removed from wishlist' : 'Added to wishlist',
      isWishlisted: !isFav,
      wishlist: user.wishlist,
    });
  } catch (error) {
    next(error);
  }
};

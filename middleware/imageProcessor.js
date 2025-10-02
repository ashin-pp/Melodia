const sharp = require('sharp');

const cloudinary = require('../config/cloudinary');


// Image processing and upload middleware for Cloudinary
const processImages = async (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ 
      success: false, 
      message: 'Please upload at least 3 product images' 
    });
  }

  if (req.files.length < 3) {
    return res.status(400).json({ 
      success: false, 
      message: 'Minimum 3 images are required' 
    });
  }

  try {
    const uploadPromises = req.files.map(async (file) => {
      // Process image with sharp
      const processedImageBuffer = await sharp(file.buffer)
        .resize(800, 800, {
          fit: 'cover',
          position: 'center'
        })
        .webp({ quality: 90 })
        .toBuffer();

      // Upload to Cloudinary
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'melodia/products',
            format: 'webp',
            transformation: [
              { width: 800, height: 800, crop: 'fill' }
            ]
          },
          (error, result) => {
            if (error) {
              reject(error);
            } else {
              resolve(result.secure_url);
            }
          }
        );
        uploadStream.end(processedImageBuffer);
      });
    });

    const uploadedImages = await Promise.all(uploadPromises);
    req.processedImages = uploadedImages;
    next();
  } catch (error) {
    console.error('Error processing/uploading images:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error processing images' 
    });
  }
};

// Delete images from Cloudinary
const processImagesOptional = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      req.processedImages = [];
      return next();
    }

    const uploadPromises = req.files.map(async (file) => {
      const processedImageBuffer = await sharp(file.buffer)
        .resize(800, 800, { fit: 'cover', position: 'center' })
        .webp({ quality: 90 })
        .toBuffer();

      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'melodia/products',
            format: 'webp',
            transformation: [{ width: 800, height: 800, crop: 'fill' }]
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result.secure_url);
          }
        );
        uploadStream.end(processedImageBuffer);
      });
    });

    const uploadedImages = await Promise.all(uploadPromises);
    req.processedImages = uploadedImages;
    next();
  } catch (error) {
    console.error('Error processing/uploading images (optional):', error);
    // Do not terminate the request here; allow controller to handle gracefully
    req.processedImages = [];
    return next();
  }
};

const deleteImages = async (imageUrls) => {
  try {
    const deletePromises = imageUrls.map(async (url) => {
      // Extract public_id from Cloudinary URL
      const publicId = extractPublicId(url);
      if (publicId) {
        return cloudinary.uploader.destroy(publicId);
      }
    });
    await Promise.all(deletePromises);
  } catch (error) {
    console.error('Error deleting images from Cloudinary:', error);
  }
};

// Helper function to extract public_id from Cloudinary URL
const extractPublicId = (url) => {
  try {
    const parts = url.split('/');
    const uploadIndex = parts.indexOf('upload');
    if (uploadIndex !== -1 && parts.length > uploadIndex + 1) {
      const pathParts = parts.slice(uploadIndex + 2);
      const publicIdWithExt = pathParts.join('/');
      // Remove file extension
      return publicIdWithExt.replace(/\.[^/.]+$/, '');
    }
    return null;
  } catch (error) {
    console.error('Error extracting public_id:', error);
    return null;
  }
};

module.exports = {
  processImages,
  processImagesOptional,
  deleteImages
};
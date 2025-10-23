
import cloudinary from '../config/cloudinary.js';
import streamifier from 'streamifier';

function uploadBufferToCloudinary(buffer, folder = 'melodia/products') {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
}

export { uploadBufferToCloudinary };

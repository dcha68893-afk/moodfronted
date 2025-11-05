const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

// Configure Cloudinary using environment variables (RECOMMENDED)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Function to upload a file
const uploadToCloudinary = async (filePath) => {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const result = await cloudinary.uploader.upload(filePath, {
      folder: 'uniconnectsphere', // optional: specify a folder in Cloudinary
      resource_type: 'auto' // automatically detect file type (image, video, raw)
    });
    
    console.log('Upload successful:', result.secure_url);
    return {
      url: result.secure_url,
      public_id: result.public_id,
      format: result.format,
      bytes: result.bytes
    };
  } catch (error) {
    console.error('Upload error:', error.message);
    throw error;
  }
};

// Function to upload from buffer (useful for multer file uploads)
const uploadFromBuffer = async (buffer, originalname) => {
  try {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'uniconnectsphere',
          resource_type: 'auto'
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      
      uploadStream.end(buffer);
    });
  } catch (error) {
    console.error('Buffer upload error:', error.message);
    throw error;
  }
};

// Function to delete file from Cloudinary
const deleteFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    console.log('Delete result:', result);
    return result;
  } catch (error) {
    console.error('Delete error:', error.message);
    throw error;
  }
};

// Export the functions
module.exports = { 
  uploadToCloudinary, 
  uploadFromBuffer, 
  deleteFromCloudinary 
};

// --- Example usage ---
// (Uncomment below lines to test locally)

/*
// Test with local file
const testFile = path.join(__dirname, 'test-image.jpg');
uploadToCloudinary(testFile)
  .then(result => {
    console.log('File uploaded successfully:');
    console.log('URL:', result.url);
    console.log('Public ID:', result.public_id);
  })
  .catch(error => {
    console.error('Upload failed:', error.message);
  });

// Test with multer buffer (example)
/*
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.post('/upload', upload.single('image'), async (req, res) => {
  try {
    const result = await uploadFromBuffer(req.file.buffer, req.file.originalname);
    res.json({ success: true, url: result.secure_url });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
*/
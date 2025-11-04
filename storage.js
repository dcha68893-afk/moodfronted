import FirebaseStorageService from './FirebaseStorageService';

// Example usage in a React component
async function handlePostImageUpload(file) {
  try {
    const userId = FirebaseStorageService.getCurrentUserId();
    const imageUrl = await FirebaseStorageService.uploadPostFile(file, userId);
    console.log('Image uploaded successfully:', imageUrl);
    return imageUrl;
  } catch (error) {
    console.error('Failed to upload image:', error);
  }
}

async function handleProfileImageUpload(file) {
  try {
    const userId = FirebaseStorageService.getCurrentUserId();
    const imageUrl = await FirebaseStorageService.uploadProfileImage(file, userId);
    console.log('Profile image uploaded successfully:', imageUrl);
    return imageUrl;
  } catch (error) {
    console.error('Failed to upload profile image:', error);
  }
}

async function handleStatusUpload(file) {
  try {
    const userId = FirebaseStorageService.getCurrentUserId();
    const fileUrl = await FirebaseStorageService.uploadStatusFile(file, userId);
    console.log('Status file uploaded successfully:', fileUrl);
    return fileUrl;
  } catch (error) {
    console.error('Failed to upload status file:', error);
  }
}
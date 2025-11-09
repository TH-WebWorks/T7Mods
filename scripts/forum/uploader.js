import { getSupabase, FORUM_CONFIG } from './config.js';
import { getCurrentProfile } from './auth.js';

// Handle image upload
export async function uploadImage(file) {
  // Validate file
  if (!file) {
    throw new Error('No file selected');
  }

  if (!FORUM_CONFIG.allowedImageTypes.includes(file.type)) {
    throw new Error('Invalid file type. Only images are allowed.');
  }

  if (file.size > FORUM_CONFIG.maxImageSize) {
    throw new Error(`File size exceeds ${FORUM_CONFIG.maxImageSize / 1024 / 1024}MB limit`);
  }

  const supabase = await getSupabase();
  const profile = getCurrentProfile();
  
  if (!profile) {
    throw new Error('You must be logged in to upload images');
  }

  // Generate unique filename
  const fileExt = file.name.split('.').pop();
  const fileName = `${profile.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

  // Upload to Supabase Storage
  const { data, error } = await supabase.storage
    .from('forum-uploads')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false
    });

  if (error) {
    console.error('Upload error:', error);
    throw new Error('Failed to upload image');
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from('forum-uploads')
    .getPublicUrl(fileName);

  const publicUrl = urlData.publicUrl;

  // Save upload record to database
  await supabase.from('uploads').insert({
    user_id: profile.id,
    file_name: file.name,
    file_url: publicUrl,
    file_size: file.size,
    mime_type: file.type,
  });

  return publicUrl;
}

// Setup image upload handler for editor
export function setupImageUploadHandler(inputId, textareaId) {
  const input = document.getElementById(inputId);
  const textarea = document.getElementById(textareaId);

  if (!input || !textarea) return;

  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Show loading indicator
    const uploadBtn = document.querySelector(`button[data-action="image"]`);
    if (uploadBtn) {
      uploadBtn.disabled = true;
      uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }

    try {
      const url = await uploadImage(file);
      
      // Insert markdown image at cursor position
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const before = textarea.value.substring(0, start);
      const after = textarea.value.substring(end);
      
      const imageMarkdown = `\n![Image](${url})\n`;
      textarea.value = before + imageMarkdown + after;
      
      // Move cursor after inserted image
      textarea.selectionStart = textarea.selectionEnd = start + imageMarkdown.length;
      textarea.focus();

      alert('Image uploaded successfully!');
    } catch (error) {
      console.error('Upload failed:', error);
      alert(error.message || 'Failed to upload image');
    } finally {
      // Reset button
      if (uploadBtn) {
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = '<i class="fas fa-image"></i>';
      }
      // Clear input
      input.value = '';
    }
  });
}

// Compress image before upload (optional enhancement)
export async function compressImage(file, maxWidth = 1920, maxHeight = 1080, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        if (height > maxHeight) {
          width = (width * maxHeight) / height;
          height = maxHeight;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              // Create a new File object from the blob
              const compressedFile = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            } else {
              reject(new Error('Failed to compress image'));
            }
          },
          'image/jpeg',
          quality
        );
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target.result;
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// Handle paste events for image upload
export function setupPasteUpload(textareaId) {
  const textarea = document.getElementById(textareaId);
  if (!textarea) return;

  textarea.addEventListener('paste', async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.indexOf('image') === 0) {
        e.preventDefault();
        
        const file = item.getAsFile();
        if (!file) continue;

        // Show loading indicator
        const uploadBtn = document.querySelector(`button[data-action="image"]`);
        if (uploadBtn) {
          uploadBtn.disabled = true;
          uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        }

        try {
          const url = await uploadImage(file);
          
          // Insert markdown image at cursor position
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const before = textarea.value.substring(0, start);
          const after = textarea.value.substring(end);
          
          const imageMarkdown = `\n![Pasted Image](${url})\n`;
          textarea.value = before + imageMarkdown + after;
          
          textarea.selectionStart = textarea.selectionEnd = start + imageMarkdown.length;
          textarea.focus();

          alert('Image uploaded successfully!');
        } catch (error) {
          console.error('Upload failed:', error);
          alert(error.message || 'Failed to upload image');
        } finally {
          if (uploadBtn) {
            uploadBtn.disabled = false;
            uploadBtn.innerHTML = '<i class="fas fa-image"></i>';
          }
        }
      }
    }
  });
}

// Delete uploaded image
export async function deleteImage(fileUrl) {
  const supabase = await getSupabase();
  const profile = getCurrentProfile();

  if (!profile) {
    throw new Error('You must be logged in to delete images');
  }

  // Extract filename from URL
  const fileName = fileUrl.split('/').slice(-2).join('/');

  // Delete from storage
  const { error: storageError } = await supabase.storage
    .from('forum-uploads')
    .remove([fileName]);

  if (storageError) {
    console.error('Delete error:', storageError);
    throw new Error('Failed to delete image');
  }

  // Delete from database
  await supabase
    .from('uploads')
    .delete()
    .eq('file_url', fileUrl)
    .eq('user_id', profile.id);

  return true;
}


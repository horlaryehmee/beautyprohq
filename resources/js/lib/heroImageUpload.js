export async function optimizeHeroImage(file) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        throw new Error('Choose a JPG, PNG or WEBP image.');
    }
    if (file.size > 12 * 1024 * 1024) throw new Error('Images must be 12 MB or smaller.');

    const url = URL.createObjectURL(file);
    try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Image optimization is unavailable in this browser.');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.75));
        if (!blob) throw new Error('Could not optimize this image.');
        if (scale === 1 && blob.size >= file.size) return file;
        const extension = blob.type === 'image/webp' ? 'webp' : 'png';
        return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.${extension}`, { type: blob.type });
    } finally {
        URL.revokeObjectURL(url);
    }
}

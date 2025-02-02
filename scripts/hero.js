document.addEventListener('DOMContentLoaded', () => {
  const backgrounds = document.querySelectorAll('.hero-bg');
  let currentBg = 0;

  // Hide all backgrounds except first one
  backgrounds.forEach((bg, index) => {
    if (index !== 0) bg.classList.remove('active');
  });

  function nextBackground() {
    // Fade out current
    backgrounds[currentBg].classList.remove('active');
    
    // Update index
    currentBg = (currentBg + 1) % backgrounds.length;
    
    // Fade in next
    backgrounds[currentBg].classList.add('active');
  }

  // Start the rotation
  if (backgrounds.length > 1) {
    setInterval(nextBackground, 5000);
  }
}); 
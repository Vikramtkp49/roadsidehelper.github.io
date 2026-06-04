/* ========== APP.JS — Roadside Helper ========== */

// ---- Header scroll effect ----
window.addEventListener('scroll', () => {
  document.querySelector('.header')?.classList.toggle('scrolled', window.scrollY > 40);
});

// ---- Mobile hamburger menu ----
document.addEventListener('DOMContentLoaded', () => {
  const hamburger = document.getElementById('hamburger');
  const navLinks = document.getElementById('nav-links');
  if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => navLinks.classList.toggle('open'));
    navLinks.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => navLinks.classList.remove('open'));
    });
  }

  // ---- Scroll reveal for cards ----
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        setTimeout(() => entry.target.classList.add('visible'), i * 80);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  document.querySelectorAll('.feature-card, .service-card').forEach(el => observer.observe(el));
});

// ========== MODAL & WIZARD ==========
let currentStep = 1;
const totalSteps = 3;
let modalMap = null;
let modalMarker = null;

function openModal() {
  document.getElementById('modal-overlay').classList.add('active');
  document.body.style.overflow = 'hidden';
  resetForm();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('active');
  document.body.style.overflow = '';
}

// Close on backdrop click
document.addEventListener('click', (e) => {
  if (e.target.id === 'modal-overlay') closeModal();
});

// Close on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

function resetForm() {
  currentStep = 1;
  document.getElementById('help-form')?.reset();
  document.getElementById('form-success')?.classList.remove('active');
  document.querySelector('.modal-body').style.display = '';
  document.querySelector('.step-progress').style.display = '';
  document.querySelector('.form-actions-container').style.display = '';
  const preview = document.getElementById('upload-preview');
  if (preview) preview.innerHTML = '';
  updateStep();
}

function updateStep() {
  // Update step visibility
  document.querySelectorAll('.form-step').forEach(s => s.classList.remove('active'));
  const active = document.getElementById('step-' + currentStep);
  if (active) active.classList.add('active');

  // Update dots
  document.querySelectorAll('.step-dot').forEach((dot, i) => {
    dot.classList.remove('active', 'done');
    if (i + 1 === currentStep) dot.classList.add('active');
    else if (i + 1 < currentStep) dot.classList.add('done');
  });
  document.querySelectorAll('.step-line').forEach((line, i) => {
    line.classList.toggle('done', i + 1 < currentStep);
  });

  // Update buttons
  const backBtn = document.getElementById('btn-back');
  const nextBtn = document.getElementById('btn-next');
  const submitBtn = document.getElementById('btn-submit');

  if (backBtn) backBtn.style.display = currentStep === 1 ? 'none' : '';
  if (nextBtn) nextBtn.style.display = currentStep < totalSteps ? '' : 'none';
  if (submitBtn) submitBtn.style.display = currentStep === totalSteps ? '' : 'none';
}

function validateCurrentStep() {
  if (currentStep === 1) {
    const name = document.getElementById('f-name').value.trim();
    const phone = document.getElementById('f-phone').value.trim();
    if (!name || name.length < 2) { showToast('Please enter your name (min 2 characters)', 'error'); return false; }
    if (!phone || !/^[0-9]{10,15}$/.test(phone)) { showToast('Please enter a valid phone number (10-15 digits)', 'error'); return false; }
    return true;
  }
  if (currentStep === 2) {
    const loc = document.getElementById('f-location').value.trim();
    const vehicle = document.getElementById('f-vehicle').value;
    if (!loc) { showToast('Please detect your location first', 'error'); return false; }
    if (!vehicle) { showToast('Please select your vehicle type', 'error'); return false; }
    return true;
  }
  return true;
}

function nextStep() {
  if (!validateCurrentStep()) return;
  if (currentStep < totalSteps) { currentStep++; updateStep(); }
}

function prevStep() {
  if (currentStep > 1) { currentStep--; updateStep(); }
}

// ---- Location detection ----
function detectLocation() {
  const btn = document.getElementById('btn-detect');
  const input = document.getElementById('f-location');
  if (!navigator.geolocation) { showToast('Geolocation not supported by your browser', 'error'); return; }

  btn.classList.add('loading');
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Detecting...';

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      input.value = `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`;
      input.dataset.lat = lat;
      input.dataset.lng = lng;
      btn.classList.remove('loading');
      btn.innerHTML = '<i class="fas fa-check"></i> Found';
      setTimeout(() => { btn.innerHTML = '<i class="fas fa-crosshairs"></i> Detect'; }, 2500);

      // Update map
      try {
        if (typeof google !== 'undefined' && google.maps) {
          const pos2 = new google.maps.LatLng(lat, lng);
          if (!modalMap) {
            modalMap = new google.maps.Map(document.getElementById('modal-map'), { center: pos2, zoom: 15 });
          } else {
            modalMap.setCenter(pos2);
          }
          if (modalMarker) { modalMarker.setPosition(pos2); }
          else { modalMarker = new google.maps.Marker({ position: pos2, map: modalMap }); }
        }
      } catch (e) { console.log('Map not available'); }

      showToast('Location detected successfully!', 'success');
    },
    () => {
      btn.classList.remove('loading');
      btn.innerHTML = '<i class="fas fa-crosshairs"></i> Detect';
      showToast('Unable to detect location. Please allow access.', 'error');
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// ---- Image upload preview ----
function handleImageUpload(input) {
  const preview = document.getElementById('upload-preview');
  const zone = document.querySelector('.upload-zone');
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];

  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowed.includes(file.type)) { showToast('Invalid format. Use JPG, PNG, GIF, or WebP', 'error'); input.value = ''; return; }
  if (file.size > 5 * 1024 * 1024) { showToast('Image must be under 5MB', 'error'); input.value = ''; return; }

  const reader = new FileReader();
  reader.onload = (e) => {
    preview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
    zone.querySelector('p').textContent = file.name;
  };
  reader.readAsDataURL(file);
}

// ---- Drag and drop ----
document.addEventListener('DOMContentLoaded', () => {
  const zone = document.querySelector('.upload-zone');
  if (!zone) return;
  ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('dragover'); }));
  zone.addEventListener('drop', (e) => {
    const fileInput = document.getElementById('f-image');
    if (e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files;
      handleImageUpload(fileInput);
    }
  });
});

// ---- Form submission ----
async function submitForm(e) {
  e.preventDefault();
  if (!validateCurrentStep()) return;

  const submitBtn = document.getElementById('btn-submit');
  submitBtn.classList.add('loading');
  submitBtn.textContent = 'Sending...';

  const formData = new FormData();
  formData.append('name', document.getElementById('f-name').value.trim());
  formData.append('phone', document.getElementById('f-phone').value.trim());
  formData.append('latitude', document.getElementById('f-location').dataset.lat || '');
  formData.append('longitude', document.getElementById('f-location').dataset.lng || '');
  formData.append('vehicle', document.getElementById('f-vehicle').value);
  formData.append('needs', document.getElementById('f-needs').value.trim());

  const imageFile = document.getElementById('f-image').files[0];
  if (imageFile) formData.append('image', imageFile);

  try {
    const response = await fetch('http://localhost:5000/api/request-assistance', {
      method: 'POST',
      body: formData
    });
    const data = await response.json();
    if (response.ok) {
      showSuccess();
    } else {
      showToast('Error: ' + (data.message || 'Something went wrong'), 'error');
      submitBtn.classList.remove('loading');
      submitBtn.textContent = 'Submit Request';
    }
  } catch (err) {
    console.error('Submit error:', err);
    showToast('Network error. Please check your connection.', 'error');
    submitBtn.classList.remove('loading');
    submitBtn.textContent = 'Submit Request';
  }
}

function showSuccess() {
  document.querySelector('.modal-body').style.display = 'none';
  document.querySelector('.step-progress').style.display = 'none';
  document.querySelector('.form-actions-container').style.display = 'none';
  document.getElementById('form-success').classList.add('active');
}

// ---- Toast notifications ----
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  const bg = type === 'success' ? 'rgba(34,197,94,0.15)' : type === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)';
  const border = type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#f59e0b';
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  toast.style.cssText = `
    position:fixed; top:20px; right:20px; z-index:9999;
    padding:14px 20px; border-radius:12px;
    background:${bg}; border:1px solid ${border};
    color:#f0f0f5; font-size:14px; font-family:var(--font-body);
    backdrop-filter:blur(12px);
    display:flex; align-items:center; gap:10px;
    animation:fadeUp 0.35s ease;
    max-width:360px;
  `;
  toast.innerHTML = `<span style="font-weight:700;font-size:16px;color:${border}">${icon}</span>${message}`;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(-10px)'; setTimeout(() => toast.remove(), 300); }, 4000);
}

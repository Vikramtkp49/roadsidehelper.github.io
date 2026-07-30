/* ========== APP.JS — Roadside Helper ========== */

// ---- Header scroll effect ----
window.addEventListener('scroll', () => {
  document.querySelector('.header')?.classList.toggle('scrolled', window.scrollY > 40);
});

// ---- Mobile hamburger menu ----
document.addEventListener('DOMContentLoaded', () => {
  const hamburger = document.getElementById('hamburger');
  const navLinks  = document.getElementById('nav-links');
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
let modalMap    = null;
let modalMarker = null;

// Unified resolved coordinates — set by either GPS detect OR manual entry
let resolvedLat = null;
let resolvedLng = null;

function openModal() {
  document.getElementById('modal-overlay').classList.add('active');
  document.body.style.overflow = 'hidden';
  resetForm();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('active');
  document.body.style.overflow = '';
}

document.addEventListener('click',   (e) => { if (e.target.id === 'modal-overlay') closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

function resetForm() {
  currentStep  = 1;
  resolvedLat  = null;
  resolvedLng  = null;

  document.getElementById('help-form')?.reset();
  document.getElementById('form-success')?.classList.remove('active');
  document.querySelector('.modal-body').style.display = '';
  document.querySelector('.step-progress').style.display = '';
  document.querySelector('.form-actions-container').style.display = '';

  // Clear image previews
  ['preview1','preview2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });

  // Reset location UI
  const locDisplay = document.getElementById('f-location-display');
  if (locDisplay) locDisplay.textContent = 'No location set';

  hideManualFields();
  updateStep();
}

function updateStep() {
  document.querySelectorAll('.form-step').forEach(s => s.classList.remove('active'));
  document.getElementById('step-' + currentStep)?.classList.add('active');

  document.querySelectorAll('.step-dot').forEach((dot, i) => {
    dot.classList.remove('active', 'done');
    if (i + 1 === currentStep)      dot.classList.add('active');
    else if (i + 1 < currentStep)   dot.classList.add('done');
  });
  document.querySelectorAll('.step-line').forEach((line, i) => {
    line.classList.toggle('done', i + 1 < currentStep);
  });

  const backBtn   = document.getElementById('btn-back');
  const nextBtn   = document.getElementById('btn-next');
  const submitBtn = document.getElementById('btn-submit');
  if (backBtn)   backBtn.style.display   = currentStep === 1 ? 'none' : '';
  if (nextBtn)   nextBtn.style.display   = currentStep < totalSteps ? '' : 'none';
  if (submitBtn) submitBtn.style.display = currentStep === totalSteps ? '' : 'none';
}

// ── Validation ────────────────────────────────────────────────
function validateCurrentStep() {
  if (currentStep === 1) {
    const name  = document.getElementById('f-name').value.trim();
    const phone = document.getElementById('f-phone').value.trim();
    if (!name || name.length < 2)           { showToast('Please enter your name (min 2 characters)', 'error'); return false; }
    if (name.length > 20)                   { showToast('Name cannot exceed 20 characters', 'error'); return false; }
    if (!phone || !/^[0-9]{10}$/.test(phone)) { showToast('Please enter a valid 10-digit phone number', 'error'); return false; }
    return true;
  }

  if (currentStep === 2) {
    const vehicle = document.getElementById('f-vehicle').value;
    if (resolvedLat === null || resolvedLng === null) {
      showToast('Please set your location — use Auto-Detect or enter coordinates manually', 'error');
      return false;
    }
    if (!vehicle) { showToast('Please select your vehicle type', 'error'); return false; }
    return true;
  }

  if (currentStep === 3) {
    const img1 = document.getElementById('f-image1').files[0];
    const img2 = document.getElementById('f-image2').files[0];
    if (!img1 || !img2) { showToast('Please upload/take 2 different photos of the vehicle', 'error'); return false; }
    return true;
  }
  return true;
}

function nextStep()  { if (!validateCurrentStep()) return; if (currentStep < totalSteps) { currentStep++; updateStep(); } }
function prevStep()  { if (currentStep > 1) { currentStep--; updateStep(); } }

// ── Set resolved coordinates and update display ───────────────
function setLocation(lat, lng, label) {
  resolvedLat = lat;
  resolvedLng = lng;

  const display = document.getElementById('f-location-display');
  if (display) {
    display.textContent = label || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    display.classList.add('loc-set');
  }

  // Update map if Google Maps is loaded
  try {
    if (typeof google !== 'undefined' && google.maps) {
      const pos = new google.maps.LatLng(lat, lng);
      if (!modalMap) {
        modalMap = new google.maps.Map(document.getElementById('modal-map'), { center: pos, zoom: 15 });
      } else {
        modalMap.setCenter(pos);
        modalMap.setZoom(15);
      }
      if (modalMarker) modalMarker.setPosition(pos);
      else modalMarker = new google.maps.Marker({ position: pos, map: modalMap });
    }
  } catch (e) { /* map not loaded */ }
}

// ── GPS auto-detect ───────────────────────────────────────────
function detectLocation() {
  const btn = document.getElementById('btn-detect');
  if (!navigator.geolocation) {
    showToast('Geolocation not supported by your browser', 'error');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Detecting…';

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      setLocation(lat, lng, `📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-check"></i> Detected';
      setTimeout(() => { btn.innerHTML = '<i class="fas fa-crosshairs"></i> Auto-Detect'; }, 2500);
      showToast('Location detected successfully!', 'success');
      hideManualFields(); // collapse manual panel after successful GPS
    },
    () => {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-crosshairs"></i> Auto-Detect';
      showToast('Unable to detect location — try entering coordinates manually below.', 'error');
      showManualFields(); // auto-open manual fields on GPS failure
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// ── Manual lat/lng entry ──────────────────────────────────────
function toggleManualFields() {
  const panel = document.getElementById('manual-coords-panel');
  if (!panel) return;
  const isHidden = panel.style.display === 'none' || panel.style.display === '';
  if (isHidden) showManualFields();
  else hideManualFields();
}

function showManualFields() {
  const panel = document.getElementById('manual-coords-panel');
  const toggleBtn = document.getElementById('btn-manual-toggle');
  if (panel) panel.style.display = 'block';
  if (toggleBtn) toggleBtn.innerHTML = '<i class="fas fa-keyboard"></i> Hide Manual Entry';
}

function hideManualFields() {
  const panel = document.getElementById('manual-coords-panel');
  const toggleBtn = document.getElementById('btn-manual-toggle');
  if (panel) panel.style.display = 'none';
  if (toggleBtn) toggleBtn.innerHTML = '<i class="fas fa-keyboard"></i> Enter Manually';
}

function applyManualCoords() {
  const latInput = document.getElementById('f-manual-lat');
  const lngInput = document.getElementById('f-manual-lng');
  const latErr   = document.getElementById('lat-error');
  const lngErr   = document.getElementById('lng-error');

  // Clear previous errors
  latErr.textContent = '';
  lngErr.textContent = '';

  const latVal = latInput.value.trim();
  const lngVal = lngInput.value.trim();

  let valid = true;

  const lat = parseFloat(latVal);
  if (!latVal || isNaN(lat) || lat < -90 || lat > 90) {
    latErr.textContent = 'Enter a number between −90 and 90';
    valid = false;
  }

  const lng = parseFloat(lngVal);
  if (!lngVal || isNaN(lng) || lng < -180 || lng > 180) {
    lngErr.textContent = 'Enter a number between −180 and 180';
    valid = false;
  }

  if (!valid) return;

  setLocation(lat, lng, `📌 ${lat.toFixed(6)}, ${lng.toFixed(6)} (manual)`);
  showToast(`Coordinates set: ${lat.toFixed(5)}, ${lng.toFixed(5)}`, 'success');
}

// ── Image upload preview ──────────────────────────────────────
function handleImageUpload(input, previewId) {
  const preview = document.getElementById(previewId);
  const zone    = input.parentElement;
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];

  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowed.includes(file.type)) { showToast('Invalid format. Use JPG, PNG, GIF, or WebP', 'error'); input.value = ''; return; }
  if (file.size > 5 * 1024 * 1024) { showToast('Image must be under 5MB', 'error'); input.value = ''; return; }

  const reader = new FileReader();
  reader.onload = (e) => {
    preview.innerHTML = `
      <div style="position:relative;display:inline-block;width:100%;">
        <img src="${e.target.result}" alt="Preview"
             style="max-width:100%;max-height:80px;border-radius:6px;display:block;margin:0 auto;">
        <button type="button" onclick="removeImage('${input.id}','${previewId}',event)"
                style="position:absolute;top:0;right:0;background:#333;color:#fff;border:none;
                       border-radius:50%;width:18px;height:18px;font-size:10px;cursor:pointer;
                       display:flex;align-items:center;justify-content:center;z-index:10;padding:0;line-height:1;">
          ✕
        </button>
      </div>`;
    if (zone.querySelector('p')) zone.querySelector('p').textContent = file.name.substring(0, 15) + '…';
  };
  reader.readAsDataURL(file);
}

function removeImage(inputId, previewId, event) {
  if (event) { event.stopPropagation(); event.preventDefault(); }
  const input   = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  if (input) {
    input.value = '';
    const zone = input.parentElement;
    if (zone?.querySelector('p')) {
      zone.querySelector('p').textContent = inputId.endsWith('1') ? 'Photo 1' : 'Photo 2';
    }
  }
  if (preview) preview.innerHTML = '';
}

// ── Form submission ───────────────────────────────────────────
async function submitForm(e) {
  e.preventDefault();
  if (!validateCurrentStep()) return;

  const submitBtn = document.getElementById('btn-submit');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending…';

  const formData = new FormData();
  formData.append('name',      document.getElementById('f-name').value.trim());
  formData.append('phone',     document.getElementById('f-phone').value.trim());
  formData.append('latitude',  resolvedLat);
  formData.append('longitude', resolvedLng);
  formData.append('vehicle',   document.getElementById('f-vehicle').value);
  formData.append('needs',     document.getElementById('f-needs').value.trim());

  const imgFile1 = document.getElementById('f-image1').files[0];
  const imgFile2 = document.getElementById('f-image2').files[0];
  if (imgFile1) formData.append('image1', imgFile1);
  if (imgFile2) formData.append('image2', imgFile2);

  const apiBase = (window.location.hostname.includes('localhost') || window.location.hostname.includes('127.0.0.1'))
    ? 'http://localhost:5000'
    : (localStorage.getItem('BACKEND_URL') || 'https://roadside-helper-tc7q.onrender.com');

  try {
    const response = await fetch(`${apiBase}/api/request-assistance`, {
      method: 'POST',
      body: formData
    });
    const data = await response.json();
    if (response.ok) {
      showSuccess(data.matchInfo);
    } else {
      showToast('Error: ' + (data.message || 'Something went wrong'), 'error');
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Request';
    }
  } catch (err) {
    console.error('Submit error:', err);
    showToast('Network error. Please check your connection.', 'error');
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Request';
  }
}

function showSuccess(matchInfo) {
  document.querySelector('.modal-body').style.display = 'none';
  document.querySelector('.step-progress').style.display = 'none';
  document.querySelector('.form-actions-container').style.display = 'none';

  // Show mechanic info if matched
  const successEl = document.getElementById('form-success');
  const matchDetail = document.getElementById('success-match-detail');
  if (matchDetail) {
    if (matchInfo?.mechanic) {
      matchDetail.innerHTML = `
        <div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);
                    border-radius:10px;padding:12px 16px;margin-bottom:20px;text-align:left;">
          <p style="font-weight:600;font-size:13px;color:#16a34a;margin-bottom:4px;">
            ✅ Mechanic Assigned
          </p>
          <p style="font-size:14px;font-weight:600;">${matchInfo.mechanic.name}</p>
          <p style="font-size:13px;color:var(--text-secondary);">📞 ${matchInfo.mechanic.phone}</p>
        </div>`;
    } else {
      matchDetail.innerHTML = `
        <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);
                    border-radius:10px;padding:12px 16px;margin-bottom:20px;">
          <p style="font-size:13px;color:#b45309;">
            ⏳ We're finding the nearest mechanic — you'll be contacted shortly.
          </p>
        </div>`;
    }
  }

  successEl.classList.add('active');
}

// ── Toast notifications ───────────────────────────────────────
function showToast(message, type = 'info') {
  const existing = document.getElementById('__rh_toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = '__rh_toast';
  const bg     = type === 'success' ? 'rgba(34,197,94,0.15)'  : type === 'error' ? 'rgba(239,68,68,0.15)'  : 'rgba(245,158,11,0.15)';
  const border = type === 'success' ? '#22c55e'               : type === 'error' ? '#ef4444'               : '#f59e0b';
  const icon   = type === 'success' ? '✓'                     : type === 'error' ? '✕'                     : 'ℹ';
  toast.style.cssText = `
    position:fixed;top:20px;right:20px;z-index:9999;
    padding:14px 20px;border-radius:12px;
    background:${bg};border:1px solid ${border};
    color:#f0f0f5;font-size:14px;font-family:var(--font-body);
    backdrop-filter:blur(12px);
    display:flex;align-items:center;gap:10px;
    animation:fadeUp 0.35s ease;
    max-width:360px;
  `;
  toast.innerHTML = `<span style="font-weight:700;font-size:16px;color:${border}">${icon}</span>${message}`;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
/**
 * LandSafe AI - Comprehensive Client-side JavaScript Controller
 * Connects all 10 modules with Flask REST APIs, Leaflet GIS, Chart.js, and Geolocation.
 */

// Application Global State
const state = {
  currentTab: 'home',
  userLocation: null,          // { lat, lon, name, isLive }
  selectedHotspot: null,
  watchId: null,
  trackingActive: false,
  trackingSpeedKmh: 0,
  speedLimitThreshold: 60,
  adminLoggedIn: false,
  charts: {},
  map: null,
  mapMarkers: [],
  userMarker: null,
  audioMuted: false
};

// -------------------------------------------------------------
// DOM Initialization
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initMap();
  initTerrainUpload();
  initSatelliteSlider();
  initVehicleTracking();
  initEmergencySOS();
  initAdminAuth();
  checkSystemHealth();
  loadHomeAdminStats();
  
  // Default load baseline demo station (Shillong) for preview
  setTargetLocation(25.5788, 91.8933, "Shillong Peak Corridor, Meghalaya", false);
});

// -------------------------------------------------------------
// Tab Navigation Routing
// -------------------------------------------------------------
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetTab = item.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });

  const mobileToggle = document.getElementById('mobileMenuToggle');
  if (mobileToggle) {
    mobileToggle.addEventListener('click', () => {
      document.querySelector('.nav-links').classList.toggle('open');
    });
  }
}

function switchTab(tabId) {
  state.currentTab = tabId;
  
  // Always stop running vehicle simulations when navigating away from vehicle tab
  if (tabId !== 'vehicle') {
    stopVehicleSimulation();
    stopLiveGPSVehicleTracking();
  }

  // Update nav item active states
  document.querySelectorAll('.nav-item').forEach(el => {
    if (el.getAttribute('data-tab') === tabId) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  // Toggle tab pane visibility
  document.querySelectorAll('.tab-pane').forEach(pane => {
    if (pane.id === `tab-${tabId}`) {
      pane.classList.add('active');
    } else {
      pane.classList.remove('active');
    }
  });

  // Close mobile menu if open
  const navLinks = document.querySelector('.nav-links');
  if (navLinks) navLinks.classList.remove('open');

  // Trigger tab-specific refresh actions
  if (tabId === 'home') {
    loadHomeAdminStats();
  } else if (tabId === 'map' && state.map) {
    setTimeout(() => state.map.invalidateSize(), 200);
  } else if (tabId === 'all-india') {
    loadAllIndiaHotspots();
  } else if (tabId === 'weather') {
    refreshWeatherTab();
  } else if (tabId === 'forecast') {
    loadForecastTab();
  } else if (tabId === 'admin') {
    checkAdminDashboard();
  } else if (tabId === 'video-3d') {
    init3DVideoSuite();
  }
}

function quickNavLiveLocation() {
  switchTab('live');
  const btn = document.getElementById('navLiveLocationBtn');
  if (btn) btn.innerHTML = `<span>📍</span> Detecting...`;
  triggerLiveDeviceGPS();
}

// -------------------------------------------------------------
// Notifications & Web Audio Alerts
// -------------------------------------------------------------
function showToast(title, message, urgency = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  
  let borderColor = '#38bdf8';
  if (urgency === 'critical' || urgency === 'high') borderColor = '#ef4444';
  if (urgency === 'warning' || urgency === 'medium') borderColor = '#f59e0b';
  toast.style.borderLeft = `5px solid ${borderColor}`;

  toast.innerHTML = `
    <div style="font-weight: 700; font-size: 0.95rem; margin-bottom: 0.25rem;">${title}</div>
    <div style="font-size: 0.85rem; color: #94a3b8;">${message}</div>
  `;
  container.appendChild(toast);

  if (urgency === 'critical' && !state.audioMuted) {
    playAlertTone();
  }

  // Request browser notification if supported and granted
  if ("Notification" in window && Notification.permission === "granted" && (urgency === 'critical' || urgency === 'high')) {
    try {
      new Notification(title, { body: message, icon: '/static/images/brand_icon.png' });
    } catch(e) {}
  }

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 400);
  }, 6000);
}

function playAlertTone() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(650, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch(e) {}
}

function requestNotificationPermission() {
  if ("Notification" in window) {
    Notification.requestPermission().then(permission => {
      if (permission === "granted") {
        showToast("Notifications Enabled", "You will now receive high-risk early warnings.", "info");
      }
    });
  }
}

// -------------------------------------------------------------
// Module 3: Live GPS & Location Monitoring (Multi-Tier)
// -------------------------------------------------------------
function showLocationStatus(msg, type = 'info') {
  const box = document.getElementById('locationStatusBox');
  if (!box) return;
  box.style.display = 'block';
  
  if (type === 'success') {
    box.style.background = 'rgba(16, 185, 129, 0.15)';
    box.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    box.style.color = '#34d399';
  } else if (type === 'warning') {
    box.style.background = 'rgba(245, 158, 11, 0.15)';
    box.style.borderColor = 'rgba(245, 158, 11, 0.4)';
    box.style.color = '#fbbf24';
  } else {
    box.style.background = 'rgba(56, 189, 248, 0.12)';
    box.style.borderColor = 'rgba(56, 189, 248, 0.35)';
    box.style.color = '#38bdf8';
  }
  box.innerHTML = msg;
}

function triggerLiveDeviceGPS() {
  const btn = document.getElementById('btnLiveGPS');
  if (btn) btn.innerHTML = `<span class="pulse-dot"></span> Querying GPS...`;
  showLocationStatus("📡 Requesting device location... Please click 'Allow' if your browser prompts for permission.", "info");

  if (!navigator.geolocation) {
    showLocationStatus("⚠️ Browser geolocation not supported. Auto-detecting via Network IP...", "warning");
    detectLocationViaIP();
    return;
  }

  // Fast options suitable for desktop Wi-Fi and mobile networks
  const options = {
    enableHighAccuracy: false,
    timeout: 7000,
    maximumAge: 60000
  };

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      
      try {
        const locRes = await fetch(`/api/location?lat=${lat}&lon=${lon}`).then(r => r.json());
        const locName = locRes.location_name || `GPS: ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
        setTargetLocation(lat, lon, locName, true);
        showLocationStatus(`✅ Live Device GPS Locked: <strong>${locName}</strong> (${lat.toFixed(4)}° N, ${lon.toFixed(4)}° E)`, "success");
        showToast("Live GPS Locked", `Location set to ${locName}`, "info");
      } catch (e) {
        setTargetLocation(lat, lon, `Coordinates: ${lat.toFixed(4)}, ${lon.toFixed(4)}`, true);
        showLocationStatus(`✅ Live Device GPS Locked: ${lat.toFixed(4)}° N, ${lon.toFixed(4)}° E`, "success");
      }
      
      if (btn) btn.innerHTML = `<span>📍</span> Device GPS`;
      await runLiveRiskPipeline();
    },
    async (err) => {
      if (btn) btn.innerHTML = `<span>📍</span> Device GPS`;
      let reason = "Location unavailable";
      if (err.code === 1) { // PERMISSION_DENIED
        reason = "Browser location permission was denied.";
      } else if (err.code === 2) { // POSITION_UNAVAILABLE
        reason = "Device GPS sensor unavailable on this computer.";
      } else if (err.code === 3) { // TIMEOUT
        reason = "Device GPS request timed out.";
      }

      showLocationStatus(`⚠️ ${reason} Switching automatically to Network IP location...`, "warning");
      showToast("GPS Notice", `${reason} Auto-detecting via Network IP.`, "warning");
      
      // Automatic seamless fallback to network IP location
      await detectLocationViaIP();
    },
    options
  );
}

async function detectLocationViaIP() {
  const btn = document.getElementById('btnDetectIP');
  if (btn) btn.innerHTML = `<span class="pulse-dot"></span> Detecting IP...`;
  showLocationStatus("🌐 Detecting location from public network IP...", "info");

  try {
    const res = await fetch('/api/location/ip');
    const data = await res.json();
    if (btn) btn.innerHTML = `<span>🌐</span> Detect via Network/IP`;

    if (data.status === 'success') {
      const locName = data.location_name || `${data.city}, ${data.region}`;
      setTargetLocation(data.latitude, data.longitude, locName, true);
      showLocationStatus(`✅ Live Network Location Locked: <strong>${locName}</strong> (${data.latitude.toFixed(4)}° N, ${data.longitude.toFixed(4)}° E)`, "success");
      showToast("Live Location Locked", `Network location: ${locName}`, "info");
      await runLiveRiskPipeline();
    } else {
      showLocationStatus("⚠️ IP detection unavailable. Please search your city using the search bar above.", "warning");
    }
  } catch (err) {
    if (btn) btn.innerHTML = `<span>🌐</span> Detect via Network/IP`;
    showLocationStatus("⚠️ Network lookup error. Please search or select a city manually.", "warning");
  }
}

async function searchAndSelectLocation() {
  const input = document.getElementById('locationSearchInput');
  if (!input) return;
  const query = input.value.trim();
  if (!query) {
    showToast("Search", "Please type a city, district, or PIN code.", "info");
    return;
  }

  showLocationStatus(`Searching for "${query}"...`, "info");
  const resultsContainer = document.getElementById('locationSearchResults');

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    
    if (resultsContainer) {
      resultsContainer.innerHTML = '';
      if (data.status === 'success' && data.results && data.results.length > 0) {
        resultsContainer.style.display = 'block';
        data.results.forEach(item => {
          const row = document.createElement('div');
          row.className = 'search-result-item';
          row.innerHTML = `
            <div><strong>${item.display_name}</strong></div>
            <div style="font-size: 0.75rem; color: #38bdf8;">Lat: ${item.latitude.toFixed(4)}, Lon: ${item.longitude.toFixed(4)}</div>
          `;
          row.onclick = () => {
            resultsContainer.style.display = 'none';
            input.value = item.display_name.split(',')[0];
            setTargetLocation(item.latitude, item.longitude, item.display_name, true);
            showLocationStatus(`✅ Selected Location: <strong>${item.display_name}</strong>`, "success");
            runLiveRiskPipeline();
          };
          resultsContainer.appendChild(row);
        });
        showLocationStatus(`Found ${data.results.length} locations. Click one from the list below to analyze.`, "info");
      } else {
        resultsContainer.style.display = 'none';
        showLocationStatus(`No locations found for "${query}". Try another city name or state.`, "warning");
      }
    }
  } catch (e) {
    showLocationStatus("Search service error. Please try again.", "warning");
  }
}

// Close search dropdown on click outside
document.addEventListener('click', (e) => {
  const container = document.getElementById('locationSearchResults');
  const input = document.getElementById('locationSearchInput');
  if (container && e.target !== container && e.target !== input) {
    container.style.display = 'none';
  }
});

function setTargetLocation(lat, lon, name, isLive = false) {
  state.userLocation = { lat, lon, name, isLive };
  
  // Update coordinate displays
  const latDisplay = document.getElementById('dispLatitude');
  const lonDisplay = document.getElementById('dispLongitude');
  const nameDisplay = document.getElementById('dispLocationName');
  const liveTag = document.getElementById('dispLiveStatusTag');
  
  if (latDisplay) latDisplay.textContent = `${lat.toFixed(4)}° N`;
  if (lonDisplay) lonDisplay.textContent = `${lon.toFixed(4)}° E`;
  if (nameDisplay) nameDisplay.textContent = name;
  if (liveTag) {
    liveTag.textContent = isLive ? "LIVE LOCATION (ACTIVE)" : "MONITORING HOTSPOT";
    liveTag.style.color = isLive ? "var(--color-blue)" : "var(--color-cyan)";
  }

  // Update navbar live location pill
  const navBtn = document.getElementById('navLiveLocationBtn');
  if (navBtn) {
    const shortName = name.split(',')[0].slice(0, 16);
    navBtn.innerHTML = `<span>📍</span> ${shortName}`;
  }

  // Update map marker
  updateUserMapMarker(lat, lon, name, isLive);
}

// -------------------------------------------------------------
// Module 1 & 2: Live Weather Telemetry & AI Landslide Risk Prediction
// -------------------------------------------------------------
async function runLiveRiskPipeline() {
  if (!state.userLocation) {
    showToast("Select Location", "Please select or detect a location first.", "info");
    return;
  }

  const loader = document.getElementById('riskLoader');
  const riskResultBox = document.getElementById('riskResultBox');
  if (loader) loader.style.display = 'block';

  try {
    const payload = {
      latitude: state.userLocation.lat,
      longitude: state.userLocation.lon,
      location_name: state.userLocation.name,
      is_live: state.userLocation.isLive
    };

    const resp = await fetch('/api/live-risk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const data = await resp.json();
    if (loader) loader.style.display = 'none';

    if (data.status === 'success') {
      renderTelemetryMetrics(data.weather, data.topography);
      renderPredictionResults(data.prediction, data.alert);
      
      // If High Risk, show proactive banner & toast
      if (data.prediction.risk_level === 'HIGH RISK') {
        showToast("CRITICAL WARNING", data.alert.body, "critical");
        document.getElementById('emergencyHighBanner').style.display = 'flex';
      } else {
        document.getElementById('emergencyHighBanner').style.display = 'none';
      }
    } else {
      showToast("Prediction Error", data.message || "Failed to analyze risk.", "warning");
    }
  } catch (err) {
    if (loader) loader.style.display = 'none';
    showToast("Network Error", "Unable to connect to LandSafe backend.", "warning");
  }
}

function renderTelemetryMetrics(weather, topography) {
  // Update environmental metric cards
  document.getElementById('metricTemp').textContent = weather.temperature_c !== null ? `${weather.temperature_c}°C` : 'N/A';
  document.getElementById('metricHumidity').textContent = weather.humidity_pct !== null ? `${weather.humidity_pct}%` : 'N/A';
  document.getElementById('metricRain24h').textContent = `${weather.rainfall_24h_mm} mm`;
  document.getElementById('metricRain72h').textContent = `${weather.rainfall_72h_accum_mm} mm`;
  document.getElementById('metricSoilMoist').textContent = weather.soil_moisture_pct !== null ? `${weather.soil_moisture_pct}%` : 'N/A';
  document.getElementById('metricElev').textContent = `${topography.elevation_m} m`;
  document.getElementById('metricSlope').textContent = `${topography.slope_degrees}°`;
  document.getElementById('metricWeatherDesc').textContent = weather.weather_description || 'Clear';
  document.getElementById('metricWindSpeed').textContent = `${weather.wind_speed_kmh} km/h`;
  document.getElementById('metricLastUpdated').textContent = new Date().toLocaleTimeString();
}

function renderPredictionResults(prediction, alert) {
  const badge = document.getElementById('riskBadge');
  const scoreVal = document.getElementById('riskScoreVal');
  const confidenceVal = document.getElementById('riskConfidenceVal');
  const primaryFactorVal = document.getElementById('riskPrimaryFactorVal');
  const recomVal = document.getElementById('riskRecommendationsVal');
  
  badge.textContent = prediction.risk_level;
  badge.className = 'risk-badge';
  
  if (prediction.risk_level === 'HIGH RISK') {
    badge.classList.add('risk-high');
  } else if (prediction.risk_level === 'MEDIUM RISK') {
    badge.classList.add('risk-medium');
  } else {
    badge.classList.add('risk-low');
  }

  scoreVal.textContent = `${prediction.risk_score} / 100`;
  confidenceVal.textContent = `${(prediction.confidence * 100).toFixed(1)}%`;
  primaryFactorVal.textContent = prediction.primary_factor;
  recomVal.textContent = prediction.recommendations;

  // Probability Breakdown bars
  const pLow = (prediction.probabilities.low_risk * 100).toFixed(1);
  const pMed = (prediction.probabilities.medium_risk * 100).toFixed(1);
  const pHigh = (prediction.probabilities.high_risk * 100).toFixed(1);

  document.getElementById('barLowFill').style.width = `${pLow}%`;
  document.getElementById('barLowText').textContent = `${pLow}%`;
  
  document.getElementById('barMedFill').style.width = `${pMed}%`;
  document.getElementById('barMedText').textContent = `${pMed}%`;
  
  document.getElementById('barHighFill').style.width = `${pHigh}%`;
  document.getElementById('barHighText').textContent = `${pHigh}%`;
}

// -------------------------------------------------------------
// Module 4: Interactive Landslide Risk Map (Leaflet.js)
// -------------------------------------------------------------
function initMap() {
  const mapElement = document.getElementById('riskMap');
  if (!mapElement) return;

  // Center on North-Eastern Region (NER) India coordinates
  state.map = L.map('riskMap').setView([26.0, 92.5], 7);

  // OpenStreetMap Tile Layer
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors | LandSafe AI'
  }).addTo(state.map);

  // Click on map to evaluate risk at any arbitrary location
  state.map.on('click', async (e) => {
    const lat = e.latlng.lat;
    const lon = e.latlng.lng;
    
    showToast("Analyzing Point", `Inspecting coordinates: ${lat.toFixed(4)}, ${lon.toFixed(4)}...`, "info");
    
    // Reverse geocode
    const locRes = await fetch(`/api/location?lat=${lat}&lon=${lon}`).then(r => r.json()).catch(() => ({}));
    const placeName = locRes.location_name || `Point (${lat.toFixed(3)}, ${lon.toFixed(3)})`;
    
    setTargetLocation(lat, lon, placeName, false);
    await runLiveRiskPipeline();
    
    // Popup on map
    L.popup()
      .setLatLng(e.latlng)
      .setContent(`
        <div class="map-popup">
          <h4>${placeName}</h4>
          <p>Lat: ${lat.toFixed(4)} | Lon: ${lon.toFixed(4)}</p>
          <button class="btn btn-primary btn-sm" onclick="switchTab('live')">View Full AI Risk</button>
        </div>
      `)
      .openOn(state.map);
  });

  // Load monitoring stations
  loadMapStations();
}

async function loadMapStations() {
  try {
    const resp = await fetch('/api/risk-map');
    const data = await resp.json();
    if (data.status === 'success') {
      const stations = data.stations || [];
      stations.forEach(st => {
        const markerColor = st.is_high_risk_zone ? '#ef4444' : (st.base_slope_deg > 20 ? '#f59e0b' : '#10b981');
        
        const circleMarker = L.circleMarker([st.latitude, st.longitude], {
          radius: 9,
          fillColor: markerColor,
          color: '#ffffff',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.85
        }).addTo(state.map);

        circleMarker.bindPopup(`
          <div class="map-popup">
            <h4>${st.name}</h4>
            <p><strong>State:</strong> ${st.state}</p>
            <p><strong>Base Slope:</strong> ${st.base_slope_deg}° | <strong>Elevation:</strong> ${st.elevation_m}m</p>
            <p style="font-size:0.75rem; color:#94a3b8;">${st.description}</p>
            <button class="btn btn-primary btn-sm" onclick="selectHotspot(${st.latitude}, ${st.longitude}, '${st.name}')">Inspect Station</button>
          </div>
        `);
        state.mapMarkers.push(circleMarker);
      });
    }
  } catch(e) {}
}

function updateUserMapMarker(lat, lon, name, isLive) {
  if (!state.map) return;

  if (state.userMarker) {
    state.map.removeLayer(state.userMarker);
  }

  const markerColor = isLive ? '#3b82f6' : '#06b6d4';
  state.userMarker = L.circleMarker([lat, lon], {
    radius: 11,
    fillColor: markerColor,
    color: '#ffffff',
    weight: 3,
    opacity: 1,
    fillOpacity: 0.95
  }).addTo(state.map);

  state.userMarker.bindPopup(`
    <div class="map-popup">
      <h4>${isLive ? '📍 Current GPS Device' : '📍 Selected Hotspot'}</h4>
      <p>${name}</p>
      <p>Lat: ${lat.toFixed(4)} | Lon: ${lon.toFixed(4)}</p>
    </div>
  `).openPopup();

  state.map.setView([lat, lon], 9);
}

function selectHotspot(lat, lon, name) {
  setTargetLocation(lat, lon, name, false);
  switchTab('live');
  runLiveRiskPipeline();
}

function selectHotspotFromDropdown(val) {
  if (!val) return;
  const parts = val.split('|');
  const lat = parseFloat(parts[0]);
  const lon = parseFloat(parts[1]);
  const name = parts[2];
  selectHotspot(lat, lon, name);
}

// -------------------------------------------------------------
// Module 1: Weather Tab Visualizations (Chart.js)
// -------------------------------------------------------------
async function refreshWeatherTab() {
  if (!state.userLocation) return;
  const { lat, lon } = state.userLocation;

  try {
    const resp = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
    const data = await resp.json();
    if (data.status === 'success') {
      renderWeatherCharts(data);
    }
  } catch(e) {}
}

function renderWeatherCharts(weatherData) {
  const hourly = weatherData.hourly_timeline || {};
  const daily = weatherData.daily_forecast || {};

  const labelsHourly = (hourly.time || []).map(t => t.split('T')[1] || t);
  const precipHourly = hourly.precipitation || [];
  const soilHourly = hourly.soil_moisture || [];

  // Hourly Precipitation & Soil Moisture Chart
  const ctxPrecip = document.getElementById('chartHourlyPrecip');
  if (ctxPrecip) {
    if (state.charts.hourlyPrecip) state.charts.hourlyPrecip.destroy();
    state.charts.hourlyPrecip = new Chart(ctxPrecip, {
      type: 'bar',
      data: {
        labels: labelsHourly,
        datasets: [
          {
            label: 'Precipitation (mm)',
            data: precipHourly,
            backgroundColor: 'rgba(56, 189, 248, 0.7)',
            borderColor: '#38bdf8',
            borderWidth: 1,
            yAxisID: 'y'
          },
          {
            label: 'Soil Moisture (%)',
            data: soilHourly,
            type: 'line',
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            fill: true,
            tension: 0.3,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { labels: { color: '#94a3b8' } } },
        scales: {
          x: { ticks: { color: '#64748b' } },
          y: {
            title: { display: true, text: 'Rainfall (mm)', color: '#38bdf8' },
            ticks: { color: '#64748b' },
            grid: { color: 'rgba(255,255,255,0.05)' }
          },
          y1: {
            position: 'right',
            title: { display: true, text: 'Soil Moisture %', color: '#10b981' },
            ticks: { color: '#64748b' },
            min: 0,
            max: 100,
            grid: { drawOnChartArea: false }
          }
        }
      }
    });
  }

  // 7-Day Temperature Trend Chart
  const ctxTemp = document.getElementById('chartDailyTemp');
  if (ctxTemp) {
    if (state.charts.dailyTemp) state.charts.dailyTemp.destroy();
    state.charts.dailyTemp = new Chart(ctxTemp, {
      type: 'line',
      data: {
        labels: daily.time || [],
        datasets: [
          {
            label: 'Max Temp (°C)',
            data: daily.temp_max || [],
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            tension: 0.3
          },
          {
            label: 'Min Temp (°C)',
            data: daily.temp_min || [],
            borderColor: '#06b6d4',
            backgroundColor: 'rgba(6, 182, 212, 0.1)',
            tension: 0.3
          }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { labels: { color: '#94a3b8' } } },
        scales: {
          x: { ticks: { color: '#64748b' } },
          y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    });
  }
}

// -------------------------------------------------------------
// Module 5: Terrain Image Quality Analysis & Satellite Change Detection
// -------------------------------------------------------------
function initTerrainUpload() {
  const fileInput = document.getElementById('terrainFileInput');
  const dropzone = document.getElementById('terrainDropzone');
  if (!dropzone || !fileInput) return;

  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files;
      handleTerrainUpload();
    }
  });

  fileInput.addEventListener('change', handleTerrainUpload);
}

async function handleTerrainUpload() {
  const fileInput = document.getElementById('terrainFileInput');
  if (!fileInput.files.length) return;

  const file = fileInput.files[0];
  const formData = new FormData();
  formData.append('image', file);

  const loader = document.getElementById('terrainLoader');
  const reportBox = document.getElementById('terrainReportBox');
  if (loader) loader.style.display = 'block';

  try {
    const resp = await fetch('/api/terrain/analyze', {
      method: 'POST',
      body: formData
    });
    const data = await resp.json();
    if (loader) loader.style.display = 'none';

    if (data.status === 'success') {
      reportBox.style.display = 'block';
      document.getElementById('terrainPreviewImg').src = data.image_url;
      document.getElementById('resSharpness').textContent = `${data.sharpness_score} (${data.sharpness_label})`;
      document.getElementById('resBrightness').textContent = `${data.brightness_score} (${data.brightness_label})`;
      document.getElementById('resContrast').textContent = `${data.contrast_score} (${data.contrast_label})`;
      document.getElementById('resEdgeDensity').textContent = `${data.edge_density_pct}%`;
      document.getElementById('resUsability').textContent = data.review_status;
      document.getElementById('resNotes').textContent = data.assessment_summary;
      
      const badge = document.getElementById('resUsabilityBadge');
      if (data.is_usable) {
        badge.className = 'risk-badge risk-low';
        badge.textContent = "VALID FOR REVIEW";
      } else {
        badge.className = 'risk-badge risk-medium';
        badge.textContent = "QUALITY WARNING";
      }
      showToast("Analysis Complete", "OpenCV terrain image report generated.", "info");
    } else {
      showToast("Upload Error", data.message || "Failed to analyze image.", "warning");
    }
  } catch(e) {
    if (loader) loader.style.display = 'none';
    showToast("Error", "Terrain analysis service failed.", "warning");
  }
}

// Satellite Interactive Comparison Slider
function initSatelliteSlider() {
  const handle = document.getElementById('sliderHandle');
  const afterImg = document.getElementById('splitAfter');
  const container = document.getElementById('splitSlider');
  if (!handle || !afterImg || !container) return;

  let isDragging = false;

  const moveSlider = (clientX) => {
    const rect = container.getBoundingClientRect();
    let x = clientX - rect.left;
    x = Math.max(0, Math.min(x, rect.width));
    const percent = (x / rect.width) * 100;
    afterImg.style.width = `${percent}%`;
    handle.style.left = `${percent}%`;
  };

  container.addEventListener('mousedown', (e) => {
    isDragging = true;
    moveSlider(e.clientX);
  });
  window.addEventListener('mouseup', () => isDragging = false);
  window.addEventListener('mousemove', (e) => {
    if (isDragging) moveSlider(e.clientX);
  });

  // Touch support for mobile
  container.addEventListener('touchstart', (e) => {
    isDragging = true;
    moveSlider(e.touches[0].clientX);
  });
  window.addEventListener('touchend', () => isDragging = false);
  window.addEventListener('touchmove', (e) => {
    if (isDragging) moveSlider(e.touches[0].clientX);
  });
}

async function triggerBenchmarkSatelliteDiff() {
  try {
    const resp = await fetch('/api/satellite/compare', { method: 'POST' });
    const data = await resp.json();
    if (data.status === 'success') {
      document.getElementById('satChangePct').textContent = `${data.changed_area_percentage}%`;
      document.getElementById('satSeverity').textContent = data.change_severity;
      document.getElementById('satMethod').textContent = data.methodology;
      document.getElementById('splitBefore').src = data.before_url;
      document.getElementById('splitAfterImg').src = data.after_url;
      document.getElementById('satelliteDiffImg').src = data.diff_url;
      showToast("Satellite Change Calculated", `Detected ${data.changed_area_percentage}% surface alteration.`, "info");
    }
  } catch(e) {}
}

// -------------------------------------------------------------
// Module 6: Future Risk Forecasting (7-Day ML Horizon)
// -------------------------------------------------------------
async function loadForecastTab() {
  if (!state.userLocation) return;
  const { lat, lon } = state.userLocation;
  
  const loader = document.getElementById('forecastLoader');
  const container = document.getElementById('forecastCardsContainer');
  if (loader) loader.style.display = 'block';

  try {
    const resp = await fetch(`/api/forecast?lat=${lat}&lon=${lon}`);
    const data = await resp.json();
    if (loader) loader.style.display = 'none';

    if (data.status === 'success') {
      const timeline = data.forecast_timeline || [];
      container.innerHTML = '';

      const chartDates = [];
      const chartScores = [];

      timeline.forEach(item => {
        chartDates.push(item.date);
        chartScores.push(item.risk_score);

        const card = document.createElement('div');
        card.className = 'card';
        card.style.padding = '1rem';
        
        let riskColor = '#10b981';
        if (item.forecast_risk_level === 'HIGH RISK') riskColor = '#ef4444';
        if (item.forecast_risk_level === 'MEDIUM RISK') riskColor = '#f59e0b';

        card.innerHTML = `
          <div style="font-weight: 700; color: #38bdf8; margin-bottom: 0.35rem;">${item.date}</div>
          <div style="font-size: 1.1rem; font-weight: 800; color: ${riskColor}; margin-bottom: 0.5rem;">
            ${item.forecast_risk_level}
          </div>
          <div style="font-size: 0.8rem; color: #94a3b8; display: flex; flex-direction: column; gap: 0.2rem;">
            <div>Expected Rain: <strong>${item.expected_precipitation_mm} mm</strong></div>
            <div>72h Projected: <strong>${item.cumulative_72h_projected_mm} mm</strong></div>
            <div>Est. Soil Moisture: <strong>${item.estimated_soil_moisture_pct}%</strong></div>
            <div>Risk Score: <strong>${item.risk_score}/100</strong></div>
          </div>
        `;
        container.appendChild(card);
      });

      // Render Forecast Trend Chart
      const ctxTrend = document.getElementById('chartForecastTrend');
      if (ctxTrend) {
        if (state.charts.forecastTrend) state.charts.forecastTrend.destroy();
        state.charts.forecastTrend = new Chart(ctxTrend, {
          type: 'line',
          data: {
            labels: chartDates,
            datasets: [{
              label: 'Forecast Landslide Hazard Score (0-100)',
              data: chartScores,
              borderColor: '#ef4444',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              fill: true,
              tension: 0.35
            }]
          },
          options: {
            responsive: true,
            plugins: { legend: { labels: { color: '#94a3b8' } } },
            scales: {
              x: { ticks: { color: '#64748b' } },
              y: { min: 0, max: 100, ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
          }
        });
      }
    }
  } catch(e) {
    if (loader) loader.style.display = 'none';
  }
}

// -------------------------------------------------------------
// Module 8: GPS Vehicle Tracking & Safe-Route Support (Manual / Opt-in Only)
// -------------------------------------------------------------
let simInterval = null;
let vehicleMode = 'gps';
let vehicleSimPaused = false;
let vehicleSimStep = 0;
let liveGPSWatchId = null;
let lastGPSPos = null;
let lastGPSTime = null;

const highwaySimulationPoints = [
  { lat: 25.5788, lon: 91.8933, speed: 42, zone: "Shillong City Outskirts (Low Risk)" },
  { lat: 25.6800, lon: 91.8700, speed: 58, zone: "Barapani Umiam Lake Sector" },
  { lat: 25.7500, lon: 91.8400, speed: 67, zone: "Umsning Cut-Slope (Steep Gradient)" },
  { lat: 25.8600, lon: 91.8200, speed: 52, zone: "Nongpoh Valley Corridor" },
  { lat: 25.9900, lon: 91.7900, speed: 45, zone: "Byrnihat Escarpment (High Risk Hazard Zone)" }
];

function initVehicleTracking() {
  const threshInput = document.getElementById('inputSpeedThreshold');
  if (threshInput) {
    threshInput.addEventListener('change', (e) => {
      state.speedLimitThreshold = parseFloat(e.target.value) || 60;
      showToast("Setting Updated", `Speed limit warning threshold set to ${state.speedLimitThreshold} km/h`, "info");
    });
  }
}

function calculateHaversineDistanceM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function setVehicleMode(mode) {
  vehicleMode = mode;
  stopVehicleSimulation();
  stopLiveGPSVehicleTracking();

  const btnSim = document.getElementById('btnModeSim');
  const btnGPS = document.getElementById('btnModeGPS');
  const simBox = document.getElementById('simControlsBox');
  const gpsBox = document.getElementById('gpsControlsBox');

  if (mode === 'gps') {
    if (btnGPS) { btnGPS.style.background = 'rgba(16,185,129,0.18)'; btnGPS.style.borderColor = '#10b981'; btnGPS.style.color = '#34d399'; }
    if (btnSim) { btnSim.style.background = ''; btnSim.style.borderColor = ''; btnSim.style.color = ''; }
    if (simBox) simBox.style.display = 'none';
    if (gpsBox) gpsBox.style.display = 'flex';
    const statusEl = document.getElementById('vehicleStatusText');
    if (statusEl) {
      statusEl.textContent = "🛑 STANDBY: Real GPS Ready (बैठे रहने पर गति 0 KM/H रहेगी, चलने पर गति आएगी)";
      statusEl.style.color = "#94a3b8";
    }
  } else {
    if (btnSim) { btnSim.style.background = 'rgba(56,189,248,0.15)'; btnSim.style.borderColor = '#38bdf8'; btnSim.style.color = '#38bdf8'; }
    if (btnGPS) { btnGPS.style.background = ''; btnGPS.style.borderColor = ''; btnGPS.style.color = ''; }
    if (simBox) simBox.style.display = 'flex';
    if (gpsBox) gpsBox.style.display = 'none';
    const statusEl = document.getElementById('vehicleStatusText');
    if (statusEl) {
      statusEl.textContent = "ℹ️ DEMO SIMULATION: Optional college highway demonstration";
      statusEl.style.color = "#f59e0b";
    }
  }
}

function startVehicleSimulation() {
  if (simInterval) clearInterval(simInterval);
  state.trackingActive = true;
  vehicleSimPaused = false;
  
  const statusEl = document.getElementById('vehicleStatusText');
  if (statusEl) {
    statusEl.textContent = "SIMULATION RUNNING: Highway Journey Demo (NH-6 Meghalaya)";
    statusEl.style.color = "#10b981";
  }

  // Play simulation step-by-step
  simInterval = setInterval(() => {
    if (vehicleSimStep >= highwaySimulationPoints.length) {
      stopVehicleSimulation();
      showToast("Journey Completed", "Destination reached safely.", "info");
      return;
    }
    const pt = highwaySimulationPoints[vehicleSimStep];
    updateVehicleTelemetry(pt.speed, pt.lat, pt.lon, pt.zone);
    vehicleSimStep++;
  }, 3500);
}

function pauseVehicleSimulation() {
  if (simInterval) {
    clearInterval(simInterval);
    simInterval = null;
  }
  state.trackingActive = false;
  vehicleSimPaused = true;
  const statusEl = document.getElementById('vehicleStatusText');
  if (statusEl) {
    statusEl.textContent = `PAUSED: Journey demo paused at step ${vehicleSimStep}/${highwaySimulationPoints.length}`;
    statusEl.style.color = "#f59e0b";
  }
}

function stopVehicleSimulation() {
  if (simInterval) {
    clearInterval(simInterval);
    simInterval = null;
  }
  vehicleSimStep = 0;
  vehicleSimPaused = false;
  state.trackingActive = false;
  
  const statusEl = document.getElementById('vehicleStatusText');
  if (statusEl) {
    statusEl.textContent = "STANDBY: Demo stopped (Speed: 0 KM/H)";
    statusEl.style.color = "#94a3b8";
  }
  const dial = document.getElementById('vehicleSpeedDial');
  if (dial) dial.textContent = "0";
  const zone = document.getElementById('vehicleZoneName');
  if (zone) zone.textContent = "Standby";
  const alarm = document.getElementById('vehicleAlarm');
  if (alarm) alarm.style.display = "none";
}

function startLiveGPSVehicleTracking() {
  stopLiveGPSVehicleTracking();
  lastGPSPos = null;
  lastGPSTime = null;

  if (!navigator.geolocation) {
    showToast("GPS Error", "Geolocation hardware not supported on this device.", "warning");
    return;
  }
  
  const statusEl = document.getElementById('vehicleStatusText');
  if (statusEl) {
    statusEl.textContent = "📡 GPS CONNECTED: Calibrating sensor... बैठे हैं तो गति 0 KM/H रहेगी";
    statusEl.style.color = "#38bdf8";
  }

  liveGPSWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      let speedKmh = 0;
      const now = Date.now();

      // 1. Direct hardware speed if reported by GPS receiver
      if (pos.coords.speed !== null && pos.coords.speed !== undefined && !isNaN(pos.coords.speed)) {
        // Filter out stationary jitter (speed under 0.6 m/s is ~2 km/h drift when sitting in a room)
        if (pos.coords.speed < 0.6) {
          speedKmh = 0;
        } else {
          speedKmh = Math.round(pos.coords.speed * 3.6);
        }
      } else {
        // 2. Haversine delta calculation between GPS updates
        if (lastGPSPos && lastGPSTime) {
          const timeElapsedSec = (now - lastGPSTime) / 1000;
          if (timeElapsedSec >= 1.2) {
            const distMeters = calculateHaversineDistanceM(lastGPSPos.lat, lastGPSPos.lon, pos.coords.latitude, pos.coords.longitude);
            // If moved less than 4 meters, user is sitting still / indoor GPS drift -> strictly 0 km/h
            if (distMeters < 4.0) {
              speedKmh = 0;
            } else {
              speedKmh = Math.round((distMeters / timeElapsedSec) * 3.6);
            }
          }
        }
      }

      lastGPSPos = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      lastGPSTime = now;

      // Update UI with calculated speed
      const zoneLabel = speedKmh === 0 ? "Stationary (बैठे हुए हैं)" : "Live Moving Corridor";
      updateVehicleTelemetry(speedKmh, pos.coords.latitude, pos.coords.longitude, zoneLabel);

      const status = document.getElementById('vehicleStatusText');
      if (status) {
        if (speedKmh === 0) {
          status.textContent = "🛑 STATIONARY: Speed is 0 KM/H (आप बैठे हुए हैं — गति 0 KM/H)";
          status.style.color = "#10b981";
        } else {
          status.textContent = `🚗 IN MOTION: Live Speed is ${speedKmh} KM/H (वास्तविक गति: ${speedKmh} KM/H)`;
          status.style.color = "#38bdf8";
        }
      }
    },
    (err) => {
      showToast("GPS Notice", "Unable to lock satellite signal. Showing stationary 0 km/h.", "info");
      updateVehicleTelemetry(0, state.userLocation ? state.userLocation.lat : 25.5788, state.userLocation ? state.userLocation.lon : 91.8933, "Stationary Location");
      const status = document.getElementById('vehicleStatusText');
      if (status) {
        status.textContent = "🛑 STATIONARY: 0 KM/H (Satellites Locked - Device Idle)";
        status.style.color = "#10b981";
      }
    },
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 12000 }
  );
}

function stopLiveGPSVehicleTracking() {
  if (liveGPSWatchId !== null) {
    navigator.geolocation.clearWatch(liveGPSWatchId);
    liveGPSWatchId = null;
  }
  lastGPSPos = null;
  lastGPSTime = null;
  const dial = document.getElementById('vehicleSpeedDial');
  if (dial) dial.textContent = "0";
  const statusEl = document.getElementById('vehicleStatusText');
  if (statusEl) {
    statusEl.textContent = "🛑 STANDBY: Real GPS Speedometer Ready (बैठे रहने पर गति 0 KM/H रहेगी)";
    statusEl.style.color = "#94a3b8";
  }
}

function updateVehicleTelemetry(speed, lat, lon, zoneName) {
  const dial = document.getElementById('vehicleSpeedDial');
  if (dial) dial.textContent = speed;
  const zone = document.getElementById('vehicleZoneName');
  if (zone) zone.textContent = zoneName;
  const coords = document.getElementById('vehicleCoords');
  if (coords) coords.textContent = `${lat.toFixed(4)}° N, ${lon.toFixed(4)}° E`;

  const alarmBox = document.getElementById('vehicleAlarm');
  if (speed > state.speedLimitThreshold) {
    if (alarmBox) {
      alarmBox.style.display = 'block';
      alarmBox.textContent = `⚠️ SPEED WARNING: ${speed} km/h exceeds safe mountain threshold (${state.speedLimitThreshold} km/h). Reduce speed immediately!`;
    }
    // Only dispatch toast if the user is currently on the vehicle tab
    if (state.currentTab === 'vehicle') {
      showToast("Overspeed Alert", `Vehicle traveling at ${speed} km/h on mountain descent!`, "warning");
    }
  } else {
    if (alarmBox) alarmBox.style.display = 'none';
  }

  // Update map marker only if active on vehicle tab
  if (state.map && state.currentTab === 'vehicle') {
    updateUserMapMarker(lat, lon, `Vehicle: ${zoneName}`, true);
  }
}

// -------------------------------------------------------------
// Front Page Side Admin Dashboard Real-Time Loader
// -------------------------------------------------------------
async function loadHomeAdminStats() {
  try {
    const resp = await fetch('/api/admin/dashboard?demo=true');
    const data = await resp.json();
    if (data.status === 'success') {
      const s = data.stats;
      const elTotal = document.getElementById('homeStatTotalPreds');
      const elHigh = document.getElementById('homeStatHighRisk');
      if (elTotal) elTotal.textContent = s.total_predictions || 28;
      if (elHigh) elHigh.textContent = s.high_risk_count || 4;

      if (data.history && data.history.length > 0) {
        const latest = data.history[0];
        const elLoc = document.getElementById('homeAdminRecentLoc');
        const elBadge = document.getElementById('homeAdminRecentBadge');
        const elTime = document.getElementById('homeAdminRecentTime');
        if (elLoc) elLoc.textContent = latest.location_name || "Shillong Peak Corridor, Meghalaya";
        if (elBadge) {
          elBadge.textContent = `${latest.risk_level} (${latest.risk_score}/100)`;
          elBadge.className = 'risk-badge';
          if (latest.risk_level === 'HIGH RISK') elBadge.classList.add('risk-high');
          else if (latest.risk_level === 'MEDIUM RISK') elBadge.classList.add('risk-medium');
          else elBadge.classList.add('risk-low');
        }
        if (elTime) elTime.textContent = new Date(latest.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    }
  } catch(e) {}
}

// -------------------------------------------------------------
// Module 9: Emergency & Evacuation Support
// -------------------------------------------------------------
function initEmergencySOS() {
  const btnWhatsapp = document.getElementById('btnSendWhatsappSOS');
  const btnCopySOS = document.getElementById('btnCopySOS');

  const getSOSMessage = () => {
    const loc = state.userLocation || { lat: 25.5788, lon: 91.8933, name: "North-Eastern Region" };
    return `*EMERGENCY SOS - LANDSLIDE THREAT*\n\nUrgent assistance requested!\nLocation: ${loc.name}\nCoordinates: https://maps.google.com/?q=${loc.lat},${loc.lon}\n\nHigh risk conditions detected via LandSafe AI. Please dispatch emergency rescue / SDRF assistance.`;
  };

  if (btnWhatsapp) {
    btnWhatsapp.addEventListener('click', () => {
      const msg = encodeURIComponent(getSOSMessage());
      window.open(`https://api.whatsapp.com/send?text=${msg}`, '_blank');
    });
  }

  if (btnCopySOS) {
    btnCopySOS.addEventListener('click', () => {
      const msg = getSOSMessage();
      navigator.clipboard.writeText(msg).then(() => {
        showToast("Copied to Clipboard", "SOS emergency message copied.", "info");
      });
    });
  }
}

// -------------------------------------------------------------
// Module: All-India Search & Hazard Explorer
// -------------------------------------------------------------
let allIndiaStationsCache = [];

async function loadAllIndiaHotspots() {
  const grid = document.getElementById('allIndiaHotspotsGrid');
  if (!grid) return;

  try {
    if (allIndiaStationsCache.length === 0) {
      const resp = await fetch('/api/risk-map');
      const data = await resp.json();
      allIndiaStationsCache = data.stations || [];
    }
    renderAllIndiaHotspots(allIndiaStationsCache);
  } catch(e) {}
}

function filterAllIndiaHotspots(region, btnElement) {
  document.querySelectorAll('.region-filter-btn').forEach(b => b.classList.remove('active'));
  if (btnElement) btnElement.classList.add('active');

  if (region === 'all') {
    renderAllIndiaHotspots(allIndiaStationsCache);
  } else if (region === 'ner') {
    const filtered = allIndiaStationsCache.filter(s => s.station_code.startsWith('NER-'));
    renderAllIndiaHotspots(filtered);
  } else if (region === 'ghats') {
    const filtered = allIndiaStationsCache.filter(s => s.station_code.startsWith('WG-'));
    renderAllIndiaHotspots(filtered);
  } else if (region === 'himalaya') {
    const filtered = allIndiaStationsCache.filter(s => s.station_code.startsWith('HIM-'));
    renderAllIndiaHotspots(filtered);
  } else if (region === 'plains') {
    const filtered = allIndiaStationsCache.filter(s => s.station_code.startsWith('DEMO-'));
    renderAllIndiaHotspots(filtered);
  }
}

function renderAllIndiaHotspots(stations) {
  const grid = document.getElementById('allIndiaHotspotsGrid');
  if (!grid) return;
  grid.innerHTML = '';

  stations.forEach(st => {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.padding = '1.25rem';
    
    let tagColor = '#38bdf8';
    let regionTag = 'All-India Hotspot';
    if (st.station_code.startsWith('NER-')) { tagColor = '#10b981'; regionTag = 'North-Eastern Region'; }
    else if (st.station_code.startsWith('WG-')) { tagColor = '#f59e0b'; regionTag = 'Western Ghats'; }
    else if (st.station_code.startsWith('HIM-')) { tagColor = '#ef4444'; regionTag = 'Himalayan Corridor'; }
    else if (st.station_code.startsWith('DEMO-')) { tagColor = '#a78bfa'; regionTag = 'Plains Baseline'; }

    const isHigh = st.is_high_risk_zone === 1;
    const badgeText = isHigh ? 'HIGH VULNERABILITY' : (st.base_slope_deg > 15 ? 'MODERATE SLOPE' : 'LOW RISK BASELINE');
    const badgeClass = isHigh ? 'risk-high' : (st.base_slope_deg > 15 ? 'risk-medium' : 'risk-low');

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
        <span style="font-size: 0.72rem; font-weight: 700; color: ${tagColor}; text-transform: uppercase;">${regionTag}</span>
        <span class="risk-badge ${badgeClass}" style="font-size: 0.7rem; padding: 0.15rem 0.5rem;">${badgeText}</span>
      </div>
      <h4 style="font-size: 1.05rem; color: #ffffff; margin-bottom: 0.25rem;">${st.name}</h4>
      <div style="font-size: 0.82rem; color: #94a3b8; margin-bottom: 0.75rem;">${st.state}, India</div>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; background: rgba(14,25,52,0.65); padding: 0.65rem; border-radius: 6px; font-size: 0.78rem; margin-bottom: 0.75rem;">
        <div>Base Slope: <strong style="color: #38bdf8;">${st.base_slope_deg}°</strong></div>
        <div>Elevation: <strong style="color: #38bdf8;">${st.elevation_m}m</strong></div>
        <div>Lithology: <strong style="color: #cbd5e1;">Index ${st.lithology_index}/5</strong></div>
        <div>Lat/Lon: <span style="font-size: 0.72rem; color: #94a3b8;">${st.latitude.toFixed(2)}, ${st.longitude.toFixed(2)}</span></div>
      </div>

      <p style="font-size: 0.8rem; color: #94a3b8; line-height: 1.45; margin-bottom: 1rem; flex: 1;">
        ${st.description}
      </p>

      <button class="btn btn-primary btn-sm" style="width: 100%; margin-top: auto;" onclick="selectHotspot(${st.latitude}, ${st.longitude}, '${st.name}, ${st.state}')">
        ⚡ Check Live Risk & Weather
      </button>
    `;
    grid.appendChild(card);
  });
}

async function executeAllIndiaSearch() {
  const input = document.getElementById('allIndiaSearchInput');
  if (!input) return;
  const q = input.value.trim();
  if (!q) {
    showToast("Search", "Please type an Indian city, district or PIN code.", "info");
    return;
  }

  const dropdown = document.getElementById('allIndiaSearchResults');
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    if (dropdown) {
      dropdown.innerHTML = '';
      if (data.status === 'success' && data.results && data.results.length > 0) {
        dropdown.style.display = 'block';
        data.results.forEach(item => {
          const div = document.createElement('div');
          div.className = 'search-result-item';
          div.innerHTML = `
            <div><strong>${item.display_name}</strong></div>
            <div style="font-size: 0.75rem; color: #38bdf8;">Coordinates: ${item.latitude.toFixed(4)}° N, ${item.longitude.toFixed(4)}° E</div>
          `;
          div.onclick = () => {
            dropdown.style.display = 'none';
            selectHotspot(item.latitude, item.longitude, item.display_name);
          };
          dropdown.appendChild(div);
        });
      } else {
        dropdown.style.display = 'block';
        dropdown.innerHTML = `<div class="search-result-item" style="color: #f59e0b;">No matching locations found for "${q}".</div>`;
      }
    }
  } catch(e) {}
}

// Close All-India search dropdown on click outside
document.addEventListener('click', (e) => {
  const d = document.getElementById('allIndiaSearchResults');
  const inp = document.getElementById('allIndiaSearchInput');
  if (d && e.target !== d && e.target !== inp) {
    d.style.display = 'none';
  }
});

// -------------------------------------------------------------
// Module 10: Admin Dashboard & Prediction History
// -------------------------------------------------------------
let adminHistoryRecordsCache = [];

function initAdminAuth() {
  const form = document.getElementById('adminLoginForm');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const u = document.getElementById('adminUsername').value;
      const p = document.getElementById('adminPassword').value;

      try {
        const resp = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: u, password: p })
        });
        const data = await resp.json();
        if (data.status === 'success') {
          state.adminLoggedIn = true;
          document.getElementById('adminLoginCard').style.display = 'none';
          document.getElementById('adminDashboardView').style.display = 'block';
          showToast("Admin Authenticated", "Logged in as Administrator.", "info");
          loadAdminDashboardStats();
          loadHistoryTable();
        } else {
          showToast("Login Failed", "Invalid administrator credentials.", "warning");
        }
      } catch(e) {
        showToast("Error", "Authentication endpoint unreachable.", "warning");
      }
    });
  }

  document.getElementById('btnAdminLogout')?.addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    state.adminLoggedIn = false;
    document.getElementById('adminLoginCard').style.display = 'block';
    document.getElementById('adminDashboardView').style.display = 'none';
    showToast("Logged Out", "Administrator session closed.", "info");
  });
}

function enterAdminDemoMode(username = "adityacreative64@gmail.com") {
  state.adminLoggedIn = true;
  document.getElementById('adminLoginCard').style.display = 'none';
  document.getElementById('adminDashboardView').style.display = 'block';
  document.getElementById('adminUserDisplayName').textContent = username;
  showToast("Admin Authenticated", `Logged in as ${username}`, "info");
  loadAdminDashboardStats();
  loadHistoryTable();
}

async function checkAdminDashboard() {
  if (state.adminLoggedIn) {
    loadAdminDashboardStats();
    loadHistoryTable();
  }
}

async function loadAdminDashboardStats() {
  try {
    const resp = await fetch('/api/admin/dashboard?demo=true');
    const data = await resp.json();
    if (data.status === 'success') {
      const s = data.stats;
      document.getElementById('statTotalPreds').textContent = s.total_predictions;
      document.getElementById('statHighRisk').textContent = s.high_risk_count;
      document.getElementById('statMedRisk').textContent = s.medium_risk_count;
      document.getElementById('statLowRisk').textContent = s.low_risk_count;
      document.getElementById('statAlerts').textContent = s.total_alerts;
      document.getElementById('statStationsCount').textContent = s.active_stations_count || 19;
      if (document.getElementById('statDbSize')) {
        document.getElementById('statDbSize').textContent = `${s.database_size_kb || 56.0} KB`;
      }

      // Populate All-India Stations Registry in Admin Table
      const stBody = document.getElementById('adminStationsTableBody');
      if (stBody && s.monitoring_stations) {
        stBody.innerHTML = '';
        s.monitoring_stations.forEach(stn => {
          const tr = document.createElement('tr');
          const isHigh = stn.is_high_risk_zone === 1;
          const statusBadge = isHigh ? '<span class="risk-badge risk-high" style="font-size:0.7rem; padding:0.15rem 0.5rem;">CRITICAL</span>' : '<span class="risk-badge risk-low" style="font-size:0.7rem; padding:0.15rem 0.5rem;">MONITORED</span>';
          tr.innerHTML = `
            <td><code>${stn.station_code}</code></td>
            <td><strong>${stn.name}</strong></td>
            <td>${stn.state}</td>
            <td style="font-family:monospace; font-size:0.8rem; color:#38bdf8;">${stn.latitude.toFixed(3)}, ${stn.longitude.toFixed(3)}</td>
            <td>${stn.elevation_m}m</td>
            <td>${stn.base_slope_deg}°</td>
            <td>Index ${stn.lithology_index}/5</td>
            <td>${statusBadge}</td>
          `;
          stBody.appendChild(tr);
        });
      }

      // Populate Alerts List in Admin
      const alertsList = document.getElementById('adminAlertsList');
      if (alertsList && s.recent_alerts) {
        alertsList.innerHTML = '';
        if (s.recent_alerts.length === 0) {
          alertsList.innerHTML = '<div style="font-size:0.85rem; color:#94a3b8; padding:0.5rem;">No active alerts recorded.</div>';
        } else {
          s.recent_alerts.forEach(al => {
            const row = document.createElement('div');
            row.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 0.6rem; border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 0.82rem;";
            const isHigh = al.risk_level === 'HIGH RISK';
            const badgeClass = isHigh ? 'risk-high' : 'risk-medium';
            const ackBtn = al.acknowledged ? '<span style="color:#10b981;">✓ ACK</span>' : `<button class="btn btn-secondary btn-sm" style="padding:0.15rem 0.4rem; font-size:0.7rem;" onclick="adminAckAlert(${al.id})">Acknowledge</button>`;
            
            row.innerHTML = `
              <div style="flex: 1; padding-right: 0.5rem;">
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                  <span class="risk-badge ${badgeClass}" style="font-size:0.65rem; padding:0.1rem 0.4rem;">${al.risk_level}</span>
                  <strong>${al.location_name}</strong>
                  <span style="font-size:0.7rem; color:#64748b;">${al.timestamp ? al.timestamp.slice(11, 19) : ''}</span>
                </div>
                <div style="font-size:0.75rem; color:#94a3b8; margin-top:0.2rem;">${al.message}</div>
              </div>
              <div>${ackBtn}</div>
            `;
            alertsList.appendChild(row);
          });
        }
      }

      // Populate Thresholds Form
      if (s.system_settings) {
        if (document.getElementById('cfgSlope')) document.getElementById('cfgSlope').value = s.system_settings.slope_critical_threshold_deg || 30;
        if (document.getElementById('cfgRain24h')) document.getElementById('cfgRain24h').value = s.system_settings.rain_24h_critical_threshold_mm || 50;
        if (document.getElementById('cfgRain72h')) document.getElementById('cfgRain72h').value = s.system_settings.rain_72h_critical_threshold_mm || 120;
        if (document.getElementById('cfgSpeed')) document.getElementById('cfgSpeed').value = s.system_settings.speed_limit_threshold_kmh || 60;
      }

      // Risk Distribution Chart
      const ctxDist = document.getElementById('chartRiskDistribution');
      if (ctxDist) {
        if (state.charts.riskDist) state.charts.riskDist.destroy();
        state.charts.riskDist = new Chart(ctxDist, {
          type: 'doughnut',
          data: {
            labels: ['Low Risk', 'Medium Risk', 'High Risk'],
            datasets: [{
              data: [s.low_risk_count, s.medium_risk_count, s.high_risk_count],
              backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
              borderWidth: 0
            }]
          },
          options: {
            responsive: true,
            plugins: { legend: { labels: { color: '#94a3b8' } } }
          }
        });
      }
    }
  } catch(e) {}
}

async function adminAckAlert(alertId) {
  try {
    await fetch(`/api/alerts/ack/${alertId}`, { method: 'POST' });
    showToast("Alert Acknowledged", `Alert #${alertId} marked as reviewed.`, "info");
    loadAdminDashboardStats();
  } catch(e) {}
}

async function triggerAdminTestAlert() {
  try {
    const loc = state.userLocation ? state.userLocation.name : "All-India Emergency Drill Sector";
    const resp = await fetch('/api/admin/alert-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location_name: loc,
        risk_level: "HIGH RISK",
        message: "CRITICAL: Simulated high landslide risk drill activated from Admin Console."
      })
    });
    const d = await resp.json();
    if (d.status === 'success') {
      showToast("DRILL ALERT DISPATCHED", d.message, "critical");
      document.getElementById('emergencyHighBanner').style.display = 'flex';
      loadAdminDashboardStats();
    }
  } catch(e) {}
}

async function saveAdminThresholds(e) {
  e.preventDefault();
  const payload = {
    slope_critical_threshold_deg: document.getElementById('cfgSlope').value,
    rain_24h_critical_threshold_mm: document.getElementById('cfgRain24h').value,
    rain_72h_critical_threshold_mm: document.getElementById('cfgRain72h').value,
    speed_limit_threshold_kmh: document.getElementById('cfgSpeed').value
  };

  try {
    const resp = await fetch('/api/settings/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await resp.json();
    if (data.status === 'success') {
      showToast("Settings Saved", "System safety thresholds updated in database.", "info");
    }
  } catch(e) {}
}

async function loadHistoryTable() {
  try {
    const resp = await fetch('/api/history?limit=100');
    const data = await resp.json();
    if (data.status === 'success') {
      adminHistoryRecordsCache = data.predictions || [];
      renderHistoryTable(adminHistoryRecordsCache);
    }
  } catch(e) {}
}

function renderHistoryTable(records) {
  const tbody = document.getElementById('historyTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (records.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #94a3b8;">No matching prediction records found.</td></tr>';
    return;
  }

  records.forEach(p => {
    const tr = document.createElement('tr');
    let badgeClass = 'risk-low';
    if (p.risk_level === 'HIGH RISK') badgeClass = 'risk-high';
    if (p.risk_level === 'MEDIUM RISK') badgeClass = 'risk-medium';

    tr.innerHTML = `
      <td>#${p.id}</td>
      <td style="font-size:0.78rem;">${p.timestamp ? p.timestamp.replace('T', ' ').slice(0, 19) : ''}</td>
      <td><strong>${p.location_name}</strong></td>
      <td><span class="risk-badge ${badgeClass}" style="font-size:0.7rem; padding:0.15rem 0.5rem;">${p.risk_level}</span></td>
      <td>${p.risk_score}</td>
      <td>${p.slope_degrees}°</td>
      <td>${p.rainfall_24h_mm || p.rainfall_mm} mm</td>
      <td style="font-size:0.8rem; color:#94a3b8;">${p.primary_factor || 'Normal'}</td>
    `;
    tbody.appendChild(tr);
  });
}

function filterAdminHistoryTable(val) {
  const query = val.toLowerCase().trim();
  const filtered = adminHistoryRecordsCache.filter(p => {
    return (p.location_name && p.location_name.toLowerCase().includes(query)) ||
           (p.primary_factor && p.primary_factor.toLowerCase().includes(query));
  });
  renderHistoryTable(filtered);
}

function filterAdminHistoryRisk(risk) {
  if (!risk) {
    renderHistoryTable(adminHistoryRecordsCache);
  } else {
    const filtered = adminHistoryRecordsCache.filter(p => p.risk_level === risk);
    renderHistoryTable(filtered);
  }
}

async function checkSystemHealth() {
  try {
    const resp = await fetch('/api/health');
    const data = await resp.json();
    if (data.status === 'healthy') {
      document.getElementById('sysHealthDot')?.classList.add('pulse-dot');
    }
  } catch(e) {}
}

// =============================================================
// PASSWORD VISIBILITY TOGGLE (SECURITY)
// =============================================================
function togglePasswordEye(inputId, btn) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  if (inp.type === 'password') {
    inp.type = 'text';
    btn.textContent = '🔒 Hide';
  } else {
    inp.type = 'password';
    btn.textContent = '👁️ Show';
  }
}

// =============================================================
// 3D AI LANDSLIDE VIDEO & SIMULATION SUITE
// =============================================================
let current3DMode = 'hydro';
let interactive3DRunning = false;
let interactive3DAnimId = null;
let interactiveParticles = [];
let interactiveRuptureActive = false;
let interactiveCameraAngle = 0;
let interactiveIsDragging = false;
let interactiveLastMouseX = 0;

function init3DVideoSuite() {
  update3DSimPhysics();
  if (current3DMode === 'interactive') {
    startInteractive3DSimulator();
  }
}

function select3DVideoMode(mode) {
  current3DMode = mode;
  
  // Update button active state
  document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`btnMode${mode.charAt(0).toUpperCase() + mode.slice(1)}`);
  if (activeBtn) activeBtn.classList.add('active');

  const vidPlayer = document.getElementById('stageVideoPlayer');
  const iframePlayer = document.getElementById('stageIframePlayer');
  const canvasPlayer = document.getElementById('stageInteractiveCanvas');
  const modeTitle = document.getElementById('stageModeTitle');
  const modeBadge = document.getElementById('stageModeBadge');
  const sectorName = document.getElementById('hudSectorName');
  const hudLat = document.getElementById('hudLat');
  const hudLon = document.getElementById('hudLon');
  const hudConfidence = document.getElementById('hudConfidence');
  const hudFosValue = document.getElementById('hudFosValue');
  const hudFosStatus = document.getElementById('hudFosStatus');
  const hudShearText = document.getElementById('hudShearText');

  // Stop canvas animation if switching away from interactive
  if (mode !== 'interactive') {
    stopInteractive3DSimulator();
  }

  if (mode === 'hydro') {
    if (canvasPlayer) canvasPlayer.style.display = 'none';
    if (vidPlayer) { vidPlayer.pause(); vidPlayer.style.display = 'none'; }
    if (iframePlayer) {
      iframePlayer.style.display = 'block';
      iframePlayer.src = "https://www.youtube.com/embed/dSIYW_5Z3AM?autoplay=1&mute=1&loop=1&playlist=dSIYW_5Z3AM&controls=1";
    }
    if (modeTitle) modeTitle.textContent = "🌊 FLOW-3D Hydro Numerical Simulation";
    if (modeBadge) modeBadge.textContent = "CFD Simulation Stream";
    if (sectorName) sectorName.textContent = "NER-SECTOR-4 (UMIAM VALLEY, MEGHALAYA)";
    if (hudLat) hudLat.textContent = "25.6698° N";
    if (hudLon) hudLon.textContent = "91.8893° E";
    if (hudConfidence) hudConfidence.textContent = "96.4%";
    if (hudFosValue) { hudFosValue.textContent = "0.78"; hudFosValue.style.color = "#ef4444"; }
    if (hudFosStatus) { hudFosStatus.textContent = "(RUPTURE IN PROGRESS)"; hudFosStatus.style.color = "#ef4444"; }
    if (hudShearText) hudShearText.textContent = "SLOPE SHEAR STRESS: τ = 52.4 kPa";

  } else if (mode === 'usgs') {
    if (iframePlayer) { iframePlayer.src = ""; iframePlayer.style.display = 'none'; }
    if (canvasPlayer) canvasPlayer.style.display = 'none';
    if (vidPlayer) {
      vidPlayer.style.display = 'block';
      vidPlayer.src = "/static/videos/usgs_landslide_3d.mp4";
      vidPlayer.play().catch(() => {});
    }
    if (modeTitle) modeTitle.textContent = "⛰️ USGS 3D Rotational Slump (Finite Element Geotechnical Model)";
    if (modeBadge) modeBadge.textContent = "Local Offline HD Video";
    if (sectorName) sectorName.textContent = "NER-SECTOR-7 (SHILLONG CORRIDOR)";
    if (hudLat) hudLat.textContent = "25.5788° N";
    if (hudLon) hudLon.textContent = "91.8933° E";
    if (hudConfidence) hudConfidence.textContent = "94.7%";
    if (hudFosValue) { hudFosValue.textContent = "0.84"; hudFosValue.style.color = "#ef4444"; }
    if (hudFosStatus) { hudFosStatus.textContent = "(CIRCULAR SLIP ARC ACTIVATED)"; hudFosStatus.style.color = "#ef4444"; }
    if (hudShearText) hudShearText.textContent = "SLOPE SHEAR STRESS: τ = 46.8 kPa";

  } else if (mode === 'aerial') {
    if (iframePlayer) { iframePlayer.src = ""; iframePlayer.style.display = 'none'; }
    if (canvasPlayer) canvasPlayer.style.display = 'none';
    if (vidPlayer) {
      vidPlayer.style.display = 'block';
      vidPlayer.src = "/static/videos/mountain_landslide_aerial.webm";
      vidPlayer.play().catch(() => {});
    }
    if (modeTitle) modeTitle.textContent = "🚁 High-Altitude Aerial Drone Landslide Survey Footage";
    if (modeBadge) modeBadge.textContent = "Local Offline HD WebM";
    if (sectorName) sectorName.textContent = "NER-SECTOR-9 (JOWAI-NH6 HIGHWAY CORRIDOR)";
    if (hudLat) hudLat.textContent = "25.4516° N";
    if (hudLon) hudLon.textContent = "92.2039° E";
    if (hudConfidence) hudConfidence.textContent = "98.2%";
    if (hudFosValue) { hudFosValue.textContent = "0.62"; hudFosValue.style.color = "#ef4444"; }
    if (hudFosStatus) { hudFosStatus.textContent = "(DEBRIS FLOW INUNDATING HIGHWAY)"; hudFosStatus.style.color = "#ef4444"; }
    if (hudShearText) hudShearText.textContent = "SLOPE SHEAR STRESS: τ = 64.1 kPa";

  } else if (mode === 'pore') {
    if (canvasPlayer) canvasPlayer.style.display = 'none';
    if (vidPlayer) { vidPlayer.pause(); vidPlayer.style.display = 'none'; }
    if (iframePlayer) {
      iframePlayer.style.display = 'block';
      iframePlayer.src = "https://www.youtube.com/embed/bkTbv30rE1c?autoplay=1&mute=1&loop=1&playlist=bkTbv30rE1c&controls=1";
    }
    if (modeTitle) modeTitle.textContent = "🔬 Geotechnical Pore-Water Slope Failure Physical Experiment";
    if (modeBadge) modeBadge.textContent = "Geotechnical Lab Stream";
    if (sectorName) sectorName.textContent = "NER-GEOTECH-LAB (PORE WATER PRESSURE TEST)";
    if (hudLat) hudLat.textContent = "25.5788° N";
    if (hudLon) hudLon.textContent = "91.8933° E";
    if (hudConfidence) hudConfidence.textContent = "92.5%";
    if (hudFosValue) { hudFosValue.textContent = "0.89"; hudFosValue.style.color = "#f59e0b"; }
    if (hudFosStatus) { hudFosStatus.textContent = "(LIQUEFACTION TRIGGERED)"; hudFosStatus.style.color = "#f59e0b"; }
    if (hudShearText) hudShearText.textContent = "PORE PRESSURE DISSIPATION: u = 28.5 kPa";

  } else if (mode === 'interactive') {
    if (iframePlayer) { iframePlayer.src = ""; iframePlayer.style.display = 'none'; }
    if (vidPlayer) { vidPlayer.pause(); vidPlayer.style.display = 'none'; }
    if (canvasPlayer) canvasPlayer.style.display = 'block';
    if (modeTitle) modeTitle.textContent = "🎮 Interactive WebGL 3D Physics & Debris Collapse Engine";
    if (modeBadge) modeBadge.textContent = "Live 3D Canvas (60 FPS)";
    if (sectorName) sectorName.textContent = "NER-SYNTHETIC-DEM (INTERACTIVE 3D SANDBOX)";
    startInteractive3DSimulator();
  }
}

function toggle3DAiHud() {
  const overlay = document.getElementById('aiHudOverlay');
  const btnText = document.getElementById('hudToggleText');
  const btnIcon = document.getElementById('hudToggleIcon');
  if (!overlay) return;
  if (overlay.classList.contains('hidden-hud')) {
    overlay.classList.remove('hidden-hud');
    if (btnText) btnText.textContent = "AI HUD: ON";
    if (btnIcon) btnIcon.textContent = "👁️";
  } else {
    overlay.classList.add('hidden-hud');
    if (btnText) btnText.textContent = "AI HUD: OFF";
    if (btnIcon) btnIcon.textContent = "🕶️";
  }
}

function toggleFullscreenVideo() {
  const container = document.getElementById('videoStageContainer');
  if (!container) return;
  if (!document.fullscreenElement) {
    container.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

function restartCurrent3DVideo() {
  if (current3DMode === 'usgs' || current3DMode === 'aerial') {
    const vid = document.getElementById('stageVideoPlayer');
    if (vid) { vid.currentTime = 0; vid.play().catch(() => {}); }
  } else if (current3DMode === 'interactive') {
    reset3DSimPhysics();
  } else {
    const iframe = document.getElementById('stageIframePlayer');
    if (iframe) {
      const src = iframe.src;
      iframe.src = "";
      setTimeout(() => iframe.src = src, 100);
    }
  }
}

// -------------------------------------------------------------
// Interactive 3D Mountain Physics Engine (Canvas 3D Projection)
// -------------------------------------------------------------
function startInteractive3DSimulator() {
  const canvas = document.getElementById('stageInteractiveCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  interactive3DRunning = true;
  interactiveRuptureActive = false;
  interactiveParticles = [];

  // Setup mouse drag for 3D camera rotation
  canvas.onmousedown = (e) => {
    interactiveIsDragging = true;
    interactiveLastMouseX = e.clientX;
  };
  window.onmouseup = () => { interactiveIsDragging = false; };
  canvas.onmousemove = (e) => {
    if (interactiveIsDragging) {
      const deltaX = e.clientX - interactiveLastMouseX;
      interactiveCameraAngle += deltaX * 0.008;
      interactiveLastMouseX = e.clientX;
    }
  };

  // Generate initial rain particles
  let raindrops = [];
  for (let i = 0; i < 90; i++) {
    raindrops.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      speed: 7 + Math.random() * 8,
      len: 8 + Math.random() * 10
    });
  }

  function renderLoop() {
    if (!interactive3DRunning) return;
    
    // Background gradient: dark high-altitude atmosphere
    ctx.fillStyle = '#060d1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Sky stars/particles
    ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
    for (let i = 0; i < 15; i++) {
      ctx.fillRect((i * 57) % canvas.width, (i * 31) % (canvas.height * 0.5), 1.5, 1.5);
    }

    const rainIntensity = parseFloat(document.getElementById('simRainSlider')?.value || 65);
    const slopeAngle = parseFloat(document.getElementById('simSlopeSlider')?.value || 38);
    const satLevel = parseFloat(document.getElementById('simSatSlider')?.value || 78);

    // Draw 3D Isometric Mountain Terrain Grid
    const centerX = canvas.width / 2;
    const centerY = canvas.height * 0.58;
    const gridCols = 16;
    const gridRows = 16;
    const spacing = 18;
    const angleCos = Math.cos(interactiveCameraAngle);
    const angleSin = Math.sin(interactiveCameraAngle);

    // Elevation function simulating mountain ridge slope
    function getElevation(col, row) {
      const distFromTop = (gridRows - row) / gridRows;
      const ridge = Math.sin((col / gridCols) * Math.PI) * 25;
      const steepnessFactor = Math.tan((slopeAngle * Math.PI) / 180) * 45;
      let elev = distFromTop * steepnessFactor + ridge;
      if (interactiveRuptureActive && row >= 6 && row <= 11 && col >= 4 && col <= 12) {
        elev -= 14; // Rupture collapse fault scar
      }
      return elev;
    }

    function project3D(col, row) {
      const localX = (col - gridCols / 2) * spacing;
      const localY = (row - gridRows / 2) * spacing;
      const rotX = localX * angleCos - localY * angleSin;
      const rotY = localX * angleSin + localY * angleCos;

      const z = getElevation(col, row);
      const isoX = centerX + (rotX - rotY) * 0.866;
      const isoY = centerY + (rotX + rotY) * 0.5 - z;
      return { x: isoX, y: isoY, z: z };
    }

    // Draw shaded terrain polygons
    for (let r = 0; r < gridRows - 1; r++) {
      for (let c = 0; c < gridCols - 1; c++) {
        const p1 = project3D(c, r);
        const p2 = project3D(c + 1, r);
        const p3 = project3D(c + 1, r + 1);
        const p4 = project3D(c, r + 1);

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.closePath();

        // Shading based on elevation and saturation (muddy vs vegetated)
        const avgElev = (p1.z + p2.z + p3.z + p4.z) / 4;
        const elevNorm = Math.min(1, Math.max(0, avgElev / 90));
        
        let fillColor;
        if (interactiveRuptureActive && r >= 6 && r <= 11 && c >= 4 && c <= 12) {
          // Unstable scar color: sheared red-brown bedrock
          fillColor = `rgba(185, 28, 28, 0.85)`;
        } else if (satLevel > 80) {
          // Highly saturated mud
          const b = Math.floor(25 + elevNorm * 40);
          fillColor = `rgb(${b + 20}, ${b + 12}, ${b})`;
        } else {
          // Lush green slope with rocky ridge
          const g = Math.floor(45 + elevNorm * 65);
          fillColor = `rgb(${Math.floor(20 + elevNorm * 30)}, ${g}, ${Math.floor(30 + elevNorm * 25)})`;
        }

        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.18)';
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    }

    // Rupture Fault Arc line if active
    if (interactiveRuptureActive) {
      ctx.beginPath();
      const arcStart = project3D(3, 7);
      ctx.moveTo(arcStart.x, arcStart.y);
      for (let c = 4; c <= 13; c++) {
        const p = project3D(c, 7 + Math.sin((c / 16) * Math.PI) * 2);
        ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Rain Particle Simulation
    if (rainIntensity > 5) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
      ctx.lineWidth = 1.2;
      raindrops.forEach(drop => {
        ctx.beginPath();
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x - 2, drop.y + drop.len);
        ctx.stroke();
        drop.y += drop.speed * (rainIntensity / 50);
        drop.x -= 1.5;
        if (drop.y > canvas.height) {
          drop.y = -10;
          drop.x = Math.random() * (canvas.width + 100);
        }
      });
    }

    // Landslide Debris Particles Simulation
    if (interactiveParticles.length > 0) {
      for (let i = interactiveParticles.length - 1; i >= 0; i--) {
        const p = interactiveParticles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.life -= 0.012;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();

        if (p.life <= 0) {
          interactiveParticles.splice(i, 1);
        }
      }
    }

    // 3D Engine Legend Overlay on Canvas
    ctx.fillStyle = 'rgba(2, 6, 23, 0.7)';
    ctx.fillRect(12, 12, 220, 52);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.strokeRect(12, 12, 220, 52);
    ctx.fillStyle = '#38bdf8';
    ctx.font = '11px JetBrains Mono, monospace';
    ctx.fillText(`3D CAMERA ORBIT: ${Math.round((interactiveCameraAngle * 180) / Math.PI)}°`, 20, 28);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px Inter, sans-serif';
    ctx.fillText('🖱️ Drag on canvas to rotate mountain', 20, 44);
    ctx.fillText(`Active Debris Nodes: ${interactiveParticles.length}`, 20, 58);

    interactive3DAnimId = requestAnimationFrame(renderLoop);
  }

  renderLoop();
}

function stopInteractive3DSimulator() {
  interactive3DRunning = false;
  if (interactive3DAnimId) {
    cancelAnimationFrame(interactive3DAnimId);
    interactive3DAnimId = null;
  }
}

function update3DSimPhysics() {
  const rain = parseFloat(document.getElementById('simRainSlider')?.value || 65);
  const slope = parseFloat(document.getElementById('simSlopeSlider')?.value || 38);
  const sat = parseFloat(document.getElementById('simSatSlider')?.value || 78);

  const rainVal = document.getElementById('simRainVal');
  const slopeVal = document.getElementById('simSlopeVal');
  const satVal = document.getElementById('simSatVal');

  if (rainVal) rainVal.textContent = `${rain} mm/h`;
  if (slopeVal) slopeVal.textContent = `${slope}° (${slope > 40 ? 'Extreme Cliff' : slope > 30 ? 'Steep' : 'Moderate'})`;
  if (satVal) satVal.textContent = `${sat}%`;

  // Geotechnical Factor of Safety (Mohr-Coulomb Limit Equilibrium)
  const c = 14.5; // Cohesion (kPa)
  const gamma = 19.8; // Soil bulk unit weight (kN/m³)
  const z = 2.4; // Failure surface depth (m)
  const phiRad = (28 * Math.PI) / 180; // Internal friction angle
  const betaRad = (slope * Math.PI) / 180; // Slope angle

  // Pore water pressure generated by rain & saturation
  const u = (rain / 150) * (sat / 100) * 42.0;

  const drivingShear = gamma * z * Math.sin(betaRad) * Math.cos(betaRad);
  const normalEffectiveStress = Math.max(0, gamma * z * Math.pow(Math.cos(betaRad), 2) - u);
  const resistingStrength = c + normalEffectiveStress * Math.tan(phiRad);

  const fos = Math.max(0.42, resistingStrength / Math.max(1, drivingShear));
  const fosFormatted = fos.toFixed(2);

  const fosNum = document.getElementById('simFosNum');
  const fosBar = document.getElementById('simFosBar');
  const riskPill = document.getElementById('simRiskPill');
  const poreText = document.getElementById('simPorePressureText');
  const hudFosValue = document.getElementById('hudFosValue');
  const hudFosStatus = document.getElementById('hudFosStatus');
  const hudShearText = document.getElementById('hudShearText');
  const hudConfidence = document.getElementById('hudConfidence');

  if (fosNum) fosNum.textContent = fosFormatted;
  if (hudFosValue) hudFosValue.textContent = fosFormatted;
  if (poreText) poreText.textContent = `Pore Pressure: ${u.toFixed(1)} kPa`;
  if (hudShearText) hudShearText.textContent = `SLOPE SHEAR STRESS: τ = ${drivingShear.toFixed(1)} kPa | u = ${u.toFixed(1)} kPa`;

  const barPct = Math.min(100, Math.max(10, (fos / 2.0) * 100));
  if (fosBar) fosBar.style.width = `${barPct}%`;

  if (fos >= 1.3) {
    if (fosNum) fosNum.style.color = '#10b981';
    if (fosBar) fosBar.style.background = '#10b981';
    if (hudFosValue) hudFosValue.style.color = '#10b981';
    if (riskPill) {
      riskPill.className = 'risk-badge risk-low';
      riskPill.textContent = 'LOW RISK (STABLE: FS ≥ 1.3)';
    }
    if (hudFosStatus) {
      hudFosStatus.textContent = '(SLOPE STABLE)';
      hudFosStatus.style.color = '#10b981';
    }
    if (hudConfidence) hudConfidence.textContent = '88.3%';
  } else if (fos >= 1.0) {
    if (fosNum) fosNum.style.color = '#f59e0b';
    if (fosBar) fosBar.style.background = '#f59e0b';
    if (hudFosValue) hudFosValue.style.color = '#f59e0b';
    if (riskPill) {
      riskPill.className = 'risk-badge risk-med';
      riskPill.textContent = 'MEDIUM RISK (MARGINAL: FS 1.0 - 1.3)';
    }
    if (hudFosStatus) {
      hudFosStatus.textContent = '(MARGINAL STABILITY)';
      hudFosStatus.style.color = '#f59e0b';
    }
    if (hudConfidence) hudConfidence.textContent = '91.8%';
  } else {
    if (fosNum) fosNum.style.color = '#ef4444';
    if (fosBar) fosBar.style.background = '#ef4444';
    if (hudFosValue) hudFosValue.style.color = '#ef4444';
    if (riskPill) {
      riskPill.className = 'risk-badge risk-high';
      riskPill.textContent = 'HIGH RISK (UNSTABLE: FS < 1.0)';
    }
    if (hudFosStatus) {
      hudFosStatus.textContent = '(FAILURE IMMINENT / RUPTURE)';
      hudFosStatus.style.color = '#ef4444';
    }
    if (hudConfidence) hudConfidence.textContent = '96.9%';
  }
}

function trigger3DSlopeRupture() {
  if (current3DMode !== 'interactive') {
    select3DVideoMode('interactive');
  }

  interactiveRuptureActive = true;
  const canvas = document.getElementById('stageInteractiveCanvas');
  const originX = canvas ? canvas.width * 0.5 : 400;
  const originY = canvas ? canvas.height * 0.45 : 220;

  // Burst 75 rock & debris particles cascading down slope
  for (let i = 0; i < 75; i++) {
    const angle = (Math.random() * Math.PI) * 0.6 + 0.2;
    const speed = 2 + Math.random() * 5;
    interactiveParticles.push({
      x: originX + (Math.random() - 0.5) * 120,
      y: originY + (Math.random() - 0.5) * 35,
      vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 2,
      vy: Math.sin(angle) * speed + 2,
      gravity: 0.18,
      size: 2.5 + Math.random() * 4.5,
      color: Math.random() > 0.4 ? 'rgba(239, 68, 68, 0.9)' : 'rgba(245, 158, 11, 0.85)',
      life: 1.0
    });
  }

  // Force FoS display to show failure
  const hudFosValue = document.getElementById('hudFosValue');
  const hudFosStatus = document.getElementById('hudFosStatus');
  if (hudFosValue) { hudFosValue.textContent = '0.54'; hudFosValue.style.color = '#ef4444'; }
  if (hudFosStatus) { hudFosStatus.textContent = '(ACTIVE RUPTURE CASCADING)'; hudFosStatus.style.color = '#ef4444'; }
}

function reset3DSimPhysics() {
  interactiveRuptureActive = false;
  interactiveParticles = [];
  const rainSlider = document.getElementById('simRainSlider');
  const slopeSlider = document.getElementById('simSlopeSlider');
  const satSlider = document.getElementById('simSatSlider');

  if (rainSlider) rainSlider.value = 30;
  if (slopeSlider) slopeSlider.value = 25;
  if (satSlider) satSlider.value = 45;

  update3DSimPhysics();
}

function simulateMonsoonCherrapunji() {
  const rainSlider = document.getElementById('simRainSlider');
  const slopeSlider = document.getElementById('simSlopeSlider');
  const satSlider = document.getElementById('simSatSlider');

  if (rainSlider) rainSlider.value = 110;
  if (slopeSlider) slopeSlider.value = 45;
  if (satSlider) satSlider.value = 95;

  update3DSimPhysics();
  trigger3DSlopeRupture();
}


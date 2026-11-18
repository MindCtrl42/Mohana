import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import {
  Navigation,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  MapPin,
  Flame,
  Zap,
  CheckCircle2,
  X,
  Play,
  Square,
  Search,
  Radio,
  Sliders
} from 'lucide-react';
import { PRELOADED_ROUTES } from './constants/routes';
import { calculateDistance } from './utils/geo';
import { bleService, TARGET_DEVICE_NAME } from './services/bluetooth';

export default function App() {
  // BLE State
  const [bleStatus, setBleStatus] = useState('disconnected'); // 'disconnected' | 'connecting' | 'connected'
  const [deviceName, setDeviceName] = useState(null);

  // Map & Location State
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const userMarkerRef = useRef(null);
  const destMarkerRef = useRef(null);
  const polylineCasingRef = useRef(null);
  const polylineCoreRef = useRef(null);
  const turnMarkersRef = useRef([]);

  // Live User Location Reference (Prevents Stale Closure Bug)
  const userCoordsRef = useRef(null);
  const [userCoords, setUserCoords] = useState(null); // { lat, lon, speed, accuracy }
  const [isNavigating, setIsNavigating] = useState(false);

  // Search & Confirmation Sheet State
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [confirmSheetData, setConfirmSheetData] = useState(null); // { title, address, distKm, timeMins, turnCount, waypoints }

  // Turn Navigation State
  const [offlineroute, setOfflineroute] = useState([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [distanceToNext, setDistanceToNext] = useState(null);
  const [cueAlertActive, setCueAlertActive] = useState(false);
  const [showArrivalModal, setShowArrivalModal] = useState(false);
  const [showManualDrawer, setShowManualDrawer] = useState(false);

  // Simulation & Watch Refs
  const watchIdRef = useRef(null);
  const searchDebounceRef = useRef(null);
  const audioCtxRef = useRef(null);
  const selectDestinationRef = useRef(null);

  // Sound Synthesizer
  const playSound = (freq1, freq2) => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      const now = audioCtxRef.current.currentTime;
      const osc = audioCtxRef.current.createOscillator();
      const gain = audioCtxRef.current.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq1, now);
      osc.frequency.exponentialRampToValueAtTime(freq2, now + 0.18);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc.connect(gain);
      gain.connect(audioCtxRef.current.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    } catch (e) {
      console.warn(e);
    }
  };

  // =========================================================================
  // 1. Destination Selection & Route Calculation (Starts from ACTUAL live location)
  // =========================================================================
  const selectDestination = async (destLat, destLon, displayName) => {
    setShowSuggestions(false);
    setSearchQuery('');

    // ALWAYS acquire the true, live user GPS position (never use stale or random coordinates)
    let currentLoc = userCoordsRef.current;
    if (!currentLoc) {
      try {
        const freshPos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 7000
          });
        });
        currentLoc = {
          lat: freshPos.coords.latitude,
          lon: freshPos.coords.longitude,
          speed: freshPos.coords.speed ? Math.round(freshPos.coords.speed * 3.6) : 0,
          accuracy: Math.round(freshPos.coords.accuracy || 0)
        };
        userCoordsRef.current = currentLoc;
        setUserCoords(currentLoc);
        if (userMarkerRef.current) {
          userMarkerRef.current.setLatLng([currentLoc.lat, currentLoc.lon]);
        }
      } catch (err) {
        alert("GPS Signal Required: Please enable location services on your device to calculate the route.");
        return;
      }
    }

    // Place Polished Finish Point Marker with Expanding Green Ripple Animation
    if (destMarkerRef.current && mapRef.current) {
      mapRef.current.removeLayer(destMarkerRef.current);
    }
    const finishHtml = `
      <div class="finish-pin-wrap">
        <div class="finish-ripple"></div>
        <div class="finish-pin-core">🏁</div>
      </div>
    `;
    const finishIcon = L.divIcon({
      className: '',
      html: finishHtml,
      iconSize: [68, 68],
      iconAnchor: [34, 34]
    });
    destMarkerRef.current = L.marker([destLat, destLon], { icon: finishIcon }).addTo(mapRef.current);

    // Query OSRM Driving Route strictly from current live position:
    // origin = currentLoc.lon,currentLoc.lat -> destination = destLon,destLat
    const url = `https://router.project-osrm.org/route/v1/driving/${currentLoc.lon},${currentLoc.lat};${destLon},${destLat}?steps=true&geometries=geojson&overview=full`;

    try {
      const res = await fetch(url);
      const data = await res.json();

      if (!data.routes || data.routes.length === 0) {
        alert("No drivable route found to that point.");
        return;
      }

      const route = data.routes[0];
      const leg = route.legs[0];

      // Draw Dual-Tone Polyline starting directly from the rider's position to destination
      if (polylineCasingRef.current && mapRef.current) mapRef.current.removeLayer(polylineCasingRef.current);
      if (polylineCoreRef.current && mapRef.current) mapRef.current.removeLayer(polylineCoreRef.current);

      const latlngs = route.geometry.coordinates.map(pt => [pt[1], pt[0]]);
      polylineCasingRef.current = L.polyline(latlngs, { color: '#0369a1', weight: 9, opacity: 0.8 }).addTo(mapRef.current);
      polylineCoreRef.current = L.polyline(latlngs, { color: '#38bdf8', weight: 5, opacity: 1.0 }).addTo(mapRef.current);

      mapRef.current.fitBounds(polylineCoreRef.current.getBounds(), { padding: [70, 70] });

      // Extract Turn Steps into precise waypoint array
      turnMarkersRef.current.forEach(m => mapRef.current.removeLayer(m));
      turnMarkersRef.current = [];

      const extractedWaypoints = [];
      leg.steps.forEach(st => {
        const mod = (st.maneuver.modifier || '').toLowerCase();
        const type = (st.maneuver.type || '').toLowerCase();
        let turnCode = null;

        if (mod.includes('left') || type.includes('left')) turnCode = 'L';
        else if (mod.includes('right') || type.includes('right')) turnCode = 'R';
        else if (mod.includes('u-turn') || mod.includes('uturn') || type.includes('u-turn')) turnCode = 'U';

        if (turnCode) {
          const sLat = parseFloat(st.maneuver.location[1].toFixed(6));
          const sLon = parseFloat(st.maneuver.location[0].toFixed(6));
          const sName = st.name ? `Turn ${turnCode === 'L' ? 'Left' : (turnCode === 'R' ? 'Right' : 'U-Turn')} onto ${st.name}` : `${st.maneuver.type} ${st.maneuver.modifier || ''}`;

          extractedWaypoints.push({
            lat: sLat,
            lon: sLon,
            turn: turnCode,
            name: sName
          });

          // Small waypoint pin on map
          const tm = L.circleMarker([sLat, sLon], {
            radius: 4,
            color: turnCode === 'L' ? '#f59e0b' : '#38bdf8',
            fillColor: '#ffffff',
            fillOpacity: 1
          }).addTo(mapRef.current);
          turnMarkersRef.current.push(tm);
        }
      });

      // Prepare Confirmation Sheet Data
      const parts = displayName.split(',');
      const distKm = (route.distance / 1000).toFixed(1);
      const timeMins = Math.round(route.duration / 60);

      setConfirmSheetData({
        title: parts[0],
        address: parts.slice(1).join(', ').trim() || displayName,
        distKm,
        timeMins,
        turnCount: extractedWaypoints.length,
        waypoints: extractedWaypoints
      });

    } catch (err) {
      console.error("Routing error:", err);
      alert("Could not load route.");
    }
  };

  // Keep ref up to date so click handlers never suffer from stale closures
  selectDestinationRef.current = selectDestination;

  // =========================================================================
  // 2. Map Initialization (Auto-Centers on User's ACTUAL Location)
  // =========================================================================
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Initial default fallback until GPS lock
    const fallbackLat = 27.7172;
    const fallbackLon = 85.3240;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: false
    }).setView([fallbackLat, fallbackLon], 15);

    // 100% Free Public OpenStreetMap Tiles (No API key needed)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);

    // Custom Rider Location Pin (Pulsing Neon Blue)
    const riderHtml = `
      <div class="rider-pin-wrap">
        <div class="rider-pin-pulse"></div>
        <div class="rider-pin-dot"></div>
      </div>
    `;
    const riderIcon = L.divIcon({
      className: '',
      html: riderHtml,
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    });
    userMarkerRef.current = L.marker([fallbackLat, fallbackLon], { icon: riderIcon }).addTo(map);

    // Click anywhere on map to route directly from current live location
    map.on('click', e => {
      const { lat, lng } = e.latlng;
      if (selectDestinationRef.current) {
        selectDestinationRef.current(lat, lng, `Dropped Pin (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
      }
    });

    mapRef.current = map;

    // Immediately fetch live location and center the map on user
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          const speed = pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : 0;
          const coords = { lat, lon, speed, accuracy: Math.round(pos.coords.accuracy || 0) };
          
          userCoordsRef.current = coords;
          setUserCoords(coords);

          if (userMarkerRef.current) {
            userMarkerRef.current.setLatLng([lat, lon]);
          }
          map.setView([lat, lon], 16);
        },
        err => console.warn("Initial GPS lock failed:", err),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }

    // Start Live GPS Tracking Loop
    initGPS();

    return () => {
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  // Continuous GPS watch loop
  const initGPS = () => {
    if (!navigator.geolocation) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      pos => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const speed = pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : 0;
        const coords = { lat, lon, speed, accuracy: Math.round(pos.coords.accuracy || 0) };
        
        userCoordsRef.current = coords;
        setUserCoords(coords);

        if (userMarkerRef.current) {
          userMarkerRef.current.setLatLng([lat, lon]);
        }

        if (isNavigating && mapRef.current) {
          mapRef.current.panTo([lat, lon], { animate: true, duration: 0.8 });
          evaluateNavigationStep(lat, lon);
        }
      },
      err => console.warn("GPS watch error:", err),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );
  };

  // =========================================================================
  // 3. Search Autocomplete
  // =========================================================================
  const handleSearchChange = (val) => {
    setSearchQuery(val);
    clearTimeout(searchDebounceRef.current);
    if (!val || val.trim().length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    searchDebounceRef.current = setTimeout(async () => {
      try {
        let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(val.trim())}&limit=5`;
        if (userCoordsRef.current) {
          url += `&viewbox=${userCoordsRef.current.lon - 0.4},${userCoordsRef.current.lat + 0.4},${userCoordsRef.current.lon + 0.4},${userCoordsRef.current.lat - 0.4}`;
        }
        const res = await fetch(url);
        const data = await res.json();
        setSuggestions(data || []);
        setShowSuggestions((data || []).length > 0);
      } catch (err) {
        console.error("Geocoding failed:", err);
      }
    }, 300);
  };

  const handleStartConfirmedRide = () => {
    if (!confirmSheetData) return;

    setOfflineroute(confirmSheetData.waypoints);
    localStorage.setItem('offlineroute', JSON.stringify(confirmSheetData.waypoints));
    setConfirmSheetData(null);
    setIsNavigating(true);
    setCurrentStepIndex(0);

    if (mapRef.current) {
      mapRef.current.setZoom(17);
      if (userCoordsRef.current) mapRef.current.panTo([userCoordsRef.current.lat, userCoordsRef.current.lon]);
    }

    playSound(440, 880);
    if (userCoordsRef.current) evaluateNavigationStep(userCoordsRef.current.lat, userCoordsRef.current.lon);
  };

  const handleCancelRoutePreview = () => {
    setConfirmSheetData(null);
    if (destMarkerRef.current && mapRef.current) mapRef.current.removeLayer(destMarkerRef.current);
    if (polylineCasingRef.current && mapRef.current) mapRef.current.removeLayer(polylineCasingRef.current);
    if (polylineCoreRef.current && mapRef.current) mapRef.current.removeLayer(polylineCoreRef.current);
    turnMarkersRef.current.forEach(m => mapRef.current.removeLayer(m));
  };

  const handleExitRide = () => {
    setIsNavigating(false);
    handleCancelRoutePreview();
    bleService.sendCommand('S');
  };

  // =========================================================================
  // 4. Turn Evaluation & 40m Auto-Trigger
  // =========================================================================
  const evaluateNavigationStep = (curLat, curLon) => {
    if (destMarkerRef.current) {
      const destPos = destMarkerRef.current.getLatLng();
      const distToFinish = calculateDistance(curLat, curLon, destPos.lat, destPos.lng);
      if (distToFinish <= 20) {
        setIsNavigating(false);
        setShowArrivalModal(true);
        bleService.sendCommand('S');
        playSound(660, 990);
        return;
      }
    }

    if (!offlineroute || offlineroute.length === 0 || currentStepIndex >= offlineroute.length) return;

    const activeStep = offlineroute[currentStepIndex];
    const dist = calculateDistance(curLat, curLon, activeStep.lat, activeStep.lon);
    setDistanceToNext(dist);

    // 40-Meter Auto-Trigger
    if (dist <= 40 && !activeStep.triggered) {
      activeStep.triggered = true;
      setCueAlertActive(true);
      bleService.sendCommand(activeStep.turn);
      playSound(activeStep.turn === 'L' ? 520 : 660, 880);

      setTimeout(() => setCueAlertActive(false), 3500);
    }

    // Advance to next step once passed (< 15 meters)
    if (dist <= 15) {
      setCurrentStepIndex(prev => prev + 1);
    }
  };

  // =========================================================================
  // 5. Bluetooth Pairing
  // =========================================================================
  const handleToggleBLE = async () => {
    if (bleStatus === 'connected') {
      await bleService.disconnect();
      setBleStatus('disconnected');
      setDeviceName(null);
      return;
    }

    setBleStatus('connecting');
    try {
      const name = await bleService.connect(() => {
        setBleStatus('disconnected');
        setDeviceName(null);
      });
      setBleStatus('connected');
      setDeviceName(name);
      playSound(580, 880);
    } catch (err) {
      setBleStatus('disconnected');
      alert(`Bluetooth pairing: ${err.message}`);
    }
  };

  const handleManualCommand = (cmd) => {
    bleService.sendCommand(cmd);
    if (cmd === 'L') playSound(520, 660);
    else if (cmd === 'R') playSound(660, 880);
    else if (cmd === 'U') playSound(440, 550);
  };

  const recenterMap = () => {
    const loc = userCoordsRef.current;
    if (loc && mapRef.current) {
      mapRef.current.setView([loc.lat, loc.lon], isNavigating ? 17 : 15);
    }
  };

  const currentTurn = offlineroute[currentStepIndex] || offlineroute[0];

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-industrial-950 font-sans select-none">
      
      {/* 1. Fullscreen Map Canvas */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* 2. Top Header Overlay (Title, BLE Badge & Search) */}
      <div className="absolute top-4 left-3.5 right-3.5 z-10 max-w-md mx-auto flex flex-col gap-2.5 pointer-events-none">
        
        {/* Brand Bar */}
        <div className="flex justify-between items-center bg-industrial-900/90 border border-white/10 rounded-2xl p-2.5 px-4 backdrop-blur-xl shadow-xl pointer-events-auto">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏍️</span>
            <span className="font-extrabold text-sm tracking-wider text-white">
              MOHANA <span className="text-safety-cyan text-xs font-mono">HUD</span>
            </span>
          </div>

          <button
            onClick={handleToggleBLE}
            className={`px-3 py-1.5 rounded-full text-xs font-bold font-mono flex items-center gap-1.5 border transition-all ${
              bleStatus === 'connected'
                ? 'bg-safety-green/20 text-safety-green border-safety-green/50 shadow-[0_0_12px_rgba(0,230,118,0.25)]'
                : bleStatus === 'connecting'
                ? 'bg-safety-amber/20 text-safety-amber border-safety-amber/50 animate-pulse'
                : 'bg-red-500/20 text-red-400 border-red-500/30'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${
              bleStatus === 'connected' ? 'bg-safety-green' : bleStatus === 'connecting' ? 'bg-safety-amber' : 'bg-red-500'
            }`} />
            {bleStatus === 'connected' ? 'LINKED' : bleStatus === 'connecting' ? 'CONNECTING...' : 'CONNECT ESP32'}
          </button>
        </div>

        {/* Search Bar (Only visible when not actively navigating) */}
        {!isNavigating && (
          <div className="relative w-full pointer-events-auto">
            <div className="flex items-center bg-industrial-900/90 border border-white/10 rounded-2xl p-1.5 px-3 backdrop-blur-xl shadow-xl focus-within:border-safety-cyan transition-colors">
              <Search className="w-4 h-4 text-slate-400 ml-1 mr-2" />
              <input
                type="text"
                value={searchQuery}
                placeholder="Search destination or tap map..."
                onChange={e => handleSearchChange(e.target.value)}
                className="flex-1 bg-transparent border-none text-sm text-white placeholder-slate-400 outline-none py-2"
              />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(''); setSuggestions([]); }} className="text-slate-400 p-1">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Suggestions Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-industrial-900/95 border border-white/10 rounded-2xl max-h-60 overflow-y-auto backdrop-blur-2xl shadow-2xl z-20">
                {suggestions.map((place, i) => {
                  const parts = place.display_name.split(',');
                  return (
                    <div
                      key={i}
                      onClick={() => selectDestination(parseFloat(place.lat), parseFloat(place.lon), place.display_name)}
                      className="p-3 border-b border-white/5 hover:bg-white/10 cursor-pointer flex items-center gap-2.5 transition-colors"
                    >
                      <MapPin className="w-4 h-4 text-safety-cyan flex-shrink-0" />
                      <div className="overflow-hidden">
                        <div className="text-sm font-semibold text-white truncate">{parts[0]}</div>
                        <div className="text-xs text-slate-400 truncate">{parts.slice(1).join(', ').trim()}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Active Turn Navigation HUD Overlay */}
      {isNavigating && currentTurn && (
        <div className={`absolute top-20 left-3.5 right-3.5 max-w-md mx-auto z-10 p-4 bg-industrial-900/95 border-2 rounded-3xl backdrop-blur-2xl shadow-2xl flex items-center gap-4 transition-all duration-300 ${
          cueAlertActive
            ? 'border-safety-amber shadow-[0_0_35px_rgba(255,170,0,0.45)] animate-pulse'
            : 'border-white/15'
        }`}>
          {/* Large Turn Direction Icon */}
          <div className={`w-16 h-16 rounded-full flex items-center justify-center border-4 shadow-inner flex-shrink-0 ${
            currentTurn.turn === 'L'
              ? 'border-safety-amber bg-safety-amber/15 text-safety-amber shadow-safety-amber/30'
              : currentTurn.turn === 'R'
              ? 'border-safety-cyan bg-safety-cyan/15 text-safety-cyan shadow-safety-cyan/30'
              : 'border-safety-orange bg-safety-orange/15 text-safety-orange shadow-safety-orange/30'
          }`}>
            {currentTurn.turn === 'L' && <ArrowLeft className="w-9 h-9 stroke-[3]" />}
            {currentTurn.turn === 'R' && <ArrowRight className="w-9 h-9 stroke-[3]" />}
            {currentTurn.turn === 'U' && <RotateCcw className="w-9 h-9 stroke-[3]" />}
          </div>

          {/* Turn Countdown & Street */}
          <div className="flex-1 overflow-hidden">
            <div className="text-3xl font-black font-mono tracking-tight text-white">
              {distanceToNext !== null ? Math.round(distanceToNext) : '--'}
              <span className="text-sm font-bold text-slate-400 ml-1">M</span>
            </div>
            <div className="text-sm font-semibold text-slate-200 truncate mt-0.5">
              {currentTurn.name}
            </div>

            {cueAlertActive && (
              <div className="mt-1.5 px-2.5 py-0.5 rounded bg-safety-amber text-black font-black text-[10px] tracking-wider w-fit flex items-center gap-1">
                <Zap className="w-3 h-3 fill-black" /> 40M CUE TRANSMITTED
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. Bottom Cockpit HUD during active navigation */}
      {isNavigating && (
        <div className="absolute bottom-5 left-3.5 right-3.5 max-w-md mx-auto z-10 p-3.5 px-5 bg-industrial-900/90 border border-white/10 rounded-2xl backdrop-blur-xl shadow-2xl flex justify-between items-center">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black font-mono text-white">{userCoords?.speed ?? 0}</span>
            <span className="text-xs font-bold text-slate-400 font-mono">KM/H</span>
          </div>

          <div className="text-center font-mono">
            <div className="text-xs font-bold text-slate-300">
              TURN {currentStepIndex + 1} OF {offlineroute.length}
            </div>
            <div className="text-[10px] text-slate-500 uppercase tracking-widest">
              OFFLINE SATELLITE HUD
            </div>
          </div>

          <button
            onClick={handleExitRide}
            className="px-4 py-2 bg-red-600/20 border border-red-500 text-red-400 font-extrabold text-xs rounded-xl active:scale-95"
          >
            END RIDE
          </button>
        </div>
      )}

      {/* 5. Pre-Ride Route Confirmation Bottom Sheet */}
      {confirmSheetData && (
        <div className="absolute bottom-5 left-3.5 right-3.5 max-w-md mx-auto z-10 p-5 bg-industrial-900/95 border border-white/15 rounded-3xl backdrop-blur-2xl shadow-2xl flex flex-col gap-3.5 animate-slideUp">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-[10px] font-mono font-bold text-safety-cyan tracking-wider uppercase">
                🏁 CONFIRM DESTINATION
              </div>
              <div className="text-lg font-black text-white mt-0.5">
                {confirmSheetData.title}
              </div>
              <div className="text-xs text-slate-400 truncate max-w-[280px]">
                {confirmSheetData.address}
              </div>
            </div>
            <button
              onClick={handleCancelRoutePreview}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 bg-black/30 border border-white/5 rounded-2xl p-2.5 text-center font-mono">
            <div>
              <div className="text-base font-black text-white">{confirmSheetData.distKm} km</div>
              <div className="text-[9px] text-slate-500 uppercase">DISTANCE</div>
            </div>
            <div>
              <div className="text-base font-black text-white">{confirmSheetData.timeMins} min</div>
              <div className="text-[9px] text-slate-500 uppercase">EST. TIME</div>
            </div>
            <div>
              <div className="text-base font-black text-safety-cyan">{confirmSheetData.turnCount}</div>
              <div className="text-[9px] text-slate-500 uppercase">HAPTIC CUES</div>
            </div>
          </div>

          <div className="flex gap-2.5">
            <button
              onClick={handleCancelRoutePreview}
              className="flex-1 py-3.5 rounded-xl border border-white/10 text-slate-400 font-bold text-sm bg-white/5"
            >
              Cancel
            </button>
            <button
              onClick={handleStartConfirmedRide}
              className="flex-2 w-full py-3.5 rounded-xl bg-gradient-to-r from-safety-green to-emerald-600 text-black font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-safety-green/20"
            >
              <Play className="w-4 h-4 fill-black" /> START NAVIGATION
            </button>
          </div>
        </div>
      )}

      {/* 6. Floating Action Buttons (Recenter, Zoom, Haptic Keypad) */}
      <div className="absolute right-4 top-36 z-10 flex flex-col gap-2.5">
        <button
          onClick={recenterMap}
          className="w-11 h-11 rounded-full bg-industrial-900/90 border border-white/15 text-white flex items-center justify-center shadow-lg backdrop-blur-xl active:scale-90 transition-transform"
          title="Recenter GPS"
        >
          <Navigation className="w-5 h-5 text-safety-cyan" />
        </button>

        <button
          onClick={() => setShowManualDrawer(prev => !prev)}
          className="w-11 h-11 rounded-full bg-industrial-900/90 border border-white/15 text-white flex items-center justify-center shadow-lg backdrop-blur-xl active:scale-90 transition-transform"
          title="Test Haptics"
        >
          <Zap className="w-5 h-5 text-safety-amber" />
        </button>
      </div>

      {/* Manual Haptic Test Drawer */}
      {showManualDrawer && (
        <div className="absolute right-4 top-64 z-10 bg-industrial-900/95 border border-white/15 rounded-2xl p-3 flex flex-col gap-2 backdrop-blur-2xl shadow-2xl w-32 animate-fadeIn">
          <div className="text-[10px] font-mono font-bold text-slate-400 text-center uppercase tracking-widest">
            TEST MOTORS
          </div>
          <button
            onClick={() => handleManualCommand('L')}
            className="py-2 px-2.5 bg-safety-amber/20 border border-safety-amber/40 text-safety-amber font-bold text-xs rounded-lg active:scale-95"
          >
            LEFT (L)
          </button>
          <button
            onClick={() => handleManualCommand('R')}
            className="py-2 px-2.5 bg-safety-cyan/20 border border-safety-cyan/40 text-safety-cyan font-bold text-xs rounded-lg active:scale-95"
          >
            RIGHT (R)
          </button>
          <button
            onClick={() => handleManualCommand('U')}
            className="py-2 px-2.5 bg-safety-orange/20 border border-safety-orange/40 text-safety-orange font-bold text-xs rounded-lg active:scale-95"
          >
            U-TURN (U)
          </button>
          <button
            onClick={() => handleManualCommand('S')}
            className="py-2 px-2.5 bg-red-500/20 border border-red-500/40 text-red-400 font-bold text-xs rounded-lg active:scale-95"
          >
            STOP (S)
          </button>
        </div>
      )}

      {/* 7. Arrival Celebration Modal */}
      {showArrivalModal && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-industrial-900 border-2 border-safety-green rounded-3xl p-6 max-w-sm w-full text-center flex flex-col items-center gap-3.5 shadow-2xl shadow-safety-green/20">
            <div className="w-16 h-16 rounded-full bg-safety-green/20 border-2 border-safety-green flex items-center justify-center text-3xl">
              🏁
            </div>
            <div className="text-xl font-black text-white">Route Completed!</div>
            <div className="text-xs text-slate-400">
              You have arrived at your destination safely.
            </div>
            <button
              onClick={() => { setShowArrivalModal(false); handleCancelRoutePreview(); }}
              className="w-full py-3 bg-safety-green text-black font-extrabold text-sm rounded-xl mt-2"
            >
              DONE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

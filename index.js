require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const zipCodes = require('./data/zipCodes.json');
const localShops = require('./data/shops');
const db = require('./data/database.json');

const app = express();
const port = process.env.PORT || 3000;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

let shops = db.shops.concat(localShops);

function findShopByPlaceId(placeId) {
  return db.shops.find(s => s.id === placeId);
}

function findShopByNameAndAddress(name, address) {
  return db.shops.find(s => s.name === name && s.address === address);
}

function updateOrAddShop(shop) {
  const existing = findShopByPlaceId(shop.id) || findShopByNameAndAddress(shop.name, shop.address);
  
  if (existing) {
    existing.rating = shop.rating;
    existing.reviews = shop.reviews;
    existing.hours = shop.hours;
    existing.last_updated = new Date().toISOString();
    console.log(`Updated: ${shop.name}`);
  } else {
    shop.created_at = new Date().toISOString();
    shop.last_updated = shop.created_at;
    db.shops.push(shop);
    console.log(`Added: ${shop.name}`);
  }
}

function saveDatabase() {
  fs.writeFileSync('./data/database.json', JSON.stringify(db, null, 2));
  shops = [...db.shops, ...localShops];
  console.log(`Database saved. Total shops: ${db.shops.length}`);
}

async function fetchGooglePlacesShops(lat, lng, radius = 50000) {
  if (!GOOGLE_API_KEY) {
    console.log('No Google API key, using local database with distance sorting');
    const userLat = lat;
    const userLng = lng;
    const R = 3959;
    
    return shops.map(s => {
      const dLat = (s.lat - userLat) * Math.PI / 180;
      const dLng = (s.lng - userLng) * Math.PI / 180;
      const a = Math.sin(dLat/2) ** 2 + Math.cos(userLat * Math.PI / 180) * Math.cos(s.lat * Math.PI / 180) * Math.sin(dLng/2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return { ...s, distance: R * c };
    }).sort((a, b) => a.distance - b.distance);
  }

  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&keyword=tire+repair&key=${GOOGLE_API_KEY}`;
  
  try {
    const res = await fetch(url);
    const data = await res.json();
    
    if (data.results) {
      const places = data.results.map((place) => ({
        id: place.place_id,
        name: place.name,
        address: place.vicinity || place.formatted_address || '',
        city: place.vicinity?.split(',')[0] || '',
        state: '',
        lat: place.geometry.location.lat,
        lng: place.geometry.location.lng,
        rating: place.rating || 0,
        reviews: place.user_ratings_total || 0,
        openNow: place.opening_hours?.open_now,
        services: place.types || ['Tire Repair'],
        phone: '',
        hours: place.opening_hours?.weekday_text?.join(', ') || 'Hours not available',
        type: 'google'
      }));
      
      // Auto-save to database
      places.forEach(updateOrAddShop);
      saveDatabase();
      
      return places;
    }
  } catch (e) {
    console.error('Google Places API error:', e.message);
  }
  
  return shops;
}

app.get('/api/places', async (req, res) => {
  const { lat, lng, zip } = req.query;
  
  // Without location, return empty - user must provide location first
  if (!lat && !lng && !zip) {
    return res.json([]);
  }
  
  let userLat, userLng;
  
  if (zip && zipCodes[zip]) {
    userLat = zipCodes[zip].lat;
    userLng = zipCodes[zip].lng;
  } else if (lat && lng) {
    userLat = parseFloat(lat);
    userLng = parseFloat(lng);
  }
  
  if (userLat && userLng) {
    const places = await fetchGooglePlacesShops(userLat, userLng);
    // limit to region (60 miles) around user
    function haversine(lat1, lon1, lat2, lon2){
      const R = 3959;
      const dLat = (lat2 - lat1) * Math.PI/180;
      const dLon = (lon2 - lon1) * Math.PI/180;
      const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
      const c = 2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
    }
    const nearby = places.filter(p => p.lat && p.lng && haversine(userLat, userLng, p.lat, p.lng) <= 60);
    const result = nearby.length ? nearby : places;
    return res.json(result.map(s => ({ ...s, distance: haversine(userLat, userLng, s.lat, s.lng), reviews_data: shops.find(db => db.id === s.id)?.reviews_data || [] })));
  }
  
  // Return empty if no valid location
  res.json([]);
});

app.get('/api/geocode', async (req, res) => {
  const { address } = req.query;
  
  if (!address) {
    return res.status(400).json({ error: 'Address required' });
  }

  const city = address.toLowerCase();
  
  const cityCoords = {
    "nashville": { lat: 36.1627, lng: -86.7816 },
    "new york": { lat: 40.7128, lng: -74.0060 },
    "los angeles": { lat: 34.0522, lng: -118.2437 },
    "chicago": { lat: 41.8781, lng: -87.6298 },
    "houston": { lat: 29.7604, lng: -95.3698 },
    "phoenix": { lat: 33.4484, lng: -112.0740 },
    "philadelphia": { lat: 39.9526, lng: -75.1652 },
    "san antonio": { lat: 29.4241, lng: -98.4936 },
    "san diego": { lat: 32.7157, lng: -117.1611 },
    "dallas": { lat: 32.7767, lng: -96.7970 },
    "san jose": { lat: 37.3382, lng: -121.8863 },
    "orlando": { lat: 28.5383, lng: -81.3792 },
    "atlanta": { lat: 33.7490, lng: -84.3880 },
    "denver": { lat: 39.7392, lng: -104.9903 },
    "seattle": { lat: 47.6062, lng: -122.3321 },
    "boston": { lat: 42.3601, lng: -71.0589 },
    "detroit": { lat: 42.3314, lng: -83.0458 },
    "miami": { lat: 25.7617, lng: -80.1918 },
    "portland": { lat: 45.5152, lng: -122.6784 },
    "las vegas": { lat: 36.1699, lng: -115.1398 },
    "salt lake city": { lat: 40.7608, lng: -111.8910 },
    "san francisco": { lat: 37.7749, lng: -122.4194 },
    "austin": { lat: 30.2672, lng: -97.7431 },
    "charlotte": { lat: 35.2271, lng: -80.8431 },
    "memphis": { lat: 35.1495, lng: -90.0490 },
    "louisville": { lat: 38.2527, lng: -85.7585 },
    "baltimore": { lat: 39.2904, lng: -76.6122 },
    "milwaukee": { lat: 43.0389, lng: -87.9065 },
    "albuquerque": { lat: 35.0844, lng: -106.6504 },
    "tucson": { lat: 32.2226, lng: -110.9747 },
    "fresno": { lat: 36.7378, lng: -119.7871 },
    "sacramento": { lat: 38.5816, lng: -121.4944 },
    "kansas city": { lat: 39.0997, lng: -94.5786 },
    "mesa": { lat: 33.4152, lng: -111.8315 },
    "omaha": { lat: 41.2565, lng: -95.9345 },
    "colorado springs": { lat: 38.8339, lng: -104.8214 },
    "raleigh": { lat: 35.7796, lng: -78.6382 },
    "virginia beach": { lat: 36.8529, lng: -75.9780 },
    "long beach": { lat: 33.7701, lng: -118.1937 },
    "oakland": { lat: 37.8044, lng: -122.2712 },
    "minneapolis": { lat: 44.9778, lng: -93.2650 },
    "tulsa": { lat: 36.1540, lng: -95.9928 },
    "arlington": { lat: 32.7357, lng: -97.1081 },
    "new orleans": { lat: 29.9511, lng: -90.0715 },
    "brooklyn": { lat: 40.6501, lng: -73.9496 },
    "bronx": { lat: 40.8448, lng: -73.8648 },
    "queens": { lat: 40.7282, lng: -73.7949 },
    "manhattan": { lat: 40.7831, lng: -73.9712 },
    "jersey city": { lat: 40.7178, lng: -74.0431 },
    "tampa": { lat: 27.9506, lng: -82.4572 },
    "jacksonville": { lat: 30.3322, lng: -81.6557 },
    "pittsburgh": { lat: 40.4406, lng: -79.9959 },
    "st louis": { lat: 38.6270, lng: -90.1994 },
    "st. louis": { lat: 38.6270, lng: -90.1994 },
    "indianapolis": { lat: 39.7684, lng: -86.1581 },
    "columbus": { lat: 39.9612, lng: -82.9988 },
    "fort worth": { lat: 32.7555, lng: -97.3308 },
    "wichita": { lat: 37.6872, lng: -97.3301 },
    "el paso": { lat: 31.7619, lng: -106.4850 },
    "san antonio": { lat: 29.4241, lng: -98.4936 },
    "miami": { lat: 25.7617, lng: -80.1918 },
    "cleveland": { lat: 41.4993, lng: -81.6944 },
    "cincinnati": { lat: 39.1031, lng: -84.5120 },
    "akron": { lat: 41.4993, lng: -81.6810 },
    "toledo": { lat: 41.6528, lng: -83.5379 },
    "birmingham": { lat: 33.5186, lng: -86.8104 },
    "montgomery": { lat: 32.3792, lng: -86.3007 },
    "mobile": { lat: 30.6954, lng: -88.0399 },
    "richmond": { lat: 37.5407, lng: -77.4360 },
    "norfolk": { lat: 36.8508, lng: -76.2599 },
    "hampton": { lat: 37.0299, lng: -76.3452 },
    "roanoke": { lat: 37.2709, lng: -79.9414 },
    "fayetteville": { lat: 35.0527, lng: -78.8783 },
    "greenville": { lat: 34.8526, lng: -82.3940 },
    "charleston": { lat: 32.7765, lng: -79.9311 },
    "savannah": { lat: 32.0809, lng: -81.0912 },
    "hilton head": { lat: 32.2166, lng: -80.7565 },
    "myrtle beach": { lat: 33.6892, lng: -78.8867 },
    "asheville": { lat: 35.5951, lng: -82.5515 },
    "greensboro": { lat: 36.0726, lng: -79.7920 },
    "winston-salem": { lat: 36.0998, lng: -80.2442 },
    "durham": { lat: 35.9940, lng: -78.8986 },
    "chapel hill": { lat: 35.9132, lng: -79.0558 },
    "wilmington": { lat: 34.2257, lng: -77.9447 },
    "boise": { lat: 43.6150, lng: -116.2023 },
    "spokane": { lat: 47.6588, lng: -117.4260 },
    "tacoma": { lat: 47.2529, lng: -122.4443 },
    "anchorage": { lat: 61.2181, lng: -149.9003 },
    "honolulu": { lat: 21.3099, lng: -157.8581 },
    "eugene": { lat: 44.0521, lng: -123.0868 },
    "salem": { lat: 44.9429, lng: -123.0350 },
    "medford": { lat: 42.3305, lng: -122.8767 },
    "bend": { lat: 44.0582, lng: -121.3153 },
    "corvallis": { lat: 44.5646, lng: -123.2720 },
    // State abbreviations
    "tn": { lat: 36.1627, lng: -86.7816 },
    "wv": { lat: 38.5976, lng: -80.4549 },
    "va": { lat: 37.4316, lng: -78.8069 },
    "md": { lat: 39.0458, lng: -76.6413 },
    "dc": { lat: 38.9072, lng: -77.0369 },
    "me": { lat: 45.2538, lng: -69.4455 },
    "nh": { lat: 43.1939, lng: -71.5724 },
    "vt": { lat: 44.5588, lng: -72.5778 },
    "ri": { lat: 41.5801, lng: -71.5074 },
    "ct": { lat: 41.6032, lng: -73.0877 },
    "nj": { lat: 40.0583, lng: -74.4057 },
    "de": { lat: 38.9108, lng: -75.5277 },
    "hi": { lat: 19.8968, lng: -155.5828 },
    "ak": { lat: 61.2181, lng: -149.9003 },
    "mt": { lat: 46.8797, lng: -110.3626 },
    "wy": { lat: 43.0750, lng: -107.2903 },
    "id": { lat: 44.0682, lng: -114.7420 },
    "nm": { lat: 34.5199, lng: -105.8701 },
    "ut": { lat: 39.3210, lng: -111.0937 },
    "or": { lat: 43.8041, lng: -120.5542 }
  };

  for (const [cityName, coords] of Object.entries(cityCoords)) {
    if (city.includes(cityName)) {
      return res.json({ lat: coords.lat, lng: coords.lng, city: cityName });
    }
  }
  
  // Try Google Geocoding for any address
  if (GOOGLE_API_KEY) {
    try {
      const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_API_KEY}`;
      const geoRes = await fetch(geoUrl);
      const geoData = await geoRes.json();
      if (geoData.results && geoData.results[0]) {
        const location = geoData.results[0].geometry.location;
        return res.json({ lat: location.lat, lng: location.lng, city: address });
      }
    } catch (e) {
      console.error('Google Geocoding error:', e.message);
    }
  }
  
  // Try zip code lookup if nothing else worked
  if (zipCodes[address]) {
    return res.json({ lat: zipCodes[address].lat, lng: zipCodes[address].lng, city: address });
  }

  res.json({ error: 'City not found. Try entering a major city or zip code.' });
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(`Database: ${shops.length} shops loaded`);
});

app.get('/api/stats', (req, res) => {
  const states = {};
  shops.forEach(s => {
    states[s.state] = (states[s.state] || 0) + 1;
  });
  res.json({
    total_shops: shops.length,
    by_state: states,
    metadata: db.metadata
  });
});

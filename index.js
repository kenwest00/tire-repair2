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
    return res.json(places.map(s => ({ ...s, reviews_data: shops.find(db => db.id === s.id)?.reviews_data || [] })));
  }
  
  res.json(shops.map(s => ({ ...s, reviews_data: s.reviews_data || [] })));
});

app.get('/api/geocode', (req, res) => {
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
    "new orleans": { lat: 29.9511, lng: -90.0715 }
  };

  for (const [cityName, coords] of Object.entries(cityCoords)) {
    if (city.includes(cityName)) {
      return res.json({ lat: coords.lat, lng: coords.lng, city: cityName });
    }
  }

  res.json({ error: 'City not found' });
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
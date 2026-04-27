const http = require('http')

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        let parsed = null
        try { parsed = JSON.parse(data) } catch (e) { parsed = data }
        resolve({ statusCode: res.statusCode, body: parsed })
      })
    }).on('error', reject)
  })
}

async function main(){
  const base = 'http://localhost:3000'
  const endpoints = [
    '/api/places?zip=37204',
    '/api/places?lat=36.16&lng=-86.78',
    '/api/geocode?address=Nashville+TN',
  ]
  for (const ep of endpoints){
    try {
      const r = await get(base + ep)
      const isArray = Array.isArray(r.body)
      const score = isArray ? (r.body.length) : (r.body && typeof r.body === 'object' ? Object.keys(r.body).length : 0)
      console.log(`${ep} => ${r.statusCode} | items: ${score}`)
    } catch (err) {
      console.error('ERR', ep, err.message)
    }
  }
}
main()

fetch('http://localhost:3000/api/status')
  .then(r=>r.json())
  .then(d=>console.log(JSON.stringify(d).substring(0, 500)));

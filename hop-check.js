// hop-check.js
import express from 'express';

const app = express();

app.get('/', (req, res) => {
  const xff = req.headers['x-forwarded-for'];

  res.json({
    'x-forwarded-for': xff,
    hops: xff ? xff.split(',').map(v => v.trim()).length : 0,
    rawHeaders: req.headers
  });
});

app.listen(3000, () => {
  console.log('hop check server listening on 3000');
});

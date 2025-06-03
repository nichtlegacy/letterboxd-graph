const express = require('express');
const path = require('path');
const sharp = require('sharp');
const { generateGraphs } = require('./standalone');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/generate', async (req, res) => {
  const { username, year } = req.body;
  if (!username) return res.status(400).json({ error: 'Username is required' });
  const yearNum = parseInt(year, 10) || new Date().getFullYear();
  try {
    const { svgDark } = await generateGraphs(username, yearNum);
    res.json({ svg: svgDark });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate graph' });
  }
});

app.post('/png', async (req, res) => {
  const { svg } = req.body;
  if (!svg) return res.status(400).end();
  try {
    const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
    res.set('Content-Type', 'image/png');
    res.send(pngBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

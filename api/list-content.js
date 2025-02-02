const express = require('express');
const fs = require('fs').promises;
const path = require('path');

const router = express.Router();

router.get('/api/list-content', async (req, res) => {
  try {
    const type = req.query.type;
    const contentDir = path.join(__dirname, '../content', type);
    
    const files = await fs.readdir(contentDir);
    const txtFiles = files.filter(file => file.endsWith('.txt'));
    
    const fileDetails = txtFiles.map(file => ({
      name: file.replace('.txt', ''),
      title: formatTitle(file.replace('.txt', ''))
    }));
    
    res.json(fileDetails);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list content' });
  }
});

function formatTitle(filename) {
  return filename
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

module.exports = router; 
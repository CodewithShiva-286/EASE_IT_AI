const express = require('express');
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Protected route: Update health data for the authenticated user
router.post('/', authMiddleware, async (req, res) => {
  const userId = req.user.userId; // Extracted from the JWT via authMiddleware
  const { healthData } = req.body;

  if (!healthData || typeof healthData !== 'object' || Array.isArray(healthData)) {
    return res.status(400).json({ error: 'Invalid health data format' });
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Safely update each category
    for (const category in healthData) {
      if (!Object.prototype.hasOwnProperty.call(healthData, category)) continue;
      if (['__proto__', 'constructor', 'prototype'].includes(category)) continue;
      
      if (!user.healthData[category]) {
        user.healthData[category] = {};
      }
      
      const catData = healthData[category];
      if (typeof catData === 'object' && !Array.isArray(catData)) {
        for (const condition in catData) {
          if (!Object.prototype.hasOwnProperty.call(catData, condition)) continue;
          if (['__proto__', 'constructor', 'prototype'].includes(condition)) continue;
          
          const value = catData[condition];
          if (typeof value === 'boolean') {
            user.healthData[category][condition] = value;
          }
        }
      }
    }
    await user.save();
    res.json({ message: 'Health data updated successfully' });
  } catch (error) {
    console.error('Error updating health data:', error);
    res.status(400).json({ error: 'Error updating health data' });
  }
});

// Protected route: Get health data for the authenticated user
router.get('/', authMiddleware, async (req, res) => {
  const userId = req.user.userId; // Use the userId from the token
  try {
    const user = await User.findById(userId);
    if (user) {
      res.json({ conditions: user.healthData });
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  } catch (error) {
    console.error('Error fetching health data:', error);
    res.status(400).json({ error: 'Error fetching health data' });
  }
});

module.exports = router;

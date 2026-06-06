const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const rateLimiter = require('../middleware/rateLimiter');

const router = express.Router();

// Enforce JWT_SECRET
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

// Rate limiters
const registerLimiter = rateLimiter({ windowMs: 15 * 60 * 1000, max: 10, message: 'Too many registration attempts. Please try again later.' });
const loginLimiter = rateLimiter({ windowMs: 15 * 60 * 1000, max: 20, message: 'Too many login attempts. Please try again later.' });

// Register route
router.post('/register', registerLimiter, async (req, res) => {
  const { email, username, password } = req.body;
  try {
    // Prevent NoSQL injection & validate types
    if (typeof email !== 'string' || typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email, username, and password must be strings' });
    }

    if (!email.trim() || !username.trim() || !password.trim()) {
      return res.status(400).json({ error: 'Email, username, and password cannot be empty' });
    }

    // Enforce password complexity
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    // Check if a user with the same email already exists
    const existingUser = await User.findOne({ email: email.trim() });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const existingUsername = await User.findOne({ username: username.trim() });
    if (existingUsername) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    
    // User model hashes the password in its pre-save hook.
    const newUser = new User({ email: email.trim(), username: username.trim(), password });
    await newUser.save();

    const token = jwt.sign(
      { userId: newUser._id, username: newUser.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
    );
    
    // Set httpOnly cookie
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 1 day for registration
    };
    res.cookie('authToken', token, cookieOptions);
    
    // Return success response
    res.status(201).json({
      message: 'User registered successfully',
      username: newUser.username,
      token
    });
  } catch (error) {
    console.error('Error registering user:', error);
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0] || 'field';
      return res.status(400).json({ error: `${field} already exists` });
    }
    res.status(400).json({ error: error.message || 'Error registering user' });
  }
});

// Login route
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password, remember } = req.body; // Using email for login
  try {
    // Prevent NoSQL injection & validate types
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email and password must be strings' });
    }

    const user = await User.findOne({ email: email.trim() });
    if (user && await user.comparePassword(password)) {
      const token = jwt.sign(
        { userId: user._id, username: user.username },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
      );
      // Set httpOnly cookie
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // Secure in production
        sameSite: 'strict',
        maxAge: remember ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000 // 30 days if remember, else 1 day
      };
      res.cookie('authToken', token, cookieOptions);
      res.json({
        message: 'Login successful',
        username: user.username,
        token
      });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('Error during login:', error);
    res.status(400).json({ error: 'Error during login' });
  }
});

module.exports = router;

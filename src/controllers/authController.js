const User = require('../models/Users');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const validator = require('validator');

const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validate input fields
    if (!name || !email || !password) {
      return res.status(400).json({ 
        success: false,
        message: "All fields are required: name, email, password" 
      });
    }

    // Validate name
    if (name.trim().length < 2 || name.trim().length > 50) {
      return res.status(400).json({ 
        success: false,
        message: "Name must be between 2 and 50 characters" 
      });
    }

    // Validate email format
    if (!validator.isEmail(email)) {
      return res.status(400).json({ 
        success: false,
        message: "Please provide a valid email address" 
      });
    }

    // Validate password strength
    if (password.length < 6) {
      return res.status(400).json({ 
        success: false,
        message: "Password must be at least 6 characters long" 
      });
    }

    if (password.length > 128) {
      return res.status(400).json({ 
        success: false,
        message: "Password must be less than 128 characters" 
      });
    }

    // Check for common weak passwords (optional)
    const weakPasswords = ['password', '123456', 'qwerty', 'letmein', 'welcome'];
    if (weakPasswords.includes(password.toLowerCase())) {
      return res.status(400).json({ 
        success: false,
        message: "Please choose a stronger password" 
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ 
        success: false,
        message: "Email already registered. Please login instead." 
      });
    }

    // Hash password
    const hashPassword = await bcrypt.hash(password, 12);

    // Create user
    const newUser = new User({
      name: name.trim(),
      email: email.toLowerCase(),
      password: hashPassword
    });

    await newUser.save();

    // Generate JWT token for immediate login after registration
    const token = jwt.sign(
      {
        userId: newUser._id,
        email: newUser.email,
        name: newUser.name
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "24h"
      }
    );

    return res.status(201).json({
      success: true,
      message: "Account created successfully",
      token,
      user: {
        name: newUser.name,
        email: newUser.email,
        userId: newUser._id
      }
    });

  } catch (error) {
    console.error("Registration error:", error);
    
    // Handle duplicate key errors (if email unique index is set)
    if (error.code === 11000) {
      return res.status(409).json({ 
        success: false,
        message: "Email already registered" 
      });
    }

    // Handle validation errors from mongoose schema
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        success: false,
        message: "Validation failed",
        errors: errors
      });
    }

    res.status(500).json({ 
      success: false,
      message: "Internal server error. Please try again later." 
    });
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        message: "Email and password are required" 
      });
    }

    if (!validator.isEmail(email)) {
      return res.status(400).json({ 
        success: false,
        message: "Please provide a valid email address" 
      });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: "Invalid email or password" // Generic message for security
      });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ 
        success: false,
        message: "Invalid email or password" // Generic message for security
      });
    }

    // Create JWT
    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        name: user.name
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "24h"
      }
    );

    res.json({
      success: true,
      token,
      user: {
        name: user.name,
        email: user.email,
        userId: user._id
      }
    });

  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ 
      success: false,
      message: "Internal server error. Please try again later." 
    });
  }
};

// Add token validation method
const validateToken = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-password");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    res.json({
      success: true,
      user: user,
      message: "Token is valid"
    });
  } catch (error) {
    console.error("Token validation error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during token validation"
    });
  }
};

module.exports = {
  registerUser,
  loginUser,
  validateToken
};
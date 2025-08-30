const express = require('express');
const authRoute = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth'); // Import your auth middleware

// authRoute.get('/',authController.LandingPage)

authRoute.post('/register', authController.registerUser);
authRoute.post('/login', authController.loginUser);
// Add token validation route
authRoute.get('/validate', auth, authController.validateToken);

module.exports = authRoute;
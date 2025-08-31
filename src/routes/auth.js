const express = require('express');
const authRoute = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');

authRoute.post('/register', authController.registerUser);
authRoute.post('/login', authController.loginUser);
authRoute.get('/validate', auth, authController.validateToken); 

module.exports = authRoute;
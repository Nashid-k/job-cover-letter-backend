const express = require('express');
const authRoute = express.Router();
const authController= require('../controllers/authController');

authRoute.post('/register', authController.registerUser)








module.exports  = authRoute
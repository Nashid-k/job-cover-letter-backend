const express = require('express');
const CoverLetterRouter = express.Router();
const coverLetterController = require('../controllers/coverLetterController');
const auth = require('../middleware/auth');

CoverLetterRouter.post('/generate', auth, coverLetterController.createCoverLetter);

module.exports = CoverLetterRouter;
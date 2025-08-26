const express = require('express');
const profileRouter = express.Router();
const profileController = require('../controllers/profileController');
const auth = require('../middleware/auth');

// Multer for file uploading
const multer = require('multer');

// Configure storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/resumes/') // Make sure this directory exists
    },
    filename: function (req, file, cb) {
        // Create unique filename: timestamp + original name
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({
    storage: storage,
    // 2MB max file size
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        // Fixed the logic error in file type checking
        const allowedTypes = [
            'application/pdf',
            'application/msword', // .doc
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // .docx
        ];
        
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF, DOC, and DOCX files are allowed'), false);
        }
    }
});

profileRouter.get('/', auth, profileController.getProfile);
profileRouter.put('/preferences', auth, profileController.updatePreferences);
profileRouter.post('/resume', auth, upload.single('resume'), profileController.uploadResume);

module.exports = profileRouter;
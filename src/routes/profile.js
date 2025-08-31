// In your profile route file
const express = require('express');
const profileRouter = express.Router();
const profileController = require('../controllers/profileController');
const auth = require('../middleware/auth');
const multer = require('multer');
const fs = require('fs');
const path = require('path');


const uploadDir = 'uploads/resumes/';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}


const storage = multer.diskStorage({
    destination: function (req, file, cb) {

        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, 
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ];
        
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF, DOC, and DOCX files are allowed'), false);
        }
    }
});


profileRouter.post('/resume', auth, (req, res, next) => {
    upload.single('resume')(req, res, function(err) {
        if (err) {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({
                        success: false,
                        message: 'File size too large. Maximum size is 5MB.'
                    });
                }
                return res.status(400).json({
                    success: false,
                    message: `Upload error: ${err.message}`
                });
            }
            return res.status(400).json({
                success: false,
                message: err.message
            });
        }
        next();
    });
}, profileController.uploadResume);

profileRouter.get('/', auth, profileController.getProfile);
profileRouter.put('/preferences', auth, profileController.updatePreferences);

module.exports = profileRouter;
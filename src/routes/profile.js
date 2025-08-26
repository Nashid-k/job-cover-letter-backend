const express = require('express');
const profileRouter = express.Router();
const profileController = require('../controllers/profileController');
const auth = require('../middleware/auth');


//multer for file uploading
const multer = require('multer');
const upload = multer({
    dest:'uploads/resumes/',
    //2mb max
    limits:{fileSize:2*1024*1024},
    fileFilter:(req, file, cb) =>{
        if(file.mimetype === 'application/pdf' || file.mimetype==='application/msword' || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            cb(null,  true)
          } else {
            cb(new Error('Only PDF or DOC/DOCX files allowed'))
        }
    }
})

profileRouter.get('/', auth, profileController.getProfile)
profileRouter.put('/preferences', auth, profileController.updatePreferences)
profileRouter.post('/resume', auth, upload.single('resume'),profileController.uploadResume)

module.exports = profileRouter

const User = require('../models/Users');
const path = require('path');
const fs = require('fs');

const getProfile = async(req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('-password');
        if(!user) return res.status(404).json({message:"User not found"});
        
        // Send the user data as response
        res.json(user);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({message: error.message});
    }
}

const updatePreferences = async(req, res) => {
    try {
        const jobPreferences = req.body; // Changed from {jobPreferences} destructuring
        const user = await User.findByIdAndUpdate(
            req.user.userId,
            {jobPreferences}, // This should match your User model field name
            {new: true}
        ).select('-password');
        
        res.json(user);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({message: error.message});
    }
}

const uploadResume = async(req, res) => {
    try {
        if(!req.file) return res.status(400).json({message:'No file uploaded'});
        
        console.log('File uploaded:', req.file); // Debug log
        
        const user = await User.findByIdAndUpdate(
            req.user.userId,
            {resumePath: req.file.path},
            {new: true}
        ).select('-password');
        
        if (!user) {
            return res.status(404).json({message: 'User not found'});
        }
        
        res.json({
            ...user.toObject(),
            message: 'Resume uploaded successfully'
        });
    } catch (error) {
        console.error('Upload error:', error.message);
        res.status(500).json({message: error.message});
    }
}

module.exports = {
    getProfile,
    updatePreferences,
    uploadResume
}
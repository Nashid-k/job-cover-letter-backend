const User = require('../models/Users');
const path = require('path');
const fs = require('fs');

const getProfile = async(req, res)=>{
    try {
        const user = await User.findById(req.user.userId).select('-password');
        if(!user) return res.status(404).json({message:"User not found"})
    } catch (error) {
        console.error(error.message)
    }
}

const updatePreferences =  async(req, res) =>{
    try {
        const {jobPreferences} = req.body;
        const user = await User.findByIdAndUpdate(
            req.user.userId,
            {jobPreferences},
            {new:true}
        ).select('-password')
        res.json(user);
    } catch (error) {
        console.error(error.message)
    }
}



const uploadResume = async(req, res) =>{
    try {
        if(!req.file) return res.status(400).json({message:'No file uploaded'});
        const user = await User.findByIdAndUpdate(
            req.user.userId,
            {resumePath:req.file.path},
            {new:true}
        ).select('-password')
    } catch (error) {
        console.error(error.message)
    }
}
















module.exports = {
    getProfile,
    updatePreferences,
    uploadResume
}
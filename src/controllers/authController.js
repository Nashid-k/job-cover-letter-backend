const User = require('../models/Users');
const bcrypt = require('bcrypt');
const jwt   = require('jsonwebtoken')


const registerUser = async(req, res)=>{
    try {
        const {name, email, password} = req.body;
        //check if user exists
        const existingUser = await User.findOne({email});
        if(existingUser) return res.status(409).json({message:"Email already registered"});
        //otherwise hash pass
        const hashPassword = await bcrypt.hash(password, 12);

        //create user
        const newUser = new User({
            name,
            email,
            password:hashPassword
        });
        await newUser.save();
        return res.status(201).json({message:"Account created successfully"})
    } catch (error) {
        res.status(500).json({message:error.message})
    }
}


module.exports = {
    registerUser,
}
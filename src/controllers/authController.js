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

const loginUser = async(req, res)=>{
    try {
        const {email, password} = req.body;

        //finding user
        const user = await User.findOne({email});
        if(!user) return res.status(404).json({message:"User is not found"});

        //if user found, check password
        const isMatch = await bcrypt.compare(password, user.password);
        if(!isMatch) return res.status(401).json({message:"Invalid credentials"});

        //create JWT
        const token = jwt.sign(
            {
                userId: user._id,
                email: user.email,
                name: user.name 
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "24h" 
            }
        );
        
        res.json({
            token, 
            user: {
                name: user.name,
                email: user.email,
                userId: user._id
            }
        });
    } catch (error) {
        res.status(500).json({message:error.message})
    }
}


module.exports = {
    registerUser,
    loginUser
}
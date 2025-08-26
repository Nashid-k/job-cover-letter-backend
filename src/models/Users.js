const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name:{
        type:String,
        required:true

    },
    email:{
        type:String,
        required:true,
        unique:true
    },
    password:{
        type:String,
        required:true
    },
    jobPreferences:{
        title:String,
        location:String,
        remote:Boolean,
        skills:[String]
    },
    resumePath:{
        type:String
    },
    createdAt:{
        type:Date,
        default:Date.now()
    }
});

module.exports = mongoose.model('User', userSchema);
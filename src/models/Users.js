const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  technologies: [String],
  startDate: String, // Changed to String for flexibility
  endDate: String,   // Changed to String for flexibility
  current: {
    type: Boolean,
    default: false
  },
  link: String,
  achievements: [String]
});

const experienceSchema = new mongoose.Schema({
  company: {
    type: String,
    required: true
  },
  position: {
    type: String,
    required: true
  },
  description: String,
  startDate: String, // Changed to String for flexibility
  endDate: String,   // Changed to String for flexibility
  current: {
    type: Boolean,
    default: false
  },
  achievements: [String],
  skills: [String]
});

const educationSchema = new mongoose.Schema({
  institution: String,
  degree: String,
  fieldOfStudy: String,
  startDate: String,
  endDate: String,
  current: Boolean,
  description: String
});

const certificationSchema = new mongoose.Schema({
  name: String,
  issuer: String,
  date: String,
  expiryDate: String
});

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: true
  },
  resumePath: String,
  jobPreferences: {
    title: String,
    location: String,
    skills: [String],
    remote: {
      type: Boolean,
      default: false
    },
    salaryExpectations: String,
    preferredIndustries: [String]
  },
  projects: [projectSchema],
  experience: [experienceSchema],
  education: [educationSchema],
  certifications: [certificationSchema],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for better query performance
userSchema.index({ email: 1 });
userSchema.index({ 'jobPreferences.skills': 1 });
userSchema.index({ 'jobPreferences.location': 1 });

module.exports = mongoose.model('User', userSchema);
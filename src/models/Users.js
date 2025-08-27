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
  startDate: Date,
  endDate: Date,
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
  startDate: Date,
  endDate: Date,
  current: {
    type: Boolean,
    default: false
  },
  achievements: [String],
  skills: [String]
});

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
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
  education: [{
    institution: String,
    degree: String,
    fieldOfStudy: String,
    startDate: Date,
    endDate: Date,
    current: Boolean,
    description: String
  }],
  certifications: [{
    name: String,
    issuer: String,
    date: Date,
    expiryDate: Date
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('User', userSchema);
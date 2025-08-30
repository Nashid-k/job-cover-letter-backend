const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  technologies: [String],
  startDate: String, // Flexible string for dates
  endDate: String, // Flexible string for dates
  current: {
    type: Boolean,
    default: false,
  },
  link: String,
  achievements: [String],
});

const experienceSchema = new mongoose.Schema({
  company: {
    type: String,
    required: true,
  },
  position: {
    type: String,
    required: true,
  },
  description: String,
  startDate: String, // Flexible string for dates
  endDate: String, // Flexible string for dates
  current: {
    type: Boolean,
    default: false,
  },
  achievements: [String],
  skills: [String],
});

const educationSchema = new mongoose.Schema({
  institution: String,
  degree: String,
  fieldOfStudy: String,
  startDate: String,
  endDate: String,
  current: Boolean,
  description: String,
});

const certificationSchema = new mongoose.Schema({
  name: String,
  issuer: String,
  date: String,
  expiryDate: String,
});

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters']
  },
  phone: {
    type: String,
    match: [/^(\+?\d{1,3}[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}$/, 'Please enter a valid phone number'],
  },
  profession: {
    type: String,
    default: 'Professional',
  },
  resumePath: String,
  jobPreferences: {
    title: String,
    location: String,
    skills: [String],
    remote: {
      type: Boolean,
      default: false,
    },
    salaryExpectations: String,
    preferredIndustries: {
      type: [String],
      default: [], // Ensure default empty array to avoid undefined issues
    },
  },
  projects: [projectSchema],
  experience: [experienceSchema],
  education: [educationSchema],
  certifications: [certificationSchema],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Index for better query performance
userSchema.index({ email: 1 });
userSchema.index({ 'jobPreferences.skills': 1 });
userSchema.index({ 'jobPreferences.location': 1 });

module.exports = mongoose.model('User', userSchema);
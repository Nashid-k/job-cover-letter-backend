const User = require('../models/Users');
const path = require('path');
const fs = require('fs');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const nlp = require('compromise');


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
       const user = await User.findByIdAndUpdate(
  req.user.userId,
  {
    resumePath: req.file.path,
    jobPreferences: {
      title: title || currentUser.jobPreferences?.title || '',
      location: currentUser.jobPreferences?.location || '',
      skills: skills.length > 0 ? skills : currentUser.jobPreferences?.skills || [],
      remote: currentUser.jobPreferences?.remote || false,
    },
    email: email || currentUser.email,
    // Only update name if we found a valid one AND it's different from current
    name: (name && name !== currentUser.name) ? name : currentUser.name,
  },
  { new: true }
).select('-password');
        
        res.json(user);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({message: error.message});
    }
}

const uploadResume = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    // First, get the current user to access existing data
    const currentUser = await User.findById(req.user.userId);
    if (!currentUser) return res.status(404).json({ message: 'User not found' });

    const fileBuffer = fs.readFileSync(path.resolve(req.file.path));
    let rawText = '';

    // Extract text based on file type
    if (req.file.mimetype === 'application/pdf') {
      const data = await pdf(fileBuffer);
      rawText = data.text;
    } else if (
      req.file.mimetype === 'application/msword' ||
      req.file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      rawText = result.value;
    } else {
      return res.status(400).json({ message: 'Invalid file type' });
    }

    // Enhanced parsing functions
    const extractEmail = (text) => {
      const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}/);
      return emailMatch ? emailMatch[0] : '';
    };

const extractName = (text) => {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  // First, try to extract name from LinkedIn/GitHub URLs if present
  const linkedInMatch = text.match(/linkedin\.com\/in\/([a-zA-Z0-9-]+)/i);
  const gitHubMatch = text.match(/github\.com\/([a-zA-Z0-9-]+)/i);
  
  if (linkedInMatch && linkedInMatch[1]) {
    const username = linkedInMatch[1];
    // Convert kebab-case to proper name
    const nameFromUrl = username.split('-')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
    
    if (nameFromUrl.split(' ').length >= 2) {
      return nameFromUrl;
    }
  }
  
  if (gitHubMatch && gitHubMatch[1]) {
    const username = gitHubMatch[1];
    // GitHub usernames are less likely to be real names, but we can try
    if (username.match(/[a-zA-Z]+[a-zA-Z0-9]*/i) && !username.match(/^[0-9]/)) {
      const nameFromUrl = username
        .replace(/([A-Z])/g, ' $1')
        .replace(/[_-]/g, ' ')
        .split(' ')
        .filter(part => part.length > 1)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
      
      if (nameFromUrl.split(' ').length >= 2) {
        return nameFromUrl;
      }
    }
  }
  
  // Look for the first line that looks like a name (typically the very first line)
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i];
    
    // Skip lines that are clearly not names
    const notNameIndicators = [
      '@', 'http', 'phone', 'linkedin', 'github', 'summary', 
      'experience', 'education', 'skills', 'technical', 'projects',
      'certifications', 'achievements', 'objective', 'resume', 'cv',
      'portfolio', 'contact', 'address', 'mobile', 'tel:', 'email:'
    ];
    
    const lowerLine = line.toLowerCase();
    if (notNameIndicators.some(indicator => lowerLine.includes(indicator))) {
      continue;
    }
    
    // Name detection criteria - more specific patterns
    const nameParts = line.split(' ');
    const isLikelyName = 
      nameParts.length >= 2 && 
      nameParts.length <= 4 &&
      nameParts.every(part => part.length > 1) &&
      /^[A-Za-zÀ-ÿ\-.' ]+$/.test(line) && // Only letters, hyphens, apostrophes, periods and spaces
      nameParts.every(part => /^[A-Z][a-z]*\.?$/.test(part) || /^[A-Z]\.?$/.test(part)) && // Each part starts with capital letter
      !line.match(/\d/) && // No numbers
      line.length > 3 && line.length < 40; // Reasonable length for a name
    
    if (isLikelyName) {
      return line;
    }
  }
  
  return '';
};

const extractSkills = (text) => {
  // Common skills database (expanded based on your resume)
  const commonSkills = [
    'javascript', 'typescript', 'html', 'css', 'react', 'node.js', 'express',
    'mongodb', 'postgresql', 'sql', 'aws', 'firebase', 'docker', 'git', 'github',
    'next.js', 'redux', 'bootstrap', 'tailwind', 'web audio api', 'restful apis',
    'jwt', 'oauth', 'mongoose', 'ci/cd', 'linux', 'postman', 'npm', 'responsive design',
    'context api', 'middleware', 'authentication', 'optimization', 'agile', 'scrum',
    'python', 'java', 'c++', 'c#', 'php', 'ruby', 'go', 'rust', 'swift', 'kotlin',
    'angular', 'vue', 'svelte', 'django', 'flask', 'spring', 'laravel', 'rails',
    'mysql', 'redis', 'elasticsearch', 'graphql', 'kubernetes', 'jenkins', 'terraform',
    'azure', 'gcp', 'heroku', 'figma', 'sketch', 'adobe xd', 'photoshop', 'illustrator'
  ];

  // Extract skills section if it exists
  const lowerText = text.toLowerCase();
  let skillsSection = '';
  
  // Try to find skills section with more specific patterns
  const sectionHeaders = ['technical skills', 'skills', 'technologies', 'expertise', 'technical expertise'];
  for (const header of sectionHeaders) {
    const regex = new RegExp(`${header}[\\s\\S]*?(?=${sectionHeaders.join('|')}|experience|education|projects|$|\\n\\n)`, 'i');
    const match = text.match(regex);
    if (match) {
      skillsSection = match[0];
      break;
    }
  }

  // If no skills section found, use the entire text but with more filtering
  const searchText = skillsSection || lowerText;

  // Extract skills using multiple methods
  const foundSkills = new Set();

  // Method 1: Look for common skills in the entire text
  commonSkills.forEach(skill => {
    // Use word boundaries to avoid partial matches
    const regex = new RegExp(`\\b${skill}\\b`, 'i');
    if (regex.test(searchText)) {
      foundSkills.add(skill);
    }
  });

  // Method 2: Look for skill patterns in the skills section
  if (skillsSection) {
    // Extract skills from lists with colons (like "Programming Languages: JavaScript, TypeScript")
    const colonPattern = /[:\-]\s*([^\.\n]+)/g;
    let match;
    while ((match = colonPattern.exec(skillsSection)) !== null) {
      const skillsList = match[1].split(/[,•\-*|]/).map(s => s.trim().toLowerCase());
      skillsList.forEach(skill => {
        if (skill && skill.length > 2 && commonSkills.includes(skill)) {
          foundSkills.add(skill);
        }
      });
    }

    // Extract skills from bullet points or lists
    const bulletPoints = skillsSection.split(/\n|\r|•|\-/).filter(point => point.length > 2);
    bulletPoints.forEach(point => {
      const cleanPoint = point.trim().toLowerCase();
      if (cleanPoint.length > 2) {
        commonSkills.forEach(skill => {
          if (cleanPoint.includes(skill)) {
            foundSkills.add(skill);
          }
        });
      }
    });
  }

  return Array.from(foundSkills).slice(0, 15);
};


const extractTitle = (text) => {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  // Common section headers to avoid
  const sectionHeaders = [
    'professional summary', 'summary', 'experience', 'work experience',
    'education', 'skills', 'technical skills', 'projects', 'certifications',
    'achievements', 'contact', 'references', 'key projects', 'key achievements'
  ];

  // Look for likely title lines (typically line 2 or 3)
  for (let i = 1; i < Math.min(10, lines.length); i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();
    
    // Skip if it's a section header
    if (sectionHeaders.some(header => lowerLine.includes(header))) {
      continue;
    }
    
    // Skip if it contains contact info indicators
    const contactIndicators = ['@', 'http', 'phone', 'linkedin', 'github', 'portfolio', '+91', '•', '-', '|'];
    if (contactIndicators.some(indicator => line.includes(indicator))) {
      continue;
    }
    
    // Look for job title patterns - developer, engineer, etc.
    const titlePatterns = [
      'developer', 'engineer', 'designer', 'specialist', 'analyst', 
      'architect', 'manager', 'consultant', 'programmer'
    ];
    
    const hasTitlePattern = titlePatterns.some(pattern => lowerLine.includes(pattern));
    
    if (line && line.length > 5 && line.length < 80 && hasTitlePattern) {
      return line;
    }
  }
  
  // If no title found, return empty string
  return '';
};

    // Extract information
    const email = extractEmail(rawText);
    const name = extractName(rawText);
    const skills = extractSkills(rawText);
    const title = extractTitle(rawText);

    // Update the user with parsed data
    const updatedUser = await User.findByIdAndUpdate(
      req.user.userId,
      {
        resumePath: req.file.path,
        jobPreferences: {
          title: title || currentUser.jobPreferences?.title || '',
          location: currentUser.jobPreferences?.location || '',
          skills: skills.length > 0 ? skills : currentUser.jobPreferences?.skills || [],
          remote: currentUser.jobPreferences?.remote || false,
        },
        email: email || currentUser.email,
        name: name || currentUser.name,
      },
      { new: true }
    ).select('-password');

    // Clean up the uploaded file after processing
    try {
      fs.unlinkSync(path.resolve(req.file.path));
    } catch (cleanupError) {
      console.warn('Could not delete uploaded file:', cleanupError.message);
    }

    res.json({
      ...updatedUser.toObject(),
      message: 'Resume uploaded and parsed successfully',
      parsed: { title, skills, email, name },
    });
  } catch (error) {
    console.error('Upload error:', error.message);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
    getProfile,
    updatePreferences,
    uploadResume
}
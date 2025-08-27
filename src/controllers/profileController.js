const User = require('../models/Users');
const path = require('path');
const fs = require('fs');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');

const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updatePreferences = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.userId);
    if (!currentUser) return res.status(404).json({ message: 'User not found' });

    const { title, location, skills = [], remote, email, name } = req.body;

    const updated = await User.findByIdAndUpdate(
      req.user.userId,
      {
        jobPreferences: {
          title: title || currentUser.jobPreferences?.title || '',
          location: location || currentUser.jobPreferences?.location || '',
          skills: skills.length ? skills : currentUser.jobPreferences?.skills || [],
          remote: typeof remote === 'boolean' ? remote : currentUser.jobPreferences?.remote || false,
        },
        email: email || currentUser.email,
        name: name || currentUser.name,
      },
      { new: true }
    ).select('-password');

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

//extract projects
const extractProjects = (text) => {
  const projects = [];
  const lines = text.split('\n');
  

  const projectSectionRegex = /(PROJECTS|PERSONAL PROJECTS|KEY PROJECTS|PORTFOLIO)/i;
  let inProjectSection = false;
  let currentProject = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    
    if (projectSectionRegex.test(line)) {
      inProjectSection = true;
      continue;
    }
    
   
    if (inProjectSection && /(EXPERIENCE|EDUCATION|SKILLS|CERTIFICATIONS)/i.test(line)) {
      inProjectSection = false;
      if (currentProject) {
        projects.push(currentProject);
        currentProject = null;
      }
      continue;
    }
    
    if (inProjectSection) {
     
      if (/^[A-Z][A-Za-z0-9\s\-]+$/.test(line) && line.length > 3 && line.length < 50) {
        if (currentProject) {
          projects.push(currentProject);
        }
        currentProject = {
          title: line,
          description: '',
          technologies: []
        };
      } 
     
      else if (currentProject && line.length > 10 && !/^(http|www)/i.test(line)) {
        if (!currentProject.description) {
          currentProject.description = line;
        } else {
          currentProject.description += ' ' + line;
        }
        
        
        const techKeywords = ['javascript', 'react', 'node', 'python', 'java', 'sql', 'mongodb', 'express', 'aws', 'docker'];
        techKeywords.forEach(tech => {
          if (line.toLowerCase().includes(tech) && !currentProject.technologies.includes(tech)) {
            currentProject.technologies.push(tech);
          }
        });
      }
      
      else if (currentProject && /^(http|www)/i.test(line)) {
        currentProject.link = line;
      }
    }
  }
  
  if (currentProject) {
    projects.push(currentProject);
  }
  
  return projects.slice(0, 5);
};

const extractExperience = (text) => {
  const experiences = [];
  const lines = text.split('\n');
  
  const experienceSectionRegex = /(EXPERIENCE|WORK EXPERIENCE|EMPLOYMENT HISTORY)/i;
  let inExperienceSection = false;
  let currentExperience = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
   
    if (experienceSectionRegex.test(line)) {
      inExperienceSection = true;
      continue;
    }
    
   
    if (inExperienceSection && /(EDUCATION|PROJECTS|SKILLS|CERTIFICATIONS)/i.test(line)) {
      inExperienceSection = false;
      if (currentExperience) {
        experiences.push(currentExperience);
        currentExperience = null;
      }
      continue;
    }
    
    if (inExperienceSection) {
     
      const companyPositionMatch = line.match(/^([^-]+)\s*[-–]\s*(.+)$/);
      if (companyPositionMatch) {
        if (currentExperience) {
          experiences.push(currentExperience);
        }
        currentExperience = {
          company: companyPositionMatch[1].trim(),
          position: companyPositionMatch[2].trim(),
          description: '',
          achievements: []
        };
      } 
   
      else if (currentExperience && /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(line) && 
               (/\d{4}/.test(line) || /present|current/i.test(line))) {
        
      }

      else if (currentExperience && line.length > 5 && !line.match(/^\s*$/)) {
        if (line.match(/^[•\-*]\s/)) {
          currentExperience.achievements.push(line.replace(/^[•\-*]\s/, ''));
        } else {
          currentExperience.description += ' ' + line;
        }
      }
    }
  }
  
  if (currentExperience) {
    experiences.push(currentExperience);
  }
  
  return experiences.slice(0, 3);
};


const extractEmail = (text) => {
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}/);
  return emailMatch ? emailMatch[0] : '';
};

const extractName = (text) => {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  

  const linkedInMatch = text.match(/linkedin\.com\/in\/([a-zA-Z0-9-]+)/i);
  const gitHubMatch = text.match(/github\.com\/([a-zA-Z0-9-]+)/i);
  
  if (linkedInMatch && linkedInMatch[1]) {
    const username = linkedInMatch[1];
 
    const nameFromUrl = username.split('-')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
    
    if (nameFromUrl.split(' ').length >= 2) {
      return nameFromUrl;
    }
  }
  
  if (gitHubMatch && gitHubMatch[1]) {
    const username = gitHubMatch[1];
    
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
  
  
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i];
    

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
    
 
    const nameParts = line.split(' ');
    const isLikelyName = 
      nameParts.length >= 2 && 
      nameParts.length <= 4 &&
      nameParts.every(part => part.length > 1) &&
      /^[A-Za-zÀ-ÿ\-.' ]+$/.test(line) && 
      nameParts.every(part => /^[A-Z][a-z]*\.?$/.test(part) || /^[A-Z]\.?$/.test(part)) &&
      line.length > 3 && line.length < 40; 
    
    if (isLikelyName) {
      return line;
    }
  }
  
  return '';
};

const extractSkills = (text) => {

  const commonSkills = [
    'javascript', 'typescript', 'html', 'css', 'react', 'node.js', 'express',
    'mongodb', 'postgresql', 'sql', 'aws', 'firebase', 'docker', 'git', 'github',
    'next.js', 'redux', 'bootstrap', 'tailwind', 'web audio api', 'restful apis',
    'jwt', 'oauth', 'mongoose', 'ci/cd', 'linux', 'postman', 'npm', 'responsive design',
    'context api', 'middleware', 'authentication', 'optimization', 'agile', 'scrum',
    'python', 'java', 'c\\+\\+', 'c#', 'php', 'ruby', 'go', 'rust', 'swift', 'kotlin', 
    'angular', 'vue', 'svelte', 'django', 'flask', 'spring', 'laravel', 'rails',
    'mysql', 'redis', 'elasticsearch', 'graphql', 'kubernetes', 'jenkins', 'terraform',
    'azure', 'gcp', 'heroku', 'figma', 'sketch', 'adobe xd', 'photoshop', 'illustrator'
  ];


  const lowerText = text.toLowerCase();
  let skillsSection = '';
  

  const sectionHeaders = ['technical skills', 'skills', 'technologies', 'expertise', 'technical expertise'];
  for (const header of sectionHeaders) {
    const regex = new RegExp(`${header}[\\s\\S]*?(?=${sectionHeaders.join('|')}|experience|education|projects|$|\\n\\n)`, 'i');
    const match = text.match(regex);
    if (match) {
      skillsSection = match[0];
      break;
    }
  }


  const searchText = skillsSection || lowerText;


  const foundSkills = new Set();


  commonSkills.forEach(skill => {

    let regexPattern;
    if (skill.includes('\\+\\+')) {
   
      regexPattern = new RegExp(`\\bc\\+\\+\\b`, 'i');
    } else if (skill.includes('+') || skill.includes('.') || skill.includes('#')) {
 
      const escapedSkill = skill.replace(/[.+*?^$()[\]{}|]/g, '\\$&');
      regexPattern = new RegExp(`\\b${escapedSkill}\\b`, 'i');
    } else {
      regexPattern = new RegExp(`\\b${skill}\\b`, 'i');
    }
    
    if (regexPattern.test(searchText)) {

      foundSkills.add(skill.replace(/\\\\/g, '')); 
    }
  });


  if (skillsSection) {
  
    const colonPattern = /[:\-]\s*([^\.\n]+)/g;
    let match;
    while ((match = colonPattern.exec(skillsSection)) !== null) {
      const skillsList = match[1].split(/[,•\-*|]/).map(s => s.trim().toLowerCase());
      skillsList.forEach(skill => {
        if (skill && skill.length > 2) {

          const normalizedSkill = skill.toLowerCase();
          const matchedSkill = commonSkills.find(commonSkill => {
            const cleanCommonSkill = commonSkill.replace(/\\\\/g, '');
            return normalizedSkill.includes(cleanCommonSkill) || cleanCommonSkill.includes(normalizedSkill);
          });
          
          if (matchedSkill) {
            foundSkills.add(matchedSkill.replace(/\\\\/g, ''));
          }
        }
      });
    }


    const bulletPoints = skillsSection.split(/\n|\r|•|\-/).filter(point => point.length > 2);
    bulletPoints.forEach(point => {
      const cleanPoint = point.trim().toLowerCase();
      if (cleanPoint.length > 2) {
        commonSkills.forEach(skill => {
          const cleanSkill = skill.replace(/\\\\/g, '');
          if (cleanPoint.includes(cleanSkill)) {
            foundSkills.add(cleanSkill);
          }
        });
      }
    });
  }

  return Array.from(foundSkills).slice(0, 15);
};

const extractTitle = (text) => {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  

  const sectionHeaders = [
    'professional summary', 'summary', 'experience', 'work experience',
    'education', 'skills', 'technical skills', 'projects', 'certifications',
    'achievements', 'contact', 'references', 'key projects', 'key achievements'
  ];


  for (let i = 1; i < Math.min(10, lines.length); i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();
    
    
    if (sectionHeaders.some(header => lowerLine.includes(header))) {
      continue;
    }
    

    const contactIndicators = ['@', 'http', 'phone', 'linkedin', 'github', 'portfolio', '+91', '•', '-', '|'];
    if (contactIndicators.some(indicator => line.includes(indicator))) {
      continue;
    }
    

    const titlePatterns = [
      'developer', 'engineer', 'designer', 'specialist', 'analyst', 
      'architect', 'manager', 'consultant', 'programmer'
    ];
    
    const hasTitlePattern = titlePatterns.some(pattern => lowerLine.includes(pattern));
    
    if (line && line.length > 5 && line.length < 80 && hasTitlePattern) {
      return line;
    }
  }
  

  return '';
};

const uploadResume = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const currentUser = await User.findById(req.user.userId);
    if (!currentUser) return res.status(404).json({ message: 'User not found' });

    const fileBuffer = fs.readFileSync(path.resolve(req.file.path));
    let rawText = '';

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


    const email = extractEmail(rawText);
    const name = extractName(rawText);
    const skills = extractSkills(rawText);
    const title = extractTitle(rawText);
    const projects = extractProjects(rawText);
    const experience = extractExperience(rawText);


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
        projects: projects.length > 0 ? projects : currentUser.projects || [],
        experience: experience.length > 0 ? experience : currentUser.experience || [],
      },
      { new: true }
    ).select('-password');


    try {
      fs.unlinkSync(path.resolve(req.file.path));
    } catch (cleanupError) {
      console.warn('Could not delete uploaded file:', cleanupError.message);
    }

    res.json({
      ...updatedUser.toObject(),
      message: 'Resume uploaded and parsed successfully',
      parsed: { 
        title, 
        skills, 
        email, 
        name, 
        projects: projects.length, 
        experience: experience.length 
      },
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
};
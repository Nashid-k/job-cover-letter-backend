const axios = require('axios');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

const HF_BASE_URL = 'https://router.huggingface.co/v1';
const HF_TOKEN = process.env.HF_TOKEN;

// Enhanced universal skills extraction for all job types
function extractSkillsFromText(text, jobType = 'general') {
  if (!text) return { skills: [], skillLevels: {} };
  
  const skillCategories = {
    // Technical Skills
    programming: ['javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'php', 'ruby', 'go', 'rust', 'swift', 'kotlin', 'r', 'matlab', 'scala', 'perl'],
    frontend: ['react', 'vue', 'angular', 'svelte', 'html', 'css', 'bootstrap', 'tailwind', 'next.js', 'nuxt.js', 'jquery', 'sass', 'less'],
    backend: ['node.js', 'express', 'django', 'flask', 'spring', 'laravel', 'rails', 'asp.net', 'fastapi', 'nestjs'],
    databases: ['mongodb', 'postgresql', 'mysql', 'redis', 'elasticsearch', 'sql', 'nosql', 'oracle', 'sqlite', 'cassandra'],
    cloud: ['aws', 'azure', 'gcp', 'firebase', 'heroku', 'vercel', 'netlify', 'digitalocean', 'cloudflare'],
    devops: ['docker', 'kubernetes', 'jenkins', 'terraform', 'ansible', 'ci/cd', 'linux', 'unix', 'bash', 'shell'],
    tools: ['git', 'github', 'gitlab', 'postman', 'figma', 'sketch', 'adobe xd', 'photoshop', 'illustrator', 'jira', 'confluence'],
    
    // Business & Management
    management: ['project management', 'team leadership', 'strategic planning', 'budget management', 'stakeholder management', 'risk management', 'change management', 'people management'],
    business: ['business analysis', 'market research', 'financial analysis', 'data analysis', 'reporting', 'forecasting', 'budgeting', 'cost management'],
    communication: ['presentation', 'public speaking', 'technical writing', 'documentation', 'training', 'mentoring', 'customer service', 'client relations'],
    
    // Analytics & Data
    analytics: ['data analysis', 'statistical analysis', 'machine learning', 'data visualization', 'tableau', 'power bi', 'excel', 'google analytics', 'sql', 'python', 'r'],
    
    // Design & Creative
    design: ['ui/ux design', 'graphic design', 'web design', 'user experience', 'user interface', 'wireframing', 'prototyping', 'adobe creative suite'],
    
    // Sales & Marketing
    marketing: ['digital marketing', 'content marketing', 'social media marketing', 'seo', 'sem', 'email marketing', 'marketing automation', 'brand management'],
    sales: ['sales', 'lead generation', 'customer acquisition', 'account management', 'crm', 'salesforce', 'hubspot', 'negotiation'],
    
    // Industry-specific
    finance: ['financial modeling', 'accounting', 'auditing', 'tax preparation', 'investment analysis', 'risk assessment', 'compliance'],
    healthcare: ['patient care', 'medical terminology', 'hipaa', 'electronic health records', 'clinical research', 'healthcare administration'],
    education: ['curriculum development', 'lesson planning', 'classroom management', 'educational technology', 'assessment', 'student engagement'],
    
    // Methodologies & Frameworks
    methodologies: ['agile', 'scrum', 'kanban', 'waterfall', 'lean', 'six sigma', 'tdd', 'bdd', 'devops', 'itil']
  };

  const allSkills = Object.values(skillCategories).flat();
  const foundSkills = new Set();
  const skillLevels = {};
  const textLower = text.toLowerCase();
  
  // Experience level indicators
  const levelIndicators = {
    expert: ['expert', 'senior', 'lead', 'principal', 'architect', 'advanced', '5+ years', '7+ years', '10+ years', 'extensive experience'],
    proficient: ['proficient', 'experienced', 'skilled', '3+ years', '4+ years', '2-4 years', 'strong experience'],
    intermediate: ['intermediate', 'familiar', '1-2 years', '2+ years', 'working knowledge'],
    beginner: ['beginner', 'basic', 'learning', 'recent', 'new to', 'introduction']
  };

  // Enhanced skill detection with flexible matching
  allSkills.forEach(skill => {
    const skillVariations = generateSkillVariations(skill);
    let skillFound = false;
    
    skillVariations.forEach(variation => {
      if (!skillFound && textLower.includes(variation.toLowerCase())) {
        foundSkills.add(skill);
        skillFound = true;
        
        // Determine skill level based on context
        let detectedLevel = 'intermediate'; // default
        for (const [level, indicators] of Object.entries(levelIndicators)) {
          if (indicators.some(indicator => {
            const contextRegex = new RegExp(`${indicator}.*${variation}|${variation}.*${indicator}`, 'i');
            return contextRegex.test(textLower);
          })) {
            detectedLevel = level;
            break;
          }
        }
        skillLevels[skill] = detectedLevel;
      }
    });
  });
  
  return { 
    skills: Array.from(foundSkills), 
    skillLevels,
    categories: skillCategories
  };
}

// Generate skill variations for better matching
function generateSkillVariations(skill) {
  const variations = [skill];
  
  // Common variations
  const skillLower = skill.toLowerCase();
  variations.push(skillLower);
  
  // Remove dots and add variations
  if (skill.includes('.')) {
    variations.push(skill.replace(/\./g, ''));
    variations.push(skill.replace(/\./g, ' '));
  }
  
  // Handle common abbreviations
  const abbreviations = {
    'javascript': ['js'],
    'typescript': ['ts'],
    'node.js': ['node', 'nodejs'],
    'react': ['reactjs'],
    'vue': ['vuejs'],
    'angular': ['angularjs'],
    'postgresql': ['postgres'],
    'mongodb': ['mongo'],
    'artificial intelligence': ['ai'],
    'machine learning': ['ml'],
    'user experience': ['ux'],
    'user interface': ['ui'],
    'search engine optimization': ['seo'],
    'customer relationship management': ['crm']
  };
  
  if (abbreviations[skillLower]) {
    variations.push(...abbreviations[skillLower]);
  }
  
  return variations;
}

// Enhanced job analysis with better skill matching
function analyzeJobMatch(jobDescription, userProfile) {
  if (!jobDescription || !userProfile) {
    return {
      score: 0,
      matchedSkills: [],
      missingSkills: [],
      requiredSkills: [],
      recommendation: 'insufficient_data',
      userExperience: { totalYears: 0, totalMonths: 0, positions: 0, hasDetailedExperience: false }
    };
  }

  const jobText = jobDescription.toLowerCase();
  
  // Extract ALL user skills from different sources with normalization
  const userSkillsFromPreferences = normalizeSkillsArray(userProfile.jobPreferences?.skills);
  const userSkillsFromProjects = (userProfile.projects || []).flatMap(proj => 
    normalizeSkillsArray(proj.technologies)
  );
  const userSkillsFromExperience = (userProfile.experience || []).flatMap(exp => 
    normalizeSkillsArray(exp.skills)
  );
  
  // Combine and deduplicate all user skills
  const allUserSkills = [
    ...userSkillsFromPreferences,
    ...userSkillsFromProjects,
    ...userSkillsFromExperience
  ].filter((skill, index, array) => 
    skill && skill.trim() && array.findIndex(s => s.toLowerCase() === skill.toLowerCase()) === index
  );

  const userSkillsLower = allUserSkills.map(skill => skill.toLowerCase().trim());
  
  // Extract skills from job description
  const jobSkillsAnalysis = extractSkillsFromText(jobText);
  const requiredSkills = jobSkillsAnalysis.skills;
  
  // Enhanced skill matching with fuzzy logic
  const matchedSkills = [];
  const skillMatchScores = {};
  
  requiredSkills.forEach(reqSkill => {
    const reqSkillLower = reqSkill.toLowerCase();
    let bestMatchScore = 0;
    let matchedUserSkill = null;
    
    userSkillsLower.forEach(userSkill => {
      const matchScore = calculateSkillMatchScore(reqSkillLower, userSkill);
      if (matchScore > bestMatchScore && matchScore >= 0.7) { // 70% similarity threshold
        bestMatchScore = matchScore;
        matchedUserSkill = allUserSkills[userSkillsLower.indexOf(userSkill)];
      }
    });
    
    if (matchedUserSkill) {
      matchedSkills.push(reqSkill);
      skillMatchScores[reqSkill] = bestMatchScore;
    }
  });
  
  const missingSkills = requiredSkills.filter(skill => !matchedSkills.includes(skill));
  
  // Calculate experience
  const userExperience = calculateUserExperience(userProfile);
  
  // Enhanced scoring
  const baseScore = requiredSkills.length > 0 ? (matchedSkills.length / requiredSkills.length) * 100 : 100;
  const experienceBonus = Math.min(20, userExperience.totalYears * 2); // Up to 20% bonus
  const finalScore = Math.min(100, Math.round(baseScore + experienceBonus));
  
  const recommendation = generateRecommendation(finalScore, matchedSkills, requiredSkills, userExperience);
  
  return {
    score: finalScore,
    matchedSkills,
    missingSkills,
    requiredSkills,
    allUserSkills, // Include all user skills for cover letter generation
    skillMatchScores,
    userExperience,
    recommendation,
    truthfulnessScore: Math.min(100, finalScore + 10) // More lenient truthfulness score
  };
}

// Normalize skills array from various input formats
function normalizeSkillsArray(skills) {
  if (!skills) return [];
  
  if (Array.isArray(skills)) {
    return skills.filter(skill => skill && typeof skill === 'string');
  }
  
  if (typeof skills === 'string') {
    return skills.split(/[,;|]/).map(s => s.trim()).filter(s => s);
  }
  
  return [];
}

// Calculate skill match score using fuzzy string matching
function calculateSkillMatchScore(skill1, skill2) {
  if (skill1 === skill2) return 1.0;
  
  // Check if one contains the other
  if (skill1.includes(skill2) || skill2.includes(skill1)) {
    return Math.max(skill2.length / skill1.length, skill1.length / skill2.length);
  }
  
  // Simple Levenshtein distance for similar strings
  const distance = levenshteinDistance(skill1, skill2);
  const maxLength = Math.max(skill1.length, skill2.length);
  return Math.max(0, 1 - distance / maxLength);
}

function levenshteinDistance(str1, str2) {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

function calculateUserExperience(userProfile) {
  const experience = userProfile && Array.isArray(userProfile.experience) ? userProfile.experience : [];
  let totalMonths = 0;
  let validExperiences = 0;
  
  experience.forEach(exp => {
    if (exp && exp.startDate) {
      try {
        const start = new Date(exp.startDate);
        const end = exp.current || exp.endDate === 'Present' || exp.endDate === 'present' || !exp.endDate ? 
                   new Date() : new Date(exp.endDate);
        
        if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end >= start) {
          const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
          totalMonths += Math.max(0, months);
          validExperiences++;
        }
      } catch (dateError) {
        console.warn('Invalid date format in experience:', exp);
      }
    }
  });
  
  return {
    totalYears: Math.floor(totalMonths / 12),
    totalMonths: totalMonths,
    positions: validExperiences,
    hasDetailedExperience: validExperiences > 0
  };
}

function generateRecommendation(score, matchedSkills, requiredSkills, userExperience) {
  const matchRatio = requiredSkills.length > 0 ? matchedSkills.length / requiredSkills.length : 1;
  
  if (score >= 80 && matchRatio >= 0.8) {
    return 'strong_match';
  } else if (score >= 60 && matchRatio >= 0.6) {
    return 'good_match';
  } else if (score >= 40 && matchRatio >= 0.4) {
    return 'partial_match';
  } else if (score >= 25) {
    return 'consider_with_caution';
  } else {
    return 'poor_match';
  }
}

// Enhanced cover letter generation with better skill utilization
exports.generateCoverLetter = async ({ jobDescription, userProfile, analysis = null }) => {
  try {
    // Perform comprehensive analysis
    const skillsAnalysis = analysis || analyzeJobMatch(jobDescription, userProfile);
    
    // Ensure userExperience has required properties
    if (!skillsAnalysis.userExperience || skillsAnalysis.userExperience.totalYears === undefined) {
      skillsAnalysis.userExperience = {
        totalYears: 0,
        totalMonths: 0,
        positions: 0,
        hasDetailedExperience: false
      };
    }
    
    // Only reject if extremely poor match (< 15% and no relevant skills)
    if (skillsAnalysis.score < 15 && skillsAnalysis.matchedSkills.length === 0) {
      return {
        coverLetter: null,
        analysis: skillsAnalysis,
        recommendation: {
          action: 'not_recommended',
          reason: 'No relevant skills found for this position. Consider building relevant experience first.',
          suggestions: [
            `Learn these key skills: ${skillsAnalysis.requiredSkills.slice(0, 5).join(', ')}`,
            'Build projects demonstrating these technologies',
            'Consider entry-level positions in this field'
          ]
        }
      };
    }

    const { name, email, jobPreferences = {}, resumePath, projects = [], experience = [] } = userProfile;
    
    // Use ALL user skills, not just matched ones, but prioritize matched skills
    const allUserSkills = skillsAnalysis.allUserSkills || [];
    const matchedSkills = skillsAnalysis.matchedSkills || [];
    const primarySkills = [...matchedSkills];
    
    // Add other user skills that might be relevant but weren't directly matched
    const additionalRelevantSkills = allUserSkills.filter(skill => 
      !primarySkills.some(ps => ps.toLowerCase() === skill.toLowerCase()) &&
      isSkillRelevantToJob(skill, jobDescription)
    ).slice(0, 5); // Limit additional skills
    
    const allRelevantSkills = [...primarySkills, ...additionalRelevantSkills];
    
    // Format projects with all their technologies, not just matched ones
    const formattedProjects = projects.map(proj => {
      const projTechs = normalizeSkillsArray(proj.technologies);
      return `- ${proj.title}: ${proj.description || 'Personal/Academic project'} (Technologies: ${projTechs.join(', ') || 'Various technologies'})`;
    }).join('\n');

    // Format experience with all skills mentioned
    const formattedExperience = experience.map(exp => {
      const expSkills = normalizeSkillsArray(exp.skills);
      return `- ${exp.position || 'Professional Role'} at ${exp.company || 'Previous Company'}: ${exp.description || exp.achievements?.join('; ') || 'Professional experience'} ${expSkills.length ? `(Skills used: ${expSkills.join(', ')})` : ''}`;
    }).join('\n');

    const candidateInfo = `
Name: ${name || 'Candidate'}
Email: ${email || ''}
Title: ${jobPreferences.title || 'Professional'}
Location: ${jobPreferences.location || ''}
Remote: ${jobPreferences.remote ? 'Yes' : 'No'}

ALL CANDIDATE SKILLS: ${allUserSkills.join(', ') || 'Skills from experience and projects'}
DIRECTLY MATCHED SKILLS: ${matchedSkills.join(', ') || 'Will highlight transferable skills'}
ADDITIONAL RELEVANT SKILLS: ${additionalRelevantSkills.join(', ') || 'None'}

Total Experience: ${skillsAnalysis.userExperience.totalYears} years (${skillsAnalysis.userExperience.positions} positions)

PROJECTS:
${formattedProjects || 'Various personal and academic projects demonstrating technical abilities'}

PROFESSIONAL EXPERIENCE:
${formattedExperience || 'Professional experience in related fields'}
`;

    // More flexible system prompt
    const systemPrompt = `You are an expert cover letter writer who creates compelling, truthful applications for diverse job seekers across all industries and experience levels.

GUIDELINES:
1. Use the candidate's actual skills and experiences as listed
2. For directly matched skills, highlight them prominently
3. For related/transferable skills, explain how they apply to the role
4. If the candidate is entry-level or switching fields, focus on potential, learning ability, and transferable skills
5. Be authentic but confident - every candidate has value to offer
6. Adapt tone and content based on the job type (technical, business, creative, etc.)

APPROACH:
- Lead with enthusiasm and genuine interest in the role
- Highlight the strongest skill matches first
- Use specific examples from projects and experience
- Address any gaps by emphasizing learning ability and related experience
- Close with confidence and next steps

Create a professional 300-400 word cover letter that positions this candidate positively while being truthful about their background.`;

    const userPrompt = `
JOB DESCRIPTION:
${jobDescription}

CANDIDATE PROFILE:
${candidateInfo}

ANALYSIS SUMMARY:
- Overall Match Score: ${skillsAnalysis.score}%
- Direct skill matches: ${matchedSkills.length} out of ${skillsAnalysis.requiredSkills.length} required
- Recommendation: ${skillsAnalysis.recommendation}
- Experience Level: ${skillsAnalysis.userExperience.totalYears} years professional experience

Write a cover letter that makes the best case for this candidate while being honest about their background. Focus on their strengths and show how their skills and experience make them a valuable addition to the team.`;

    const response = await axios.post(
      `${HF_BASE_URL}/chat/completions`,
      {
        model: 'meta-llama/Llama-3.1-8B-Instruct:cerebras',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 1200,
        temperature: 0.7,
      },
      {
        headers: {
          Authorization: `Bearer ${HF_TOKEN}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const content = response.data.choices?.[0]?.message?.content;
    if (!content) throw new Error('No cover letter content generated');
    
    return {
      coverLetter: content,
      analysis: skillsAnalysis,
      recommendation: {
        action: 'proceed',
        truthfulnessScore: skillsAnalysis.truthfulnessScore,
        matchQuality: skillsAnalysis.recommendation,
        skillsHighlighted: allRelevantSkills
      }
    };
  } catch (error) {
    console.error('Cover letter generation error:', error);
    throw new Error('Failed to generate cover letter. Please try again.');
  }
};

// Helper function to check if a skill is relevant to the job
function isSkillRelevantToJob(skill, jobDescription) {
  const jobText = jobDescription.toLowerCase();
  const skillLower = skill.toLowerCase();
  
  // Direct mention
  if (jobText.includes(skillLower)) return true;
  
  // Check for related terms
  const skillRelations = {
    'javascript': ['js', 'frontend', 'web development', 'react', 'vue', 'angular'],
    'python': ['data science', 'machine learning', 'backend', 'automation', 'ai'],
    'sql': ['database', 'data analysis', 'reporting', 'analytics'],
    'excel': ['data analysis', 'reporting', 'spreadsheet', 'analytics'],
    'project management': ['coordination', 'planning', 'leadership', 'organization'],
    // Add more as needed
  };
  
  if (skillRelations[skillLower]) {
    return skillRelations[skillLower].some(term => jobText.includes(term));
  }
  
  return false;
}

// Keep existing helper functions
async function extractResumeContent(resumePath) {
  if (!resumePath || !fs.existsSync(resumePath)) return '';
  const ext = path.extname(resumePath).toLowerCase();
  return ext === '.pdf'
    ? await extractPdfText(resumePath)
    : ext === '.docx' || ext === '.doc'
    ? await extractDocxText(resumePath)
    : '';
}

async function extractPdfText(resumePath) {
  try {
    const buffer = fs.readFileSync(resumePath);
    const data = await pdfParse(buffer);
    return data.text;
  } catch (e) {
    console.error('PDF parsing error:', e);
    return '';
  }
}

async function extractDocxText(resumePath) {
  try {
    const result = await mammoth.extractRawText({ path: resumePath });
    return result.value;
  } catch (e) {
    console.error('DOCX parsing error:', e);
    return '';
  }
}

exports.analyzeJobMatch = analyzeJobMatch;